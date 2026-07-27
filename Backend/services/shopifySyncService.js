const mongoose = require('mongoose');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const MarketplaceSyncRun = require('../models/MarketplaceSyncRun');
const MarketplaceSyncLog = require('../models/MarketplaceSyncLog');
const MarketplaceLocation = require('../models/MarketplaceLocation');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { decryptSecret } = require('../lib/marketplaces/encryption');
const {
  getAvailableStock,
  resolveShopifyLocation,
  ensureInventoryTracking,
  activateInventoryItem,
  setShopifyStock,
  verifyShopifyInventory,
  withRetry
} = require('../utils/inventoryHelper');

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function shopifyGraphqlRequest(shopDomain, accessToken, query, variables = {}) {
  if (!shopDomain) throw new Error('Shop domain is required for Shopify API request');
  if (!accessToken) throw new Error('Access token is required for Shopify API request');

  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const controller = new AbortController();
  const timeoutMs = 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

    clearTimeout(timeoutId);

    const responseText = await response.text();
    let json;
    try {
      json = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error(`Shopify API HTTP ${response.status}: Non-JSON response. Body: ${responseText.substring(0, 1000)}`);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '10';
      const err = new Error(`Shopify API rate limited (HTTP 429). Retry after ${retryAfter}s.`);
      err.statusCode = 429;
      err.retryAfter = parseInt(retryAfter, 10);
      err.isThrottle = true;
      throw err;
    }

    if (!response.ok) {
      const errMsg = json?.errors
        ? json.errors.map(e => e.message || JSON.stringify(e)).join(', ')
        : JSON.stringify(json).substring(0, 500);
      const err = new Error(`Shopify API error (HTTP ${response.status}): ${errMsg}`);
      err.statusCode = response.status;
      err.responseBody = json;
      throw err;
    }

    if (json.errors && json.errors.length > 0) {
      const errMessages = json.errors.map(e => e.message || JSON.stringify(e)).join(', ');
      const err = new Error(`Shopify GraphQL error: ${errMessages}`);
      err.statusCode = 200;
      err.graphQLErrors = json.errors;
      err.responseBody = json;
      throw err;
    }

    const cost = json.extensions?.cost;
    if (cost?.throttleStatus && cost.throttleStatus.currentlyAvailable !== undefined) {
      const requestedQueryCost = cost.throttleStatus.requestedQueryCost || 10;
      if (cost.throttleStatus.currentlyAvailable < requestedQueryCost) {
        const restoreRate = cost.throttleStatus.restoreRate || 50;
        const delayMs = Math.ceil((requestedQueryCost - cost.throttleStatus.currentlyAvailable) / restoreRate) * 1000 + 1000;
        const err = new Error(`Shopify GraphQL throttled. Retry after ${delayMs}ms`);
        err.isThrottle = true;
        err.retryAfterMs = delayMs;
        err.statusCode = 429;
        err.responseBody = json;
        throw err;
      }
    }

    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Shopify API request timed out after ${timeoutMs}ms`);
    }
    if (err.statusCode || err.isThrottle || err.graphQLErrors) {
      throw err;
    }
    throw new Error(`Shopify API request failed: ${err.message}`);
  }
}

function assertShopifyMutationSuccess(response, mutationName) {
  if (response.errors?.length) {
    throw new Error(
      response.errors.map(error => error.message).join('; ')
    );
  }

  const payload = response.data?.[mutationName];

  if (!payload) {
    throw new Error(`Missing ${mutationName} payload`);
  }

  if (payload.userErrors?.length) {
    throw new Error(
      payload.userErrors
        .map(error => {
          const field = Array.isArray(error.field)
            ? error.field.join('.')
            : error.field || 'unknown';
          return `${field}: ${error.message}`;
        })
        .join('; ')
    );
  }

  return payload;
}

async function getShopifyLocations(connection) {
  const shopDomain = connection.storeUrl || connection.shopDomain;
  const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
  const locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, shopifyGraphqlRequest);
  return { shopifyLocationId: locationId };
}

async function reconcileShopifyProductBySku(product, shopDomain, accessToken) {
  if (!product.sku) return null;
  try {
    const result = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query findVariantBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              product { id }
              inventoryItem { id }
            }
          }
        }
      }
    `, { query: `sku:${product.sku}` });
    const matched = result.data?.productVariants?.edges?.[0]?.node;
    if (matched) {
      console.log(`[ShopifySyncService] Reconciled product ${product._id} by SKU (${product.sku})`);
      return {
        shopifyProductId: matched.product.id,
        shopifyVariantId: matched.id,
        inventoryItemId: matched.inventoryItem.id
      };
    }
  } catch (err) {
    console.warn(`[ShopifySyncService] SKU reconciliation failed for ${product.sku}: ${err.message}`);
  }
  return null;
}

