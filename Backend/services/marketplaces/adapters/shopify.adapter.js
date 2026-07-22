const MarketplaceAdapter = require('../MarketplaceAdapter');
const MarketplaceProduct = require('../../../models/MarketplaceProduct');
const MarketplaceLocation = require('../../../models/MarketplaceLocation');
const { decryptSecret } = require('../../../lib/marketplaces/encryption');
const mongoose = require('mongoose');
const {
  getAvailableStock,
  resolveShopifyLocation,
  ensureInventoryTracking,
  activateInventoryItem,
  setShopifyStock,
  verifyShopifyInventory,
  withRetry
} = require('../../../utils/inventoryHelper');

// Centralized helper to make Shopify GraphQL requests
async function shopifyGraphQL({ shopDomain, accessToken, query, variables = {}, timeout = 20000 }) {
  if (!shopDomain) {
    throw new Error("Shop domain is required");
  }
  if (!shopDomain.endsWith(".myshopify.com")) {
    throw new Error("Invalid Shopify shop domain");
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';
  const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });

    clearTimeout(id);

    if (response.status === 429) {
      const throttleErr = new Error('Shopify API rate limit exceeded (HTTP 429)');
      throttleErr.isThrottle = true;
      throw throttleErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shopify API error (HTTP ${response.status}): ${errText}`);
    }

    const json = await response.json();

    // Check for cost / throttling in GraphQL extensions
    const cost = json.extensions?.cost;
    if (cost?.throttleStatus) {
      const { currentlyAvailable, restoreRate, requestedQueryCost } = cost.throttleStatus;
      if (currentlyAvailable < requestedQueryCost) {
        const throttleErr = new Error(`Shopify GraphQL Throttled: Available cost ${currentlyAvailable} is less than requested cost ${requestedQueryCost}`);
        throttleErr.isThrottle = true;
        throttleErr.retryAfterMs = Math.ceil((requestedQueryCost - currentlyAvailable) / restoreRate) * 1000 + 1000;
        throw throttleErr;
      }
    }

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map(e => e.message).join(', ');
      throw new Error(`Shopify GraphQL error: ${messages}`);
    }

    return json.data;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Shopify API request timed out after ${timeout}ms`);
    }
    throw err;
  }
}

class ShopifyMarketplaceAdapter extends MarketplaceAdapter {
  async connect(storeUrl, authCode) {
    return {
      success: true,
      tokens: { accessToken: 'mock-shopify-access' },
      storeDetails: { shopDomain: storeUrl }
    };
  }

