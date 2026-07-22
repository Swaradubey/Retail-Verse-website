const express = require('express');
const router = express.Router();
const marketplaceController = require('../controllers/marketplace.controller');
const { protect } = require('../middleware/authMiddleware');
const MarketplaceConnection = require('../models/MarketplaceConnection');

// Check if Shopify integration is configured
const isShopifyConfigured = () => {
  return !!(
    (process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID) &&
    (process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET) &&
    process.env.SHOPIFY_REDIRECT_URI
  );
};

// Middleware to block Shopify endpoints if credentials are missing
const checkShopifyConfig = async (req, res, next) => {
  if (isShopifyConfigured()) {
    return next();
  }

  let isShopifyRequest = false;

  // 1. Check path/URL patterns
  if (req.originalUrl && (
    req.originalUrl.includes('/shopify') || 
    req.originalUrl.includes('to-shopify')
  )) {
    isShopifyRequest = true;
  }

  // 2. Check marketplace param
  if (req.params && req.params.marketplace === 'shopify') {
    isShopifyRequest = true;
  }

  // 3. Check connectionId / marketplaceAccountId param if it belongs to a Shopify connection
  const targetId = req.params.connectionId || req.params.marketplaceAccountId;
  if (!isShopifyRequest && targetId) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(targetId)) {
        const conn = await MarketplaceConnection.findById(targetId).select('marketplace');
        if (conn && conn.marketplace === 'shopify') {
          isShopifyRequest = true;
        }
      }
    } catch (err) {
      console.error('[Shopify Check Middleware] Error checking connection ID:', err.message);
    }
  }

  if (isShopifyRequest) {
    return res.status(503).json({
      success: false,
      message: 'Shopify integration is not configured.'
    });
  }

  next();
};

// Apply Shopify configuration protection
router.use(checkShopifyConfig);

router.get('/', protect, marketplaceController.getMarketplaces);
router.get('/connections', protect, marketplaceController.getConnections);

router.post('/shopify/sync', protect, marketplaceController.syncShopify);
router.get('/shopify/sync/status', protect, marketplaceController.getShopifySyncStatus);

router.get('/:marketplace/connect', protect, marketplaceController.connectMarketplace);
router.get('/:marketplace/callback', marketplaceController.handleCallback); // Usually open for callback redirection
router.post('/:marketplace/connect', protect, marketplaceController.connectMarketplace);

router.get('/connections/:connectionId', protect, marketplaceController.getConnection);
router.post('/connections/:connectionId/test', protect, marketplaceController.testConnection);
router.post('/connections/:connectionId/disconnect', protect, marketplaceController.disconnectMarketplace);
router.patch('/connections/:connectionId/disconnect', protect, marketplaceController.disconnectMarketplace);
router.delete('/connections/:connectionId', protect, marketplaceController.deleteConnection);
router.post('/connections/:connectionId/reconnect', protect, marketplaceController.reconnectMarketplace);

router.get('/connections/:connectionId/logs', protect, marketplaceController.getLogs);
router.get('/connections/:connectionId/listings', protect, marketplaceController.getListings);
router.post('/connections/:connectionId/sync', protect, marketplaceController.syncConnection);

// Webhook endpoint (unprotected, verification done inside controller via HMAC)
router.post('/:marketplace/webhook', marketplaceController.handleWebhook);

// Publish product to specific connections
router.post('/products/:productId/publish', protect, marketplaceController.publishProduct);

// Publish/Sync all Retail Verse products to Shopify (one-way)
router.post('/:marketplaceAccountId/publish-to-shopify', protect, marketplaceController.publishToShopify);

// Sync all active Retail Verse inventory products to Shopify (one-way)
router.post('/:marketplaceAccountId/sync-to-shopify', protect, marketplaceController.syncToShopify);

// Get per-product sync statuses for a connection
router.get('/connections/:connectionId/product-statuses', protect, marketplaceController.getProductSyncStatuses);

// Retry sync for a specific product mapping
router.post('/products/:productId/retry-sync', protect, marketplaceController.retryProductSync);

// Retry all failed syncs for a connection
router.post('/connections/:connectionId/retry-failed', protect, marketplaceController.retryFailedSyncs);

module.exports = router;
