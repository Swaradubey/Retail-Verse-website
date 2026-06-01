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
    const isUser = role === "user";

    // ── USER ROLE: generate notifications from user-scoped data ──
    if (isUser) {
      const uId = user._id || user.id;
      const notifications = [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // 1. User's recent orders
      const orderFilter = {
        createdAt: { $gte: sevenDaysAgo },
        isDeleted: { $ne: true },
      };
      if (isValidObjectId(uId)) {
        orderFilter.user = new mongoose.Types.ObjectId(String(uId));
      }

      const userOrders = await Order.find(orderFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("orderId totalPrice createdAt")
        .lean();

      userOrders.forEach((order) => {
        notifications.push({
          type: "sale",
          title: "New Sale",
          message: `Order #${order.orderId} placed for ₹${order.totalPrice}`,
          orderId: order.orderId || String(order._id || ""),
          createdAt: order.createdAt,
          isRead: false,
        });
      });

      // 2. Products scoped to this user (by createdBy or clientId)
      const productOrConditions = [];
      if (isValidObjectId(uId)) {
        productOrConditions.push({ createdBy: new mongoose.Types.ObjectId(String(uId)) });
      }
      if (isValidObjectId(user.clientId)) {
        productOrConditions.push({ clientId: new mongoose.Types.ObjectId(String(user.clientId)) });
      }

      if (productOrConditions.length > 0) {
        const productScope = { $or: productOrConditions };

        // Discount notifications
        const discountProducts = await Product.find({
          $and: [
            productScope,
            { $or: [{ isOnSale: true }, { salePercentage: { $gt: 0 } }] },
          ],
        })
          .limit(10)
          .select("name updatedAt")
          .lean();

        discountProducts.forEach((product) => {
          notifications.push({
            type: "discount",
            title: "Discount Available",
            message: `Product "${product.name}" has discount available`,
            productId: String(product._id || ""),
            createdAt: product.updatedAt || new Date(),
            isRead: false,
          });
        });

        // Low stock (stock < minStock or stock < lowStockThreshold or stock < 10, AND stock > 0)
        const lowStockProducts = await Product.find({
          ...productScope,
          stock: { $gt: 0 },
          $expr: {
            $lt: [
              "$stock",
              { $ifNull: ["$lowStockThreshold", { $ifNull: ["$minStock", 10] }] },
            ],
          },
        })
          .sort({ stock: 1 })
          .limit(10)
          .select("name stock updatedAt")
          .lean();

        lowStockProducts.forEach((product) => {
          notifications.push({
            type: "low_stock",
            title: "Low Stock",
            message: `Product "${product.name}" has only ${product.stock} items left`,
            productId: String(product._id || ""),
            createdAt: product.updatedAt || new Date(),
            isRead: false,
          });
        });

        // Out of stock
        const outOfStockProducts = await Product.find({
          ...productScope,
          stock: 0,
        })
          .limit(10)
          .select("name stock updatedAt")
          .lean();

        outOfStockProducts.forEach((product) => {
          notifications.push({
            type: "out_of_stock",
            title: "Out of Stock",
            message: `Product "${product.name}" is out of stock`,
            productId: String(product._id || ""),
            createdAt: product.updatedAt || new Date(),
            isRead: false,
          });
        });
      }

      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const unreadCount = notifications.filter((n) => !n.isRead).length;

      return res.json({
        success: true,
        notifications,
        unreadCount,
      });
    }

    // ── EXISTING LOGIC FOR ADMIN / STAFF / OTHER ROLES (unchanged) ──
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
      stock: { $gt: 0 },
      $expr: {
        $lt: [
          "$stock",
          { $ifNull: ["$lowStockThreshold", { $ifNull: ["$minStock", 10] }] },
        ],
      },
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
        orderId: order.orderId || String(order._id || ""),
        createdAt: order.createdAt,
        isRead: false,
      });
    });

    lowStockProducts.forEach((product) => {
      notifications.push({
        type: "low_stock",
        title: "Low Stock",
        message: `Product "${product.name}" has only ${product.stock} items left`,
        productId: String(product._id || ""),
        createdAt: product.updatedAt || new Date(),
        isRead: false,
      });
    });

    outOfStockProducts.forEach((product) => {
      notifications.push({
        type: "out_of_stock",
        title: "Out of Stock",
        message: `Product "${product.name}" is out of stock`,
        productId: String(product._id || ""),
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