  async testConnection() {
    if (!this.connection.credentials?.encryptedAccessToken) {
      return { success: false, message: 'Configuration missing' };
    }
    try {
      const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
      const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);
      
      const shopData = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query {
            shop {
              name
              myshopifyDomain
            }
          }
        `
      });
      if (shopData?.shop) {
        return { success: true, message: `Connected to ${shopData.shop.name}` };
      }
      return { success: false, message: 'Invalid response from Shopify API' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async validateProduct(product) {
    const missing = [];
    if (!product.name && !product.title) missing.push('title');
    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  }

  async reconcileListing(product, shopDomain, accessToken) {
    // 1. Search by SKU first
    if (product.sku) {
      try {
        const skuResult = await shopifyGraphQL({
          shopDomain,
          accessToken,
          query: `
            query findVariantBySku($query: String!) {
              productVariants(first: 1, query: $query) {
                edges {
                  node {
                    id
                    product {
                      id
                    }
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          `,
          variables: { query: `sku:${product.sku}` }
        });
        const matchedVariant = skuResult?.productVariants?.edges?.[0]?.node;
        if (matchedVariant) {
          console.log(`[Shopify Sync] Reconciled product ${product._id} by SKU matching (${product.sku}).`);
          return {
            shopifyProductId: matchedVariant.product.id,
            shopifyVariantId: matchedVariant.id,
            inventoryItemId: matchedVariant.inventoryItem.id
          };
        }
      } catch (err) {
        console.warn(`[Shopify Sync] SKU reconciliation failed:`, err.message);
      }
    }

    // 2. Search by metafield second
    try {
      const metafieldResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query findProductByMetafield($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  id
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        inventoryItem {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { query: `metafield:retailverse.local_product_id:${product._id}` }
      });
      const matchedNode = metafieldResult?.products?.edges?.[0]?.node;
      if (matchedNode) {
        console.log(`[Shopify Sync] Reconciled product ${product._id} by metafield matching.`);
        const shopifyProductId = matchedNode.id;
        const defaultVariant = matchedNode.variants?.edges?.[0]?.node;
        return {
          shopifyProductId,
          shopifyVariantId: defaultVariant?.id,
          inventoryItemId: defaultVariant?.inventoryItem?.id
        };
      }
    } catch (err) {
      console.warn(`[Shopify Sync] Metafield reconciliation failed:`, err.message);
    }

    return null;
  }

  buildVariantInput(product, variantId = null) {
    const v = {
      price: String(Number(product.price) || 0)
    };
    if (variantId) {
      v.id = variantId;
    }
    const comparePrice = Number(product.comparePrice) || Number(product.originalPrice) || 0;
    if (comparePrice > 0 && comparePrice !== Number(product.price)) {
      v.compareAtPrice = String(comparePrice);
    }
    const weight = Number(product.weight) || 0;
    if (weight > 0) {
      v.weight = weight;
      v.weightUnit = 'KILOGRAMS';
    }
    v.inventoryItem = {
      tracked: true
    };
    if (product.sku) {
      v.inventoryItem.sku = product.sku;
    }
    if (product.barcode) {
      v.inventoryItem.barcode = String(product.barcode);
    }
    // Handle cost price if defined in payload dynamically
    if (product.costPrice !== undefined || product.cost !== undefined) {
      const cost = Number(product.costPrice) || Number(product.cost) || 0;
      if (cost > 0) {
        v.inventoryItem.cost = String(cost);
      }
    }
    return v;
  }

  async syncProductImages(product, shopifyProductId, shopDomain, accessToken) {
    const productImages = product.images && product.images.length > 0
      ? product.images
      : (product.image ? [product.image] : []);

    if (productImages.length === 0) return;

    try {
      // 1. Fetch existing images on Shopify
      const existingData = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query getProductImages($id: ID!) {
            product(id: $id) {
              images(first: 50) {
                nodes {
                  url
                }
              }
            }
          }
        `,
        variables: { id: shopifyProductId }
      });

      const existingUrls = (existingData?.product?.images?.nodes || []).map(img => img.url.split('?')[0]);

      // 2. Diff local urls vs Shopify urls
      const imagesToUpload = productImages.filter(url => {
        const cleanUrl = url.split('?')[0];
        return !existingUrls.some(existUrl => existUrl.includes(cleanUrl) || cleanUrl.includes(existUrl));
      });

      if (imagesToUpload.length > 0) {
        console.log(`[Shopify Sync] Uploading ${imagesToUpload.length} new images for product ${product._id}`);
        const uploadResult = await shopifyGraphQL({
          shopDomain,
          accessToken,
          query: `
            mutation productImagesCreate($productId: ID!, $images: [ImageInput!]!) {
              productImagesCreate(productId: $productId, images: $images) {
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            productId: shopifyProductId,
            images: imagesToUpload.map(url => ({ src: url }))
          }
        });

        const imgErrors = uploadResult?.productImagesCreate?.userErrors || [];
        if (imgErrors.length > 0) {
          console.warn(`[Shopify Sync] Image sync user errors: ${imgErrors.map(e => e.message).join(', ')}`);
        }
      }
    } catch (err) {
      console.warn(`[Shopify Sync] Image sync warning for product ${product._id}:`, err.message);
    }
  }

  async createListing(product) {
    const validation = await this.validateProduct(product);
    if (!validation.isValid) {
      throw new Error('Validation failed: ' + validation.missingFields.join(', '));
    }

    const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
    const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);
    
    // Check mapping database first to prevent duplicate creation
    let mapping = await MarketplaceProduct.findOne({
      connectionId: this.connection._id,
      localProductId: product._id
    });
    
    if (mapping && mapping.shopifyProductId) {
      console.log(`[Shopify Sync] Mapping already exists for product ${product._id}. Performing update instead.`);
      return this.updateListing(product);
    }

    // 1. Read authoritative stock
    let availableStock = 0;
    try {
      availableStock = await getAvailableStock(product._id);
    } catch (stockErr) {
      console.warn(`[Shopify Sync] Failed to read stock: ${stockErr.message}`);
    }

    const bridgeGraphql = (shop, token, query, variables) => shopifyGraphQL({ shopDomain: shop, accessToken: token, query, variables });

    // 3. Resolve active location
    let locationId;
    try {
      locationId = await resolveShopifyLocation(this.connection, shopDomain, accessToken, bridgeGraphql);
    } catch (locErr) {
      throw new Error(`Failed to resolve location: ${locErr.message}`);
    }

    // Try Shopify search reconciliation
    const reconciled = await this.reconcileListing(product, shopDomain, accessToken);
    let shopifyProductId, shopifyVariantId, inventoryItemId;

    if (reconciled) {
      shopifyProductId = reconciled.shopifyProductId;
      shopifyVariantId = reconciled.shopifyVariantId;
      inventoryItemId = reconciled.inventoryItemId;
    } else {
      // Create new Shopify Product shell
      const productInput = {
        title: product.name || product.title || "Untitled Product",
        descriptionHtml: product.description || "",
        vendor: product.brand || product.vendor || "Retail Verse",
        productType: product.category || "",
        status: product.isActive !== false ? "ACTIVE" : "DRAFT",
        tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : '',
        metafields: [
          {
            namespace: "retailverse",
            key: "local_product_id",
            value: String(product._id),
            type: "single_line_text_field"
          }
        ]
      };

      const createResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          mutation productCreate($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product {
                id
                title
                variants(first: 100) {
                  nodes {
                    id
                    sku
                    inventoryItem {
                      id
                      tracked
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: { product: productInput }
      });

      const userErrors = createResult?.productCreate?.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(`Shopify Product Create user errors: ${userErrors.map(u => u.message).join(', ')}`);
      }

      const createdProduct = createResult?.productCreate?.product;
      if (!createdProduct) {
        throw new Error('Failed to create Shopify product.');
      }

      shopifyProductId = createdProduct.id;
      const defaultVariant = createdProduct.variants?.nodes?.[0];
      shopifyVariantId = defaultVariant?.id;
      inventoryItemId = defaultVariant?.inventoryItem?.id;

      // Update variant details on default variant
      if (shopifyVariantId) {
        const variantUpdateInput = this.buildVariantInput(product, shopifyVariantId);

        const variantResult = await shopifyGraphQL({
          shopDomain,
          accessToken,
          query: `
            mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            productId: shopifyProductId,
            variants: [variantUpdateInput]
          }
        });

        const varErrors = variantResult?.productVariantsBulkUpdate?.userErrors || [];
        if (varErrors.length > 0) {
          console.warn(`[Shopify Sync] Variant update warnings: ${varErrors.map(e => e.message).join(', ')}`);
        }
      }
    }

    // Resolve variant and inventoryItem dynamically if needed
    if (!inventoryItemId && shopifyProductId) {
      const detailsResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query getProductDetails($id: ID!) {
            product(id: $id) {
              id
              variants(first: 100) {
                nodes {
                  id
                  sku
                  inventoryItem { id tracked }
                }
              }
            }
          }
        `,
        variables: { id: shopifyProductId }
      });
      const variants = detailsResult?.product?.variants?.nodes || [];
      let matchedVariant = variants.find(v => v.sku === product.sku);
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants[0];
      }
      shopifyVariantId = matchedVariant?.id;
      inventoryItemId = matchedVariant?.inventoryItem?.id;
    }

    if (!inventoryItemId) {
      throw new Error('Failed to resolve Shopify inventoryItem ID');
    }

    // Structured logging start
    console.log(`[ShopifyInventorySync] Start`);
    console.log(`[ShopifyInventorySync] Retail Verse product ID: ${product._id}`);
    console.log(`[ShopifyInventorySync] SKU: ${product.sku}`);
    console.log(`[ShopifyInventorySync] Source stock: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Shopify product ID: ${shopifyProductId}`);
    console.log(`[ShopifyInventorySync] Shopify variant ID: ${shopifyVariantId}`);
    console.log(`[ShopifyInventorySync] Inventory item ID: ${inventoryItemId}`);
    console.log(`[ShopifyInventorySync] Location ID: ${locationId}`);

    // Enable inventory tracking if disabled
    const trackingQuery = `
      query GetInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          tracked
        }
      }
    `;
    const trackingResult = await shopifyGraphQL({ shopDomain, accessToken, query: trackingQuery, variables: { id: inventoryItemId } });
    const isTracked = trackingResult?.inventoryItem?.tracked || false;
    console.log(`[ShopifyInventorySync] Tracking enabled: ${isTracked}`);

    await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, isTracked, bridgeGraphql);

    // Activate at location
    await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, bridgeGraphql);

    // Set absolute stock
    await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, bridgeGraphql);

    // Verify stock
    const verifiedQty = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, bridgeGraphql);
    console.log(`[ShopifyInventorySync] Expected quantity: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Actual quantity: ${verifiedQty}`);
    console.log(`[ShopifyInventorySync] Completed`);

    // Sync Images
    await this.syncProductImages(product, shopifyProductId, shopDomain, accessToken);

    // Save Mapping
    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: this.connection._id, localProductId: product._id },
      {
        merchantId: this.connection.merchantId,
        productId: product._id,
        connectionId: this.connection._id,
        shopDomain,
        marketplace: 'shopify',
        localProductId: product._id,
        localVariantId: null,
        shopifyProductId,
        shopifyVariantId,
        inventoryItemId,
        locationId,
        shopifyLocationId: locationId,
        listingStatus: 'active',
        syncStatus: 'inventory_synced',
        lastSyncedAt: new Date(),
        lastError: ''
      },
      { upsert: true, new: true }
    );

    return {
      success: true,
      listingId: shopifyProductId,
      shopifyProductId,
      shopifyVariantId,
      inventoryItemId,
      locationId
    };
  }

  async updateListing(product) {
    const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
    const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);

    let mapping = await MarketplaceProduct.findOne({
      connectionId: this.connection._id,
      localProductId: product._id
    });
    
    const bridgeGraphql = (shop, token, query, variables) => shopifyGraphQL({ shopDomain: shop, accessToken: token, query, variables });

    // 1. Resolve Location
    let locationId;
    try {
      locationId = await resolveShopifyLocation(this.connection, shopDomain, accessToken, bridgeGraphql);
    } catch (locErr) {
      throw new Error(`Failed to resolve location: ${locErr.message}`);
    }

    if (!mapping) {
      // Reconcile and save mapping first if missing
      const reconciled = await this.reconcileListing(product, shopDomain, accessToken);
      if (reconciled) {
        mapping = await MarketplaceProduct.findOneAndUpdate(
          { connectionId: this.connection._id, localProductId: product._id },
          {
            merchantId: this.connection.merchantId,
            productId: product._id,
            connectionId: this.connection._id,
            shopDomain,
            marketplace: 'shopify',
            localProductId: product._id,
            localVariantId: null,
            shopifyProductId: reconciled.shopifyProductId,
            shopifyVariantId: reconciled.shopifyVariantId,
            inventoryItemId: reconciled.inventoryItemId,
            locationId,
            shopifyLocationId: locationId,
            listingStatus: 'active',
            syncStatus: 'success',
            lastSyncedAt: new Date()
          },
          { upsert: true, new: true }
        );
      } else {
        return this.createListing(product);
      }
    }

    // Authoritative stock
    let availableStock = 0;
    try {
      availableStock = await getAvailableStock(product._id);
    } catch (stockErr) {
      console.warn(`[Shopify Sync] Failed to read stock: ${stockErr.message}`);
    }

    const input = {
      id: mapping.shopifyProductId,
      title: product.name || product.title,
      descriptionHtml: product.description || '',
      vendor: product.brand || product.vendor || 'Retail Verse',
      productType: product.category || 'General',
      status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
      tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : ''
    };

    const updateResult = await shopifyGraphQL({
      shopDomain,
      accessToken,
      query: `
        mutation UpdateProduct(
          $product: ProductUpdateInput!
          $media: [CreateMediaInput!]
        ) {
          productUpdate(product: $product, media: $media) {
            product {
              id
              title
              status
              handle
              variants(first: 100) {
                nodes {
                  id
                  sku
                  price
                  inventoryItem { id tracked }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: { product: input, media: [] }
    });

    const updateTopErrors = updateResult?.errors;
    if (updateTopErrors?.length) {
      throw new Error(`Shopify GraphQL error: ${updateTopErrors.map(e => e.message).join('; ')}`);
    }

    const errors = updateResult?.data?.productUpdate?.userErrors || updateResult?.productUpdate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Shopify Product Update user errors: ${errors.map(e => e.message).join(', ')}`);
    }

    const shopifyProductId = mapping.shopifyProductId;
    let shopifyVariantId = mapping.shopifyVariantId;
    let inventoryItemId = mapping.inventoryItemId;

    // Update variant SKU, price, weight, cost, barcode, tracked
    if (shopifyVariantId) {
      const variantUpdateInput = this.buildVariantInput(product, shopifyVariantId);

      const variantResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          productId: shopifyProductId,
          variants: [variantUpdateInput]
        }
      });

      const varErrors = variantResult?.productVariantsBulkUpdate?.userErrors || [];
      if (varErrors.length > 0) {
        console.warn(`[Shopify Sync] Variant update warnings on updateListing: ${varErrors.map(e => e.message).join(', ')}`);
      }
    }

    // Resolve variant and inventoryItem dynamically if needed
    if (!inventoryItemId && shopifyProductId) {
      const detailsResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query getProductDetails($id: ID!) {
            product(id: $id) {
              id
              variants(first: 100) {
                nodes {
                  id
                  sku
                  inventoryItem { id tracked }
                }
              }
            }
          }
        `,
        variables: { id: shopifyProductId }
      });
      const variants = detailsResult?.product?.variants?.nodes || [];
      let matchedVariant = variants.find(v => v.sku === product.sku);
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants[0];
      }
      shopifyVariantId = matchedVariant?.id;
      inventoryItemId = matchedVariant?.inventoryItem?.id;
    }

    if (!inventoryItemId) {
      throw new Error('Failed to resolve Shopify inventoryItem ID');
    }

    // Structured logging start
    console.log(`[ShopifyInventorySync] Start`);
    console.log(`[ShopifyInventorySync] Retail Verse product ID: ${product._id}`);
    console.log(`[ShopifyInventorySync] SKU: ${product.sku}`);
    console.log(`[ShopifyInventorySync] Source stock: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Shopify product ID: ${shopifyProductId}`);
    console.log(`[ShopifyInventorySync] Shopify variant ID: ${shopifyVariantId}`);
    console.log(`[ShopifyInventorySync] Inventory item ID: ${inventoryItemId}`);
    console.log(`[ShopifyInventorySync] Location ID: ${locationId}`);

    // Enable inventory tracking if disabled
    const trackingQuery = `
      query GetInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          tracked
        }
      }
    `;
    const trackingResult = await shopifyGraphQL({ shopDomain, accessToken, query: trackingQuery, variables: { id: inventoryItemId } });
    const isTracked = trackingResult?.inventoryItem?.tracked || false;
    console.log(`[ShopifyInventorySync] Tracking enabled: ${isTracked}`);

    await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, isTracked, bridgeGraphql);

    // Activate at location
    await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, bridgeGraphql);

    // Set absolute stock
    await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, bridgeGraphql);

    // Verify stock
    const verifiedQty = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, bridgeGraphql);
    console.log(`[ShopifyInventorySync] Expected quantity: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Actual quantity: ${verifiedQty}`);
    console.log(`[ShopifyInventorySync] Completed`);

    // Sync Images
    await this.syncProductImages(product, shopifyProductId, shopDomain, accessToken);

    mapping.shopifyVariantId = shopifyVariantId;
    mapping.inventoryItemId = inventoryItemId;
    mapping.shopifyLocationId = locationId;
    mapping.locationId = locationId;
    mapping.syncStatus = 'inventory_synced';
    mapping.lastSyncedAt = new Date();
    mapping.lastError = '';
    await mapping.save();

    return { success: true };
  }

  async updateInventory(product) {
    const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
    const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);

    const mapping = await MarketplaceProduct.findOne({
      connectionId: this.connection._id,
      localProductId: product._id
    });
    if (!mapping) {
      throw new Error('Product is not mapped to Shopify.');
    }

    const bridgeGraphql = (shop, token, query, variables) => shopifyGraphQL({ shopDomain: shop, accessToken: token, query, variables });

    // 1. Resolve Location
    let locationId;
    try {
      locationId = await resolveShopifyLocation(this.connection, shopDomain, accessToken, bridgeGraphql);
    } catch (locErr) {
      throw new Error(`Failed to resolve location: ${locErr.message}`);
    }

    let inventoryItemId = mapping.inventoryItemId;
    let shopifyProductId = mapping.shopifyProductId;
    let shopifyVariantId = mapping.shopifyVariantId;

    if (!inventoryItemId && shopifyProductId) {
      const detailsResult = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          query getProductDetails($id: ID!) {
            product(id: $id) {
              id
              variants(first: 100) {
                nodes {
                  id
                  sku
                  inventoryItem { id tracked }
                }
              }
            }
          }
        `,
        variables: { id: shopifyProductId }
      });
      const variants = detailsResult?.product?.variants?.nodes || [];
      let matchedVariant = variants.find(v => v.sku === product.sku);
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants[0];
      }
      shopifyVariantId = matchedVariant?.id;
      inventoryItemId = matchedVariant?.inventoryItem?.id;
    }

    if (!inventoryItemId || !locationId) {
      throw new Error('Mapping is missing inventoryItemId or locationId.');
    }

    // Authoritative stock
    let availableStock = 0;
    try {
      availableStock = await getAvailableStock(product._id);
    } catch (stockErr) {
      console.warn(`[Shopify Sync] Failed to read stock: ${stockErr.message}`);
    }

    // Structured logging start
    console.log(`[ShopifyInventorySync] Start`);
    console.log(`[ShopifyInventorySync] Retail Verse product ID: ${product._id}`);
    console.log(`[ShopifyInventorySync] SKU: ${product.sku}`);
    console.log(`[ShopifyInventorySync] Source stock: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Shopify product ID: ${shopifyProductId}`);
    console.log(`[ShopifyInventorySync] Shopify variant ID: ${shopifyVariantId}`);
    console.log(`[ShopifyInventorySync] Inventory item ID: ${inventoryItemId}`);
    console.log(`[ShopifyInventorySync] Location ID: ${locationId}`);

    // Enable inventory tracking if disabled
    const trackingQuery = `
      query GetInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          tracked
        }
      }
    `;
    const trackingResult = await shopifyGraphQL({ shopDomain, accessToken, query: trackingQuery, variables: { id: inventoryItemId } });
    const isTracked = trackingResult?.inventoryItem?.tracked || false;
    console.log(`[ShopifyInventorySync] Tracking enabled: ${isTracked}`);

    await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, isTracked, bridgeGraphql);

    // Activate at location
    await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, bridgeGraphql);

    // Set absolute stock
    await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, bridgeGraphql);

    // Verify stock
    const verifiedQty = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, bridgeGraphql);
    console.log(`[ShopifyInventorySync] Expected quantity: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Actual quantity: ${verifiedQty}`);
    console.log(`[ShopifyInventorySync] Completed`);

    mapping.shopifyVariantId = shopifyVariantId;
    mapping.inventoryItemId = inventoryItemId;
    mapping.shopifyLocationId = locationId;
    mapping.locationId = locationId;
    mapping.syncStatus = 'inventory_synced';
    mapping.lastSyncedAt = new Date();
    mapping.lastError = '';
    await mapping.save();

    return { success: true };
  }

  async updatePrice(product) {
    const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
    const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);

    const mapping = await MarketplaceProduct.findOne({
      connectionId: this.connection._id,
      localProductId: product._id
    });
    if (!mapping) {
      throw new Error('Product is not mapped to Shopify.');
    }

    const shopifyVariantId = mapping.shopifyVariantId;
    if (!shopifyVariantId) {
      throw new Error('Mapping is missing shopifyVariantId.');
    }

    const variantUpdateInput = this.buildVariantInput(product, shopifyVariantId);

    const priceResult = await shopifyGraphQL({
      shopDomain,
      accessToken,
      query: `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        productId: mapping.shopifyProductId,
        variants: [variantUpdateInput]
      }
    });

    const errors = priceResult?.productVariantsBulkUpdate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Shopify Variant Price update user errors: ${errors.map(e => e.message).join(', ')}`);
    }

    mapping.syncStatus = 'success';
    mapping.lastSyncedAt = new Date();
    mapping.lastError = '';
    await mapping.save();

    return { success: true };
  }

  async deleteListing(product) {
    const shopDomain = this.connection.storeUrl || this.connection.shopDomain;
    const accessToken = decryptSecret(this.connection.credentials.encryptedAccessToken);

    const mapping = await MarketplaceProduct.findOne({
      connectionId: this.connection._id,
      localProductId: product._id
    });
    if (!mapping) {
      return { success: true, message: 'Already unmapped or deleted' };
    }

    const shopifyProductId = mapping.shopifyProductId;

    // Set Shopify status to DRAFT instead of hard deleting
    if (shopifyProductId) {
      try {
        const archiveResult = await shopifyGraphQL({
          shopDomain,
          accessToken,
          query: `
            mutation UpdateProduct(
              $product: ProductUpdateInput!
              $media: [CreateMediaInput!]
            ) {
              productUpdate(product: $product, media: $media) {
                product {
                  id
                  title
                  status
                  handle
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: { product: { id: shopifyProductId, status: 'DRAFT' }, media: [] }
        });

        const archiveTopErrors = archiveResult?.errors;
        if (archiveTopErrors?.length) {
          console.warn(`[Shopify Sync] Archive GraphQL error (non-fatal): ${archiveTopErrors.map(e => e.message).join('; ')}`);
        }

        const archiveErrors = archiveResult?.data?.productUpdate?.userErrors || archiveResult?.productUpdate?.userErrors || [];
        if (archiveErrors.length > 0) {
          console.warn(`[Shopify Sync] Archive warnings: ${archiveErrors.map(e => e.message).join(', ')}`);
        }
      } catch (err) {
        console.warn(`[Shopify Sync] Archive error (non-fatal): ${err.message}`);
      }

      mapping.listingStatus = 'archived';
      mapping.syncStatus = 'success';
      mapping.lastSyncedAt = new Date();
      await mapping.save();
    }

    return { success: true, message: 'Product set to DRAFT in Shopify' };
  }

  async syncInventoryAtLocation(shopDomain, accessToken, inventoryItemId, locationId, quantity) {
    const input = {
      reason: 'correction',
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId,
          locationId,
          quantity: Number(quantity) || 0,
          name: 'available'
        }
      ]
    };
    
    try {
      const result = await shopifyGraphQL({
        shopDomain,
        accessToken,
        query: `
          mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: { input }
      });
      
      const errors = result?.inventorySetQuantities?.userErrors || [];
      if (errors.length > 0) {
        const hasNotStocked = errors.some(e => e.code === 'ITEM_NOT_STOCKED_AT_LOCATION' || e.message.includes('ITEM_NOT_STOCKED_AT_LOCATION') || e.message.includes('not stocked at location'));
        if (hasNotStocked) {
          console.log(`[Shopify Sync] Item not stocked at location ${locationId}. Activating first...`);
          await this.activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId);
          
          const retryResult = await shopifyGraphQL({
            shopDomain,
            accessToken,
            query: `
              mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
                inventorySetQuantities(input: $input) {
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: { input }
          });
          const retryErrors = retryResult?.inventorySetQuantities?.userErrors || [];
          if (retryErrors.length > 0) {
            throw new Error(`Shopify Inventory Set Quantities retry user errors: ${retryErrors.map(e => e.message).join(', ')}`);
          }
        } else {
          throw new Error(`Shopify Inventory Set Quantities user errors: ${errors.map(e => e.message).join(', ')}`);
        }
      }
    } catch (err) {
      if (err.message.includes('ITEM_NOT_STOCKED_AT_LOCATION') || err.message.includes('not stocked')) {
        console.log(`[Shopify Sync] Exception caught: Item not stocked. Activating...`);
        await this.activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId);
        
        const retryResult = await shopifyGraphQL({
          shopDomain,
          accessToken,
          query: `
            mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
              inventorySetQuantities(input: $input) {
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: { input }
        });
        const retryErrors = retryResult?.inventorySetQuantities?.userErrors || [];
        if (retryErrors.length > 0) {
          throw new Error(`Shopify Inventory Set Quantities retry user errors: ${retryErrors.map(e => e.message).join(', ')}`);
        }
      } else {
        throw err;
      }
    }
  }

  async activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId) {
    const result = await shopifyGraphQL({
      shopDomain,
      accessToken,
      query: `
        mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
          inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: { inventoryItemId, locationId, available: 0 }
    });
    const errors = result?.inventoryActivate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Shopify Inventory Activate user errors: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  async handleProductWebhook(payload) {
    const { topic, body, connectionId } = payload;
    const connection = this.connection;
    const shopDomain = connection.storeUrl || connection.shopDomain;
    const locationId = connection.locationId || connection.metadata?.locationId;
    
    // Ignore updates made by this connection/app to prevent infinite loops if possible
    // Note: the payload might not have the app details, so we use skipShopifySync on database save to prevent loops.
    
    const variants = body.variants || [];
    const Product = mongoose.model('Product');

    for (const sv of variants) {
      const sku = sv.sku || `SHPFY-${sv.id}`;
      let localProduct = await Product.findOne({ sku, clientId: connection.merchantId });
      
      if (!localProduct) {
        const imageUrl = body.images?.[0]?.src || '';
        const imagesUrls = (body.images || []).map(img => img.src);
        localProduct = new Product({
          name: body.title + (variants.length > 1 ? ` - ${sv.title}` : ''),
          title: body.title + (variants.length > 1 ? ` - ${sv.title}` : ''),
          sku,
          price: Number(sv.price) || 0,
          originalPrice: Number(sv.compare_at_price) || Number(sv.price) || 0,
          stock: sv.inventory_quantity || 0,
          quantity: sv.inventory_quantity || 0,
          description: body.body_html || '',
          category: body.product_type || 'Shopify Import',
          merchantId: connection.merchantId,
          clientId: connection.merchantId,
          isActive: body.status === 'active',
          image: imageUrl,
          images: imagesUrls
        });
        localProduct.skipShopifySync = true;
        await localProduct.save();
      } else {
        let changed = false;
        if (localProduct.price !== Number(sv.price)) {
          localProduct.price = Number(sv.price);
          changed = true;
        }
        if (localProduct.stock !== sv.inventory_quantity) {
          localProduct.stock = sv.inventory_quantity;
          localProduct.quantity = sv.inventory_quantity;
          changed = true;
        }
        if (changed) {
          localProduct.skipShopifySync = true;
          await localProduct.save();
        }
      }

      await MarketplaceProduct.findOneAndUpdate(
        { connectionId: connection._id, localProductId: localProduct._id },
        {
          merchantId: connection.merchantId,
          productId: localProduct._id,
          localProductId: localProduct._id,
          marketplaceProductId: `gid://shopify/Product/${body.id}`,
          shopifyProductId: `gid://shopify/Product/${body.id}`,
          shopifyVariantId: `gid://shopify/ProductVariant/${sv.id}`,
          inventoryItemId: `gid://shopify/InventoryItem/${sv.inventory_item_id}`,
          locationId: locationId || `gid://shopify/Location/${body.location_id || 'default'}`,
          listingStatus: 'active',
          syncStatus: 'success',
          lastSyncedAt: new Date()
        },
        { upsert: true }
      );
    }
    return { success: true };
  }

  async handleInventoryWebhook(payload) {
    const { body } = payload;
    const inventoryItemId = `gid://shopify/InventoryItem/${body.inventory_item_id}`;
    const Product = mongoose.model('Product');

    const mapping = await MarketplaceProduct.findOne({
      inventoryItemId,
      marketplace: 'shopify'
    });
    if (mapping) {
      const localProduct = await Product.findById(mapping.productId);
      if (localProduct && localProduct.stock !== body.available) {
        localProduct.stock = body.available;
        localProduct.quantity = body.available;
        localProduct.skipShopifySync = true;
        await localProduct.save();
        console.log(`[Shopify Sync Worker] Webhook synced inventory for sku ${localProduct.sku} to ${body.available}`);
      }
    }
    return { success: true };
  }
}

module.exports = ShopifyMarketplaceAdapter;
