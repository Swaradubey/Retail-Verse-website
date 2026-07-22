const mongoose = require('mongoose');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reads the authoritative available stock for a Retail Verse product.
 * @param {string} productId - Product ID (Mongoose ObjectId)
 * @param {string} [variantId] - Optional Variant ID
 * @returns {Promise<number>} Authoritative available stock quantity
 */
async function getAvailableStock(productId, variantId = null) {
  const Product = mongoose.model('Product');
  const Inventory = mongoose.model('Inventory');

  let item = await Product.findById(productId);
  let source = 'Product.stock';
  let sourceStock;
  let sku = 'unknown';

  if (item) {
    sku = item.sku || 'unknown';
    // Check variants if they are present on the product document
    if (variantId && item.variants && Array.isArray(item.variants)) {
      const variant = item.variants.find(v => String(v._id) === String(variantId));
      if (variant) {
        sourceStock = variant.stock !== undefined ? variant.stock : variant.quantity;
        source = `Product.variants[${variantId}].stock`;
      }
    }
    
    if (sourceStock === undefined) {
      sourceStock = item.stock !== undefined ? item.stock : item.quantity;
    }
  } else {
    // Try to find in Inventory collection
    item = await Inventory.findById(productId);
    if (item) {
      sku = item.sku || 'unknown';
      sourceStock = item.stock;
      source = 'Inventory.stock';
    }
  }

  if (sourceStock === undefined || sourceStock === null || isNaN(Number(sourceStock))) {
    const reason = !item 
      ? 'Product or Inventory record not found in database' 
      : `Stock field value is ${JSON.stringify(sourceStock)}`;
    
    console.warn(`[ShopifyInventorySync][Warning] Failed to resolve stock for Retail Verse product ID: ${productId}, SKU: ${sku}. Attempted stock source: ${source}. Reason: ${reason}`);
    return 0;
  }

  const availableStock = Math.max(
    0,
    Math.floor(Number(sourceStock))
  );

  return availableStock;
}

/**
 * Resolves Shopify active location based on priority logic.
 * @param {object} connection - Connection model object
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify decrypted access token
 * @param {function} shopifyGraphqlFn - Shopify GraphQL request function
 */
async function resolveShopifyLocation(connection, shopDomain, accessToken, shopifyGraphqlFn) {
  // Priority 1: Check existing saved location ID on connection metadata
  if (connection.metadata?.locationId) {
    return connection.metadata.locationId;
  }

  // Priority 2: Configured SHOPIFY_LOCATION_ID in env
  if (process.env.SHOPIFY_LOCATION_ID) {
    return process.env.SHOPIFY_LOCATION_ID;
  }

  // Query Shopify active inventory locations
  const query = `
    query GetLocations {
      locations(first: 50) {
        nodes {
          id
          name
          isActive
          fulfillsOnlineOrders
        }
      }
    }
  `;

  const result = await shopifyGraphqlFn(shopDomain, accessToken, query);
  const nodes = result.locations?.nodes || result.data?.locations?.nodes || [];
  
  if (nodes.length === 0) {
    throw new Error('No active Shopify inventory location was found. Create or activate a location in Shopify and retry the sync.');
  }

  // Priority 3: First active location that can stock inventory (isActive & fulfillsOnlineOrders)
  let selectedNode = nodes.find(n => n.isActive && n.fulfillsOnlineOrders);

  // Priority 4: First active location as a fallback
  if (!selectedNode) {
    selectedNode = nodes.find(n => n.isActive);
  }

  if (!selectedNode) {
    throw new Error('No active Shopify inventory location was found. Create or activate a location in Shopify and retry the sync.');
  }

  // Cache/store selected location ID against connection metadata and save MarketplaceLocation
  const MarketplaceConnection = mongoose.model('MarketplaceConnection');
  const MarketplaceLocation = mongoose.model('MarketplaceLocation');

  await MarketplaceConnection.updateOne(
    { _id: connection._id },
    { $set: { 'metadata.locationId': selectedNode.id } }
  );

  if (connection.metadata) {
    connection.metadata.locationId = selectedNode.id;
  }

  // Clean / save locations to MarketplaceLocation database schema for compatibility
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    await MarketplaceLocation.findOneAndUpdate(
      { connectionId: connection._id, shopifyLocationId: node.id },
      {
        merchantId: connection.merchantId,
        connectionId: connection._id,
        shopDomain,
        shopifyLocationId: node.id,
        locationName: node.name,
        isDefault: node.id === selectedNode.id
      },
      { upsert: true, new: true }
    );
  }

  return selectedNode.id;
}

/**
 * Ensures inventory tracking is enabled for a variant's inventory item.
 * If not tracked, updates it to true.
 */
