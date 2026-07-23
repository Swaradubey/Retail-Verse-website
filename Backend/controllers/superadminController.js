const mongoose = require("mongoose");
const User = require("../models/User");
const Client = require("../models/Client");
const Order = require("../models/Order");
const Invoice = require("../models/Invoice");
const ImpersonationAuditLog = require("../models/ImpersonationAuditLog");
const generateToken = require("../utils/generateToken");
const { isValidObjectId } = require("../utils/tenantResolver");
const { normalizeRole } = require("../utils/clientScopedRoles");

function resolveRequestMeta(req) {
  const xf = req.headers["x-forwarded-for"];
  const fromForwarded =
    typeof xf === "string" && xf.length ? xf.split(",")[0].trim() : null;
  const ipAddress = fromForwarded || req.ip || null;
  const userAgent = req.headers["user-agent"] || null;
  return { ipAddress, userAgent };
}

/** Roles Super Admin may open via impersonation JWT (target role in token). Never `super_admin`. */
const IMPERSONATABLE_ROLES = new Set([
  "admin",
  "user",
  "customer",
  "staff",
  "cashier",
  "inventory_manager",
  "seo_manager",
  "client",
  "store_manager",
  "employee",
  "counter_manager",
]);

// @route   POST /api/superadmin/impersonate/:adminId
// @access  Super Admin only
const impersonateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!isValidObjectId(adminId)) {
      return res.status(400).json({ success: false, message: "Invalid admin id" });
    }

    const target = await User.findById(adminId).select("-password");
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const targetRole = normalizeRole(target.role);
    if (targetRole === "super_admin" || !IMPERSONATABLE_ROLES.has(targetRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Impersonation is not allowed for this role. Use Open Super Admin from the directory when applicable.",
      });
    }
    if (!target.isActive) {
      return res.status(403).json({ success: false, message: "Target admin account is inactive" });
    }

    const performerId = req.user._id;
    const performerRole = normalizeRole(req.user.role);
    if (String(target._id) === String(performerId)) {
      return res.status(400).json({ success: false, message: "Cannot impersonate your own account" });
    }

    const expiresIn = process.env.IMPERSONATION_JWT_EXPIRES || "8h";
    const token = generateToken(target._id, target.email, target.role, {
      impersonatedBy: performerId,
      expiresIn,
    });

    await ImpersonationAuditLog.create({
      superAdminId: performerId, // Use the field for the performer regardless of role
      targetAdminId: target._id,
      actionType: "impersonate_start",
      timestamp: new Date(),
    });

    const { ipAddress, userAgent } = resolveRequestMeta(req);
    console.log(
      `[Impersonation] start performer=${performerId} (${performerRole}) target=${target._id} ip=${ipAddress} ua=${userAgent ? "yes" : "no"}`
    );

    res.json({
      success: true,
      message: "Impersonation session started",
      data: {
        token,
        expiresIn,
        user: {
          _id: target._id,
          name: target.name,
          email: target.email,
          role: target.role,
          isAdmin: target.role === "admin" || target.role === "super_admin",
          isSuperAdmin: target.role === "super_admin",
        },
        impersonation: {
          active: true,
          superAdminId: String(performerId),
          superAdminName: req.user.name,
          superAdminEmail: req.user.email,
        },
      },
    });
  } catch (error) {
    console.error("[Superadmin] impersonateAdmin:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/superadmin/impersonate/stop
// @access  Valid impersonation JWT (admin session opened by Super Admin)
const stopImpersonation = async (req, res) => {
  try {
    const performerId = req.tokenPayload.impersonatedBy;
    const originalUser = await User.findById(performerId).select("-password");

    if (!originalUser || !originalUser.isActive || (normalizeRole(originalUser.role) !== "super_admin" && normalizeRole(originalUser.role) !== "admin")) {
      return res.status(403).json({
        success: false,
        message: "Original session is no longer valid",
      });
    }

    const targetAdminId = req.user._id;

    await ImpersonationAuditLog.create({
      superAdminId,
      targetAdminId,
      actionType: "impersonate_end",
      timestamp: new Date(),
    });

    const { ipAddress, userAgent } = resolveRequestMeta(req);
    console.log(
      `[Impersonation] end superAdmin=${superAdminId} admin=${targetAdminId} ip=${ipAddress} ua=${userAgent ? "yes" : "no"}`
    );

    const token = generateToken(originalUser._id, originalUser.email, originalUser.role);

    res.json({
      success: true,
      message: `Returned to ${originalUser.role} session`,
      data: {
        token,
        user: {
          _id: originalUser._id,
          name: originalUser.name,
          email: originalUser.email,
          role: originalUser.role,
          isAdmin: originalUser.role === "admin" || originalUser.role === "super_admin",
          isSuperAdmin: originalUser.role === "super_admin",
        },
      },
    });
  } catch (error) {
    console.error("[Superadmin] stopImpersonation:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all clients (with auto-expiration check)
// @route   GET /api/superadmin/clients
// @access  Super Admin only
const getClients = async (req, res) => {
  try {
    const now = new Date();
    const clients = await Client.find({}).sort({ createdAt: -1 });

    // Auto-update expiration status
    const updatedClients = await Promise.all(
      clients.map(async (client) => {
        if (!client.isTrialExpired && client.trialEndDate && client.trialEndDate < now) {
          client.isTrialExpired = true;
          client.trialStatus = "expired";
          await client.save();
        }
        return client;
      })
    );

    res.json({ success: true, count: updatedClients.length, data: updatedClients });
  } catch (error) {
    console.error("[Superadmin] getClients error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get trials summary
// @route   GET /api/superadmin/trials/summary
// @access  Super Admin only
const getTrialSummary = async (req, res) => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);

    const clients = await Client.find({});

    const summary = {
      totalTrialClients: clients.length,
      activeTrials: 0,
      expiredTrials: 0,
      expiringSoon: 0,
    };

    clients.forEach((client) => {
      const isExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < now);
      
      if (isExpired) {
        summary.expiredTrials++;
      } else {
        summary.activeTrials++;
        if (client.trialEndDate && client.trialEndDate <= threeDaysFromNow) {
          summary.expiringSoon++;
        }
      }
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error("[Superadmin] getTrialSummary error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update client trial (extend, reset, expire)
// @route   PATCH /api/superadmin/clients/:id/trial
// @access  Super Admin only
const updateClientTrial = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, days } = req.body; // action: 'extend', 'reset', 'expire'

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid client id" });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const now = new Date();

    if (action === "extend") {
      const extendDays = days || 7;
      const currentEnd = client.trialEndDate && client.trialEndDate > now ? client.trialEndDate : now;
      client.trialEndDate = new Date(currentEnd.getTime() + extendDays * 24 * 60 * 60 * 1000);
      client.isTrialExpired = false;
      client.trialStatus = "active";
    } else if (action === "reset") {
      const resetDays = days || 14;
      client.trialStartDate = now;
      client.trialEndDate = new Date(now.getTime() + resetDays * 24 * 60 * 60 * 1000);
      client.isTrialExpired = false;
      client.trialStatus = "active";
    } else if (action === "expire") {
      client.isTrialExpired = true;
      client.trialStatus = "expired";
      client.trialEndDate = now;
    } else {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    await client.save();

    res.json({ success: true, message: `Trial ${action}ed successfully`, data: client });
  } catch (error) {
    console.error("[Superadmin] updateClientTrial error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get sales (orders) for a specific client
// @route   GET /api/superadmin/clients/:clientId/sales
// @access  Super Admin only
const getClientSales = async (req, res) => {
  try {
    const { clientId } = req.params;
    console.log(`[Superadmin] getClientSales - clientId: ${clientId}`);

    // Build scope conditions covering all possible field name variants
    const scopeConditions = [
      { clientId },
      { client: clientId },
      { client_id: clientId },
      { storeId: clientId },
      { createdBy: clientId },
    ];

    if (isValidObjectId(clientId)) {
      const oid = new mongoose.Types.ObjectId(clientId);
      scopeConditions.push(
        { clientId: oid },
        { client: oid },
        { client_id: oid },
        { storeId: oid },
        { createdBy: oid }
      );
    }

    const sales = await Order.find({ $or: scopeConditions })
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    console.log(`[Superadmin] getClientSales count: ${sales.length}`);
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error) {
    console.error("[Superadmin] getClientSales error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get invoices for a specific client
// @route   GET /api/superadmin/clients/:clientId/invoices
// @access  Super Admin only
//
// NOTE: The Invoice model has no clientId field.
// Invoices are linked to orders via orderId (string).
// Strategy: find orders for this client → collect their orderId strings → find matching invoices.
const getClientInvoices = async (req, res) => {
  try {
    const { clientId } = req.params;
    console.log(`[Superadmin] getClientInvoices - clientId: ${clientId}`);

    const orderScopeConditions = [
      { clientId },
      { client: clientId },
      { client_id: clientId },
      { storeId: clientId },
      { createdBy: clientId },
    ];

    if (isValidObjectId(clientId)) {
      const oid = new mongoose.Types.ObjectId(clientId);
      orderScopeConditions.push(
        { clientId: oid },
        { client: oid },
        { client_id: oid },
        { storeId: oid },
        { createdBy: oid }
      );
    }

    // Step 1: find all orders for this client (only need orderId field)
    const clientOrders = await Order.find({ $or: orderScopeConditions }).select("orderId");
    const orderIds = [...new Set(clientOrders.map((o) => o.orderId).filter(Boolean))];

    console.log(
      `[Superadmin] getClientInvoices - ${clientOrders.length} orders, ${orderIds.length} unique orderIds`
    );

    // Step 2: find invoices whose orderId matches one of those order IDs
    let invoices = [];
    if (orderIds.length > 0) {
      const rawInvoices = await Invoice.find({ orderId: { $in: orderIds } }).sort({ createdAt: -1 });
      invoices = rawInvoices.map((inv) => {
        const invObj = inv.toObject ? inv.toObject() : { ...inv };
        const isPos = /^POS-/i.test(invObj.orderId) || /^ORD-POS-/i.test(invObj.orderId);
        if (isPos) {
          invObj.paymentStatus = "paid";
        }
        return invObj;
      });
    }

    console.log(`[Superadmin] getClientInvoices count: ${invoices.length}`);
    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (error) {
    console.error("[Superadmin] getClientInvoices error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get customers for a specific client
// @route   GET /api/superadmin/clients/:clientId/customers
// @access  Super Admin only
//
// NOTE: Regular user/customer roles do NOT have clientId set on their User document.
// Strategy: find all orders for this client → extract unique buyers → aggregate totals.
const getClientCustomers = async (req, res) => {
  try {
    const { clientId } = req.params;
    console.log(`[Superadmin] getClientCustomers - clientId: ${clientId}`);

    const orderScopeConditions = [
      { clientId },
      { client: clientId },
      { client_id: clientId },
      { storeId: clientId },
      { createdBy: clientId },
    ];

    if (isValidObjectId(clientId)) {
      const oid = new mongoose.Types.ObjectId(clientId);
      orderScopeConditions.push(
        { clientId: oid },
        { client: oid },
        { client_id: oid },
        { storeId: oid },
        { createdBy: oid }
      );
    }

    const clientOrders = await Order.find({ $or: orderScopeConditions })
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });

    console.log(
      `[Superadmin] getClientCustomers - ${clientOrders.length} orders for clientId: ${clientId}`
    );

    // Build a deduplicated customer map keyed by userId (stable) or email (guest fallback)
    const customerMap = new Map();

    for (const order of clientOrders) {
      const populatedUser =
        order.user && typeof order.user === "object" && order.user._id ? order.user : null;

      // Choose a stable dedup key
      const key = populatedUser
        ? String(populatedUser._id)
        : order.customerEmail || null;

      if (!key) continue; // Skip orders with no customer identity

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          _id: populatedUser ? String(populatedUser._id) : key,
          name:
            populatedUser?.name ||
            order.customerName ||
            order.shippingAddress?.fullName ||
            "—",
          email:
            populatedUser?.email ||
            order.customerEmail ||
            order.shippingAddress?.email ||
            "",
          phone:
            populatedUser?.phone ||
            order.shippingAddress?.phone ||
            "",
          totalOrders: 0,
          totalSpent: 0,
          createdAt: order.createdAt,
        });
      }

      const entry = customerMap.get(key);
      entry.totalOrders += 1;
      entry.totalSpent += order.totalPrice || 0;
    }

    const customers = Array.from(customerMap.values());

    console.log(`[Superadmin] getClientCustomers count: ${customers.length}`);
    res.json({ success: true, count: customers.length, data: customers });
  } catch (error) {
    console.error("[Superadmin] getClientCustomers error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Super Admin Overview (Combined data from all clients)
// @route   GET /api/superadmin/overview
// @access  Super Admin only
const getOverview = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const cur = { start: startOfMonth, end: startOfNextMonth };

    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = { start: prevStart, end: startOfMonth };

    const trendFromChange = (pct) => {
      if (pct == null || Number.isNaN(pct)) return "neutral";
      if (pct > 0.05) return "up";
      if (pct < -0.05) return "down";
      return "neutral";
    };

    const pctChange = (current, previous) => {
      if (previous == null || Number.isNaN(previous) || previous === 0) {
        if (current == null || Number.isNaN(current) || current === 0) return 0;
        return 100;
      }
      return ((current - previous) / previous) * 100;
    };

    // Extract monetary amount from order using all possible field names
    // NOTE: totalPrice is the primary field in Order schema — must be first!
    const getOrderAmount = (order) => Number(
      order.totalPrice ??
      order.totalAmount ??
      order.grandTotal ??
      order.finalAmount ??
      order.payableAmount ??
      order.total ??
      order.amount ??
      order.pricing?.total ??
      order.payment?.amount ??
      0
    );

    // Extract order items array using all possible field names
    const getOrderItems = (order) => {
      return order.items || order.orderItems || order.products || order.cartItems || order.productItems || [];
    };

    // Returns true if the order is cancelled, refunded, or failed (should be excluded from sales)
    const isCancelledOrFailed = (order) => {
      const values = [
        order.status,
        order.orderStatus,
        order.paymentStatus,
        order.payment_status,
        order.payment?.status
      ].filter(Boolean).map(v => String(v).toLowerCase());
      return values.some(v =>
        ["cancelled", "canceled", "refunded", "failed", "rejected"].includes(v)
      );
    };

    // Valid sales order = any order that is NOT cancelled/refunded/failed.
    // This includes COD, pending payment, confirmed, placed, shipped, delivered.
    const isValidSalesOrder = (order) => !!order && !isCancelledOrFailed(order);

    // Keep isRevenueOrder as alias for backward compat with invoice/category helpers
    const isRevenueOrder = isValidSalesOrder;

    const isInvoicePaidOrSuccessful = (invoice) => {
      const paymentStatus = String(invoice.paymentStatus || "").toLowerCase().trim();
      const orderStatus = String(invoice.orderStatus || "").toLowerCase().trim();

      if (
        ["cancelled", "refunded", "failed"].includes(paymentStatus) ||
        ["cancelled", "refunded", "failed"].includes(orderStatus)
      ) {
        return false;
      }

      const successStatuses = ["paid", "completed", "success", "successful"];
      return successStatuses.includes(paymentStatus) || successStatuses.includes(orderStatus);
    };

    const getDocDate = (doc) => {
      if (doc.createdAt) {
        const d = new Date(doc.createdAt);
        if (!isNaN(d.getTime())) return d;
      }
      if (doc.orderDate) {
        const d = new Date(doc.orderDate);
        if (!isNaN(d.getTime())) return d;
      }
      if (doc.invoiceDate) {
        const d = new Date(doc.invoiceDate);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    };

    const isDateInWindow = (doc, start, end) => {
      const docDate = getDocDate(doc);
      if (!docDate) return false;
      return docDate >= start && docDate < end;
    };

    // Calculate core revenue stats for a given time window
    const calculateStatsForWindow = (start, end, allOrders, allInvoices) => {
      const ordersInWindow = allOrders.filter(o => isDateInWindow(o, start, end));
      const invoicesInWindow = (allInvoices || []).filter(i => isDateInWindow(i, start, end));

      let revenue = 0;
      let validOrdersCount = 0;
      const validOrderIdsSet = new Set();

      for (const order of ordersInWindow) {
        if (isValidSalesOrder(order)) {
          const amt = getOrderAmount(order);
          revenue += amt;
          validOrdersCount++;
          if (order.orderId) {
            validOrderIdsSet.add(String(order.orderId).trim().toLowerCase());
          }
        }
      }

      for (const invoice of invoicesInWindow) {
        if (isInvoicePaidOrSuccessful(invoice)) {
          const invOrderId = String(invoice.orderId || "").trim().toLowerCase();
          if (invOrderId && validOrderIdsSet.has(invOrderId)) {
            continue;
          }
          const amt = invoice.totalAmount || invoice.subtotal || 0;
          revenue += amt;
          validOrdersCount++;
          if (invOrderId) {
            validOrderIdsSet.add(invOrderId);
          }
        }
      }

      const orderCount = validOrdersCount;
      // paidOrdersCount kept for backward-compat log references
      const paidOrdersCount = validOrdersCount;
      const paidOrderIdsSet = validOrderIdsSet;
      const avgOrderValue = validOrdersCount > 0 ? revenue / validOrdersCount : 0;

      return { revenue, paidOrdersCount, orderCount, avgOrderValue, paidOrderIdsSet };
    };

    // Calculate total loss (cancelled / refunded / failed orders) for the given window.
    // allOrders must include cancelled/refunded/failed orders (do not pre-filter them out).
    const calculateLossThisMonth = (start, end, allOrders) => {
      const LOSS_STATUSES = ["cancelled", "refunded", "failed"];
      let loss = 0;
      let cancelledCount = 0;

      for (const order of allOrders) {
        const orderStatusStr = String(order.status || order.orderStatus || "").toLowerCase().trim();
        const isCancelledStatus = LOSS_STATUSES.includes(orderStatusStr);

        // Refunds first — use explicit refundAmount + refundedAt (avoid double-counting)
        if (order.refundAmount > 0 && order.refundedAt) {
          const refDate = new Date(order.refundedAt);
          if (refDate >= start && refDate < end) {
            loss += order.refundAmount;
            cancelledCount++;
            continue;
          }
        }

        // Cancelled / failed — use cancelledAt if set, fall back to createdAt.
        // Fallback covers orders cancelled via admin status PATCH without explicit cancelledAt.
        if (isCancelledStatus) {
          const cancelDate = order.cancelledAt
            ? new Date(order.cancelledAt)
            : order.createdAt
            ? new Date(order.createdAt)
            : null;
          if (cancelDate && cancelDate >= start && cancelDate < end) {
            const amt = order.totalPrice || order.totalAmount || order.grandTotal || order.amount || 0;
            loss += amt;
            cancelledCount++;
          }
        }
      }

      console.log(`[SuperAdmin Loss] role=super_admin cancelledOrdersCounted=${cancelledCount} lossAmount=${Math.round(loss * 100) / 100} window=[${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}]`);
      return Math.round(loss * 100) / 100;
    };

    // Determine target client scope for administrative queries
    const explicitClientId = req.query?.clientId || req.body?.clientId || req.headers["x-client-id"];
    let scopeQuery = {};
    if (isValidObjectId(explicitClientId)) {
      scopeQuery = { clientId: new mongoose.Types.ObjectId(String(explicitClientId)) };
    } else {
      scopeQuery = {}; // Global across ALL clients — match adminAnalyticsController behavior
    }

    // Load active registered customers and storefront users
    const registeredClientCustomers = await User.find({
      role: { $in: ["user", "customer"] },
      ...scopeQuery
    }).lean();

    // Fetch all non-deleted orders — same approach as getOrders() so dashboard
    // overview counts the same orders visible in the orders page.
    // isCancelledOrFailed / isValidSalesOrder handle in-memory filtering.
    const allOrders = await Order.find({
      ...scopeQuery,
      isDeleted: { $ne: true },
    }).populate("user").lean();

    // Log sample order so we can see actual field names from DB
    if (allOrders.length > 0) {
      console.log("SAMPLE ORDER:", JSON.stringify(allOrders[0], null, 2));
      for (let i = 0; i < Math.min(3, allOrders.length); i++) {
        const o = allOrders[i];
        console.log(`[SuperAdmin Order #${i}] _id=${o._id} status="${o.status}" orderStatus="${o.orderStatus}" paymentStatus="${String(o.paymentStatus || o.payment_status)}" isPaid=${o.isPaid} paidAt=${o.paidAt} paymentMethod="${o.paymentMethod}" orderSource="${o.orderSource}" totalPrice=${o.totalPrice} totalAmount=${o.totalAmount} grandTotal=${o.grandTotal} amount=${o.amount} isCancelled=${isCancelledOrFailed(o)} isValid=${isValidSalesOrder(o)} resolvedAmount=${getOrderAmount(o)} createdAt=${o.createdAt}`);
      }
    } else {
      console.log("[SuperAdmin] No orders found in query.");
    }

    const allInvoices = await Invoice.find({
      ...scopeQuery,
    }).lean();

    // Compute month-over-month statistics
    const curStats = calculateStatsForWindow(cur.start, cur.end, allOrders, allInvoices);
    const prevStats = calculateStatsForWindow(prev.start, prev.end, allOrders, allInvoices);

    const salesThisMonth = curStats.revenue;
    const lossThisMonth = calculateLossThisMonth(cur.start, cur.end, allOrders);
    const profitThisMonth = Math.round((salesThisMonth - lossThisMonth) * 100) / 100;

    // Active customer metrics for trends (in-memory, highly performant and accurate)
    const countActiveCustomersForWindow = (start, end, ordersList) => {
      const activeKeys = new Set();
      const EXCLUDED_ROLES = ["super_admin", "admin", "seo_manager", "counter_manager", "inventory_manager"];

      for (const o of ordersList) {
        const docDate = getDocDate(o);
        if (!docDate || docDate < start || docDate >= end) continue;

        if (o.user && EXCLUDED_ROLES.includes(o.user.role)) {
          continue;
        }

        let key = "";
        if (o.user) {
          key = `uid:${o.user._id || o.user}`;
        } else {
          let email = o.customerEmail ? o.customerEmail.toLowerCase().trim() : "";
          if (!email && o.shippingAddress?.email) {
            email = o.shippingAddress.email.toLowerCase().trim();
          }
          if (email) {
            key = `em:${email}`;
          } else {
            const name = o.customerName || o.shippingAddress?.fullName || "";
            const phone = o.customerPhone || o.shippingAddress?.phone || "";
            if (name || phone) {
              key = `guest_${name.replace(/\s+/g, "_")}_${phone}`;
            }
          }
        }

        if (key) {
          activeKeys.add(key);
        }
      }
      return activeKeys.size;
    };

    const countNewCustomersForWindow = (start, end, usersList) => {
      let count = 0;
      for (const u of usersList) {
        if (u.createdAt && u.createdAt >= start && u.createdAt < end) {
          count++;
        }
      }
      return count;
    };

    const activeCustCur = countActiveCustomersForWindow(cur.start, cur.end, allOrders);
    const activeCustPrev = countActiveCustomersForWindow(prev.start, prev.end, allOrders);

    const newCustCur = countNewCustomersForWindow(cur.start, cur.end, registeredClientCustomers);
    const newCustPrev = countNewCustomersForWindow(prev.start, prev.end, registeredClientCustomers);

    // Build the complete customer list map for Super Admin live customer calculations
    const customerMap = new Map();
    for (const u of registeredClientCustomers) {
      const key = String(u._id);
      customerMap.set(key, {
        id: key,
        userId: u._id,
        email: u.email ? u.email.toLowerCase().trim() : "",
        name: u.name || "",
        phone: u.phone || "",
        role: u.role,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt || u.lastLoginAt || u.createdAt,
        ordersCount: 0,
        ordersThisMonthCount: 0
      });
    }

    const EXCLUDED_ROLES = ["super_admin", "admin", "seo_manager", "counter_manager", "inventory_manager"];
    for (const o of allOrders) {
      const docDate = getDocDate(o);
      if (!docDate || docDate < cur.start || docDate >= cur.end) continue;

      if (o.user && EXCLUDED_ROLES.includes(o.user.role)) {
        continue;
      }

      let key = "";
      let email = "";
      let name = "";
      let phone = "";
      let hasUser = false;
      let orderUser = null;

      if (o.user) {
        key = String(o.user._id);
        email = o.user.email ? o.user.email.toLowerCase().trim() : "";
        name = o.user.name || "";
        phone = o.user.phone || "";
        hasUser = true;
        orderUser = o.user;
      } else {
        email = o.customerEmail ? o.customerEmail.toLowerCase().trim() : "";
        if (!email && o.shippingAddress?.email) {
          email = o.shippingAddress.email.toLowerCase().trim();
        }
        name = o.customerName || o.shippingAddress?.fullName || "";
        phone = o.customerPhone || o.shippingAddress?.phone || "";

        if (email) {
          key = email;
        } else if (name || phone) {
          key = `guest_${name.replace(/\s+/g, "_")}_${phone}`;
        } else {
          key = `order_${o._id}`;
        }
      }

      let cust = customerMap.get(key);
      if (!cust && email) {
        for (const existing of customerMap.values()) {
          if (existing.email === email) {
            cust = existing;
            customerMap.set(key, cust);
            break;
          }
        }
      }

      if (!cust) {
        cust = {
          id: key,
          userId: hasUser ? orderUser._id : null,
          email,
          name,
          phone,
          role: hasUser ? orderUser.role : "customer",
          createdAt: o.createdAt,
          lastActiveAt: o.createdAt,
          ordersCount: 0,
          ordersThisMonthCount: 0
        };
        customerMap.set(key, cust);
      }

      cust.ordersCount += 1;
      cust.ordersThisMonthCount += 1;
      if (o.createdAt < cust.createdAt) {
        cust.createdAt = o.createdAt;
      }
      if (o.createdAt > cust.lastActiveAt) {
        cust.lastActiveAt = o.createdAt;
      }
    }

    // Live Customers (last 15 minutes)
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60000);
    const liveCustomers = Array.from(customerMap.values()).filter(c => c.lastActiveAt >= fifteenMinutesAgo).length;

    // Conversion rate
    const totalCustomers = customerMap.size;
    const conversionRate = totalCustomers > 0 ? Math.min(100, (activeCustCur / totalCustomers) * 100) : 0;
    const prevTotalCustomers = registeredClientCustomers.length; // Denominator approximation for prev
    const conversionRatePrev = prevTotalCustomers > 0 ? Math.min(100, (activeCustPrev / prevTotalCustomers) * 100) : 0;

    // Growth percentage rates
    const totalRevenueChange = pctChange(curStats.revenue, prevStats.revenue);
    const orderCountChange = pctChange(curStats.orderCount, prevStats.orderCount);
    const activeCustomersChange = pctChange(activeCustCur, activeCustPrev);
    const newCustomersChange = pctChange(newCustCur, newCustPrev);
    const conversionRateChange = pctChange(conversionRate, conversionRatePrev);
    const avgOrderValueChange = pctChange(curStats.avgOrderValue, prevStats.avgOrderValue);

    // Calculate sales analytics for the last 7 days (in-memory)
    const calculateSalesAnalytics = (ordersList, invoicesList) => {
      const days = [];
      const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0);

        const stats = calculateStatsForWindow(dayStart, dayEnd, ordersList, invoicesList);
        days.push({
          date: dayStart.toISOString().slice(0, 10),
          revenue: Math.round(stats.revenue * 100) / 100,
          orders: stats.orderCount
        });
      }
      return days;
    };

    const salesAnalytics = calculateSalesAnalytics(allOrders, allInvoices);

    // Calculate category distribution (in-memory)
    const calculateTopCategories = (start, end, ordersList, invoicesList, limit = 10) => {
      const categoriesMap = new Map();
      const ordersInWindow = ordersList.filter(o => isDateInWindow(o, start, end));
      const invoicesInWindow = invoicesList.filter(i => isDateInWindow(i, start, end));

      for (const order of ordersInWindow) {
        if (isRevenueOrder(order)) {
          const orderItems = getOrderItems(order);
          if (!Array.isArray(orderItems)) continue;
          for (const item of orderItems) {
            const cat = String(item.category || "Uncategorized").trim() || "Uncategorized";
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const itemRev = qty * price;

            if (!categoriesMap.has(cat)) {
              categoriesMap.set(cat, { totalSales: 0, orderCount: 0 });
            }
            const entry = categoriesMap.get(cat);
            entry.totalSales += itemRev;
            entry.orderCount += 1;
          }
        }
      }

      for (const invoice of invoicesInWindow) {
        if (isInvoicePaidOrSuccessful(invoice)) {
          const invOrderId = String(invoice.orderId || "").trim().toLowerCase();
          const matchingOrder = ordersList.find(o => String(o.orderId).trim().toLowerCase() === invOrderId);
          if (matchingOrder && isRevenueOrder(matchingOrder)) {
            continue;
          }
          if (Array.isArray(invoice.items)) {
            for (const item of invoice.items) {
              const cat = "Uncategorized";
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              const itemRev = qty * price;

              if (!categoriesMap.has(cat)) {
                categoriesMap.set(cat, { totalSales: 0, orderCount: 0 });
              }
              const entry = categoriesMap.get(cat);
              entry.totalSales += itemRev;
              entry.orderCount += 1;
            }
          }
        }
      }

      const sorted = Array.from(categoriesMap.entries())
        .sort((a, b) => b[1].totalSales - a[1].totalSales)
        .slice(0, limit)
        .map(([name, entry]) => {
          return {
            category: name,
            totalSales: Math.round(entry.totalSales * 100) / 100,
            orderCount: entry.orderCount
          };
        });

      return sorted;
    };

    const categoryDistribution = calculateTopCategories(cur.start, cur.end, allOrders, allInvoices);

    // Calculate top products
    const calculateTopProducts = (startCur, endCur, startPrev, endPrev, ordersList, invoicesList, limit = 3) => {
      const productsCur = new Map();
      const productsPrev = new Map();

      const processItems = (ordersInWindow, invoicesInWindow, map, isCur) => {
        for (const order of ordersInWindow) {
          if (isRevenueOrder(order)) {
            const orderItems = getOrderItems(order);
            if (!Array.isArray(orderItems)) continue;
            for (const item of orderItems) {
              const name = String(item.productName || item.name || item.title || (item.product && item.product.name) || "").trim();
              if (!name) continue;
              const qty = Number(item.quantity || item.qty || 1) || 0;
              const price = Number(item.price) || 0;
              const itemRev = qty * price;
              const image = item.image || "";

              if (isCur) {
                if (!map.has(name)) map.set(name, { sales: 0, image });
                const entry = map.get(name);
                entry.sales += itemRev;
                if (image && !entry.image) entry.image = image;
              } else {
                map.set(name, (map.get(name) || 0) + itemRev);
              }
            }
          }
        }

        for (const invoice of invoicesInWindow) {
          if (isInvoicePaidOrSuccessful(invoice)) {
            const invOrderId = String(invoice.orderId || "").trim().toLowerCase();
            const matchingOrder = ordersList.find(o => String(o.orderId).trim().toLowerCase() === invOrderId);
            if (matchingOrder && isRevenueOrder(matchingOrder)) {
              continue;
            }

            if (Array.isArray(invoice.items)) {
              for (const item of invoice.items) {
                const name = String(item.name || "").trim();
                if (!name) continue;
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const itemRev = qty * price;

                if (isCur) {
                  if (!map.has(name)) map.set(name, { sales: 0, image: "" });
                  const entry = map.get(name);
                  entry.sales += itemRev;
                } else {
                  map.set(name, (map.get(name) || 0) + itemRev);
                }
              }
            }
          }
        }
      };

      const ordersCur = ordersList.filter(o => isDateInWindow(o, startCur, endCur));
      const invoicesCur = invoicesList.filter(i => isDateInWindow(i, startCur, endCur));
      processItems(ordersCur, invoicesCur, productsCur, true);

      const ordersPrev = ordersList.filter(o => isDateInWindow(o, startPrev, endPrev));
      const invoicesPrev = invoicesList.filter(i => isDateInWindow(i, startPrev, endPrev));
      processItems(ordersPrev, invoicesPrev, productsPrev, false);

      const list = Array.from(productsCur.entries()).map(([name, entry]) => {
        const sales = Math.round(entry.sales * 100) / 100;
        const prevRev = productsPrev.get(name) || 0;
        let growthPercent = 0;
        if (prevRev > 0) {
          growthPercent = ((sales - prevRev) / prevRev) * 100;
        } else if (sales > 0) {
          growthPercent = 100;
        }
        return {
          name,
          sales,
          growthPercent: Math.round(growthPercent * 10) / 10,
          image: entry.image || "",
        };
      });

      list.sort((a, b) => b.sales - a.sales);
      return list.slice(0, limit);
    };

    const topProducts = calculateTopProducts(cur.start, cur.end, prev.start, prev.end, allOrders, allInvoices, 3);

    // Trial Stats
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);

    let trialQuery = {};
    if (isValidObjectId(explicitClientId)) {
      trialQuery = { _id: new mongoose.Types.ObjectId(String(explicitClientId)) };
    }
    const trialClients = await Client.find(trialQuery);
    const trialStats = {
      totalTrialClients: trialClients.length,
      activeTrials: 0,
      expiredTrials: 0,
      expiringSoon: 0,
    };

    trialClients.forEach((client) => {
      const isExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < now);
      if (isExpired) {
        trialStats.expiredTrials++;
      } else {
        trialStats.activeTrials++;
        if (client.trialEndDate && client.trialEndDate <= threeDaysFromNow) {
          trialStats.expiringSoon++;
        }
      }
    });

    // Safe backend debug logs — all valid (non-cancelled) orders, loss amount, role filter
    const totalOrdersFound = allOrders.length;
    const validOrdersFound = curStats.paidOrdersCount; // paidOrdersCount = validOrdersCount
    const paidOrdersFound = validOrdersFound;
    const totalRevenueCalculated = Math.round(curStats.revenue * 100) / 100;
    const topProductFound = topProducts[0]?.name || "None";
    const ordersInCurrentMonth = allOrders.filter(o => isDateInWindow(o, cur.start, cur.end)).length;
    const cancelledThisMonth = allOrders.filter(o => isDateInWindow(o, cur.start, cur.end) && isCancelledOrFailed(o)).length;

    console.log("[SuperAdmin Dashboard Stats LOG]:", {
      roleFilter: "super_admin",
      scopeFilter: isValidObjectId(explicitClientId) ? String(explicitClientId) : "Global (All Clients)",
      totalOrdersFound,
      ordersInCurrentMonth,
      cancelledThisMonth,
      validOrdersFound,
      totalRevenueCalculated,
      lossThisMonth,
      profitThisMonth,
      topProductFound
    });

    res.json({
      success: true,
      data: {
        totalRevenue: Math.round(curStats.revenue * 100) / 100,
        totalRevenueChange: Math.round(totalRevenueChange * 10) / 10,
        totalRevenueTrend: trendFromChange(totalRevenueChange),
        activeCustomers: activeCustCur,
        activeCustomersChange: Math.round(activeCustomersChange * 10) / 10,
        activeCustomersTrend: trendFromChange(activeCustomersChange),
        newCustomers: newCustCur,
        newCustomersChange: Math.round(newCustomersChange * 10) / 10,
        newCustomersTrend: trendFromChange(newCustomersChange),
        conversionRate: Math.round(conversionRate * 100) / 100,
        conversionRateChange: Math.round(conversionRateChange * 10) / 10,
        conversionRateTrend: trendFromChange(conversionRateChange),
        salesThisMonth,
        lossThisMonth,
        profitThisMonth,
        totalOrdersThisMonth: curStats.orderCount,
        totalOrdersThisMonthChange: Math.round(orderCountChange * 10) / 10,
        totalOrdersThisMonthTrend: trendFromChange(orderCountChange),
        avgOrderValue: Math.round(curStats.avgOrderValue * 100) / 100,
        avgOrderValueChange: Math.round(avgOrderValueChange * 10) / 10,
        avgOrderValueTrend: trendFromChange(avgOrderValueChange),
        liveCustomers,
        salesAnalytics,
        categoryDistribution,
        topProducts,
        trialStats
      }
    });
  } catch (error) {
    console.error("[Superadmin] getOverview error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper to fetch and resolve business profile details for a Client.
 * @param {import("mongoose").Types.ObjectId|Object|null} clientInput
 * @returns {Promise<Object>}
 */
async function resolveBusinessProfile(clientInput) {
  const business = {
    name: "",
    logo: "",
    address: "",
    email: "",
    phone: "",
    taxNumber: "",
    website: ""
  };

  if (!clientInput) {
    business.name = "Business Profile";
    return business;
  }

  const Client = require("../models/Client");
  const User = require("../models/User");
  const CustomDomain = require("../models/CustomDomain");

  let client = clientInput;
  if (clientInput && !(clientInput.companyName || clientInput.shopName)) {
    try {
      client = await Client.findById(clientInput);
    } catch (err) {
      console.error("[resolveBusinessProfile] Error fetching client by ID:", err.message);
    }
  }

  if (client) {
    business.name = client.companyName || client.shopName || "";
    business.logo = client.logo || "";
    business.address = client.permanentAddress || "";
    business.email = client.email || "";
    business.phone = client.phone || "";
    business.taxNumber = client.gst || "";

    try {
      const domainDoc = await CustomDomain.findOne({ clientId: client._id, status: "Verified" });
      if (domainDoc) {
        business.website = domainDoc.domainName || domainDoc.domain || "";
      }
    } catch (err) {
      console.error("[resolveBusinessProfile] Error resolving custom domain:", err.message);
    }
  }

  // Fallback Logic:
  // 1. Business Name (client.companyName)
  // 2. Store Name (client.shopName)
  // 3. Merchant Name (User name)
  if (!business.name && client) {
    try {
      let merchantUser = await User.findById(client.userId || client.createdBy);
      if (!merchantUser) {
        merchantUser = await User.findOne({ clientId: client._id, role: { $in: ["client", "admin"] } });
      }
      if (merchantUser) {
        business.name = merchantUser.name || "";
        if (!business.email) business.email = merchantUser.email || "";
        if (!business.phone) business.phone = merchantUser.phone || "";
        if (!business.address) {
          business.address = merchantUser.address || (merchantUser.storeSettings && merchantUser.storeSettings.storeAddress) || "";
        }
      }
    } catch (err) {
      console.error("[resolveBusinessProfile] Error fetching merchant user:", err.message);
    }
  }

  // Never display "DAIZY HOMES" as a fallback
  if (!business.name || business.name.toUpperCase() === "DAIZY HOMES") {
    business.name = "Business Profile";
  }

  return business;
}

// @desc    Get invoice by orderId
// @route   GET /api/superadmin/invoices/:orderId
// @access  Super Admin only
const getInvoiceByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log("Invoice request orderId:", orderId);

    // 1. Find Order using multiple fields (robust lookup)
    const orderQuery = {
      $or: [
        { orderId: orderId },
        { orderNumber: orderId }
      ]
    };

    if (isValidObjectId(orderId)) {
      orderQuery.$or.push({ _id: orderId });
    }

    const order = await Order.findOne(orderQuery)
      .populate("user", "name email phone")
      .populate("clientId");
    console.log("Order found:", !!order);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 2. Try to find existing invoice in collection
    // Use the actual orderId from the found order document for consistency
    const invoice = await Invoice.findOne({ 
      $or: [
        { orderId: order.orderId },
        { orderId: orderId }
      ]
    }).populate("clientId");
    console.log("Invoice found:", !!invoice);

    // 3. Resolve business profile linked to order/invoice
    const clientToResolve = order.clientId || invoice?.clientId;
    const business = await resolveBusinessProfile(clientToResolve);

    // 4. Fallback logic: return existing invoice OR generate from order
    const invoiceNo = invoice?.invoiceNumber || invoice?.invoiceNo || `INV-${order.orderId.replace("ORD-", "")}`;
    
    const isPos = order.orderSource === "pos" || /^POS-/i.test(order.orderId) || /^ORD-POS-/i.test(order.orderId);
    let finalPaymentStatus = order.paymentStatus || (order.isPaid ? "paid" : "pending");
    if (isPos) {
      finalPaymentStatus = "paid";
    }
    
    const responseData = {
      invoiceNo,
      orderId: order.orderId,
      customerName: order.shippingAddress?.fullName || order.customerName || order.user?.name || "Guest Customer",
      customerEmail: order.customerEmail || order.user?.email || "",
      customerPhone: order.shippingAddress?.phone || order.user?.phone || "",
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
      subtotal: order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      tax: order.taxPrice || order.tax || 0,
      discount: order.discount || 0,
      total: order.totalPrice || order.amount || 0,
      paymentStatus: invoice?.paymentStatus === "paid" ? "paid" : finalPaymentStatus,
      paymentMethod: order.paymentMethod || "N/A",
      orderStatus: order.orderStatus || order.status || "placed",
      createdAt: order.createdAt,
      business
    };

    res.json({ success: true, data: responseData, business });
  } catch (error) {
    console.error("[Superadmin] getInvoiceByOrderId error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  impersonateAdmin,
  stopImpersonation,
  getClients,
  getClientSales,
  getClientInvoices,
  getClientCustomers,
  getOverview,
  getInvoiceByOrderId,
  getTrialSummary,
  updateClientTrial,
};