async function checkShopifyProductExists(shopDomain, accessToken, shopifyProductId) {
  try {
    const result = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          status
        }
      }
    `, { id: shopifyProductId });
    return result.data?.product || null;
  } catch (err) {
    return null;
  }
}

function buildVariantInput(product, variantId) {
  const v = {
    price: String(Number(product.price) || 0)
  };
  if (variantId) v.id = variantId;
  const comparePrice = Number(product.comparePrice) || Number(product.originalPrice) || 0;
  if (comparePrice > 0 && comparePrice !== Number(product.price)) {
    v.compareAtPrice = String(comparePrice);
  }
  const weight = Number(product.weight) || 0;
  if (weight > 0) {
    v.weight = weight;
    v.weightUnit = 'KILOGRAMS';
  }
  if (product.barcode) {
    v.barcode = String(product.barcode);
  }
  v.inventoryItem = { tracked: true };
  if (product.sku) v.inventoryItem.sku = product.sku;
  if (product.costPrice || product.cost) {
    const cost = Number(product.costPrice) || Number(product.cost) || 0;
    if (cost > 0) v.inventoryItem.cost = String(cost);
  }
  return v;
}



async function syncProductImages(product, shopifyProductId, shopDomain, accessToken) {
  const productImages = product.images && product.images.length > 0
    ? product.images
    : (product.image ? [product.image] : []);
  if (productImages.length === 0) return { warnings: [] };

  const warnings = [];

  const validImages = productImages.filter(url => {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) return false;
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://10.') || url.startsWith('http://192.168.')) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
      return true;
    } catch {
      return false;
    }
  });

  const invalidCount = productImages.length - validImages.length;
  if (invalidCount > 0) {
    warnings.push(`${invalidCount} image(s) skipped: invalid or non-public URLs`);
  }

  if (validImages.length === 0) return { warnings };

  try {
    const existingData = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query getProductImages($id: ID!) {
        product(id: $id) {
          images(first: 50) {
            nodes { url }
          }
        }
      }
    `, { id: shopifyProductId });

    const existingUrls = (existingData.data?.product?.images?.nodes || []).map(img => img.url.split('?')[0]);

    const imagesToUpload = validImages.filter(url => {
      const cleanUrl = url.split('?')[0];
      return !existingUrls.some(existUrl => existUrl.includes(cleanUrl) || cleanUrl.includes(existUrl));
    });

    if (imagesToUpload.length > 0) {
      console.log(`[ShopifySyncService] Uploading ${imagesToUpload.length} images for product ${product._id}`);
      await shopifyGraphqlRequest(shopDomain, accessToken, `
        mutation productImagesCreate($productId: ID!, $images: [ImageInput!]!) {
          productImagesCreate(productId: $productId, images: $images) {
            userErrors { field message }
          }
        }
      `, { productId: shopifyProductId, images: imagesToUpload.map(u => ({ src: u })) });
    }
  } catch (err) {
    warnings.push(`Image sync error: ${err.message}`);
    console.warn(`[ShopifySyncService] Image sync warning for ${product._id}: ${err.message}`);
  }

  return { warnings };
}

async function publishToOnlineStore(shopDomain, accessToken, shopifyProductId) {
  try {
    const result = await shopifyGraphqlRequest(shopDomain, accessToken, `
      query getPublications {
        publications(first: 10) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);

    const publications = result.data?.publications?.edges || [];
    const onlineStorePub = publications.find(e =>
      e.node.name === 'Online Store' || e.node.id.includes('OnlineStore')
    );

    if (!onlineStorePub) {
      console.log(`[ShopifySyncService] No Online Store publication found. Product created in Admin only.`);
      return { published: false, warning: 'No Online Store publication found. Product visible in Admin only.' };
    }

    const publishResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `, {
      id: shopifyProductId,
      input: [{ publicationId: onlineStorePub.node.id }]
    });

    const pubErrors = publishResult.data?.publishablePublish?.userErrors || [];
    if (pubErrors.length > 0) {
      const msg = pubErrors.map(e => e.message).join(', ');
      console.warn(`[ShopifySyncService] Publication warning: ${msg}`);
      return { published: false, warning: `Publication issue: ${msg}` };
    }

    console.log(`[ShopifySyncService] Published product ${shopifyProductId} to Online Store`);
    return { published: true };
  } catch (err) {
    console.warn(`[ShopifySyncService] Publication failed: ${err.message}`);
    return { published: false, warning: `Publication error: ${err.message}` };
  }
}

async function fetchShopifyProductDetails(shopDomain, accessToken, shopifyProductId) {
  const result = await shopifyGraphqlRequest(shopDomain, accessToken, `
    query getProduct($id: ID!) {
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
  `, { id: shopifyProductId });
  return result.data?.product;
}

