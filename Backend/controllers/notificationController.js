const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { resolveClientId, buildScopeQuery, applyScope, isValidObjectId } = require("../utils/tenantResolver");
const { normalizeRole } = require("../utils/clientScopedRoles");

const getNotifications = async (req, res) => {
  try {
    const user = req.user;
    const role = normalizeRole(user?.role);
    const isSuperAdmin = role === "super_admin";
    const isAdmin = role === "admin";

    let scopeQuery = {};
    if (isSuperAdmin || isAdmin) {
      const explicitClientId = req.query?.clientId || req.headers["x-client-id"];
      if (isValidObjectId(explicitClientId)) {
        scopeQuery = { clientId: new mongoose.Types.ObjectId(String(explicitClientId)) };
      }
    } else {
      const resolvedClientId = await resolveClientId(req);
      scopeQuery = buildScopeQuery(req.user, resolvedClientId, true);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const orderMatch = { createdAt: { $gte: sevenDaysAgo }, isDeleted: { $ne: true } };
    if (scopeQuery && Object.keys(scopeQuery).length > 0) {
      applyScope(orderMatch, scopeQuery);
    }

    const recentOrders = await Order.find(orderMatch)
      .sort({ createdAt: -1 })
      .limit(10)
      .select("orderId totalPrice createdAt clientId")
      .lean();

    const productFilter = {};
    if (scopeQuery && Object.keys(scopeQuery).length > 0) {
      Object.assign(productFilter, scopeQuery);
    }

    const lowStockProducts = await Product.find({
      ...productFilter,
      stock: { $gt: 0, $lte: 5 },
    })
      .sort({ stock: 1 })
      .limit(10)
      .select("name stock updatedAt")
      .lean();

    const outOfStockProducts = await Product.find({
      ...productFilter,
      stock: 0,
    })
      .limit(10)
      .select("name stock updatedAt")
      .lean();

    const notifications = [];

    recentOrders.forEach((order) => {
      notifications.push({
        type: "sale",
        title: "New Sale",
        message: `Order #${order.orderId} placed for ₹${order.totalPrice}`,
        createdAt: order.createdAt,
        isRead: false,
      });
    });

    lowStockProducts.forEach((product) => {
      notifications.push({
        type: "low_stock",
        title: "Low Stock",
        message: `Product "${product.name}" has only ${product.stock} items left`,
        createdAt: product.updatedAt || new Date(),
        isRead: false,
      });
    });

    outOfStockProducts.forEach((product) => {
      notifications.push({
        type: "out_of_stock",
        title: "Out of Stock",
        message: `Product "${product.name}" is out of stock`,
        createdAt: product.updatedAt || new Date(),
        isRead: false,
      });
    });

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("[NotificationController] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

module.exports = { getNotifications };
