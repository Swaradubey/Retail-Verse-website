const express = require('express');
const router = express.Router();
const marketplaceController = require('../controllers/marketplace.controller');
const { protect } = require('../middleware/authMiddleware');

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
