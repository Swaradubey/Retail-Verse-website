const mongoose = require('mongoose');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const shopifySyncService = require('./shopifySyncService');



async function updateInventory({
  tenantId = null,
  productId,
  variantId = null,
  quantity,
  source = 'manual_adjustment',
  referenceId = null,
  updatedAt = null,
  idempotencyKey = null
}) {
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error('Valid productId is required for inventory update.');
  }

  const numericQuantity = Math.max(0, Math.floor(Number(quantity)));
  if (isNaN(numericQuantity)) {
    throw new Error(`Invalid quantity provided: ${quantity}`);
  }

  // 1. Fetch local product
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error(`Product not found with ID: ${productId}`);
  }

  const effectiveTenantId = tenantId || product.clientId || product.merchantId || product.createdBy;
  const previousQuantity = product.stock !== undefined ? Number(product.stock) : 0;
  const sku = product.sku || 'AUTO-GENERATED';
  const updateTimestamp = updatedAt ? new Date(updatedAt) : new Date();

  // Out-of-order / Stale job check: if product was updated after this event timestamp, skip
  if (product.updatedAt && product.updatedAt.getTime() > updateTimestamp.getTime()) {
    console.warn(`[INVENTORY_UPDATE][STALE_SKIPPED] Product ${productId} has newer updatedAt (${product.updatedAt.toISOString()}) than event timestamp (${updateTimestamp.toISOString()}). Update skipped.`);
    return {
      success: true,
      staleSkipped: true,
      previousQuantity,
      newQuantity: previousQuantity,
      shopifyResults: []
    };
  }

  // 2. Persist local update in MongoDB (Product & Inventory collections)
  product.stock = numericQuantity;
  product.updatedAt = updateTimestamp;

  if (variantId && product.variants && Array.isArray(product.variants)) {
    const variant = product.variants.find(v => String(v._id) === String(variantId));
    if (variant) {
      variant.stock = numericQuantity;
      if (variant.quantity !== undefined) variant.quantity = numericQuantity;
    }
  }

  await product.save({ validateBeforeSave: true });

  // Sync to Inventory collection if matching document exists
  try {
    if (sku && sku !== 'AUTO-GENERATED') {
      await Inventory.updateOne(
        { sku },
        { $set: { stock: numericQuantity, updatedAt: updateTimestamp } }
      );
    }
  } catch (invErr) {
    console.warn(`[INVENTORY_UPDATE] Optional Inventory collection sync warning: ${invErr.message}`);
  }

  // 3. Temporary Structured Logging
  console.log(`[INVENTORY_UPDATE] localProductId=${productId} SKU=${sku} previousQuantity=${previousQuantity} newQuantity=${numericQuantity} tenantId=${effectiveTenantId} updateSource=${source} timestamp=${updateTimestamp.toISOString()}`);

  // 4. Trigger Shopify Sync for all connected Shopify marketplace integrations for this product/tenant
  const shopifyResults = [];
  try {
    let connections = [];

    // First: Check existing MarketplaceProduct mappings for this product
    const mappings = await MarketplaceProduct.find({
      $or: [{ localProductId: product._id }, { productId: product._id }],
      marketplace: 'shopify'
    }).lean();

    if (mappings.length > 0) {
      const connIds = mappings.map(m => m.connectionId).filter(Boolean);
      connections = await MarketplaceConnection.find({
        _id: { $in: connIds },
        marketplace: 'shopify',
        status: 'connected'
      });
    }

    // Second: Fallback to querying MarketplaceConnection by tenantId
    if (connections.length === 0) {
      connections = await MarketplaceConnection.find({
        $or: [
          { merchantId: effectiveTenantId },
          { clientId: effectiveTenantId },
          { merchantId: product.merchantId },
          { clientId: product.clientId }
        ],
        marketplace: 'shopify',
        status: 'connected'
      });
    }

    // Third: Fallback to any connected Shopify integration in system
    if (connections.length === 0) {
      connections = await MarketplaceConnection.find({
        marketplace: 'shopify',
        status: 'connected'
      });
    }

    for (const connection of connections) {
      const shopDomain = connection.storeUrl || connection.shopDomain;
      const decryptSecret = require('../lib/marketplaces/encryption').decryptSecret;
      let accessToken = null;
      try {
        accessToken = decryptSecret(connection.credentials?.encryptedAccessToken || connection.accessToken);
      } catch (tokenErr) {
        console.error(`[INVENTORY_UPDATE][Shopify] Failed to decrypt access token for connection ${connection._id}: ${tokenErr.message}`);
      }

      if (accessToken) {
        try {
          const syncResult = await shopifySyncService.syncSingleProductInline(
            product,
            connection,
            shopDomain,
            accessToken
          );
          shopifyResults.push({
            connectionId: connection._id,
            shopDomain,
            syncResult
          });
        } catch (syncErr) {
          console.error(`[INVENTORY_UPDATE][Shopify] Sync error for connection ${connection._id}: ${syncErr.message}`);
          shopifyResults.push({
            connectionId: connection._id,
            shopDomain,
            error: syncErr.message
          });
        }
      }
    }
  } catch (connErr) {
    console.error(`[INVENTORY_UPDATE] Error fetching Shopify connections: ${connErr.message}`);
  }

  return {
    success: true,
    localProductId: product._id,
    sku,
    previousQuantity,
    newQuantity: numericQuantity,
    tenantId: effectiveTenantId,
    source,
    shopifyResults
  };
}

module.exports = {
  updateInventory
};
