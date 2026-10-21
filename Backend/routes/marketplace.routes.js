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

const oneClickMarketplaceController = require('../controllers/oneClickMarketplace.controller');
const marketplaceTokenMiddleware = require('../middleware/marketplaceTokenMiddleware');

router.get('/', protect, marketplaceController.getMarketplaces);
router.get('/connections', protect, marketplaceController.getConnections);

// ── One-Click Marketplace Integration Routes (Flipkart, Amazon, Meesho, Swiggy, Myntra) ──
router.post('/auth-url', protect, oneClickMarketplaceController.getAuthUrl);
router.post('/:channel/auth-url', protect, oneClickMarketplaceController.getAuthUrl);
router.get('/:channel/auth-url', protect, oneClickMarketplaceController.getAuthUrl);
router.post('/authorize', protect, oneClickMarketplaceController.getAuthUrl);
router.post('/:channel/authorize', protect, oneClickMarketplaceController.getAuthUrl);
router.get('/:channel/authorize', protect, oneClickMarketplaceController.getAuthUrl);
router.post('/:channel/connect-direct', protect, oneClickMarketplaceController.connectDirect);
router.get('/:channel/mock-oauth', oneClickMarketplaceController.handleMockOAuthConsent);
router.post('/:channel/sync-inventory', protect, marketplaceTokenMiddleware, oneClickMarketplaceController.syncInventory);
router.post('/:channel/disconnect', protect, oneClickMarketplaceController.disconnectMarketplace);
router.patch('/:channel/auto-sync', protect, oneClickMarketplaceController.toggleAutoSync);
router.get('/:channel/sync-logs', protect, oneClickMarketplaceController.getSyncLogs);
router.get('/:channel/status', protect, oneClickMarketplaceController.getChannelStatus);

// Unified Callback Route: routes shopify to legacy handler and other channels to one-click OAuth handler
router.get('/:marketplace/callback', (req, res, next) => {
  const channel = (req.params.marketplace || '').toLowerCase();
  if (channel === 'shopify') {
    return marketplaceController.handleCallback(req, res, next);
  }
  return oneClickMarketplaceController.handleOAuthCallback(req, res, next);
});

router.post('/shopify/sync', protect, marketplaceController.syncShopify);
router.get('/shopify/sync/status', protect, marketplaceController.getShopifySyncStatus);

router.get('/:marketplace/connect', protect, marketplaceController.connectMarketplace);
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
