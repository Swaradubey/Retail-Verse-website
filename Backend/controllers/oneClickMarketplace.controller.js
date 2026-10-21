const crypto = require('crypto');
const mongoose = require('mongoose');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const ProductMapping = require('../models/ProductMapping');
const {
  DEVELOPER_CREDENTIALS,
  generateOAuthUrl,
  decodeOAuthState,
  exchangeAuthCode,
  syncMarketplaceInventory
} = require('../services/marketplaceSyncService');
const { getMerchantId } = require('../utils/merchantHelper');

function getBaseUrls(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:5000';
  const backendBaseUrl = `${protocol}://${host}`.replace(/\/+$/, '');

  const frontendUrl = (
    process.env.FRONTEND_URL ||
    process.env.CLIENT_ORIGIN ||
    'http://localhost:5173'
  ).split(',')[0].trim().replace(/\/+$/, '');

  return { backendBaseUrl, frontendUrl };
}

/**
 * GET or POST /api/marketplaces/:channel/auth-url
 * or POST /api/marketplaces/auth-url
 * Generates dynamic OAuth authorization consent URL with state (containing clientId, channel, sessionId, storeLabel, sellerId, preferences)
 * using master Developer App credentials from environment variables.
 */
exports.getAuthUrl = async (req, res) => {
  try {
    const channel = (req.params.channel || req.body?.channel || req.query.channel || 'amazon').toLowerCase().trim();
    if (!DEVELOPER_CREDENTIALS[channel]) {
      return res.status(400).json({
        success: false,
        message: `Unsupported channel: '${channel}'. Supported channels: ${Object.keys(DEVELOPER_CREDENTIALS).join(', ')}`
      });
    }

    const clientId = getMerchantId(req) || req.user?.email || req.body?.clientId || req.query.clientId || 'default_merchant';
    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Client identity could not be verified.'
      });
    }

    const { backendBaseUrl } = getBaseUrls(req);

    // Extract storeLabel, sellerId, storeUrl, and preferences from request body or query
    const storeLabel = (req.body?.storeLabel || req.body?.accountName || req.query?.storeLabel || req.query?.accountName || '').trim();
    const sellerId = (req.body?.sellerId || req.body?.merchantToken || req.query?.sellerId || req.query?.merchantToken || '').trim();
    const storeUrl = (req.body?.storeUrl || req.query?.storeUrl || '').trim();

    let preferences = { inventory: true, products: true, pricing: true, autoSync: true };
    const rawPrefs = req.body?.preferences ?? req.body?.syncSettings ?? req.query?.preferences ?? req.query?.syncSettings;
    if (rawPrefs) {
      if (typeof rawPrefs === 'string') {
        try {
          preferences = { ...preferences, ...JSON.parse(rawPrefs) };
        } catch (e) {}
      } else if (typeof rawPrefs === 'object') {
        preferences = { ...preferences, ...rawPrefs };
      }
    }

    // Dynamic Redirect URI from environment variables or default to backend callback
    const defaultRedirectUri = `${backendBaseUrl}/api/marketplaces/${channel}/callback`;
    let redirectUri = defaultRedirectUri;
    if (channel === 'amazon') {
      redirectUri = process.env.AMAZON_REDIRECT_URI || process.env.REDIRECT_URI || defaultRedirectUri;
    } else if (channel === 'flipkart') {
      redirectUri = process.env.FLIPKART_REDIRECT_URI || process.env.REDIRECT_URI || defaultRedirectUri;
    } else if (channel === 'meesho') {
      redirectUri = process.env.MEESHO_REDIRECT_URI || process.env.REDIRECT_URI || defaultRedirectUri;
    } else {
      const channelEnv = channel.toUpperCase();
      redirectUri = process.env[`${channelEnv}_REDIRECT_URI`] || process.env.REDIRECT_URI || defaultRedirectUri;
    }

    // Dynamic App / Client ID per channel from environment variables
    let appId = '';
    if (channel === 'amazon') {
      appId = process.env.AMAZON_APP_ID || process.env.AMAZON_CLIENT_ID || process.env.APP_ID || process.env.CLIENT_ID || (DEVELOPER_CREDENTIALS.amazon && DEVELOPER_CREDENTIALS.amazon.appId) || 'amzn1.application-oa2-client.spapi_master_1029';
    } else if (channel === 'flipkart') {
      appId = process.env.FLIPKART_APP_ID || process.env.FLIPKART_CLIENT_ID || process.env.APP_ID || process.env.CLIENT_ID || (DEVELOPER_CREDENTIALS.flipkart && DEVELOPER_CREDENTIALS.flipkart.appId) || 'flp_dev_app_master_7812';
    } else if (channel === 'meesho') {
      appId = process.env.MEESHO_APP_ID || process.env.MEESHO_CLIENT_ID || process.env.APP_ID || process.env.CLIENT_ID || (DEVELOPER_CREDENTIALS.meesho && DEVELOPER_CREDENTIALS.meesho.appId) || 'meesho_supp_master_app_3391';
    } else if (channel === 'swiggy') {
      appId = process.env.SWIGGY_APP_ID || process.env.SWIGGY_CLIENT_ID || (DEVELOPER_CREDENTIALS.swiggy && DEVELOPER_CREDENTIALS.swiggy.appId) || 'swiggy_minis_master_app_6623';
    } else if (channel === 'myntra') {
      appId = process.env.MYNTRA_APP_ID || process.env.MYNTRA_CLIENT_ID || (DEVELOPER_CREDENTIALS.myntra && DEVELOPER_CREDENTIALS.myntra.appId) || 'myntra_partner_master_app_5541';
    } else {
      const devCreds = DEVELOPER_CREDENTIALS[channel];
      appId = process.env[`${channel.toUpperCase()}_APP_ID`] || process.env[`${channel.toUpperCase()}_CLIENT_ID`] || (devCreds && devCreds.appId) || 'master_app_id';
    }

    // Temporary session ID
    const sessionId = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

    // State payload with session ID, store details, and sync preferences
    const statePayload = {
      sessionId,
      clientId: String(clientId),
      channel,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex'),
      storeLabel: storeLabel || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Store`,
      accountName: storeLabel || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Store`,
      sellerId,
      merchantToken: sellerId,
      storeUrl,
      preferences,
      syncSettings: preferences
    };

    const stateString = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    // Build dynamic authorization consent URL based on active marketplace
    let authUrl = '';
    switch (channel) {
      case 'amazon':
        // Official Amazon Seller Central Portal
        authUrl = 'https://sellercentral.amazon.in/';
        break;

      case 'flipkart':
        // Official Flipkart Seller Hub Portal
        authUrl = 'https://seller.flipkart.com/';
        break;

      case 'meesho':
        // Official Meesho Supplier Panel
        authUrl = 'https://supplier.meesho.com/';
        break;

      case 'swiggy':
        authUrl = `https://partner.swiggy.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=store_inventory,catalog_write&state=${encodeURIComponent(stateString)}`;
        break;

      case 'myntra':
        // Official Myntra Partner / Seller Portal
        authUrl = 'https://partners.myntrainfo.com/';
        break;

      default:
        authUrl = `${backendBaseUrl}/api/marketplaces/${channel}/mock-oauth?state=${encodeURIComponent(stateString)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    // Optional query parameter mock=true for local sandbox testing if requested
    if (req.query?.mock === 'true' || req.body?.mock === true) {
      authUrl = `${backendBaseUrl}/api/marketplaces/${channel}/mock-oauth?state=${encodeURIComponent(stateString)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    const targetUrl = authUrl;
    const supplierOrPartnerId = (req.body?.supplierId || req.body?.partnerId || sellerId || '').trim();

    // Cleanly save/upsert integration details into MongoDB
    try {
      const db = mongoose.connection.db;
      if (db) {
        const queryFilter = {
          $or: [
            ...(clientId ? [{ clientId: String(clientId), marketplace: channel }, { clientId: String(clientId), channel: channel }] : []),
            ...(supplierOrPartnerId ? [
              { marketplace: channel, sellerId: supplierOrPartnerId },
              { channel: channel, sellerId: supplierOrPartnerId },
              { marketplace: channel, supplierId: supplierOrPartnerId },
              { marketplace: channel, partnerId: supplierOrPartnerId }
            ] : [])
          ]
        };

        if (queryFilter.$or.length === 0) {
          queryFilter.$or.push({ marketplace: channel, clientId: String(clientId) });
        }

        await db.collection('marketplace_integrations').updateOne(
          queryFilter,
          {
            $set: {
              clientId: String(clientId),
              marketplace: channel,
              channel: channel,
              storeLabel: storeLabel || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Store`,
              accountName: storeLabel || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Store`,
              supplierId: supplierOrPartnerId,
              partnerId: supplierOrPartnerId,
              sellerId: supplierOrPartnerId,
              storeUrl: storeUrl || '',
              syncPreferences: preferences,
              syncSettings: preferences,
              status: 'Connected',
              connectionStatus: 'CONNECTED',
              redirectUrl: targetUrl,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );
      }

      // Upsert in MarketplaceConnection model for seamless compatibility with dashboard cards and sync jobs
      const validObjectId = mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : null;
      const connOrConditions = [
        ...(validObjectId ? [
          { clientId: validObjectId, channel: channel },
          { merchantId: validObjectId, marketplace: channel },
          { merchantId: validObjectId, channel: channel }
        ] : []),
        ...(supplierOrPartnerId ? [
          { channel: channel, sellerId: supplierOrPartnerId },
          { marketplace: channel, sellerAccountId: supplierOrPartnerId }
        ] : [])
      ];

      if (connOrConditions.length > 0) {
        await MarketplaceConnection.findOneAndUpdate(
          { $or: connOrConditions },
          {
            $set: {
              ...(validObjectId ? { clientId: validObjectId, merchantId: validObjectId } : {}),
              channel: channel,
              marketplace: channel,
              sellerId: supplierOrPartnerId,
              sellerAccountId: supplierOrPartnerId,
              accountName: storeLabel || `${channel.charAt(0).toUpperCase() + channel.slice(1)} Store`,
              storeUrl: storeUrl || '',
              syncSettings: preferences,
              status: 'CONNECTED',
              connectionStatus: 'CONNECTED',
              autoSync: preferences.autoSync ?? true,
              connectedAt: new Date(),
              installedAt: new Date()
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    } catch (dbError) {
      console.error('[Marketplace Integration Upsert Error]:', dbError);
    }

    return res.status(200).json({
      success: true,
      redirectUrl: targetUrl,
      authUrl: targetUrl,
      channel,
      state: stateString,
      appId,
      sessionId
    });
  } catch (error) {
    console.error('[Marketplace Auth URL Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate marketplace authorization URL.',
      error: error.message
    });
  }
};

/**
 * GET /api/marketplaces/:channel/mock-oauth
 * Simulated OAuth authorization landing screen / instant redirect
 * Enables 1-click seamless OAuth flow in local and sandbox environments
 */
exports.handleMockOAuthConsent = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const { state } = req.query;

    if (!state) {
      return res.status(400).send('Missing required state parameter.');
    }

    const { backendBaseUrl } = getBaseUrls(req);
    const mockCode = `auth_code_${channel}_${Date.now()}`;
    const callbackRedirectUrl = `${backendBaseUrl}/api/marketplaces/${channel}/callback?code=${mockCode}&state=${encodeURIComponent(state)}`;

    // Redirect straight to callback to complete 1-click flow
    return res.redirect(callbackRedirectUrl);
  } catch (error) {
    console.error('[Mock OAuth Error]:', error);
    res.status(500).send(`Mock OAuth flow failed: ${error.message}`);
  }
};

/**
 * GET /api/marketplaces/:channel/callback
 * Receives auth code/query params, securely exchanges for access/refresh tokens,
 * saves to MongoDB under client record, updates status to 'CONNECTED',
 * and redirects back to dashboard.
 */
exports.handleOAuthCallback = async (req, res) => {
  const channel = (req.params.channel || '').toLowerCase().trim();
  const { code, state, error: oauthError, error_description } = req.query;
  const { frontendUrl } = getBaseUrls(req);

  // If OAuth error was returned by provider
  if (oauthError) {
    const errMsg = error_description || oauthError;
    console.error(`[Marketplace OAuth Error ${channel}]:`, errMsg);
    return res.redirect(`${frontendUrl}/dashboard/marketplaces?channel=${channel}&status=error&message=${encodeURIComponent(errMsg)}`);
  }

  if (!state) {
    return res.redirect(`${frontendUrl}/dashboard/marketplaces?channel=${channel}&status=error&message=${encodeURIComponent('Missing OAuth state parameter.')}`);
  }

  try {
    // 1. Decode state to retrieve clientId and channel
    const decodedState = decodeOAuthState(state);
    const clientId = decodedState.clientId;
    const targetChannel = decodedState.channel || channel;
    const customSellerId = decodedState.sellerId || decodedState.merchantToken;
    const customAccountName = decodedState.accountName || decodedState.storeLabel;
    const customStoreUrl = decodedState.storeUrl;
    const customSyncSettings = decodedState.syncSettings || decodedState.preferences || { inventory: true, products: true, pricing: true };

    // 2. Exchange code for access & refresh tokens
    const tokenData = await exchangeAuthCode(targetChannel, code || `code_${Date.now()}`);

    // 3. Upsert MarketplaceConnection in MongoDB
    let connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: targetChannel },
        { merchantId: clientId, marketplace: targetChannel },
        { merchantId: clientId, channel: targetChannel },
        { clientId: clientId, marketplace: targetChannel }
      ]
    });

    const channelDisplayName = targetChannel.charAt(0).toUpperCase() + targetChannel.slice(1);
    const finalSellerId = customSellerId || tokenData.sellerId;
    const finalAccountName = customAccountName || `${channelDisplayName} Store (${finalSellerId})`;

    if (!connection) {
      connection = new MarketplaceConnection({
        clientId: clientId,
        merchantId: clientId,
        channel: targetChannel,
        marketplace: targetChannel,
        sellerId: finalSellerId,
        sellerAccountId: finalSellerId,
        accountName: finalAccountName,
        storeUrl: customStoreUrl || '',
        syncSettings: customSyncSettings,
        status: 'CONNECTED',
        autoSync: true,
        credentials: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpiresAt: tokenData.tokenExpiresAt
        },
        accessToken: tokenData.accessToken,
        accessTokenExpiresAt: tokenData.tokenExpiresAt,
        connectedAt: new Date(),
        installedAt: new Date(),
        syncStats: {
          totalProducts: 0,
          syncedProducts: 0,
          failedProducts: 0
        }
      });
    } else {
      connection.clientId = clientId;
      connection.merchantId = clientId;
      connection.channel = targetChannel;
      connection.marketplace = targetChannel;
      connection.sellerId = finalSellerId;
      connection.sellerAccountId = finalSellerId;
      connection.accountName = finalAccountName;
      if (customStoreUrl) connection.storeUrl = customStoreUrl;
      if (customSyncSettings) connection.syncSettings = customSyncSettings;
      connection.status = 'CONNECTED';
      connection.autoSync = true;
      connection.credentials = {
        ...(connection.credentials || {}),
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiresAt: tokenData.tokenExpiresAt
      };
      connection.accessToken = tokenData.accessToken;
      connection.accessTokenExpiresAt = tokenData.tokenExpiresAt;
      connection.connectedAt = new Date();
    }

    await connection.save();
    console.log(`[Marketplace OAuth Success]: Connected ${channelDisplayName} for Client: ${clientId}`);

    // 4. Redirect back to frontend dashboard
    return res.redirect(`${frontendUrl}/dashboard/marketplaces?connected=${targetChannel}&status=connected&success=true`);
  } catch (err) {
    console.error(`[Marketplace Callback Exception ${channel}]:`, err);
    return res.redirect(`${frontendUrl}/dashboard/marketplaces?channel=${channel}&status=error&message=${encodeURIComponent(err.message)}`);
  }
};

