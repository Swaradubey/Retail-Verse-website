const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
  createProductReview,
  syncProductNow,
  getProductSyncStatus,
} = require("../controllers/productController");
const { protect, allowRoles, optionalProtect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

/**
 * @route   GET /api/products
 * @desc    Get all products
 * @access  Public (Optional auth for scoping)
 */
router.get("/", optionalProtect, tenantMiddleware, getProducts);

/**
 * @route   GET /api/products/featured
 * @desc    Get featured products
 * @access  Public (Optional auth for scoping)
 */
router.get("/featured", optionalProtect, tenantMiddleware, getFeaturedProducts);

/**
 * @route   GET /api/products/:id
 * @desc    Get single product
 * @access  Public (Optional auth for scoping)
 */
router.get("/:id", optionalProtect, tenantMiddleware, getProductById);

/**
 * @route   POST /api/products
 * @desc    Create product
 * @access  Private (Admin)
 */
router.post(
  "/",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  [
    check("name", "Name is required").not().isEmpty(),
    check("sku", "SKU is required").not().isEmpty(),
    check("category", "Category is required").not().isEmpty(),
    check("price", "Price is required and must be a number").isFloat({ min: 0 }),
    check("stock", "Stock must be a number").isInt({ min: 0 }),
  ],
  createProduct
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product (admin: full body; inventory_manager: name/title/description only — enforced in controller)
 * @access  Private (Admin, inventory_manager)
 */
router.put(
  "/:id",
  protect,
  allowRoles("super_admin", "admin", "inventory_manager", "client", "client_admin", "store_manager", "employee", "staff", "seo_manager", "counter_manager"),
  tenantMiddleware,
  updateProduct
);

/**
 * @route   PATCH /api/products/:id/stock
 * @desc    Update only stock
 * @access  Private (Admin)
 */
router.patch(
  "/:id/stock",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  [check("stock", "Stock count is required").isInt({ min: 0 })],
  updateProductStock
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product
 * @access  Private (Admin)
 */
router.delete(
  "/:id",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  deleteProduct
);

/**
 * @route   POST /api/products/:id/rating
 * @desc    Rate product
 * @access  Private
 */
router.post("/:id/rating", protect, tenantMiddleware, createProductReview);

/**
 * @route   POST /api/products/:id/sync
 * @desc    Retry synchronization to failed marketplaces
 * @access  Private
 */
router.post("/:id/sync", protect, tenantMiddleware, syncProductNow);

/**
 * @route   GET /api/products/:id/sync-status
 * @desc    Get synchronization status for a product's listings
 * @access  Private
 */
router.get("/:id/sync-status", protect, tenantMiddleware, getProductSyncStatus);

module.exports = router;
