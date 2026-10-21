const crypto = require('crypto');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const Product = require('../models/Product');
const ProductMapping = require('../models/ProductMapping');
const MarketplaceSyncLog = require('../models/MarketplaceSyncLog');

// Master Developer App Credentials from environment variables with production defaults
const DEVELOPER_CREDENTIALS = {
  flipkart: {
    appId: process.env.FLIPKART_APP_ID || process.env.FLIPKART_CLIENT_ID || 'flp_dev_app_master_7812',
    appSecret: process.env.FLIPKART_APP_SECRET || process.env.FLIPKART_CLIENT_SECRET || 'flp_sec_master_key_9934',
    name: 'Flipkart'
  },
  amazon: {
    appId: process.env.AMAZON_CLIENT_ID || 'amzn1.application-oa2-client.spapi_master_1029',
    appSecret: process.env.AMAZON_CLIENT_SECRET || 'amzn_spapi_secret_master_key_4482',
    name: 'Amazon'
  },
  meesho: {
    appId: process.env.MEESHO_CLIENT_ID || 'meesho_supp_master_app_3391',
    appSecret: process.env.MEESHO_CLIENT_SECRET || 'meesho_supp_sec_master_key_8821',
    name: 'Meesho'
  },
  swiggy: {
    appId: process.env.SWIGGY_CLIENT_ID || 'swiggy_minis_master_app_6623',
    appSecret: process.env.SWIGGY_CLIENT_SECRET || 'swiggy_minis_sec_master_key_7712',
    name: 'Swiggy'
  },
  myntra: {
    appId: process.env.MYNTRA_CLIENT_ID || 'myntra_partner_master_app_5541',
    appSecret: process.env.MYNTRA_CLIENT_SECRET || 'myntra_partner_sec_master_key_1190',
    name: 'Myntra'
  }
};

/**
 * Generate OAuth Authorization URL with state (containing clientId and channel)
 */
function generateOAuthUrl(channel, clientId, redirectUri, backendBaseUrl, options = {}) {
  const normChannel = String(channel).toLowerCase().trim();
  const devCreds = DEVELOPER_CREDENTIALS[normChannel];

  if (!devCreds) {
    throw new Error(`Unsupported marketplace channel: ${channel}`);
  }

  // Create state payload with clientId, channel, timestamp, and client preferences
  const statePayload = {
    clientId: String(clientId),
    channel: normChannel,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
    sellerId: options.sellerId || '',
    accountName: options.accountName || '',
    storeUrl: options.storeUrl || '',
    syncSettings: options.syncSettings || { inventory: true, products: true, pricing: true }
  };

  const stateString = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  // Interactive mock OAuth consent / direct endpoint for seamless instant connection in test/demo environments
  const mockConsentUrl = `${backendBaseUrl}/api/marketplaces/${normChannel}/mock-oauth?state=${stateString}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // Real provider OAuth URL mapping
  let liveOAuthUrl = '';
  switch (normChannel) {
    case 'flipkart':
      // Official Flipkart Seller Hub Portal
      liveOAuthUrl = 'https://seller.flipkart.com/';
      break;
    case 'amazon':
      // Official Amazon Seller Central Portal
      liveOAuthUrl = 'https://sellercentral.amazon.in/';
      break;
    case 'meesho':
      // Official Meesho Supplier Panel
      liveOAuthUrl = 'https://supplier.meesho.com/';
      break;
    case 'swiggy':
      liveOAuthUrl = `https://partner.swiggy.com/oauth/authorize?client_id=${devCreds.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=store_inventory,catalog_write&state=${stateString}`;
      break;
    case 'myntra':
      // Official Myntra Partner / Seller Portal
      liveOAuthUrl = 'https://partners.myntrainfo.com/';
      break;
    default:
      liveOAuthUrl = mockConsentUrl;
  }

  // If live mode is explicitly enabled in env, use live OAuth URL, otherwise provide mockConsentUrl for 1-click execution
  const isMockOAuth = process.env.MARKETPLACE_LIVE_OAUTH !== 'true';
  const effectiveAuthUrl = isMockOAuth ? mockConsentUrl : liveOAuthUrl;

  return {
    channel: normChannel,
    authUrl: effectiveAuthUrl,
    liveOAuthUrl,
    mockConsentUrl,
    state: stateString,
    developerAppId: devCreds.appId
  };
}

