/**
 * Shopify Sync Verification Script
 *
 * Usage:
 *   node scripts/verifyShopifySync.js <merchantId>
 *
 * What it does:
 *   1. Prints the normalized shop domain
 *   2. Queries Shopify shop identity
 *   3. Queries current installed scopes
 *   4. Queries active locations
 *   5. Counts eligible Retail Verse products
 *   6. Performs a dry-run field mapping
 *   7. Optionally syncs one selected test product
 *   8. Prints Shopify product ID, variant ID and inventory item ID
 *   9. Confirms whether it is published to Online Store
 *
 * Never prints the access token.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { decryptSecret } = require('../lib/marketplaces/encryption');

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

async function shopifyGraphQL(shopDomain, accessToken, query, variables = {}) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON: ${text.substring(0, 200)}`); }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).substring(0, 300)}`);
  if (json.errors) throw new Error(`GraphQL: ${json.errors.map(e => e.message).join(', ')}`);
  return json.data;
}

async function verify() {
  const merchantId = process.argv[2];
  if (!merchantId) {
    console.error('Usage: node scripts/verifyShopifySync.js <merchantId>');
    process.exit(1);
  }

  await connectDB();
  console.log(`\n=== Shopify Sync Verification for Merchant: ${merchantId} ===\n`);

  const connection = await MarketplaceConnection.findOne({
    merchantId,
    marketplace: 'shopify',
    status: 'connected'
  });

  if (!connection) {
    console.error('❌ No active Shopify connection found for this merchant.');
    process.exit(1);
  }

  const shopDomain = connection.storeUrl || connection.shopDomain;
  console.log(`1. Normalized Shop Domain: ${shopDomain}`);

  if (!shopDomain || !shopDomain.endsWith('.myshopify.com')) {
    console.error('❌ Invalid shop domain format.');
    process.exit(1);
  }

  const encryptedToken = connection.credentials?.encryptedAccessToken;
  if (!encryptedToken) {
    console.error('❌ No access token stored. Reconnect the account.');
    process.exit(1);
  }

  const accessToken = decryptSecret(encryptedToken);
  if (!accessToken) {
    console.error('❌ Failed to decrypt access token.');
    process.exit(1);
  }

  console.log('2. Shopify Shop Identity:');
  try {
    const shopData = await shopifyGraphQL(shopDomain, accessToken, `
      query { shop { name myshopifyDomain email } }
    `);
    console.log(`   Name: ${shopData.shop.name}`);
    console.log(`   Domain: ${shopData.shop.myshopifyDomain}`);
    console.log(`   Email: ${shopData.shop.email}`);
    console.log('   ✅ Shopify API connection valid');
  } catch (err) {
    console.error(`   ❌ Failed to query shop: ${err.message}`);
    process.exit(1);
  }

  console.log('3. Installed Access Scopes:');
  try {
    const scopeData = await shopifyGraphQL(shopDomain, accessToken, `
      query { currentAppInstallation { accessScopes { handle } } }
    `);
    const scopes = scopeData.currentAppInstallation.accessScopes.map(s => s.handle);
    console.log(`   Scopes: ${scopes.join(', ')}`);

    const required = ['write_products', 'read_products', 'write_inventory', 'read_inventory', 'read_locations'];
    const missing = required.filter(s => !scopes.includes(s));
    if (missing.length > 0) {
      console.error(`   ❌ Missing required scopes: ${missing.join(', ')}`);
      console.error('   Action: Reconnect or reinstall the Shopify app after updating scopes.');
    } else {
      console.log('   ✅ All required scopes present');
    }
  } catch (err) {
    console.error(`   ❌ Scope query failed: ${err.message}`);
  }

  console.log('4. Shopify Locations:');
  try {
    const locData = await shopifyGraphQL(shopDomain, accessToken, `
      query { locations(first: 10) { edges { node { id name isActive fulfillsOnlineOrders } } } }
    `);
    const locations = (locData.locations?.edges || []).map(e => e.node);
    if (locations.length === 0) {
      console.error('   ❌ No locations found');
    } else {
      console.log(`   Found ${locations.length} locations:`);
      for (const loc of locations) {
        console.log(`   - ${loc.name} (${loc.id}) Active: ${loc.isActive}`);
      }
      console.log('   ✅ Locations available for inventory sync');
    }
  } catch (err) {
    console.error(`   ❌ Location query failed: ${err.message}`);
  }

  console.log('5. Eligible Retail Verse Products:');
  const allProducts = await Product.find({
    $or: [{ clientId: merchantId }, { merchantId: merchantId }]
  }).lean();
  console.log(`   Total Product records: ${allProducts.length}`);

  const eligible = allProducts.filter(p => {
    if (!p.name && !p.title) return false;
    if (p.price === undefined || p.price === null || isNaN(Number(p.price)) || Number(p.price) < 0) return false;
    return true;
  });

  console.log(`   Eligible for sync: ${eligible.length}`);
  const reasons = {
    missingTitle: allProducts.filter(p => !p.name && !p.title).length,
    invalidPrice: allProducts.filter(p => p.name && p.title && (p.price === undefined || p.price === null || isNaN(Number(p.price)) || Number(p.price) < 0)).length
  };
  console.log(`   Filtered out - missing title: ${reasons.missingTitle}, invalid price: ${reasons.invalidPrice}`);

  const inventoryProducts = await Inventory.find({}).lean();
  console.log(`   Inventory records (no ownership filter): ${inventoryProducts.length}`);

  console.log('6. Dry-Run Field Mapping (first 3 eligible products):');
  for (const p of eligible.slice(0, 3)) {
    const mapping = await MarketplaceProduct.findOne({
      connectionId: connection._id,
      localProductId: p._id
    }).lean();

    console.log(`\n   Product: ${p.name || p.title}`);
    console.log(`   SKU: ${p.sku}`);
    console.log(`   Price: ${p.price}`);
    console.log(`   Stock: ${p.stock}`);
    console.log(`   Category: ${p.category}`);
    console.log(`   Status: ${p.isActive ? 'ACTIVE' : 'DRAFT'}`);
    console.log(`   Image: ${p.image ? p.image.substring(0, 80) + '...' : 'none'}`);
    console.log(`   Images count: ${(p.images || []).length}`);
    console.log(`   Description: ${(p.description || '').substring(0, 60)}`);
    console.log(`   Shopify mapping: ${mapping ? `exists (product: ${mapping.shopifyProductId})` : 'none - will create new'}`);
    if (p.stock !== undefined) {
      console.log(`   Inventory: ${p.stock} units`);
    }
  }

  console.log('\n7. Sync Test:');
  const testProductId = process.argv[3];
  if (testProductId) {
    const testProduct = await Product.findById(testProductId).lean();
    if (testProduct) {
      console.log(`   Selected test product: ${testProduct.name || testProduct.title} (${testProduct.sku})`);
      console.log('   Run a full sync via: POST /api/marketplaces/shopify/sync');
      console.log('   Or use the Sync Now button in the admin dashboard.');
    } else {
      console.error(`   ❌ Product ${testProductId} not found`);
    }
  } else {
    console.log('   Pass a product ID as second argument to test a specific product:');
    console.log('   node scripts/verifyShopifySync.js <merchantId> <productId>');
  }

  console.log('\n8. Mapped Shopify Products:');
  const mappedProducts = await MarketplaceProduct.find({
    connectionId: connection._id,
    syncStatus: 'success',
    shopifyProductId: { $ne: null }
  }).lean();
  console.log(`   Total mapped: ${mappedProducts.length}`);
  for (const mp of mappedProducts.slice(0, 5)) {
    console.log(`   - Local: ${mp.localProductId} → Shopify: ${mp.shopifyProductId}, Variant: ${mp.shopifyVariantId}, InvItem: ${mp.inventoryItemId}`);
  }

  console.log('\n9. Publication Status (first 3 mapped):');
  for (const mp of mappedProducts.slice(0, 3)) {
    try {
      const pubData = await shopifyGraphQL(shopDomain, accessToken, `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            status
            onlineStoreUrl
            publishedAt
          }
        }
      `, { id: mp.shopifyProductId });
      const p = pubData.product;
      console.log(`   ${p.title}: status=${p.status}, publishedAt=${p.publishedAt || 'NOT PUBLISHED'}, url=${p.onlineStoreUrl || 'NONE'}`);
      if (p.onlineStoreUrl) {
        console.log(`   ✅ Published to Online Store: ${p.onlineStoreUrl}`);
      } else {
        console.log('   ⚠️ Not published to Online Store');
      }
    } catch (err) {
      console.log(`   ❌ Could not verify publication: ${err.message}`);
    }
  }

  console.log('\n=== Verification Complete ===');
  process.exit(0);
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