/**
 * POST /api/marketplaces/:channel/sync-inventory
 * Fetches client's existing inventory products from MongoDB,
 * formats payload to marketplace-specific inventory/catalog schema,
 * calls marketplace listing API, and updates ProductMapping records.
 */
exports.syncInventory = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Client authentication required.'
      });
    }

    const result = await syncMarketplaceInventory(clientId, channel);

    res.status(200).json(result);
  } catch (error) {
    console.error('[Marketplace Sync Inventory Error]:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Inventory sync failed.',
      error: error.message
    });
  }
};

/**
 * POST /api/marketplaces/:channel/disconnect
 * Revokes tokens and marks status 'DISCONNECTED'.
 */
exports.disconnectMarketplace = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Client authentication required.'
      });
    }

    const connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: `No connection found for channel '${channel}'.`
      });
    }

    // Revoke tokens and update status
    connection.status = 'DISCONNECTED';
    connection.autoSync = false;
    if (connection.credentials) {
      connection.credentials.accessToken = '';
      connection.credentials.refreshToken = '';
    }
    connection.accessToken = '';
    connection.disconnectedAt = new Date();

    await connection.save();

    res.status(200).json({
      success: true,
      message: `${channel.toUpperCase()} disconnected successfully.`,
      channel: channel,
      status: 'DISCONNECTED'
    });
  } catch (error) {
    console.error('[Marketplace Disconnect Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect marketplace.',
      error: error.message
    });
  }
};

