const crypto = require('crypto');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceProductMapping = require('../models/MarketplaceProductMapping');
const MarketplaceSyncJob = require('../models/MarketplaceSyncJob');
const MarketplaceSyncLog = require('../models/MarketplaceSyncLog');
const FlipkartOAuthState = require('../models/FlipkartOAuthState');
const Product = require('../models/Product');
const flipkartApiClient = require('../services/marketplaces/flipkartApiClient');
const { encryptSecret } = require('../lib/marketplaces/encryption');
const { getMerchantId, getMerchantIdCandidates, findWithMerchantFallback, merchantFilter } = require('../utils/merchantHelper');
const FlipkartMarketplaceAdapter = require('../services/marketplaces/adapters/flipkart.adapter');

/**
 * GET /api/integrations/flipkart/connect
 * Initiates the connection flow. For THIRD_PARTY_OAUTH, redirects to Flipkart authorize page.
 */
exports.connectMarketplace = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const { accountLabel = 'Flipkart Store', mode = 'THIRD_PARTY_OAUTH' } = req.query;

    if (mode === 'SELF_ACCESS') {
      const { clientId, clientSecret, sellerId } = req.body;
      if (!clientId || !clientSecret || !sellerId) {
        return res.status(400).json({
          success: false,
          message: 'Client ID, Client Secret and Seller ID are required for Self Access Mode.'
        });
      }

      // Encrypt credentials
      const encryptedClientSecret = encryptSecret(clientSecret);

      let connection = await MarketplaceConnection.findOne({
        merchantId,
        marketplace: 'FLIPKART',
        sellerAccountId: sellerId
      });

      if (!connection) {
        connection = new MarketplaceConnection({
          merchantId,
          marketplace: 'FLIPKART',
          sellerAccountId: sellerId
        });
      }

      connection.accountLabel = accountLabel;
      connection.accountName = accountLabel;
      connection.applicationMode = 'SELF_ACCESS';
      connection.connectionStatus = 'CONNECTING';
      connection.status = 'connecting';
      connection.isSyncEnabled = true;
      connection.credentials = {
        encryptedConsumerKey: clientId, // store client ID
        encryptedConsumerSecret: encryptedClientSecret // store encrypted secret
      };

      await connection.save();

      // Retrieve first token to test credentials
      try {
        await flipkartApiClient.getClientCredentialsToken(connection);
        connection.connectionStatus = 'CONNECTED';
        connection.status = 'connected';
        connection.apiHealthStatus = 'HEALTHY';
        connection.lastHealthCheckAt = new Date();
        await connection.save();

        // Perform initial full sync in background
        triggerBackgroundFullSync(connection, merchantId).catch(err => {
          console.error('[Flipkart Connect] Background sync error:', err.message);
        });

        return res.status(200).json({
          success: true,
          connectionId: connection._id,
          message: 'Connected in Self Access mode successfully.'
        });
      } catch (authErr) {
        connection.connectionStatus = 'AUTHENTICATION_FAILED';
        connection.status = 'connection_error';
        connection.apiHealthStatus = 'UNHEALTHY';
        connection.lastErrorCode = 'AUTH_ERROR';
        connection.lastErrorMessage = authErr.message;
        await connection.save();
        return res.status(401).json({
          success: false,
          message: `Self Access authentication failed: ${authErr.message}`
        });
      }
    }

    // THIRD_PARTY_OAUTH (Default Mode)
    const { appId, secret } = flipkartApiClient.getDeveloperCredentials();
    const redirectUri = process.env.FLIPKART_REDIRECT_URI;
    if (!redirectUri) {
      return res.status(500).json({
        success: false,
        message: 'FLIPKART_REDIRECT_URI is not configured in backend environment.'
      });
    }

    // Generate secure state
    const state = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins expiration

    await FlipkartOAuthState.create({
      state,
      merchantId,
      accountLabel,
      expiresAt
    });

    const authorizationUrl = new URL(`${flipkartApiClient.baseUrl}/oauth-service/oauth/authorize`);
    authorizationUrl.searchParams.set('client_id', appId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'seller_api');

    console.log('[Flipkart OAuth] Initiating OAuth for merchant:', merchantId);

    if (req.method === 'POST') {
      return res.status(200).json({ success: true, authUrl: authorizationUrl.toString() });
    } else {
      return res.redirect(authorizationUrl.toString());
    }
  } catch (error) {
    console.error('[Flipkart Connect] Connect error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/integrations/flipkart/callback
 * Handle OAuth callback redirect from Flipkart.
 */
exports.handleCallback = async (req, res) => {
  const { code, state, error: oauthError, error_description } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (oauthError || error_description) {
    console.error('[Flipkart Callback] OAuth redirect error:', oauthError, error_description);
    return res.redirect(`${frontendUrl}/admin/marketplaces?flipkart=error&message=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/admin/marketplaces?flipkart=error&message=Missing+code+or+state+parameters`);
  }

  try {
    // Verify state
    const oauthState = await FlipkartOAuthState.findOne({ state, used: false, expiresAt: { $gt: new Date() } });
    if (!oauthState) {
      return res.redirect(`${frontendUrl}/admin/marketplaces?flipkart=error&message=Invalid+or+expired+OAuth+state+parameter`);
    }

    oauthState.used = true;
    await oauthState.save();

    const merchantId = oauthState.merchantId;
    const accountLabel = oauthState.accountLabel || 'Flipkart Store';
    const redirectUri = process.env.FLIPKART_REDIRECT_URI;

    // Exchange code for tokens
    const tokenResult = await flipkartApiClient.exchangeCode(code, redirectUri);

    let connection = await MarketplaceConnection.findOne({
      merchantId,
      marketplace: 'FLIPKART',
      sellerAccountId: tokenResult.sellerId
    });

    if (!connection) {
      connection = new MarketplaceConnection({
        merchantId,
        marketplace: 'FLIPKART',
        sellerAccountId: tokenResult.sellerId
      });
    }

    connection.accountLabel = accountLabel;
    connection.accountName = accountLabel;
    connection.applicationMode = 'THIRD_PARTY_OAUTH';
    connection.connectionStatus = 'CONNECTED';
    connection.status = 'connected';
    connection.isSyncEnabled = true;
    connection.credentials = {
      encryptedAccessToken: tokenResult.credentials.encryptedAccessToken,
      encryptedRefreshToken: tokenResult.credentials.encryptedRefreshToken
    };
    connection.accessTokenExpiresAt = new Date(Date.now() + (tokenResult.expiresIn - 60) * 1000);
    connection.apiHealthStatus = 'HEALTHY';
    connection.lastHealthCheckAt = new Date();
    await connection.save();

    console.log(`[Flipkart Callback] Connection established: ${connection._id}. Initializing sync...`);

    // Perform initial full sync in background
    triggerBackgroundFullSync(connection, merchantId).catch(err => {
      console.error('[Flipkart Connect] Background sync error:', err.message);
    });

    return res.redirect(`${frontendUrl}/admin/marketplaces?flipkart=connected&account=${encodeURIComponent(accountLabel)}`);
  } catch (err) {
    console.error('[Flipkart Callback] Exception:', err.message);
    return res.redirect(`${frontendUrl}/admin/marketplaces?flipkart=error&message=${encodeURIComponent(err.message)}`);
  }
};

/**
 * POST /api/integrations/flipkart/disconnect
 * Disconnects integration, pausing all sync jobs.
 */
exports.disconnectMarketplace = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOneAndUpdate(
      { merchantId: { $in: merchantCandidates }, marketplace: 'FLIPKART' },
      {
        connectionStatus: 'DISCONNECTED',
        status: 'disconnected',
        apiHealthStatus: 'UNKNOWN',
        isSyncEnabled: false,
        credentials: {},
        disconnectedAt: new Date()
      },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({ success: false, message: 'Flipkart connection not found.' });
    }

    res.status(200).json({ success: true, message: 'Disconnected Flipkart connection successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/integrations/flipkart/reconnect
 * Re-trigger connections.
 */
exports.reconnectMarketplace = exports.connectMarketplace;

/**
 * GET /api/integrations/flipkart/status
 * Get connection metrics, mappings status and job counters.
 */
exports.getStatus = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(200).json({
        success: true,
        data: { status: 'DISCONNECTED', connection: null }
      });
    }

    const connectionId = connection._id;

    // Count mappings
    const totalMapped = await MarketplaceProductMapping.countDocuments({ marketplaceConnectionId: connectionId });
    const syncedCount = await MarketplaceProductMapping.countDocuments({ marketplaceConnectionId: connectionId, mappingStatus: 'SYNCED' });
    const failedCount = await MarketplaceProductMapping.countDocuments({ marketplaceConnectionId: connectionId, mappingStatus: 'FAILED' });
    const needsMappingCount = await MarketplaceProductMapping.countDocuments({ marketplaceConnectionId: connectionId, mappingStatus: 'NEEDS_FSN_MAPPING' });

    // Recent job status
    const recentJob = await MarketplaceSyncJob.findOne({ connectionId, marketplace: 'FLIPKART' })
      .sort({ createdAt: -1 })
      .lean();

    // Recent logs
    const recentLogs = await MarketplaceSyncLog.find({ connectionId, marketplace: 'FLIPKART' })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        status: connection.connectionStatus || 'CONNECTED',
        connection: {
          id: connection._id,
          accountLabel: connection.accountLabel,
          sellerId: connection.sellerAccountId,
          applicationMode: connection.applicationMode,
          apiHealthStatus: connection.apiHealthStatus,
          lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
          lastHealthCheckAt: connection.lastHealthCheckAt,
          lastErrorCode: connection.lastErrorCode,
          lastErrorMessage: connection.lastErrorMessage,
          createdAt: connection.createdAt
        },
        stats: {
          totalProducts: totalMapped,
          synced: syncedCount,
          failed: failedCount,
          needsMapping: needsMappingCount
        },
        recentJob,
        recentActivity: recentLogs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/integrations/flipkart/health
 * Executes a real health check on the Flipkart API.
 */
exports.healthCheck = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(404).json({ success: false, message: 'Flipkart connection not found.' });
    }

    const result = await flipkartApiClient.checkHealth(connection);
    
    connection.apiHealthStatus = result.status;
    connection.lastHealthCheckAt = new Date();
    if (result.status !== 'HEALTHY') {
      connection.lastErrorCode = 'HEALTH_CHECK_ERROR';
      connection.lastErrorMessage = result.message;
      if (result.status === 'REAUTH_REQUIRED') {
        connection.connectionStatus = 'REAUTH_REQUIRED';
        connection.status = 'connection_error';
      }
    } else {
      connection.lastErrorCode = '';
      connection.lastErrorMessage = '';
      if (connection.connectionStatus === 'REAUTH_REQUIRED' || connection.connectionStatus === 'DISCONNECTED') {
        connection.connectionStatus = 'CONNECTED';
        connection.status = 'connected';
      }
    }

    await connection.save();

    res.status(200).json({
      success: true,
      status: result.status,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/integrations/flipkart/sync/products
 * Starts manual sync for products.
 */
exports.syncProducts = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(400).json({ success: false, message: 'Flipkart connection is not configured.' });
    }

    if (connection.connectionStatus !== 'CONNECTED') {
      return res.status(400).json({ success: false, message: `Cannot sync: Connection is in ${connection.connectionStatus} state.` });
    }

    const { productIds = [], mode = 'FULL', force = false } = req.body;

    // Create sync job
    const idempotencyKey = `manual-sync-${connection._id}-${Date.now()}`;
    const job = new MarketplaceSyncJob({
      merchantId,
      connectionId: connection._id,
      marketplace: 'FLIPKART',
      operation: 'FULL_SYNC',
      jobType: 'FULL_SYNC',
      status: 'pending',
      idempotencyKey,
      requestedBy: 'User',
      payload: { productIds, mode, force }
    });

    await job.save();

    // Trigger processing asynchronously
    processSyncJob(job, connection).catch(err => {
      console.error(`[Flipkart Sync Job] Process error for job ${job._id}:`, err.message);
    });

    res.status(202).json({
      success: true,
      message: 'Sync job started successfully.',
      jobId: job._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/integrations/flipkart/products
 * Fetch mapped products list.
 */
exports.getMappedProducts = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(400).json({ success: false, message: 'Flipkart connection not found.' });
    }

    // Load mappings
    const mappings = await MarketplaceProductMapping.find({ marketplaceConnectionId: connection._id })
      .populate('retailVerseProductId', 'name sku price originalPrice stock image category')
      .lean();

    res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/integrations/flipkart/products/map
 * Manual mapping of product to Flipkart FSN
 */
exports.mapProduct = async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const merchantCandidates = getMerchantIdCandidates(req);
    const { retailVerseProductId, flipkartFsn, sellerSku, flipkartLocationId, categoryId } = req.body;

    if (!retailVerseProductId || !flipkartFsn || !sellerSku) {
      return res.status(400).json({ success: false, message: 'retailVerseProductId, flipkartFsn, and sellerSku are required.' });
    }

    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(400).json({ success: false, message: 'Flipkart connection not configured.' });
    }

    const product = await Product.findById(retailVerseProductId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Retail Verse product not found.' });
    }

    // Upsert mapping
    let mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: connection._id,
      retailVerseProductId
    });

    if (!mapping) {
      // Check for SKU conflicts
      const skuConflict = await MarketplaceProductMapping.findOne({
        marketplaceConnectionId: connection._id,
        sellerSku
      });
      if (skuConflict) {
        return res.status(400).json({ success: false, message: `Seller SKU ${sellerSku} is already mapped to another product.` });
      }

      mapping = new MarketplaceProductMapping({
        merchantId,
        marketplaceConnectionId: connection._id,
        retailVerseProductId
      });
    }

    mapping.flipkartFsn = flipkartFsn;
    mapping.sellerSku = sellerSku;
    if (flipkartLocationId) mapping.flipkartLocationId = flipkartLocationId;
    if (categoryId) mapping.categoryId = categoryId;
    mapping.mappingStatus = 'READY'; // Ready to sync
    await mapping.save();

    res.status(200).json({
      success: true,
      message: 'Product mapped successfully.',
      data: mapping
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/integrations/flipkart/products/unmap
 * Unmaps product
 */
exports.unmapProduct = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const { mappingId } = req.body;

    const mapping = await MarketplaceProductMapping.findOne({
      _id: mappingId,
      merchantId: { $in: merchantCandidates }
    });

    if (!mapping) {
      return res.status(404).json({ success: false, message: 'Mapping not found.' });
    }

    // Deactivate remote listing before unmapping if active
    if (mapping.flipkartListingId) {
      try {
        const connection = await MarketplaceConnection.findById(mapping.marketplaceConnectionId);
        const product = await Product.findById(mapping.retailVerseProductId);
        if (connection && product) {
          const adapter = new FlipkartMarketplaceAdapter(connection);
          await adapter.deleteListing(product);
        }
      } catch (err) {
        console.warn('[Flipkart Unmap] Failed to remote-deactivate listing:', err.message);
      }
    }

    await MarketplaceProductMapping.deleteOne({ _id: mappingId });

    res.status(200).json({
      success: true,
      message: 'Product unmapped successfully.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/integrations/flipkart/logs
 * Retrieve connection-specific sync logs
 */
exports.getLogs = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(400).json({ success: false, message: 'Flipkart connection not found.' });
    }

    const { level, action } = req.query;
    const query = {
      connectionId: connection._id,
      marketplace: 'FLIPKART'
    };

    if (level) query.level = level;
    if (action) query.action = action;

    const logs = await MarketplaceSyncLog.find(query)
      .populate('productId', 'name sku')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Map logs to UI friendly format
    const formattedLogs = logs.map(l => ({
      _id: l._id,
      productName: l.productId?.name || 'Unknown Product',
      sku: l.sellerSku || l.productId?.sku || 'N/A',
      action: l.action,
      status: l.level === 'error' ? 'failed' : 'success',
      shopifyProductId: l.flipkartFsn || 'N/A', // Reuse ShopifyId col in logs table for FSN
      error: l.errorMessage || l.message || null,
      timestamp: l.createdAt
    }));

    res.status(200).json(formattedLogs);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Background full sync triggers upon connect
 */
async function triggerBackgroundFullSync(connection, merchantId) {
  const idempotencyKey = `auto-sync-${connection._id}-${Date.now()}`;
  const job = new MarketplaceSyncJob({
    merchantId,
    connectionId: connection._id,
    marketplace: 'FLIPKART',
    operation: 'FULL_SYNC',
    jobType: 'FULL_SYNC',
    status: 'pending',
    idempotencyKey,
    requestedBy: 'System',
    payload: { mode: 'FULL' }
  });

  await job.save();
  await processSyncJob(job, connection);
}

/**
 * Core async job execution
 */
async function processSyncJob(job, connection) {
  job.status = 'processing';
  job.startedAt = new Date();
  await job.save();

  try {
    const adapter = new FlipkartMarketplaceAdapter(connection);
    const targetProductIds = job.payload?.productIds || [];
    
    let products = [];
    if (targetProductIds.length > 0) {
      products = await Product.find({ _id: { $in: targetProductIds } });
    } else {
      // Find all active products of this merchant
      products = await Product.find({
        $or: [
          { clientId: connection.merchantId },
          { merchantId: connection.merchantId }
        ],
        isActive: true
      });
    }

    job.totalCount = products.length;
    await job.save();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products) {
      try {
        const validation = await adapter.validateProduct(product);
        if (!validation.fsn) {
          // Incomplete product missing FSN mapping
          skipped++;
          await logActivity(job, product, 'info', 'Validation skipped: missing Flipkart FSN catalog mapping', { fsn: null }, null);
          continue;
        }

        if (!validation.isValid) {
          failed++;
          await logActivity(job, product, 'error', `Validation failed: ${validation.errors.join(', ')}`, null, { code: 'VALIDATION_ERROR', message: validation.errors.join(', ') });
          continue;
        }

        // Check if mapping exists to determine created vs updated
        const existingMapping = await MarketplaceProductMapping.findOne({
          marketplaceConnectionId: connection._id,
          retailVerseProductId: product._id,
          flipkartListingId: { $ne: '' }
        });

        // Submit creation/update
        const result = await adapter.createListing(product);
        if (result && result.success) {
          if (existingMapping) {
            updated++;
            await logActivity(job, product, 'info', `Successfully updated listing on Flipkart: SKU ${product.sku}`, { sku: product.sku }, null);
          } else {
            created++;
            await logActivity(job, product, 'info', `Successfully created listing on Flipkart: SKU ${product.sku}`, { sku: product.sku }, null);
          }
        } else {
          failed++;
          await logActivity(job, product, 'error', `Flipkart submission failed for SKU ${product.sku}`, null, { message: 'Flipkart returned empty response' });
        }
      } catch (prodErr) {
        failed++;
        console.error(`[Flipkart Sync Job] Error sync product ${product.sku}:`, prodErr.message);
        await logActivity(job, product, 'error', `Sync failed: ${prodErr.message}`, null, { code: 'SYNC_ERROR', message: prodErr.message });
      }

      // Update counters incrementally
      job.processedCount = created + updated + skipped + failed;
      job.createdCount = created;
      job.updatedCount = updated;
      job.skippedCount = skipped;
      job.failedCount = failed;
      await job.save();
    }

    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    connection.lastSuccessfulSyncAt = new Date();
    await connection.save();
    
    console.log(`[Flipkart Sync Job] Sync complete. Total: ${job.totalCount}, Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  } catch (err) {
    job.status = 'failed';
    job.error = { message: err.message, stack: err.stack };
    job.completedAt = new Date();
    await job.save();

    connection.lastErrorCode = 'SYNC_JOB_FAILED';
    connection.lastErrorMessage = err.message;
    await connection.save();
  }
}

/**
 * Log job activity helper
 */
async function logActivity(job, product, level, message, reqSummary, resSummary) {
  await MarketplaceSyncLog.create({
    merchantId: job.merchantId,
    connectionId: job.connectionId,
    marketplace: 'FLIPKART',
    productId: product._id,
    jobId: job._id,
    action: job.operation,
    level,
    message,
    requestSummary: reqSummary,
    responseSummary: resSummary,
    sellerSku: product.sku,
    statusCode: level === 'error' ? 400 : 200,
    durationMs: Date.now() - job.startedAt.getTime()
  });
}

/**
 * GET /api/integrations/flipkart/products/search
 * Search Flipkart catalogue / products mapping
 */
exports.searchCatalogue = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const connection = await MarketplaceConnection.findOne({
      merchantId: { $in: merchantCandidates },
      marketplace: 'FLIPKART'
    });

    if (!connection) {
      return res.status(400).json({ success: false, message: 'Flipkart connection not found.' });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Query parameter q is required.' });
    }

    console.log(`[Flipkart Search] Searching catalogue for query: ${q}...`);
    const results = await flipkartApiClient.searchProduct(connection, q);
    
    res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/integrations/flipkart/products/attributes
 * Updates Flipkart specific attributes on the Product model
 */
exports.updateProductAttributes = async (req, res) => {
  try {
    const merchantCandidates = getMerchantIdCandidates(req);
    const { productId, hsn, weight, length, width, height } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required.' });
    }

    const product = await Product.findOne({
      _id: productId,
      $or: [
        { clientId: { $in: merchantCandidates } },
        { merchantId: { $in: merchantCandidates } }
      ]
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found or access denied.' });
    }

    // Update attributes
    if (hsn !== undefined) product.hsn = hsn;
    if (weight !== undefined) product.weight = Number(weight);
    
    product.dimensions = product.dimensions || {};
    if (length !== undefined) product.dimensions.length = Number(length);
    if (width !== undefined) product.dimensions.width = Number(width);
    if (height !== undefined) product.dimensions.height = Number(height);

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product attributes updated successfully.',
      data: product
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
