const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const { 
  getInventoryManage,
  createInventoryItem, 
  createInventoryProduct,
  getInventory, 
  getInventoryById, 
  updateInventoryItem, 
  updateStock, 
  deleteInventoryItem 
} = require("../controllers/inventoryController");
const { protect, allowRoles, optionalProtect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// Public routes for fetching (Optional auth for scoping)
router.get("/", optionalProtect, tenantMiddleware, getInventory);
router.get(
  "/manage",
  protect,
  allowRoles("super_admin", "admin", "inventory_manager", "client", "client_admin", "store_manager", "employee", "staff", "seo_manager", "counter_manager"),
  tenantMiddleware,
  getInventoryManage
);
router.get("/:id", optionalProtect, tenantMiddleware, getInventoryById);

// Add Product route for Retailverse Add Product flow
router.post(
  "/products",
  optionalProtect,
  tenantMiddleware,
  createInventoryProduct
);

// Protected routes for management (create/update/delete/stock)
router.post(
  "/",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  [
    check("name", "Name is required").not().isEmpty(),
    check("sku", "SKU is required").not().isEmpty(),
    check("category", "Category is required").not().isEmpty(),
    check("price", "Price is required").isNumeric(),
    check("stock", "Stock must be a number").isNumeric(),
  ],
  createInventoryItem
);

router.put(
  "/:id",
  protect,
  allowRoles("super_admin", "admin", "inventory_manager", "client", "client_admin", "store_manager", "employee", "staff", "seo_manager", "counter_manager"),
  tenantMiddleware,
  updateInventoryItem
);

router.patch(
  "/:id/stock",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  [check("stock", "Stock count is required").isNumeric()],
  updateStock
);

router.delete(
  "/:id",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "inventory_manager", "counter_manager"),
  tenantMiddleware,
  deleteInventoryItem
);

module.exports = router;
