const express = require('express');
const router = express.Router();
const flipkartController = require('../controllers/flipkart.controller');
const { protect } = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');

// Rate limiter specifically for connection and sync actions
const connectionLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 30, // max 30 connection attempts
  message: 'Too many connection attempts, please try again later.'
});

const syncLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 10, // max 10 sync clicks
  message: 'Too many sync requests, please wait before syncing again.'
});

// OAuth connection flow endpoints
router.get('/connect', protect, connectionLimiter, flipkartController.connectMarketplace);
router.post('/connect', protect, connectionLimiter, flipkartController.connectMarketplace);
router.get('/callback', connectionLimiter, flipkartController.handleCallback);
router.post('/disconnect', protect, flipkartController.disconnectMarketplace);
router.post('/reconnect', protect, connectionLimiter, flipkartController.reconnectMarketplace);

// Integration status and health endpoints
router.get('/status', protect, flipkartController.getStatus);
router.get('/health', protect, flipkartController.healthCheck);

// Manual product listing sync endpoint
router.post('/sync/products', protect, syncLimiter, flipkartController.syncProducts);

// Product catalog mapping endpoints
router.get('/products', protect, flipkartController.getMappedProducts);
router.get('/products/search', protect, flipkartController.searchCatalogue);
router.post('/products/map', protect, flipkartController.mapProduct);
router.post('/products/unmap', protect, flipkartController.unmapProduct);
router.post('/products/attributes', protect, flipkartController.updateProductAttributes);

// Historical activity logs
router.get('/logs', protect, flipkartController.getLogs);

module.exports = router;
