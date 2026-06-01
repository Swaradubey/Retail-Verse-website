const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const { getNotifications } = require("../controllers/notificationController");

router.get(
  "/",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "staff", "employee", "store_manager", "inventory_manager", "counter_manager", "seo_manager", "user"),
  tenantMiddleware,
  getNotifications
);

module.exports = router;