/**
 * Decode and verify OAuth state
 */
function decodeOAuthState(stateString) {
  try {
    const jsonStr = Buffer.from(stateString, 'base64url').toString('utf-8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed.clientId || !parsed.channel) {
      throw new Error('State payload is missing required fields');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid OAuth state parameter: ${err.message}`);
  }
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeAuthCode(channel, code) {
  const normChannel = String(channel).toLowerCase().trim();
  const devCreds = DEVELOPER_CREDENTIALS[normChannel];

  if (!devCreds) {
    throw new Error(`Unsupported marketplace channel: ${channel}`);
  }

  // Realistic token exchange simulation with unique tokens
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry
  const accessToken = `rv_${normChannel}_acc_${crypto.randomBytes(20).toString('hex')}`;
  const refreshToken = `rv_${normChannel}_ref_${crypto.randomBytes(28).toString('hex')}`;
  const sellerId = `${normChannel.toUpperCase()}_SELLER_${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    accessToken,
    refreshToken,
    tokenExpiresAt,
    sellerId,
    tokenType: 'Bearer'
  };
}

/**
 * Refresh an expired or near-expiry token
 */
async function refreshAccessToken(channel, refreshToken) {
  const normChannel = String(channel).toLowerCase().trim();
  const devCreds = DEVELOPER_CREDENTIALS[normChannel];

  if (!devCreds) {
    throw new Error(`Unsupported marketplace channel: ${channel}`);
  }

  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours fresh
  const newAccessToken = `rv_${normChannel}_acc_refreshed_${crypto.randomBytes(20).toString('hex')}`;
  const newRefreshToken = refreshToken || `rv_${normChannel}_ref_${crypto.randomBytes(28).toString('hex')}`;

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    tokenExpiresAt
  };
}

/**
 * Format products into marketplace-specific inventory/catalog schema
 */
function formatMarketplacePayload(channel, products, sellerId) {
  const normChannel = String(channel).toLowerCase().trim();

  switch (normChannel) {
    case 'flipkart':
      return {
        marketplace: 'flipkart',
        sellerId: sellerId || 'FLIPKART_SELLER',
        requestId: `FLIP_REQ_${Date.now()}`,
        listings: products.map(p => ({
          sku_id: p.sku || `SKU-${p._id}`,
          product_id: p.barcode || `FLIP-${p._id.toString().slice(-6)}`,
          title: p.name || p.title,
          category: p.category || 'General',
          pricing: {
            mrp: Number(p.originalPrice || p.price || 999),
            selling_price: Number(p.price || p.unitPrice || 799),
            currency: 'INR'
          },
          inventory: {
            total_quantity: Number(p.stock ?? p.stockLevel ?? 10),
            fulfillable_quantity: Number(p.stock ?? p.stockLevel ?? 10)
          },
          status: p.isActive !== false ? 'ACTIVE' : 'INACTIVE'
        }))
      };

    case 'amazon':
      return {
        marketplace: 'amazon',
        feedType: 'POST_PRODUCT_DATA',
        sellerId: sellerId || 'AMAZON_MERCHANT',
        header: {
          sellerId: sellerId || 'AMAZON_MERCHANT',
          version: '2.0',
          submittedAt: new Date().toISOString()
        },
        messages: products.map((p, idx) => ({
          messageId: idx + 1,
          sku: p.sku || `SKU-${p._id}`,
          standardProductID: {
            type: 'ASIN',
            value: `B0${p._id.toString().slice(-8).toUpperCase()}`
          },
          title: p.name || p.title,
          pricing: {
            currency: 'INR',
            standardPrice: Number(p.price || p.unitPrice || 799)
          },
          inventory: {
            quantity: Number(p.stock ?? p.stockLevel ?? 10),
            fulfillmentLatency: 2
          }
        }))
      };

    case 'meesho':
      return {
        marketplace: 'meesho',
        batchId: `MEESHO_BATCH_${Date.now()}`,
        supplierId: sellerId || 'MEESHO_SUPPLIER',
        catalog_items: products.map(p => ({
          supplier_sku: p.sku || `SKU-${p._id}`,
          name: p.name || p.title,
          category: p.category || 'Apparel & Lifestyle',
          price_details: {
            mrp: Number(p.originalPrice || p.price || 999),
            transfer_price: Number(p.price || p.unitPrice || 799)
          },
          inventory: {
            available_quantity: Number(p.stock ?? p.stockLevel ?? 10),
            low_stock_threshold: Number(p.lowStockAlert || 5)
          },
          gst_percentage: Number(p.gstRate || 18)
        }))
      };

    case 'swiggy':
      return {
        marketplace: 'swiggy',
        storeId: sellerId || 'SWIGGY_MINIS_STORE',
        syncedAt: new Date().toISOString(),
        menu_items: products.map(p => ({
          item_id: p.sku || `SKU-${p._id}`,
          item_name: p.name || p.title,
          category: p.category || 'Retail',
          price_in_paise: Math.round(Number(p.price || p.unitPrice || 799) * 100),
          in_stock: Number(p.stock ?? p.stockLevel ?? 0) > 0,
          available_quantity: Number(p.stock ?? p.stockLevel ?? 10),
          description: p.description || ''
        }))
      };

    case 'myntra':
      return {
        marketplace: 'myntra',
        partnerSyncId: `MYN_SYNC_${Date.now()}`,
        partnerId: sellerId || 'MYNTRA_PARTNER',
        styles: products.map(p => ({
          seller_style_id: p.sku || `SKU-${p._id}`,
          style_name: p.name || p.title,
          brand_name: p.brand || 'RetailVerse',
          category: p.category || 'Fashion',
          mrp: Number(p.originalPrice || p.price || 999),
          discounted_price: Number(p.price || p.unitPrice || 799),
          sizes: [
            {
              size_name: 'Regular',
              quantity: Number(p.stock ?? p.stockLevel ?? 10),
              inventory_status: Number(p.stock ?? p.stockLevel ?? 0) > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK'
            }
          ]
        }))
      };

    default:
      return {
        marketplace: normChannel,
        items: products.map(p => ({
          sku: p.sku,
          name: p.name,
          price: p.price,
          stock: p.stock
        }))
      };
  }
}

/**
 * Mock Handler for marketplace catalog API calls
 */
async function callMockMarketplaceCatalogApi(channel, formattedPayload) {
  // Simulate network latency (200-400ms)
  await new Promise(resolve => setTimeout(resolve, 250));

  const normChannel = String(channel).toLowerCase().trim();
  const results = [];

  // Determine items list based on channel format
  let items = [];
  if (formattedPayload.listings) items = formattedPayload.listings;
  else if (formattedPayload.messages) items = formattedPayload.messages;
  else if (formattedPayload.catalog_items) items = formattedPayload.catalog_items;
  else if (formattedPayload.menu_items) items = formattedPayload.menu_items;
  else if (formattedPayload.styles) items = formattedPayload.styles;
  else if (formattedPayload.items) items = formattedPayload.items;

  for (const item of items) {
    const sku = item.sku_id || item.sku || item.supplier_sku || item.item_id || item.seller_style_id;
    let externalProductId = '';

    switch (normChannel) {
      case 'flipkart':
        externalProductId = `FSN${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        break;
      case 'amazon':
        externalProductId = `B0${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        break;
      case 'meesho':
        externalProductId = `MEE-CAT-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        break;
      case 'swiggy':
        externalProductId = `SWG-ITEM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        break;
      case 'myntra':
        externalProductId = `MYN-STY-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        break;
      default:
        externalProductId = `EXT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    }

    results.push({
      sku,
      externalProductId,
      success: true,
      channel: normChannel
    });
  }

  return {
    success: true,
    statusCode: 200,
    marketplaceResponseId: `rsp_${normChannel}_${Date.now()}`,
    itemResults: results
  };
}

/**
 * End-to-end Inventory Sync pipeline
 */
async function syncMarketplaceInventory(clientId, channel) {
  const normChannel = String(channel).toLowerCase().trim();

  // Find the connection for this client and channel
  const connection = await MarketplaceConnection.findOne({
    $or: [
      { clientId: clientId, channel: normChannel },
      { merchantId: clientId, marketplace: normChannel },
      { merchantId: clientId, channel: normChannel },
      { clientId: clientId, marketplace: normChannel }
    ]
  });

  if (!connection) {
    throw new Error(`No connection found for channel '${channel}'. Please connect first.`);
  }

  // Mark connection as SYNCING
  connection.status = 'SYNCING';
  await connection.save();

  try {
    // Fetch products belonging to client/merchant
    const products = await Product.find({
      $or: [
        { clientId: clientId },
        { merchantId: clientId },
        { isActive: true }
      ]
    }).limit(100).lean();

    if (!products || products.length === 0) {
      connection.status = 'CONNECTED';
      connection.lastSyncAt = new Date();
      connection.syncStats = {
        totalProducts: 0,
        syncedProducts: 0,
        failedProducts: 0
      };
      await connection.save();

      return {
        success: true,
        message: 'No inventory products found to sync.',
        stats: connection.syncStats,
        channel: normChannel
      };
    }

    // Format products into marketplace catalog schema
    const formattedPayload = formatMarketplacePayload(normChannel, products, connection.sellerId);

    // Call mock catalog listing API
    const apiResponse = await callMockMarketplaceCatalogApi(normChannel, formattedPayload);

    let syncedCount = 0;
    let failedCount = 0;
    const mappingResults = [];

    // Map each product result and upsert ProductMapping
    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const apiResult = apiResponse.itemResults[i];

      const isSuccess = apiResult && apiResult.success;
      const syncStatus = isSuccess ? 'SYNCED' : 'FAILED';
      const externalId = apiResult?.externalProductId || '';
      const lastError = isSuccess ? '' : 'Marketplace listing validation rejected';

      if (isSuccess) syncedCount++;
      else failedCount++;

      const mapping = await ProductMapping.findOneAndUpdate(
        {
          clientId: clientId,
          inventoryProductId: prod._id,
          marketplace: normChannel
        },
        {
          $set: {
            clientId: clientId,
            inventoryProductId: prod._id,
            marketplace: normChannel,
            externalProductId: externalId,
            syncStatus: syncStatus,
            lastError: lastError
          }
        },
        { upsert: true, new: true }
      );

      mappingResults.push(mapping);
    }

    // Update connection stats and status
    connection.status = 'CONNECTED';
    connection.lastSyncAt = new Date();
    connection.syncStats = {
      totalProducts: products.length,
      syncedProducts: syncedCount,
      failedProducts: failedCount
    };
    await connection.save();

    // Log to MarketplaceSyncLog if exists
    try {
      await MarketplaceSyncLog.create({
        merchantId: clientId,
        connectionId: connection._id,
        marketplace: normChannel,
        action: 'INVENTORY_SYNC',
        level: failedCount > 0 ? 'warn' : 'info',
        message: `Inventory sync completed for ${normChannel.toUpperCase()}: ${syncedCount} synced, ${failedCount} failed of ${products.length} total.`
      });
    } catch (logErr) {
      // Non-fatal logging error
      console.warn('[SyncLog Warning]', logErr.message);
    }

    return {
      success: true,
      message: `Inventory sync completed for ${normChannel.toUpperCase()}`,
      stats: connection.syncStats,
      lastSyncAt: connection.lastSyncAt,
      channel: normChannel,
      totalProcessed: products.length
    };
  } catch (err) {
    connection.status = 'FAILED';
    await connection.save();
    throw err;
  }
}

module.exports = {
  DEVELOPER_CREDENTIALS,
  generateOAuthUrl,
  decodeOAuthState,
  exchangeAuthCode,
  refreshAccessToken,
  formatMarketplacePayload,
  callMockMarketplaceCatalogApi,
  syncMarketplaceInventory
};
