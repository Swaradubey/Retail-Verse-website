const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const vendorAllocationController = require('../controllers/vendorAllocationController');

// All vendor allocation routes require authentication
router.use(protect);

// Vendor list and management
router.get('/vendors', vendorAllocationController.getVendors);
router.get('/vendors/list', vendorAllocationController.getVendors);
router.get('/', vendorAllocationController.getVendors);
router.post('/vendors', vendorAllocationController.createVendor);

// Admin Allocation operations
router.post('/allocate', vendorAllocationController.createSplitAllocation);
router.get('/admin', vendorAllocationController.getAdminAllocations);
router.get('/low-stock-summary', vendorAllocationController.getLowStockSummary);
router.post('/:id/receive', vendorAllocationController.receiveAllocation);
router.post('/allocations/:id/receive', vendorAllocationController.receiveAllocation);
router.post('/:id/cancel', vendorAllocationController.cancelAllocation);
router.post('/allocations/:id/cancel', vendorAllocationController.cancelAllocation);
router.delete('/:id', vendorAllocationController.deleteAllocation);
router.delete('/allocations/:id', vendorAllocationController.deleteAllocation);
router.delete('/requirements/:id', vendorAllocationController.deleteAllocation);

// Vendor Requirements / Allocations Fetch API (Supports all expected paths: /allocations, /requirements, /vendor)
router.get('/allocations', vendorAllocationController.getVendorAllocations);
router.get('/requirements', vendorAllocationController.getVendorAllocations);
router.get('/vendor', vendorAllocationController.getVendorAllocations);
router.get('/vendor/allocations', vendorAllocationController.getVendorAllocations);
router.get('/vendor/requirements', vendorAllocationController.getVendorAllocations);
router.get('/vendor/stats', vendorAllocationController.getVendorStats);
router.get('/stats', vendorAllocationController.getVendorStats);

// Read-Receipt ("Seen" feature): PATCH & POST routes
router.patch('/allocations/:id/seen', vendorAllocationController.markAllocationSeen);
router.post('/allocations/:id/seen', vendorAllocationController.markAllocationSeen);
router.patch('/requirements/:id/seen', vendorAllocationController.markAllocationSeen);
router.post('/requirements/:id/seen', vendorAllocationController.markAllocationSeen);
router.patch('/:id/seen', vendorAllocationController.markAllocationSeen);
router.post('/:id/seen', vendorAllocationController.markAllocationSeen);

// Vendor Status Updates, Direct Inventory Stock Fulfillment & Dispatching: PATCH & POST routes
router.post('/allocations/:id/update-stock', vendorAllocationController.vendorUpdateStock);
router.patch('/allocations/:id/update-stock', vendorAllocationController.vendorUpdateStock);
router.post('/requirements/:id/update-stock', vendorAllocationController.vendorUpdateStock);
router.patch('/requirements/:id/update-stock', vendorAllocationController.vendorUpdateStock);
router.post('/:id/update-stock', vendorAllocationController.vendorUpdateStock);
router.patch('/:id/update-stock', vendorAllocationController.vendorUpdateStock);

router.patch('/allocations/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/allocations/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/allocations/:id/dispatch', vendorAllocationController.dispatchAllocation);
router.patch('/requirements/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/requirements/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/requirements/:id/dispatch', vendorAllocationController.dispatchAllocation);
router.patch('/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/:id/status', vendorAllocationController.updateVendorStatus);
router.post('/:id/dispatch', vendorAllocationController.dispatchAllocation);

module.exports = router;