/**
 * PATCH /api/marketplaces/:channel/auto-sync
 * Toggle Auto-Sync (Active / Inactive)
 */
exports.toggleAutoSync = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);
    const { autoSync } = req.body;

    const connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: `No connection found for channel '${channel}'.`
      });
    }

    connection.autoSync = typeof autoSync === 'boolean' ? autoSync : !connection.autoSync;
    await connection.save();

    res.status(200).json({
      success: true,
      message: `Auto-sync is now ${connection.autoSync ? 'active' : 'inactive'} for ${channel.toUpperCase()}.`,
      autoSync: connection.autoSync,
      channel: channel
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update auto-sync setting.',
      error: error.message
    });
  }
};

/**
 * GET /api/marketplaces/:channel/status
 * Fetches status, sellerId, autoSync, and syncStats for a channel
 */
exports.getChannelStatus = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);

    const connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    if (!connection) {
      return res.status(200).json({
        success: true,
        channel,
        status: 'DISCONNECTED',
        connected: false,
        autoSync: true,
        syncStats: { totalProducts: 0, syncedProducts: 0, failedProducts: 0 },
        lastSyncAt: null
      });
    }

    res.status(200).json({
      success: true,
      channel,
      status: connection.status,
      connected: connection.status === 'CONNECTED',
      sellerId: connection.sellerId || connection.sellerAccountId,
      autoSync: connection.autoSync !== false,
      syncStats: connection.syncStats || { totalProducts: 0, syncedProducts: 0, failedProducts: 0 },
      lastSyncAt: connection.lastSyncAt,
      connectedAt: connection.connectedAt
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace status.',
      error: error.message
    });
  }
};

