try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: "commonjs",
      target: "es2020",
      esModuleInterop: true
    }
  });
} catch (err) {}

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/Product');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const MarketplaceSyncLog = require('../models/MarketplaceSyncLog');
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

async function shopifyGraphqlRequest(shopDomain, accessToken, query, variables = {}) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch (err) {
    throw new Error(`Shopify API HTTP ${response.status}: Non-JSON response: ${responseText.substring(0, 500)}`);
  }

  if (!response.ok) {
    const errMsg = json?.errors ? json.errors.map(e => e.message).join(', ') : responseText.substring(0, 500);
    throw new Error(`Shopify API error (HTTP ${response.status}): ${errMsg}`);
  }

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL error: ${json.errors.map(e => e.message).join(', ')}`);
  }

  return json;
}

async function reconcileProduct(product, shopDomain, accessToken) {
  // 1. Reconcile by exact SKU
  if (product.sku) {
    try {
      const skuRes = await shopifyGraphqlRequest(shopDomain, accessToken, `
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
      const matchedVariant = skuRes.data?.productVariants?.edges?.[0]?.node;
      if (matchedVariant) {
        return {
          shopifyProductId: matchedVariant.product.id,
          shopifyVariantId: matchedVariant.id,
          inventoryItemId: matchedVariant.inventoryItem.id
        };
      }
    } catch (err) {
      console.warn(`[Backfill] SKU match warning for ${product.sku}: ${err.message}`);
    }
  }

  // 2. Reconcile by metafield
  for (const ns of ['retail_verse', 'retailverse']) {
    try {
      const metaRes = await shopifyGraphqlRequest(shopDomain, accessToken, `
        query findProductByMetafield($query: String!) {
          products(first: 1, query: $query) {
            edges {
              node {
                id
                variants(first: 1) {
                  edges {
                    node {
                      id
                      inventoryItem { id }
                    }
                  }
                }
              }
            }
          }
        }
      `, { query: `metafield:${ns}.local_product_id:${product._id}` });
      const matchedNode = metaRes.data?.products?.edges?.[0]?.node;
      if (matchedNode) {
        const defaultVariant = matchedNode.variants?.edges?.[0]?.node;
        return {
          shopifyProductId: matchedNode.id,
          shopifyVariantId: defaultVariant?.id,
          inventoryItemId: defaultVariant?.inventoryItem?.id
        };
      }
    } catch (err) {
      console.warn(`[Backfill] Metafield (${ns}) match warning: ${err.message}`);
    }
  }

  return null;
}