async function createShopifyProduct(product, shopDomain, accessToken, locationId) {
  const productInput = {
    title: product.name || product.title || 'Untitled Product',
    descriptionHtml: product.description || '',
    vendor: product.brand || product.vendor || 'Retail Verse',
    productType: product.category || 'General',
    status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
    tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : '',
    metafields: [
      {
        namespace: 'retailverse',
        key: 'local_product_id',
        value: String(product._id),
        type: 'single_line_text_field'
      }
    ]
  };

  console.log('[Shopify Sync] mutation', {
    operation: 'productCreate',
    title: productInput.title,
    variableType: 'ProductCreateInput'
  });

  const createResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
    mutation CreateProduct(
      $product: ProductCreateInput!
      $media: [CreateMediaInput!]
    ) {
      productCreate(product: $product, media: $media) {
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
        userErrors { field message }
      }
    }
  `, { product: productInput, media: [] });

  const createPayload = assertShopifyMutationSuccess(createResult, 'productCreate');

  const createdProduct = createPayload.product;
  if (!createdProduct) throw new Error('Shopify product creation returned empty product');

  const shopifyProductId = createdProduct.id;
  const defaultVariant = createdProduct.variants?.nodes?.[0];
  const shopifyVariantId = defaultVariant?.id;
  const inventoryItemId = defaultVariant?.inventoryItem?.id;

  console.log(`[ShopifySyncService] Created Shopify product ${shopifyProductId}, variant ${shopifyVariantId}, inventoryItem ${inventoryItemId}`);

  if (shopifyVariantId) {
    const variantInput = buildVariantInput(product, shopifyVariantId);
    const variantResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }
    `, { productId: shopifyProductId, variants: [variantInput] });

    const varErrors = variantResult.data?.productVariantsBulkUpdate?.userErrors || [];
    if (varErrors.length > 0) {
      console.warn(`[ShopifySyncService] Variant update userErrors: ${varErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    } else {
      console.log(`[ShopifySyncService] Updated variant SKU/price for variant ${shopifyVariantId}`);
    }
  }

  const { warnings: imgWarnings } = await syncProductImages(product, shopifyProductId, shopDomain, accessToken);

  const pubResult = await publishToOnlineStore(shopDomain, accessToken, shopifyProductId);

  const warnings = [...imgWarnings];
  if (pubResult.warning) warnings.push(pubResult.warning);

  return { shopifyProductId, shopifyVariantId, inventoryItemId, warnings };
}

async function updateShopifyProduct(product, mapping, shopDomain, accessToken) {
  const shopifyProductId = mapping.shopifyProductId;
  const shopifyVariantId = mapping.shopifyVariantId;
  const inventoryItemId = mapping.inventoryItemId;

  const existingProduct = await checkShopifyProductExists(shopDomain, accessToken, shopifyProductId);
  if (!existingProduct) {
    console.log(`[ShopifySyncService] Shopify product ${shopifyProductId} no longer exists. Will recreate.`);
    return null; // signals recreation needed
  }

  const productInput = {
    id: shopifyProductId,
    title: product.name || product.title,
    descriptionHtml: product.description || '',
    vendor: product.brand || product.vendor || 'Retail Verse',
    productType: product.category || 'General',
    status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
    tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : ''
  };

  console.log('[Shopify Sync] mutation', {
    operation: 'productUpdate',
    productId: productInput.id,
    title: productInput.title,
    variableType: 'ProductUpdateInput'
  });

  const updateResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
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
        userErrors { field message }
      }
    }
  `, { product: productInput, media: [] });

  assertShopifyMutationSuccess(updateResult, 'productUpdate');
  console.log(`[ShopifySyncService] Updated Shopify product ${shopifyProductId}`);

  if (shopifyVariantId) {
    const variantInput = buildVariantInput(product, shopifyVariantId);
    const variantResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }
    `, { productId: shopifyProductId, variants: [variantInput] });

    const varErrors = variantResult.data?.productVariantsBulkUpdate?.userErrors || [];
    if (varErrors.length > 0) {
      console.warn(`[ShopifySyncService] Variant update userErrors: ${varErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    }
  }

  const { warnings: imgWarnings } = await syncProductImages(product, shopifyProductId, shopDomain, accessToken);

  const pubResult = await publishToOnlineStore(shopDomain, accessToken, shopifyProductId);

  const warnings = [...imgWarnings];
  if (pubResult.warning) warnings.push(pubResult.warning);

  return { shopifyProductId, shopifyVariantId, inventoryItemId, warnings };
}