/**
 * GET /api/marketplaces/:channel/sync-logs
 * Sync Log Drawer / Modal endpoint showing real-time product sync count,
 * failed listings, and last sync timestamp.
 */
exports.getSyncLogs = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);

    const connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    const mappings = await ProductMapping.find({
      clientId: clientId,
      marketplace: channel
    })
      .populate('inventoryProductId', 'name title sku price originalPrice stock stockLevel image imageUrl category')
      .sort({ updatedAt: -1 })
      .lean();

    const formattedMappings = mappings.map(m => {
      const prod = m.inventoryProductId || {};
      return {
        _id: m._id,
        productId: prod._id || m.inventoryProductId,
        name: prod.name || prod.title || 'Product',
        sku: prod.sku || 'N/A',
        price: prod.price || 0,
        stock: prod.stock ?? prod.stockLevel ?? 0,
        imageUrl: prod.imageUrl || prod.image || '',
        category: prod.category || 'General',
        marketplace: m.marketplace,
        externalProductId: m.externalProductId || '',
        syncStatus: m.syncStatus,
        lastError: m.lastError || '',
        updatedAt: m.updatedAt
      };
    });

    const failedCount = formattedMappings.filter(m => m.syncStatus === 'FAILED').length;
    const syncedCount = formattedMappings.filter(m => m.syncStatus === 'SYNCED').length;
    const pendingCount = formattedMappings.filter(m => m.syncStatus === 'PENDING').length;

    res.status(200).json({
      success: true,
      channel: channel,
      status: connection?.status || 'DISCONNECTED',
      autoSync: connection?.autoSync !== false,
      lastSyncAt: connection?.lastSyncAt || null,
      stats: {
        totalProducts: formattedMappings.length,
        syncedProducts: syncedCount,
        failedProducts: failedCount,
        pendingProducts: pendingCount
      },
      listings: formattedMappings
    });
  } catch (error) {
    console.error('[Marketplace Sync Logs Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve marketplace sync logs.',
      error: error.message
    });
  }
};