async function runBackfill() {
  console.log("\n=======================================================");
  console.log("Starting One-Time Idempotent Shopify Product Backfill");
  console.log("=======================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("[Backfill] Connected to MongoDB.");

  // Find active Shopify connection
  const connections = await MarketplaceConnection.find({
    marketplace: 'shopify',
    status: 'connected'
  });

  if (!connections || connections.length === 0) {
    console.error("[Backfill ERROR] No connected Shopify account found in database.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const connection = connections.find(c => (c.storeUrl || c.shopDomain || '').includes('retail-verse-test')) || connections[0];
  const shopDomain = connection.storeUrl || connection.shopDomain;
  const accessToken = decryptSecret(connection.credentials?.encryptedAccessToken || connection.accessToken);

  console.log(`[Backfill] Target Connection ID: ${connection._id}`);
  console.log(`[Backfill] Target Shop Domain: ${shopDomain}`);

  // STEP 3: Verify Shopify shop domain at runtime
  const shopRes = await shopifyGraphqlRequest(shopDomain, accessToken, `
    query {
      shop {
        name
        myshopifyDomain
      }
    }
  `);

  const myshopifyDomain = shopRes.data?.shop?.myshopifyDomain;
  console.log(`[Backfill] Verified Runtime Shop Domain: ${myshopifyDomain} (${shopRes.data?.shop?.name})`);

  if (myshopifyDomain !== 'retail-verse-test.myshopify.com') {
    console.error(`[Backfill ERROR] Shop domain mismatch! Expected retail-verse-test.myshopify.com, got ${myshopifyDomain}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // STEP 8: Resolve active fulfillment location
  const bridgeGraphql = (shop, token, query, variables) => shopifyGraphqlRequest(shop, token, query, variables);
  const locationId = await resolveShopifyLocation(connection, shopDomain, accessToken, bridgeGraphql);
  console.log(`[Backfill] Active Shopify Location ID: ${locationId}`);

  if (!locationId) {
    console.error("[Backfill ERROR] Could not resolve active Shopify inventory location.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // STEP 5: Query source-of-truth local products
  const products = await Product.find({ isActive: true }).lean();
  console.log(`\n[Backfill Diagnostic] Total active local products found: ${products.length}`);
  products.forEach((p, idx) => {
    console.log(` ${idx + 1}. ID: ${p._id} | Title: ${p.name || p.title} | SKU: ${p.sku} | Price: $${p.price} | Stock: ${p.stock} | tenantId: ${p.clientId || p.merchantId}`);
  });

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const product of products) {
    console.log(`\n-------------------------------------------------------`);
    console.log(`Processing Product: "${product.name || product.title}" (SKU: ${product.sku}, ID: ${product._id})`);

    if (!product.sku || (!product.name && !product.title)) {
      console.warn(` [SKIP] Missing required fields (SKU or Title)`);
      skippedCount++;
      continue;
    }

    try {
      let mapping = await MarketplaceProduct.findOne({
        connectionId: connection._id,
        localProductId: product._id
      });

      if (!mapping) {
        const reconciled = await reconcileProduct(product, shopDomain, accessToken);
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
              locationId,
              shopifyLocationId: locationId,
              listingStatus: 'active',
              syncStatus: 'success',
              lastSyncedAt: new Date()
            },
            { upsert: true, new: true }
          );
          console.log(` [RECONCILED] Matched existing Shopify product by SKU/metafield: ${reconciled.shopifyProductId}`);
        }
      }

      let shopifyProductId, shopifyVariantId, inventoryItemId;
      let isNew = !mapping;

      const productInput = {
        title: product.name || product.title,
        descriptionHtml: product.description || '',
        vendor: product.brand || product.vendor || 'Retail Verse',
        productType: product.category || 'General',
        status: product.isActive !== false ? 'ACTIVE' : 'DRAFT',
        tags: product.tags && Array.isArray(product.tags) ? product.tags.join(', ') : '',
        metafields: [
          {
            namespace: 'retail_verse',
            key: 'local_product_id',
            value: String(product._id),
            type: 'single_line_text_field'
          }
        ]
      };

      if (!isNew && mapping.shopifyProductId) {
        // Check if exists on Shopify
        try {
          const checkRes = await shopifyGraphqlRequest(shopDomain, accessToken, `
            query getProduct($id: ID!) {
              product(id: $id) { id title }
            }
          `, { id: mapping.shopifyProductId });

          if (checkRes.data?.product?.id) {
            shopifyProductId = mapping.shopifyProductId;
            shopifyVariantId = mapping.shopifyVariantId;
            inventoryItemId = mapping.inventoryItemId;

            // Update existing product
            await shopifyGraphqlRequest(shopDomain, accessToken, `
              mutation UpdateProduct($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
                productUpdate(product: $product, media: $media) {
                  product { id title }
                  userErrors { field message }
                }
              }
            `, {
              product: {
                id: shopifyProductId,
                title: productInput.title,
                descriptionHtml: productInput.descriptionHtml,
                vendor: productInput.vendor,
                productType: productInput.productType,
                status: productInput.status,
                tags: productInput.tags
              },
              media: []
            });

            updatedCount++;
            console.log(` [UPDATED] Updated Shopify product ${shopifyProductId}`);
          } else {
            isNew = true;
          }
        } catch (err) {
          isNew = true;
        }
      }

      if (isNew) {
        // Create new Shopify product
        const createRes = await shopifyGraphqlRequest(shopDomain, accessToken, `
          mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
            productCreate(product: $product, media: $media) {
              product {
                id
                title
                variants(first: 1) {
                  nodes {
                    id
                    sku
                    inventoryItem { id tracked }
                  }
                }
              }
              userErrors { field message }
            }
          }
        `, { product: productInput, media: [] });

        const createdProd = createRes.data?.productCreate?.product;
        if (!createdProd) {
          const errs = createRes.data?.productCreate?.userErrors || [];
          throw new Error('Product creation failed: ' + errs.map(e => e.message).join('; '));
        }

        shopifyProductId = createdProd.id;
        const defaultVar = createdProd.variants?.nodes?.[0];
        shopifyVariantId = defaultVar?.id;
        inventoryItemId = defaultVar?.inventoryItem?.id;

        createdCount++;
        console.log(` [CREATED] Created new Shopify product ${shopifyProductId}`);
      }

      // Update variant SKU and price
      if (shopifyVariantId) {
        const variantInput = {
          id: shopifyVariantId,
          price: String(Number(product.price) || 0),
          inventoryItem: {
            tracked: true,
            sku: product.sku
          }
        };
        if (product.originalPrice || product.comparePrice) {
          const cp = Number(product.comparePrice || product.originalPrice);
          if (cp > Number(product.price)) variantInput.compareAtPrice = String(cp);
        }

        await shopifyGraphqlRequest(shopDomain, accessToken, `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `, { productId: shopifyProductId, variants: [variantInput] });
      }

      // Set Stock Quantity at active location
      const availableStock = Number(product.stock || 0);
      await ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, false, bridgeGraphql);
      await activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, bridgeGraphql);
      await setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, availableStock, product._id, bridgeGraphql);
      const verifiedStock = await verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, availableStock, bridgeGraphql);

      console.log(` [STOCK] Set & verified stock quantity: ${verifiedStock} (Expected: ${availableStock})`);

      // Persist Mapping
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
          lastSyncedAt: new Date(),
          syncError: ''
        },
        { upsert: true, new: true }
      );

      results.push({
        productId: product._id,
        title: product.name || product.title,
        sku: product.sku,
        status: isNew ? 'created' : 'updated',
        shopifyProductId,
        shopifyVariantId,
        stock: verifiedStock
      });

    } catch (err) {
      console.error(` [FAILED] Error syncing product "${product.name || product.title}": ${err.message}`);
      failedCount++;
      results.push({
        productId: product._id,
        title: product.name || product.title,
        sku: product.sku,
        status: 'failed',
        error: err.message
      });
    }
  }

  // Update connection lastSyncAt
  connection.lastSyncAt = new Date();
  connection.lastSuccessfulSync = connection.lastSyncAt;
  await connection.save();

  console.log(`\n=======================================================`);
  console.log(`BACKFILL SUMMARY REPORT`);
  console.log(`=======================================================`);
  console.log(`Shop Domain: ${shopDomain}`);
  console.log(`Local Products Found: ${products.length}`);
  console.log(`Created in Shopify: ${createdCount}`);
  console.log(`Updated in Shopify: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`=======================================================\n`);

  await mongoose.disconnect();
}

runBackfill().catch(err => {
  console.error("[Backfill Uncaught Error]:", err);
  process.exit(1);
});