async function syncSingleProductInline(product, connection, shopDomain, accessToken, locationIdInput) {
  const result = {
    productId: product._id,
    productName: product.name || product.title || 'Untitled',
    sku: product.sku || '',
    status: 'not_synced',
    error: null,
    warnings: [],
    shopifyProductId: null,
    shopifyVariantId: null,
    inventoryItemId: null,
    productSynced: false,
    inventorySynced: false
  };

  if (!product.name && !product.title) {
    result.status = 'failed';
    result.error = 'Missing product name or title';
    return result;
  }

  if (product.price === undefined || product.price === null || isNaN(Number(product.price))) {
    result.status = 'failed';
    result.error = `Invalid price: ${product.price}`;
    return result;
  }

  // 1. Read authoritative Retail Verse stock
  let availableStock = 0;
  try {
    availableStock = await getAvailableStock(product._id);
  } catch (stockErr) {
    console.warn(`[ShopifyInventorySync] Failed to read stock for product ${product._id}: ${stockErr.message}`);
  }

  // 3. Resolve active location
  let locationId = locationIdInput;
  try {
    locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, shopifyGraphqlRequest);
  } catch (locErr) {
    result.status = 'failed';
    result.error = locErr.message;
    return result;
  }

  if (!locationId) {
    result.status = 'failed';
    result.error = 'No active Shopify inventory location was found. Create or activate a location in Shopify and retry the sync.';
    return result;
  }

  let mapping = await MarketplaceProduct.findOne({
    connectionId: connection._id,
    localProductId: product._id
  });

  if (!mapping) {
    const reconciled = await reconcileShopifyProductBySku(product, shopDomain, accessToken);
    if (reconciled) {
      mapping = await MarketplaceProduct.findOneAndUpdate(
        { connectionId: connection._id, localProductId: product._id },
        {
          merchantId: connection.merchantId,
          productId: product._id,
          connectionId: connection._id,
          shopDomain,
          marketplace: 'shopify',
          localProductId: product._id,
          shopifyProductId: reconciled.shopifyProductId,
          shopifyVariantId: reconciled.shopifyVariantId,
          inventoryItemId: reconciled.inventoryItemId,
          locationId: locationId || undefined,
          shopifyLocationId: locationId || undefined,
          listingStatus: 'active',
          syncStatus: 'success',
          lastSyncedAt: new Date()
        },
        { upsert: true, new: true }
      );
      console.log(`[ShopifySyncService] Mapping created via reconciliation for product ${product._id}`);
    }
  }

  let shopifyProductId, shopifyVariantId, inventoryItemId;
  let isNewProduct = !mapping;
  let warnings = [];

  try {
    // 2. Create or Update Shopify Product shell
    if (mapping && mapping.shopifyProductId) {
      const updateResult = await withRetry(() => updateShopifyProduct(product, mapping, shopDomain, accessToken));
      if (updateResult === null) {
        isNewProduct = true;
      } else {
        shopifyProductId = updateResult.shopifyProductId;
        shopifyVariantId = updateResult.shopifyVariantId;
        inventoryItemId = updateResult.inventoryItemId;
        warnings = updateResult.warnings || [];
        result.productSynced = true;
      }
    }

    if (isNewProduct) {
      const createResult = await withRetry(() => createShopifyProduct(product, shopDomain, accessToken, locationId));
      shopifyProductId = createResult.shopifyProductId;
      shopifyVariantId = createResult.shopifyVariantId;
      inventoryItemId = createResult.inventoryItemId;
      warnings = createResult.warnings || [];
      result.productSynced = true;
    }

    // 4. Retrieve Shopify Variant and Inventory Item ID
    if (!inventoryItemId && shopifyProductId) {
      const fetchedProduct = await withRetry(() => fetchShopifyProductDetails(shopDomain, accessToken, shopifyProductId));
      const variants = fetchedProduct?.variants?.nodes || [];
      
      // Match by SKU first
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

    // Structured Sync Logging - Start
    console.log(`[ShopifyInventorySync] Start`);
    console.log(`[ShopifyInventorySync] Retail Verse product ID: ${product._id}`);
    console.log(`[ShopifyInventorySync] SKU: ${product.sku}`);
    console.log(`[ShopifyInventorySync] Source stock: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Shopify product ID: ${shopifyProductId}`);
    console.log(`[ShopifyInventorySync] Shopify variant ID: ${shopifyVariantId}`);
    console.log(`[ShopifyInventorySync] Inventory item ID: ${inventoryItemId}`);
    console.log(`[ShopifyInventorySync] Location ID: ${locationId}`);

    // 5. Enable Inventory Tracking & Read Previous Quantity
    let previousShopifyQuantity = 0;
    try {
      const prevRes = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
        query GetPrevQty($id: ID!) {
          inventoryItem(id: $id) {
            id
            tracked
            inventoryLevels(first: 10) {
              nodes {
                location { id }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
      `, { id: inventoryItemId }));
      const invNodes = prevRes.data?.inventoryItem?.inventoryLevels?.nodes || [];
      const matchedLocLevel = invNodes.find(n => String(n.location?.id) === String(locationId));
      if (matchedLocLevel) {
        const qtyObj = matchedLocLevel.quantities?.find(q => q.name === 'available');
        if (qtyObj) previousShopifyQuantity = Number(qtyObj.quantity) || 0;
      }
    } catch (prevErr) {
      console.warn(`[ShopifyInventorySync] Non-fatal error reading previous quantity: ${prevErr.message}`);
    }

    const itemDetails = await withRetry(() => shopifyGraphqlRequest(shopDomain, accessToken, `
      query GetInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          id
          tracked
        }
      }
    `, { id: inventoryItemId }));
    const isTracked = itemDetails.data?.inventoryItem?.tracked || false;
    console.log(`[ShopifyInventorySync] Tracking enabled: ${isTracked}`);

    await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, isTracked, shopifyGraphqlRequest);

    // 6. Activate Inventory Item at Shopify Location
    await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, shopifyGraphqlRequest);

    // 7. Set Absolute Available Quantity
    await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, shopifyGraphqlRequest);

    // 11. Verify Inventory After Update
    const verifiedQty = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, shopifyGraphqlRequest);
    console.log(`[ShopifyInventorySync] Expected quantity: ${availableStock}`);
    console.log(`[ShopifyInventorySync] Actual quantity: ${verifiedQty}`);
    
    // Structured Sync Logging - Completed
    console.log(`[ShopifyInventorySync] Completed`);

    result.inventorySynced = true;

    // 9. Save Sync Mapping and Detailed Status
    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: connection._id, localProductId: product._id },
      {
        merchantId: connection.merchantId,
        productId: product._id,
        connectionId: connection._id,
        shopDomain,
        marketplace: 'shopify',
        localProductId: product._id,
        shopifyProductId,
        shopifyVariantId,
        shopifyInventoryItemId: inventoryItemId,
        inventoryItemId,
        locationId,
        shopifyLocationId: locationId,
        listingStatus: 'active',
        syncStatus: 'success',
        status: 'Synced',
        requestedQuantity: availableStock,
        previousShopifyQuantity,
        finalShopifyQuantity: verifiedQty,
        attemptCount: (mapping?.attemptCount || 0) + 1,
        lastAttemptAt: new Date(),
        lastSyncedAt: new Date(),
        errorCode: '',
        errorMessage: '',
        lastError: '',
        syncError: ''
      },
      { upsert: true, new: true }
    );

    result.status = 'synced';
    result.shopifyProductId = shopifyProductId;
    result.shopifyVariantId = shopifyVariantId;
    result.inventoryItemId = inventoryItemId;
    result.warnings = warnings;

  } catch (syncErr) {
    // Structured Sync Logging - Failed
    console.error(`[ShopifyInventorySync] Failed: ${syncErr.message}`);
    console.log(`[ShopifyInventorySync] GraphQL userErrors: ${syncErr.message}`);
    console.log(`[ShopifyInventorySync] Failed`);

    const errMsg = syncErr.message;
    result.error = errMsg;
    result.status = 'failed';

    let detailStatus = 'inventory_sync_failed';
    if (!product.sku) {
      detailStatus = 'missing_sku';
    } else if (!locationId) {
      detailStatus = 'missing_location';
    } else if (errMsg.includes('scope') || errMsg.includes('permission')) {
      detailStatus = 'missing_permission';
    } else if (errMsg.includes('token') || errMsg.includes('unauthorized') || errMsg.includes('401')) {
      detailStatus = 'reconnection_required';
    }

    await MarketplaceProduct.findOneAndUpdate(
      { connectionId: connection._id, localProductId: product._id },
      {
        merchantId: connection.merchantId,
        productId: product._id,
        connectionId: connection._id,
        shopDomain,
        marketplace: 'shopify',
        localProductId: product._id,
        shopifyProductId: shopifyProductId || mapping?.shopifyProductId,
        shopifyVariantId: shopifyVariantId || mapping?.shopifyVariantId,
        inventoryItemId: inventoryItemId || mapping?.inventoryItemId,
        locationId: locationId || mapping?.locationId,
        shopifyLocationId: locationId || mapping?.shopifyLocationId,
        listingStatus: 'active',
        syncStatus: detailStatus,
        status: 'Failed',
        requestedQuantity: availableStock,
        attemptCount: (mapping?.attemptCount || 0) + 1,
        lastAttemptAt: new Date(),
        errorCode: detailStatus,
        errorMessage: errMsg.substring(0, 500),
        syncError: errMsg.substring(0, 500),
        lastError: errMsg.substring(0, 500),
        lastSyncedAt: new Date()
      },
      { upsert: true, new: true }
    );
  }

  return result;
}

class ShopifySyncService {
  async syncSingleProductInline(product, connection, shopDomain, accessToken, locationId) {
    return await syncSingleProductInline(product, connection, shopDomain, accessToken, locationId);
  }

  /**
   * Execute a full product sync for a merchant's Shopify connection.
   * Processes eligible Retail Verse products synchronously.
   */
  async syncProducts(connection, merchantId) {
    const startTime = Date.now();
    const shopDomain = connection.storeUrl || connection.shopDomain;
    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);

    console.log(`[ShopifySyncService] Starting sync for merchant ${merchantId}, shop ${shopDomain}, connection ${connection._id}`);

    const location = await getShopifyLocations(connection);
    const locationId = location ? location.shopifyLocationId : null;
    console.log(`[ShopifySyncService] Using Shopify location: ${locationId}`);

    const products = await Product.find({
      $or: [{ clientId: merchantId }, { merchantId: merchantId }],
      isActive: true
    }).lean();

    console.log(`[ShopifySyncService] Found ${products.length} active Product records for merchant ${merchantId}`);

    let inventoryItems = [];
    try {
      inventoryItems = await Inventory.find({ isActive: true }).lean();
      if (inventoryItems.length > 0) {
        console.log(`[ShopifySyncService] Also found ${inventoryItems.length} Inventory records (no ownership filter available on Inventory model)`);
      }
    } catch (err) {
      console.warn(`[ShopifySyncService] Inventory query failed: ${err.message}`);
    }

    const allSourceProducts = [...products];
    if (inventoryItems.length > 0) {
      const existingSkus = new Set(products.filter(p => p.sku).map(p => p.sku));
      for (const inv of inventoryItems) {
        if (existingSkus.has(inv.sku)) continue;
        if (inv.name || inv.title) {
          allSourceProducts.push({
            _id: inv._id,
            name: inv.name || inv.title,
            title: inv.title || inv.name,
            sku: inv.sku,
            description: inv.description || '',
            category: inv.category || 'General',
            price: inv.price,
            stock: inv.stock !== undefined ? inv.stock : 0,
            image: inv.image || '',
            images: inv.image ? [inv.image] : [],
            isActive: inv.isActive !== false,
            brand: '',
            vendor: '',
            tags: [],
            barcode: '',
            weight: 0,
            comparePrice: 0,
            originalPrice: 0
          });
          existingSkus.add(inv.sku);
        }
      }
      console.log(`[ShopifySyncService] Total after merging Inventory: ${allSourceProducts.length}`);
    }

    let eligibleProducts = allSourceProducts.filter(p => {
      if (!p.name && !p.title) return false;
      if (p.price === undefined || p.price === null || isNaN(Number(p.price)) || Number(p.price) < 0) return false;
      return true;
    });

    console.log(`[ShopifySyncService] Eligible products: ${eligibleProducts.length}`);

    const syncRun = await MarketplaceSyncRun.create({
      merchantId,
      connectionId: connection._id,
      marketplace: 'shopify',
      direction: 'export',
      status: 'running',
      totalCount: eligibleProducts.length,
      queuedCount: eligibleProducts.length,
      activeCount: 0,
      syncedCount: 0,
      failedCount: 0,
      skippedCount: products.length - eligibleProducts.length,
      startedAt: new Date()
    });

    const syncRunId = syncRun._id;
    console.log(`[ShopifySyncService] Sync run ${syncRunId} created. Total: ${eligibleProducts.length}`);

    if (eligibleProducts.length === 0) {
      syncRun.status = 'completed';
      syncRun.completedAt = new Date();
      syncRun.activeCount = 0;
      await syncRun.save();

      connection.lastSyncAt = new Date();
      connection.lastSuccessfulSync = new Date();
      connection.apiHealth = {
        ...connection.apiHealth,
        status: 'healthy',
        lastCheckedAt: new Date(),
        lastSuccessAt: new Date()
      };
      await connection.save();

      return {
        syncRunId,
        total: 0,
        queued: 0,
        active: 0,
        synced: 0,
        failed: 0,
        skipped: products.length,
        message: 'No eligible Retail Verse products were found for this merchant.'
      };
    }

    let syncedCount = 0;
    let failedCount = 0;
    const errors = [];
    const warningsList = [];

    const BATCH_SIZE = 3;

    for (let i = 0; i < eligibleProducts.length; i += BATCH_SIZE) {
      const batch = eligibleProducts.slice(i, i + BATCH_SIZE);
      syncRun.activeCount = batch.length;
      syncRun.queuedCount = eligibleProducts.length - i - batch.length + batch.length;
      await syncRun.save();

      const batchResults = await Promise.allSettled(
        batch.map(async (product) => {
          try {
            return await syncSingleProductInline(product, connection, shopDomain, accessToken, locationId);
          } catch (err) {
            return {
              productId: product._id,
              productName: product.name || product.title || 'Untitled',
              sku: product.sku,
              status: 'failed',
              error: err.message,
              warnings: []
            };
          }
        })
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const r = settled.value;
          if (r.status === 'synced') {
            syncedCount++;
            if (r.warnings && r.warnings.length > 0) {
              warningsList.push({
                productId: r.productId,
                productName: r.productName,
                sku: r.sku,
                warning: r.warnings.join('; ')
              });
            }
          } else {
            failedCount++;
            errors.push({
              productId: r.productId,
              productName: r.productName,
              sku: r.sku,
              error: r.error || 'Unknown error'
            });
          }
        } else {
          failedCount++;
          errors.push({
            productId: 'unknown',
            productName: 'unknown',
            sku: 'unknown',
            error: settled.reason?.message || 'Unknown batch error'
          });
        }
      }

      syncRun.syncedCount = syncedCount;
      syncRun.failedCount = failedCount;
      syncRun.errors = errors;
      syncRun.warnings = warningsList;
      await syncRun.save();

      await MarketplaceSyncLog.create({
        merchantId: connection.merchantId,
        connectionId: connection._id,
        marketplace: 'shopify',
        action: 'SYNC_BATCH',
        level: failedCount > 0 ? 'warn' : 'info',
        message: `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(eligibleProducts.length / BATCH_SIZE)}: +${syncedCount - (syncedCount - batchResults.filter(r => r.status === 'fulfilled' && r.value?.status === 'synced').length)} synced, ${batchResults.filter(r => r.status === 'rejected' || r.value?.status === 'failed').length} failed`
      });

      await sleep(300);
    }

    const finalStatus = failedCount === 0 ? 'completed' : (syncedCount > 0 ? 'partial' : 'failed');

    syncRun.status = finalStatus;
    syncRun.activeCount = 0;
    syncRun.queuedCount = 0;
    syncRun.completedAt = new Date();
    await syncRun.save();

    connection.lastSyncAt = new Date();
    connection.lastSuccessfulSync = new Date();
    connection.apiHealth = {
      ...connection.apiHealth,
      status: failedCount === 0 ? 'healthy' : 'warning',
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: failedCount > 0 ? `${failedCount} product(s) failed to sync` : ''
    };
    await connection.save();

    await MarketplaceSyncLog.create({
      merchantId: connection.merchantId,
      connectionId: connection._id,
      marketplace: 'shopify',
      action: 'SYNC_COMPLETE',
      level: finalStatus === 'completed' ? 'info' : 'warn',
      message: `Sync ${finalStatus}: ${syncedCount} synced, ${failedCount} failed, ${products.length - eligibleProducts.length} skipped out of ${products.length} total`
    });

    const duration = Date.now() - startTime;
    console.log(`[ShopifySyncService] Sync run ${syncRunId} ${finalStatus} in ${duration}ms. Synced: ${syncedCount}, Failed: ${failedCount}`);

    return {
      syncRunId,
      total: eligibleProducts.length,
      queued: 0,
      active: 0,
      synced: syncedCount,
      failed: failedCount,
      skipped: products.length - eligibleProducts.length,
      message: `Sync ${finalStatus}: ${syncedCount} products synced to Shopify, ${failedCount} failed`,
      errors: errors.slice(0, 50),
      warnings: warningsList.slice(0, 50)
    };
  }

  /**
   * Get the latest sync run status for a connection.
   */
  async getSyncStatus(connection) {
    const latestRun = await MarketplaceSyncRun.findOne({
      connectionId: connection._id
    }).sort({ createdAt: -1 }).lean();

    if (!latestRun) {
      return {
        status: 'not_started',
        lastSyncAt: connection.lastSyncAt || null,
        total: 0,
        queued: 0,
        active: 0,
        synced: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        warnings: []
      };
    }

    // Accept all valid synced statuses for backward compatibility
    const SYNCED_STATUSES = ['success', 'synced', 'inventory_synced'];
    const syncedMappings = await MarketplaceProduct.countDocuments({
      connectionId: connection._id,
      syncStatus: { $in: SYNCED_STATUSES },
      shopifyProductId: { $ne: null }
    });

    return {
      status: latestRun.status,
      syncRunId: latestRun._id,
      lastSyncAt: latestRun.completedAt || latestRun.updatedAt || connection.lastSyncAt || null,
      total: latestRun.totalCount || 0,
      queued: latestRun.queuedCount || 0,
      active: latestRun.activeCount || 0,
      synced: latestRun.syncedCount || syncedMappings,
      failed: latestRun.failedCount || 0,
      skipped: latestRun.skippedCount || 0,
      errors: (latestRun.errors || []).slice(0, 50),
      warnings: (latestRun.warnings || []).slice(0, 50)
    };
  }

  /**
   * Verify Shopify connection health including scope validation.
   */
  async checkConnectionHealth(connection) {
    const shopDomain = connection.storeUrl || connection.shopDomain;
    if (!shopDomain) {
      return { status: 'error', message: 'Shop domain not configured' };
    }

    if (!connection.credentials?.encryptedAccessToken) {
      return { status: 'error', message: 'Access token not found. Reconnect the account.' };
    }

    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
    if (!accessToken) {
      return { status: 'error', message: 'Failed to decrypt access token. Reconnect the account.' };
    }

    try {
      const shopResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query {
          shop { name myshopifyDomain }
        }
      `);

      if (!shopResult.data?.shop) {
        return { status: 'error', message: 'Invalid response from Shopify API' };
      }

      console.log(`[ShopifyHealth] Connected to shop: ${shopResult.data.shop.name} (${shopResult.data.shop.myshopifyDomain})`);

      const scopeResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `);

      const installedScopes = (scopeResult.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
      console.log(`[ShopifyHealth] Installed scopes: ${installedScopes.join(', ')}`);

      const requiredScopes = [
        'write_products', 'read_products',
        'write_inventory', 'read_inventory',
        'read_locations'
      ];

      const missingScopes = requiredScopes.filter(s => !installedScopes.includes(s));

      if (missingScopes.length > 0) {
        return {
          status: 'action_required',
          scopes: installedScopes,
          missingScopes,
          message: `Missing Shopify access scopes: ${missingScopes.join(', ')}. Reconnect or reinstall the Shopify app after updating scopes.`
        };
      }

      const locationResult = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query {
          locations(first: 5) {
            edges {
              node { id name isActive }
            }
          }
        }
      `);

      const locations = (locationResult.data?.locations?.edges || []).map(e => e.node);
      const hasLocation = locations.some(l => l.isActive);

      return {
        status: 'healthy',
        scopes: installedScopes,
        locations: locations.length,
        hasActiveLocation: hasLocation,
        shopName: shopResult.data.shop.name,
        shopDomain: shopResult.data.shop.myshopifyDomain,
        message: hasLocation ? 'Connection valid with all required scopes and locations' : 'Connection valid but no active locations for inventory sync'
      };
    } catch (err) {
      console.error(`[ShopifyHealth] Connection check failed: ${err.message}`);
      return {
        status: err.message.includes('access token') || err.message.includes('unauthorized') || err.message.includes('401')
          ? 'disconnected' : 'error',
        message: err.message
      };
    }
  }

  /**
   * Reconciles current inventory quantities for mapped Retail Verse products against Shopify.
   * Compares local stock vs Shopify available stock level, updates mismatches, and returns summary stats.
   */
  async reconcileInventoryQuantities(connection, merchantId) {
    const shopDomain = connection.storeUrl || connection.shopDomain;
    const accessToken = decryptSecret(connection.credentials.encryptedAccessToken);
    const locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, shopifyGraphqlRequest);

    const mappings = await MarketplaceProduct.find({ connectionId: connection._id }).lean();
    let productsChecked = 0;
    let quantitiesUpdated = 0;
    let alreadyMatched = 0;
    let failed = 0;
    const details = [];

    const products = await Product.find({
      $or: [{ clientId: merchantId }, { merchantId }],
      isActive: true
    }).lean();

    for (const product of products) {
      productsChecked++;
      try {
        const localStock = await getAvailableStock(product._id);
        const mapping = mappings.find(m => String(m.localProductId || m.productId) === String(product._id));
        const inventoryItemId = mapping?.inventoryItemId || mapping?.shopifyInventoryItemId;

        let shopifyStock = null;
        if (inventoryItemId && locationId) {
          try {
            const query = `
              query GetLevel($id: ID!) {
                inventoryItem(id: $id) {
                  inventoryLevels(first: 10) {
                    nodes {
                      location { id }
                      quantities(names: ["available"]) { name quantity }
                    }
                  }
                }
              }
            `;
            const res = await shopifyGraphqlRequest(shopDomain, accessToken, query, { id: inventoryItemId });
            const nodes = res.data?.inventoryItem?.inventoryLevels?.nodes || [];
            const matchedLoc = nodes.find(n => String(n.location?.id) === String(locationId));
            if (matchedLoc) {
              const qObj = matchedLoc.quantities?.find(q => q.name === 'available');
              if (qObj) shopifyStock = Number(qObj.quantity);
            }
          } catch (qErr) {}
        }

        if (shopifyStock !== null && shopifyStock === localStock) {
          alreadyMatched++;
          details.push({
            productId: product._id,
            sku: product.sku,
            localStock,
            shopifyStock,
            status: 'matched'
          });
        } else {
          const syncRes = await syncSingleProductInline(product, connection, shopDomain, accessToken, locationId);
          if (syncRes.status === 'synced') {
            quantitiesUpdated++;
            details.push({
              productId: product._id,
              sku: product.sku,
              oldShopifyQuantity: shopifyStock,
              newShopifyQuantity: localStock,
              status: 'updated'
            });
          } else {
            failed++;
            details.push({
              productId: product._id,
              sku: product.sku,
              error: syncRes.error,
              status: 'failed'
            });
          }
        }
      } catch (err) {
        failed++;
        details.push({
          productId: product._id,
          error: err.message,
          status: 'failed'
        });
      }
    }

    return {
      productsChecked,
      quantitiesUpdated,
      alreadyMatched,
      failed,
      shopDomain,
      details
    };
  }
}

module.exports = new ShopifySyncService();