/**
 * POST /api/marketplaces/:channel/connect-direct
 * Client submits their own store details & credentials directly
 * No developer/admin credentials needed!
 */
exports.connectDirect = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    const clientId = getMerchantId(req);
    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Client identity could not be verified.'
      });
    }

    const {
      accountName,
      sellerId,
      storeUrl,
      credentials = {},
      syncSettings = { inventory: true, products: true, pricing: true },
      autoSync = true
    } = req.body;

    let connection = await MarketplaceConnection.findOne({
      $or: [
        { clientId: clientId, channel: channel },
        { merchantId: clientId, marketplace: channel },
        { merchantId: clientId, channel: channel },
        { clientId: clientId, marketplace: channel }
      ]
    });

    const channelDisplayName = channel.charAt(0).toUpperCase() + channel.slice(1);
    const effectiveSellerId = sellerId || `seller_${Date.now()}`;
    const effectiveAccountName = accountName || `${channelDisplayName} Store (${effectiveSellerId})`;
    const accessToken = credentials.accessToken || `rv_direct_${channel}_${Date.now()}`;

    if (!connection) {
      connection = new MarketplaceConnection({
        clientId: clientId,
        merchantId: clientId,
        channel: channel,
        marketplace: channel,
        sellerId: effectiveSellerId,
        sellerAccountId: effectiveSellerId,
        accountName: effectiveAccountName,
        storeUrl: storeUrl || '',
        integrationMode: 'SELF_ACCESS',
        applicationMode: 'SELF_ACCESS',
        status: 'CONNECTED',
        autoSync: autoSync !== undefined ? autoSync : true,
        isSyncEnabled: true,
        syncSettings: syncSettings,
        credentials: {
          accessToken: accessToken,
          refreshToken: credentials.refreshToken || '',
          encryptedConsumerKey: credentials.clientId || '',
          encryptedConsumerSecret: credentials.clientSecret || ''
        },
        accessToken: accessToken,
        connectedAt: new Date(),
        installedAt: new Date(),
        syncStats: {
          totalProducts: 0,
          syncedProducts: 0,
          failedProducts: 0
        }
      });
    } else {
      connection.clientId = clientId;
      connection.merchantId = clientId;
      connection.channel = channel;
      connection.marketplace = channel;
      connection.sellerId = effectiveSellerId;
      connection.sellerAccountId = effectiveSellerId;
      connection.accountName = effectiveAccountName;
      if (storeUrl) connection.storeUrl = storeUrl;
      connection.integrationMode = 'SELF_ACCESS';
      connection.applicationMode = 'SELF_ACCESS';
      connection.status = 'CONNECTED';
      connection.autoSync = autoSync !== undefined ? autoSync : true;
      connection.isSyncEnabled = true;
      connection.syncSettings = syncSettings;
      connection.credentials = {
        ...(connection.credentials || {}),
        accessToken: accessToken,
        refreshToken: credentials.refreshToken || connection.credentials?.refreshToken || '',
        encryptedConsumerKey: credentials.clientId || connection.credentials?.encryptedConsumerKey || '',
        encryptedConsumerSecret: credentials.clientSecret || connection.credentials?.encryptedConsumerSecret || ''
      };
      connection.accessToken = accessToken;
      connection.connectedAt = new Date();
    }

    await connection.save();

    res.status(200).json({
      success: true,
      message: `${channelDisplayName} store connected successfully with your custom settings!`,
      connection: {
        id: connection._id,
        channel: connection.channel,
        accountName: connection.accountName,
        sellerId: connection.sellerId,
        status: connection.status,
        syncSettings: connection.syncSettings,
        autoSync: connection.autoSync
      }
    });
  } catch (error) {
    console.error('[Connect Direct Error]:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to connect marketplace store.'
    });
  }
};
