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
 * GET /api/marketplaces/:channel/auth-url
 * Generates dynamic OAuth authorization URL with state (containing clientId and channel)
 * using master Developer App credentials from environment variables.
 */
exports.getAuthUrl = async (req, res) => {
  try {
    const channel = (req.params.channel || '').toLowerCase().trim();
    if (!DEVELOPER_CREDENTIALS[channel]) {
      return res.status(400).json({
        success: false,
        message: `Unsupported channel: '${channel}'. Supported channels: ${Object.keys(DEVELOPER_CREDENTIALS).join(', ')}`
      });
    }

    const clientId = getMerchantId(req);
    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Client identity could not be verified.'
      });
    }

    const { backendBaseUrl } = getBaseUrls(req);
    const redirectUri = `${backendBaseUrl}/api/marketplaces/${channel}/callback`;

    // Extract any client-provided configuration (Store label, seller ID, sync preferences)
    let clientSyncSettings = { inventory: true, products: true, pricing: true };
    if (req.query.syncSettings) {
      try {
        clientSyncSettings = typeof req.query.syncSettings === 'string'
          ? JSON.parse(req.query.syncSettings)
          : req.query.syncSettings;
      } catch (e) {}
    } else if (req.body?.syncSettings) {
      clientSyncSettings = req.body.syncSettings;
    }

    const options = {
      sellerId: req.query.sellerId || req.body?.sellerId || '',
      accountName: req.query.accountName || req.body?.accountName || '',
      storeUrl: req.query.storeUrl || req.body?.storeUrl || '',
      syncSettings: clientSyncSettings
    };

    const result = generateOAuthUrl(channel, clientId, redirectUri, backendBaseUrl, options);

    res.status(200).json({
      success: true,
      channel: result.channel,
      authUrl: result.authUrl,
      state: result.state,
      developerAppId: result.developerAppId
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
    const customSellerId = decodedState.sellerId;
    const customAccountName = decodedState.accountName;
    const customStoreUrl = decodedState.storeUrl;
    const customSyncSettings = decodedState.syncSettings || { inventory: true, products: true, pricing: true };

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
