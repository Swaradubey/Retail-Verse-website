const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { check } = require("express-validator");
const {
  getProducts,
  getFeaturedProducts,
  getProductById,
  lookupProduct,
  createProduct,
  createProductWithImage,
  updateProduct,
  updateProductStock,
  deleteProduct,
  createProductReview,
  syncProductNow,
  getProductSyncStatus,
} = require("../controllers/productController");
const { protect, allowRoles, optionalProtect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// Ensure upload directory exists for product images
const productsUploadDir = path.resolve(__dirname, "../uploads/products");
if (!fs.existsSync(productsUploadDir)) {
  fs.mkdirSync(productsUploadDir, { recursive: true });
}

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productsUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const safeName = `product-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    cb(null, safeName);
  },
});

const uploadProduct = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Only PNG, JPG, WEBP, and SVG are accepted."));
    }
  },
});

/**
 * @route   GET /api/products/lookup?code=:code
 * @desc    Find product where barcode === code OR sku === code
 * @access  Public / Optional auth
 */
router.get("/lookup", optionalProtect, tenantMiddleware, lookupProduct);

/**
 * @route   POST /api/products/create
 * @desc    Create product supporting multipart/form-data for productImage
 * @access  Public / Scoped Auth
 */
router.post(
  "/create",
  optionalProtect,
  tenantMiddleware,
  uploadProduct.single("productImage"),
  createProductWithImage
);

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
