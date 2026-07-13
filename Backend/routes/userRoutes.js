const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const { getMe, updateMe, listPlatformUsers, updateUserRole, updateUserStatus, resetUserPassword, deleteUser } = require("../controllers/userController");
const { getSubscription, createSubscriptionOrder, verifySubscriptionPayment } = require("../controllers/subscriptionController");
const { getUserAnalytics } = require("../controllers/userAnalyticsController");

router.get("/me", protect, tenantMiddleware, getMe);
router.put("/me", protect, tenantMiddleware, updateMe);

router.get("/subscription", protect, tenantMiddleware, getSubscription);
router.post("/subscription/create-order", protect, tenantMiddleware, createSubscriptionOrder);
router.post("/subscription/verify", protect, tenantMiddleware, verifySubscriptionPayment);

/** User analytics (Sales Analytics + Category Distribution for their orders) */
router.get(
  "/analytics",
  protect,
  allowRoles("user", "customer"),
  tenantMiddleware,
  getUserAnalytics
);

/** Super Admin directory (same payload as `/platform/list`; REST-style alias). */
router.get("/", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, listPlatformUsers);

router.get("/platform/list", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, listPlatformUsers);
router.patch("/platform/:id/role", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, updateUserRole);
router.patch("/platform/:id/status", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, updateUserStatus);
router.post("/platform/:id/reset-password", protect, allowRoles("super_admin", "admin", "client", "client_admin"), tenantMiddleware, resetUserPassword);
router.delete("/platform/:id", protect, allowRoles("super_admin"), tenantMiddleware, deleteUser);


module.exports = router;