async function ensureInventoryTracking(shopDomain, accessToken, inventoryItemId, tracked, shopifyGraphqlFn) {
  if (tracked) {
    console.log(`[ShopifyInventorySync] Inventory item ${inventoryItemId} is already tracked.`);
    return;
  }

  console.log(`[ShopifyInventorySync] Inventory tracking is disabled for item ${inventoryItemId}. Enabling tracking...`);
  const query = `
    mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          tracked
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphqlFn(shopDomain, accessToken, query, {
    id: inventoryItemId,
    input: { tracked: true }
  });

  const payload = result.inventoryItemUpdate || result.data?.inventoryItemUpdate;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    console.error(`[ShopifyInventorySync] Failed to enable inventory tracking for ${inventoryItemId}:`, userErrors);
    throw new Error(`Failed to enable inventory tracking: ${userErrors.map(e => e.message).join(', ')}`);
  }
  console.log(`[ShopifyInventorySync] Inventory tracking successfully enabled for ${inventoryItemId}.`);
}

/**
 * Activates an inventory item at a Shopify location.
 * Does not treat already activated items as a fatal error.
 */
async function activateInventoryItem(shopDomain, accessToken, inventoryItemId, locationId, shopifyGraphqlFn) {
  console.log(`[ShopifyInventorySync] Activating inventory item ${inventoryItemId} at location ${locationId}...`);
  const query = `
    mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) {
        inventoryLevel {
          id
          quantities(names: ["available"]) {
            name
            quantity
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const result = await shopifyGraphqlFn(shopDomain, accessToken, query, {
      inventoryItemId,
      locationId,
      available: 0
    });

    const payload = result.inventoryActivate || result.data?.inventoryActivate;
    const errors = payload?.userErrors || [];
    if (errors.length > 0) {
      console.warn(`[ShopifyInventorySync] inventoryActivate warning/error (non-fatal): ${errors.map(e => e.message).join(', ')}`);
    } else {
      console.log(`[ShopifyInventorySync] Activated inventory item ${inventoryItemId} at location ${locationId}`);
    }
  } catch (err) {
    console.warn(`[ShopifyInventorySync] inventoryActivate exception caught (non-fatal): ${err.message}`);
  }
}

/**
 * Sets Shopify absolute inventory quantity.
 */
async function setShopifyStock(shopDomain, accessToken, inventoryItemId, locationId, stock, retailVerseProductId, shopifyGraphqlFn) {
  const input = {
    name: 'available',
    reason: 'correction',
    referenceDocumentUri: `retail-verse://inventory-sync/${retailVerseProductId}`,
    ignoreCompareQuantity: true,
    quantities: [
      {
        inventoryItemId,
        locationId,
        quantity: stock
      }
    ]
  };

  const query = `
    mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          id
          createdAt
          reason
          referenceDocumentUri
          changes {
            name
            delta
            quantityAfterChange
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphqlFn(shopDomain, accessToken, query, { input });
  const payload = result.inventorySetQuantities || result.data?.inventorySetQuantities;
  
  if (!payload) {
    throw new Error('Failed to set Shopify inventory quantity: empty payload response.');
  }

  const errors = payload.userErrors || [];
  if (errors.length > 0) {
    throw new Error(`Shopify Inventory Set Quantities user errors: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
  }

  console.log(`[ShopifyInventorySync] Successfully set stock to ${stock} for inventory item ${inventoryItemId}`);
  return payload;
}

/**
 * Queries and verifies Shopify inventory matches Retail Verse stock.
 */
async function verifyShopifyInventory(shopDomain, accessToken, inventoryItemId, locationId, expectedQuantity, shopifyGraphqlFn) {
  const query = `
    query VerifyInventory($id: ID!) {
      inventoryItem(id: $id) {
        id
        tracked
        inventoryLevels(first: 20) {
          nodes {
            location {
              id
              name
            }
            quantities(names: ["available"]) {
              name
              quantity
            }
          }
        }
      }
    }
  `;

  const result = await shopifyGraphqlFn(shopDomain, accessToken, query, { id: inventoryItemId });
  const inventoryItem = result.inventoryItem || result.data?.inventoryItem;
  if (!inventoryItem) {
    throw new Error(`Verification failed: inventory item ${inventoryItemId} not found on Shopify.`);
  }

  const nodes = inventoryItem.inventoryLevels?.nodes || [];
  const level = nodes.find(n => String(n.location?.id) === String(locationId));

  if (!level) {
    throw new Error(`Verification failed: inventory level not found at location ${locationId}`);
  }

  const availableQtyObj = level.quantities?.find(q => q.name === 'available');
  const actualQuantity = availableQtyObj ? Number(availableQtyObj.quantity) : 0;

  if (actualQuantity !== expectedQuantity) {
    throw new Error(`Inventory verification mismatch at location ${locationId}. Expected: ${expectedQuantity}, Actual: ${actualQuantity}`);
  }

  console.log(`[ShopifyInventorySync] Verified inventory for item ${inventoryItemId} at location ${locationId} successfully matches expected stock of ${expectedQuantity}`);
  return actualQuantity;
}

/**
 * Wraps Shopify GraphQL requests with exponential backoff retry.
 */
async function withRetry(fn, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (err.isThrottle && attempt < maxRetries) {
        const delay = err.retryAfterMs || (err.retryAfter * 1000) || (Math.pow(2, attempt) * 1000);
        console.warn(`[ShopifyInventorySync] Throttled. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  getAvailableStock,
  resolveShopifyLocation,
  ensureInventoryTracking,
  activateInventoryItem,
  setShopifyStock,
  verifyShopifyInventory,
  withRetry
};
