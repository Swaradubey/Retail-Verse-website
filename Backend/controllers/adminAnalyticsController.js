const Order = require("../models/Order");
const User = require("../models/User");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const { 
  applyScope,
  isValidObjectId
} = require("../utils/tenantResolver");
const { normalizeRole } = require("../utils/clientScopedRoles");




/** Same storefront roles as adminCustomerController — denominator for conversion-style metrics. */
const CUSTOMER_ROLES = ["user", "customer"];

/**
 * Analytics order scope (website + POS):
 * - Headline `totalRevenue` / MoM trends: all orders in the month (unchanged), sum of `totalPrice`.
 * - `salesThisMonth`: subset treated as fulfilled / paid-intent (see salesThisMonthForWindow).
 * - Loss uses optional `refundAmount` + `refundedAt`, and `cancelledAt` + `totalPrice` when no refund recorded.
 */

function trendFromChange(pct) {
  if (pct == null || Number.isNaN(pct)) return "neutral";
  if (pct > 0.05) return "up";
  if (pct < -0.05) return "down";
  return "neutral";
}

function pctChange(current, previous) {
  if (previous == null || Number.isNaN(previous) || previous === 0) {
    if (current == null || Number.isNaN(current) || current === 0) return 0;
    return 100;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Conversion rate (no visit/session collection in this project):
 * (distinct registered customers who placed at least one order in the window with `user` set) /
 * (total registered storefront accounts) * 100.
 * Guest checkout and walk-in POS without a linked User are excluded from the numerator so the rate stays bounded
 * against the registered-customer denominator.
 */
async function conversionRateForWindow(start, end, scopeQuery) {
  const userQuery = { role: { $in: CUSTOMER_ROLES } };
  applyScope(userQuery, scopeQuery);
  const registered = await User.countDocuments(userQuery);
  if (registered === 0) return { rate: 0, registered };

  const orderQuery = {
    createdAt: { $gte: start, $lt: end },
    user: { $exists: true, $ne: null },
  };
  applyScope(orderQuery, scopeQuery);

  const withUser = await Order.distinct("user", orderQuery);
  const purchasers = withUser.filter((id) => id != null).length;
  const rate = Math.min(100, (purchasers / registered) * 100);
  return { rate, registered, purchasers };
}

async function orderTotalsForWindow(start, end, scopeQuery) {
  // Requirement: Only non-deleted paid/successful orders
  const match = {
    createdAt: { $gte: start, $lt: end },
    // Exclude soft-deleted orders
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    // Only count orders with a successful payment / fulfillment signal
    $or: [
      { isPaid: true },
      { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS", "successful", "Successful"] } },
      { "payment.status": { $in: ["paid", "completed", "success", "successful"] } },
      { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
      { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
      { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
      { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
    ]
  };
  applyScope(match, scopeQuery);

  const [agg] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", { $ifNull: ["$totalAmount", { $ifNull: ["$grandTotal", { $ifNull: ["$amount", 0] }] }] }] } },
      },
    },
  ]);
  const orderCount = agg?.orderCount ?? 0;
  const revenue = agg?.revenue ?? 0;
  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
  return { orderCount, revenue, avgOrderValue };
}

const FULFILLED_STATUS_LOWER = [
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];

/**
 * Sales this month: sum(totalPrice) for orders placed in [start,end) that are not cancelled
 * and match at least one “successful sale” signal (paid, POS, delivered, stage ≥ 2, or fulfilled status).
 */
/**
 * Sales this month: sum(totalPrice) for non-deleted paid/fulfilled orders placed in [start,end).
 * Requirement: exclude deleted, cancelled, refunded, failed orders from Sales This Month.
 */
async function salesThisMonthForWindow(start, end, scopeQuery) {
  const match = {
    createdAt: { $gte: start, $lt: end },
    // Exclude soft-deleted orders
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    // Only count paid/successful orders
    $or: [
      { isPaid: true },
      { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS", "successful", "Successful"] } },
      { "payment.status": { $in: ["paid", "completed", "success", "successful"] } },
      { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
      { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
      { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
      { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
    ]
  };
  applyScope(match, scopeQuery);
  const [agg] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        sales: { $sum: { $ifNull: ["$totalPrice", { $ifNull: ["$totalAmount", { $ifNull: ["$grandTotal", { $ifNull: ["$amount", 0] }] }] }] } },
      },
    },
  ]);
  return agg?.sales ?? 0;
}

/** Refunds recorded in the window (by refundedAt). */
async function lossFromRefundsForWindow(start, end, scopeQuery) {
  const match = {
    refundAmount: { $gt: 0 },
    refundedAt: { $gte: start, $lt: end },
  };
  applyScope(match, scopeQuery);
  const [agg] = await Order.aggregate([
    {
      $match: match,
    },
    { $group: { _id: null, t: { $sum: "$refundAmount" } } },
  ]);
  return agg?.t ?? 0;
}

/**
 * Cancellations in the window: sum(totalPrice) when no refund amount is stored (avoids double-count with refund loss).
 */
async function lossFromCancellationsForWindow(start, end, scopeQuery) {
  const match = {
    cancelledAt: { $gte: start, $lt: end },
    $or: [{ refundAmount: { $exists: false } }, { refundAmount: null }, { refundAmount: 0 }],
  };
  applyScope(match, scopeQuery);
  const [agg] = await Order.aggregate([
    {
      $match: match,
    },
    { $group: { _id: null, t: { $sum: { $ifNull: ["$totalPrice", 0] } } } },
  ]);
  return agg?.t ?? 0;
}

async function lossThisMonthForWindow(start, end, scopeQuery) {
  const [a, b] = await Promise.all([
    lossFromRefundsForWindow(start, end, scopeQuery),
    lossFromCancellationsForWindow(start, end, scopeQuery),
  ]);
  return a + b;
}

/**
 * Distinct "active ordering customers" in [start, end): same identity keys as conversion/CLV
 * (linked User id, else normalized customerEmail on the order). Orders with neither are excluded.
 */
async function activeOrderingCustomersCountForWindow(start, end, scopeQuery) {
  const match = { 
    createdAt: { $gte: start, $lt: end },
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
  };
  applyScope(match, scopeQuery);
  const [agg] = await Order.aggregate([
    { $match: match },
    {
      $project: {
        payerKey: {
          $cond: {
            if: { $ne: [{ $ifNull: ["$user", null] }, null] },
            then: { $concat: ["uid:", { $toString: "$user" }] },
            else: {
              $cond: {
                if: { $gt: [{ $strLenCP: { $ifNull: ["$customerEmail", ""] } }, 0] },
                then: { $concat: ["em:", { $toLower: { $trim: { input: "$customerEmail" } } }] },
                else: null,
              },
            },
          },
        },
      },
    },
    { $match: { payerKey: { $ne: null } } },
    { $group: { _id: "$payerKey" } },
    { $count: "c" },
  ]);
  return agg?.c ?? 0;
}

/**
 * Customer lifetime value (all-time):
 * total revenue from valid orders / count of distinct paying identities (user id or normalized guest email on orders).
 */
async function customerLifetimeValueAllTime(scopeQuery) {
  // Requirement: CLV based on customer order totals for valid orders
  const match = {
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    $or: [
      { isPaid: true },
      { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS"] } },
      { "payment.status": { $in: ["paid", "completed", "success"] } },
      { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
      { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
      { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
      { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
    ]
  };
  applyScope(match, scopeQuery);
  
  const [revAgg] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        revenue: { $sum: { $ifNull: ["$totalPrice", { $ifNull: ["$totalAmount", { $ifNull: ["$grandTotal", { $ifNull: ["$amount", 0] }] }] }] } },
      },
    },
  ]);
  const totalRevenue = revAgg?.revenue ?? 0;

  const keys = await Order.aggregate([
    { $match: match },
    {
      $project: {
        k: {
          $cond: {
            if: { $ne: [{ $ifNull: ["$user", null] }, null] },
            then: { $concat: ["uid:", { $toString: "$user" }] },
            else: {
              $cond: {
                if: { $gt: [{ $strLenCP: { $ifNull: ["$customerEmail", ""] } }, 0] },
                then: { $concat: ["em:", { $toLower: { $trim: { input: "$customerEmail" } } }] },
                else: null,
              },
            },
          },
        },
      },
    },
    { $match: { k: { $ne: null } } },
    { $group: { _id: "$k" } },
    { $count: "c" },
  ]);
  const distinctPayers = keys[0]?.c ?? 0;
  const clv = distinctPayers > 0 ? totalRevenue / distinctPayers : 0;
  return { customerLifetimeValue: clv, totalRevenue, distinctPayers };
}

/**
 * Sessions proxy (no PageView/Session model):
 * Count of registered storefront accounts with activity (lastActiveAt, lastLoginAt, or max of both) in [start, end).
 * Documented as "monthly active registered customers" rather than raw HTTP sessions.
 */
/** New storefront registrations (user/customer role) created in [start, end). */
async function newCustomersForWindow(start, end, scopeQuery) {
  const query = {
    role: { $in: CUSTOMER_ROLES },
    createdAt: { $gte: start, $lt: end },
  };
  applyScope(query, scopeQuery);
  return User.countDocuments(query);
}

async function monthlyActiveCustomers(start, end, scopeQuery) {
  const match = { role: { $in: CUSTOMER_ROLES } };
  applyScope(match, scopeQuery);
  const [agg] = await User.aggregate([
    { $match: match },
    {
      $addFields: {
        lastSeen: { $max: ["$lastActiveAt", "$lastLoginAt"] },
      },
    },
    {
      $match: {
        $or: [
          { lastActiveAt: { $gte: start, $lt: end } },
          { lastLoginAt: { $gte: start, $lt: end } },
          { lastSeen: { $gte: start, $lt: end } },
        ],
      },
    },
    { $count: "c" },
  ]);
  return agg?.c ?? 0;
}

/**
 * MoM trend for CLV: compares average revenue per distinct paying identity (user or email) within each calendar month.
 * This is not the lifetime CLV delta (that would need historical snapshots); it is documented as a revenue-intensity trend.
 */
async function monthlyRevenuePerPayer(start, end, scopeQuery) {
  const match = { 
    createdAt: { $gte: start, $lt: end },
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
  };
  applyScope(match, scopeQuery);
  const rows = await Order.aggregate([
    { $match: match },
    {
      $project: {
        payerKey: {
          $cond: {
            if: { $ne: [{ $ifNull: ["$user", null] }, null] },
            then: { $concat: ["uid:", { $toString: "$user" }] },
            else: {
              $cond: {
                if: { $gt: [{ $strLenCP: { $ifNull: ["$customerEmail", ""] } }, 0] },
                then: { $concat: ["em:", { $toLower: { $trim: { input: "$customerEmail" } } }] },
                else: null,
              },
            },
          },
        },
        totalPrice: { $ifNull: ["$totalPrice", 0] },
      },
    },
    { $match: { payerKey: { $ne: null } } },
    {
      $group: {
        _id: "$payerKey",
        rev: { $sum: "$totalPrice" },
      },
    },
    {
      $group: {
        _id: null,
        payers: { $sum: 1 },
        revenue: { $sum: "$rev" },
      },
    },
  ]);
  const payers = rows[0]?.payers ?? 0;
  const revenue = rows[0]?.revenue ?? 0;
  return payers > 0 ? revenue / payers : 0;
}

/** Last 7 local days (including today): label + total revenue — non-deleted paid/fulfilled orders only. */
async function revenueFlowLast7Days(scopeQuery) {
  const now = new Date();
  const days = [];
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
    const match = {
      createdAt: { $gte: day, $lt: next },
      // Exclude soft-deleted orders
      isDeleted: { $ne: true },
      deletedAt: { $exists: false },
      status: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
      orderStatus: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
      // Only count paid/successful orders
      $or: [
        { isPaid: true },
        { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS", "successful", "Successful"] } },
        { "payment.status": { $in: ["paid", "completed", "success", "successful"] } },
        { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
        { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
        { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
        { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
      ]
    };
    applyScope(match, scopeQuery);
    const [agg] = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          sales: { $sum: { $ifNull: ["$totalPrice", { $ifNull: ["$totalAmount", { $ifNull: ["$grandTotal", { $ifNull: ["$amount", 0] }] }] }] } },
          orders: { $sum: 1 },
        },
      },
    ]);
    const sales = Math.round((agg?.sales ?? 0) * 100) / 100;
    const orders = agg?.orders ?? 0;
    days.push({
      name: short[day.getDay()],
      sales,
      orders,
      date: day.toISOString().slice(0, 10),
    });
  }
  return days;
}

const PIE_COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f43f5e"];

/**
 * Category revenue for orders in [start, end): join line items to Product when productId is a valid ObjectId.
 * Orders without resolvable category bucket as "Uncategorized".
 */
async function topCategoriesForWindow(start, end, scopeQuery, limit = 8) {
  const match = { 
    createdAt: { $gte: start, $lt: end },
    // Exclude soft-deleted orders
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
    // Only count paid/successful orders
    $or: [
      { isPaid: true },
      { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS", "successful", "Successful"] } },
      { "payment.status": { $in: ["paid", "completed", "success", "successful"] } },
      { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
      { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
      { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
      { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
    ]
  };
  applyScope(match, scopeQuery);
  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $addFields: {
        lineRevenue: {
          $multiply: [{ $ifNull: ["$items.price", 0] }, { $ifNull: ["$items.quantity", 0] }],
        },
        pidStr: { $toString: "$items.productId" },
      },
    },
    {
      $addFields: {
        pidForLookup: {
          $cond: {
            if: {
              $regexMatch: { input: "$pidStr", regex: /^[a-fA-F0-9]{24}$/ },
            },
            then: { $toObjectId: "$pidStr" },
            else: null,
          },
        },
      },
    },
    // Use safe localField/foreignField lookup — pidForLookup was already
    // guarded by $regexMatch (valid 24-char hex only), so no $toObjectId crash risk.
    {
      $lookup: {
        from: "products",
        localField: "pidForLookup",
        foreignField: "_id",
        as: "p",
      },
    },
    {
      $addFields: {
        categoryName: {
          $ifNull: [
            "$items.category",
            { $ifNull: [{ $arrayElemAt: ["$p.category", 0] }, "Uncategorized"] }
          ]
        },
      },
    },
    {
      $group: {
        _id: "$categoryName",
        value: { $sum: "$lineRevenue" },
      },
    },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);

  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  return rows.map((r, i) => {
    const value = Math.round((r.value || 0) * 100) / 100;
    const percent = total > 0 ? Math.round(((r.value || 0) / total) * 1000) / 10 : 0;
    return {
      name: r._id || "Uncategorized",
      value,
      percent,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  });
}

/** Top products by line revenue in window; growth vs previous window of equal length. */
async function topProductsForWindow(start, end, scopeQuery, limit = 3) {
  const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const prevEnd = start;

  const productLineStages = (windowStart, windowEnd) => {
    const match = { 
      createdAt: { $gte: windowStart, $lt: windowEnd },
      // Exclude soft-deleted orders
      isDeleted: { $ne: true },
      deletedAt: { $exists: false },
      status: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
      orderStatus: { $nin: ["deleted", "cancelled", "canceled", "refunded", "failed"] },
      // Only count paid/successful orders
      $or: [
        { isPaid: true },
        { paymentStatus: { $in: ["paid", "Paid", "PAID", "completed", "success", "Success", "SUCCESS", "successful", "Successful"] } },
        { "payment.status": { $in: ["paid", "completed", "success", "successful"] } },
        { orderSource: { $in: ["pos", "POS", "manual", "Manual"] } },
        { paymentMethod: { $in: ["cash", "Cash", "CASH", "cod", "COD", "Cod", "card", "Card", "CARD", "razorpay", "Razorpay"] } },
        { orderStatus: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } },
        { status: { $in: ["delivered", "completed", "shipped", "confirmed", "packed", "out_for_delivery"] } }
      ]
    };
    applyScope(match, scopeQuery);
    return [
      { $match: match },
      { $unwind: "$items" },
      {
        $addFields: {
          lineRevenue: {
            $multiply: [{ $ifNull: ["$items.price", 0] }, { $ifNull: ["$items.quantity", 0] }],
          },
          pidStr: { $toString: "$items.productId" },
        },
      },
      {
        $addFields: {
          pidForLookup: {
            $cond: {
              if: {
                $regexMatch: { input: "$pidStr", regex: /^[a-fA-F0-9]{24}$/ },
              },
              then: { $toObjectId: "$pidStr" },
              else: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "pidForLookup",
          foreignField: "_id",
          as: "p",
        },
      },
      {
        $addFields: {
          productName: {
            $trim: {
              input: {
                $toString: {
                  $ifNull: [{ $arrayElemAt: ["$p.name", 0] }, { $ifNull: ["$items.name", "Product"] }],
                },
              },
            },
          },
          productImage: {
            $ifNull: [{ $arrayElemAt: ["$p.image", 0] }, { $ifNull: ["$items.image", ""] }],
          },
        },
      },
      {
        $group: {
          _id: "$pidStr",
          revenue: { $sum: "$lineRevenue" },
          name: { $first: "$productName" },
          image: { $first: "$productImage" },
        },
      },
    ];
  };

  const currentAgg = await Order.aggregate([
    ...productLineStages(start, end),
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  const prevAgg = await Order.aggregate([
    ...productLineStages(prevStart, prevEnd),
    { $sort: { revenue: -1 } },
  ]);
  const prevMap = Object.fromEntries(prevAgg.map((x) => [x._id, x.revenue]));

  return currentAgg.map((row) => {
    const prevRev = prevMap[row._id] ?? 0;
    let growthPercent = 0;
    if (prevRev > 0) growthPercent = ((row.revenue - prevRev) / prevRev) * 100;
    else if (row.revenue > 0) growthPercent = 100;
    return {
      name: row.name || "Product",
      sales: Math.round(row.revenue * 100) / 100,
      growthPercent: Math.round(growthPercent * 10) / 10,
      image: row.image || "",
    };
  });
}

// @desc    Admin dashboard analytics (summary, revenue flow, categories, top products)
// @route   GET /api/admin/analytics
// @access  Private / admin
const getAdminAnalytics = async (req, res) => {
  try {
    const userId = req.user?._id;
    const userRole = String(req.user?.role || "");
    const normalizedRole = normalizeRole(userRole);
    const isSuperAdmin = normalizedRole === "super_admin";
    const isAdmin = normalizedRole === "admin";

    let scopeFilter = {};

    if (isSuperAdmin || isAdmin) {
      const role = req.user?.role;
      const isSuperAdminCheck =
        role === "super_admin" ||
        role === "Super Admin" ||
        role === "superadmin";

      const resolvedClientStoreId =
        req.query.clientStoreId ||
        req.query.storeId ||
        req.query.clientId ||
        req.user?.clientStoreId ||
        req.user?.storeId ||
        req.user?.assignedStoreId ||
        req.user?.clientId ||
        null;

      if (!isSuperAdminCheck && resolvedClientStoreId) {
        scopeFilter.$or = [
          { clientStoreId: resolvedClientStoreId },
          { storeId: resolvedClientStoreId },
          { assignedStoreId: resolvedClientStoreId },
          { clientId: resolvedClientStoreId }
        ];
      }
    } else {
      const resolvedClientStoreId =
        req.query.clientStoreId ||
        req.query.storeId ||
        req.query.clientId ||
        req.user?.clientStoreId ||
        req.user?.storeId ||
        req.user?.assignedStoreId ||
        req.user?.clientId ||
        null;

      if (resolvedClientStoreId) {
        scopeFilter.$or = [
          { clientStoreId: resolvedClientStoreId },
          { storeId: resolvedClientStoreId },
          { assignedStoreId: resolvedClientStoreId },
          { clientId: resolvedClientStoreId }
        ];
      }
    }


    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const cur = { start: startOfMonth, end: startOfNextMonth };

    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = { start: prevStart, end: startOfMonth };

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

    // isRevenueOrder kept as alias for invoice/category helpers
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

    const calculateStatsForWindow = (start, end, allOrders /*, allInvoices intentionally excluded — orders are the single source of truth */) => {
      // Filter to orders whose createdAt falls in [start, end)
      const ordersInWindow = allOrders.filter(o => isDateInWindow(o, start, end));

      let revenue = 0;
      let validOrdersCount = 0;
      const validOrderIdsSet = new Set();
      const validOrderIds = [];

      for (const order of ordersInWindow) {
        // Count all non-cancelled/refunded/failed orders for BOTH orderCount AND revenue.
        if (isValidSalesOrder(order)) {
          const amt = getOrderAmount(order);
          revenue += amt;
          validOrdersCount++;
          const oid = order.orderId || String(order._id || "");
          if (oid) {
            validOrderIdsSet.add(String(oid).trim().toLowerCase());
            validOrderIds.push(String(oid).trim());
          }
        }
      }

      // orderCount = all valid (non-cancelled) orders this month
      const orderCount = validOrdersCount;
      const paidOrdersCount = validOrdersCount; // kept for backward-compat logs
      const paidOrderIdsSet = validOrderIdsSet;
      const paidOrderIds = validOrderIds;
      const avgOrderValue = validOrdersCount > 0 ? revenue / validOrdersCount : 0;

      return { revenue, paidOrdersCount, orderCount, avgOrderValue, paidOrderIdsSet, paidOrderIds };
    };

    const calculateLossThisMonth = (start, end, allOrders) => {
      const LOSS_STATUSES = ["cancelled", "refunded", "failed"];
      let loss = 0;
      let cancelledCount = 0;

      for (const order of allOrders) {
        const orderStatusStr = String(order.status || order.orderStatus || "").toLowerCase().trim();
        const isCancelledStatus = LOSS_STATUSES.includes(orderStatusStr);

        // Refunds first — avoid double-counting with cancellation block
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

      console.log(`[AdminAnalytics Loss] role=${userRole} cancelledOrdersCounted=${cancelledCount} lossAmount=${Math.round(loss * 100) / 100} window=[${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}]`);
      return Math.round(loss * 100) / 100;
    };

    const calculateTopProducts = (startCur, endCur, startPrev, endPrev, allOrders, allInvoices, limit = 3) => {
      const curStats = calculateStatsForWindow(startCur, endCur, allOrders, allInvoices);
      const prevStats = calculateStatsForWindow(startPrev, endPrev, allOrders, allInvoices);

      const productsCur = new Map();
      const productsPrev = new Map();

      const processItems = (ordersInWindow, invoicesInWindow, paidIds, map, isCur) => {
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
            const matchingOrder = allOrders.find(o => String(o.orderId).trim().toLowerCase() === invOrderId);
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

      const ordersCur = allOrders.filter(o => isDateInWindow(o, startCur, endCur));
      const invoicesCur = allInvoices.filter(i => isDateInWindow(i, startCur, endCur));
      processItems(ordersCur, invoicesCur, curStats.paidOrderIdsSet, productsCur, true);

      const ordersPrev = allOrders.filter(o => isDateInWindow(o, startPrev, endPrev));
      const invoicesPrev = allInvoices.filter(i => isDateInWindow(i, startPrev, endPrev));
      processItems(ordersPrev, invoicesPrev, prevStats.paidOrderIdsSet, productsPrev, false);

      const topProducts = Array.from(productsCur.entries()).map(([name, entry]) => {
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

      topProducts.sort((a, b) => b.sales - a.sales);
      return topProducts.slice(0, limit);
    };

    const calculateTopCategories = (start, end, allOrders, allInvoices, limit = 8) => {
      const categoriesMap = new Map();
      const ordersInWindow = allOrders.filter(o => isDateInWindow(o, start, end));
      const invoicesInWindow = allInvoices.filter(i => isDateInWindow(i, start, end));

      for (const order of ordersInWindow) {
        if (isRevenueOrder(order)) {
          const orderItems = getOrderItems(order);
          if (!Array.isArray(orderItems)) continue;
          for (const item of orderItems) {
            const cat = String(item.category || "Uncategorized").trim() || "Uncategorized";
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const itemRev = qty * price;

            categoriesMap.set(cat, (categoriesMap.get(cat) || 0) + itemRev);
          }
        }
      }

      for (const invoice of invoicesInWindow) {
        if (isInvoicePaidOrSuccessful(invoice)) {
          const invOrderId = String(invoice.orderId || "").trim().toLowerCase();
          const matchingOrder = allOrders.find(o => String(o.orderId).trim().toLowerCase() === invOrderId);
          if (matchingOrder && isRevenueOrder(matchingOrder)) {
            continue;
          }
          if (Array.isArray(invoice.items)) {
            for (const item of invoice.items) {
              const cat = "Uncategorized";
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              const itemRev = qty * price;

              categoriesMap.set(cat, (categoriesMap.get(cat) || 0) + itemRev);
            }
          }
        }
      }

      const total = Array.from(categoriesMap.values()).reduce((sum, val) => sum + val, 0);

      const PIE_COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f43f5e"];
      const sorted = Array.from(categoriesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, val], idx) => {
          const value = Math.round(val * 100) / 100;
          const percent = total > 0 ? Math.round((val / total) * 1000) / 10 : 0;
          return {
            name,
            value,
            percent,
            color: PIE_COLORS[idx % PIE_COLORS.length]
          };
        });

      return sorted;
    };

    const calculateRevenueFlow = (allOrders, allInvoices) => {
      const days = [];
      const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0);

        const stats = calculateStatsForWindow(dayStart, dayEnd, allOrders, allInvoices);
        days.push({
          name: short[dayStart.getDay()],
          sales: Math.round(stats.revenue * 100) / 100,
          orders: stats.orderCount,
          date: dayStart.toISOString().slice(0, 10)
        });
      }
      return days;
    };

    // Include cancelled/refunded/failed orders so calculateLossThisMonth sees them.
    // isRevenueOrder() handles revenue exclusion for cancelled/refunded orders.
    // No date filter — same approach as getOrders() so dashboard counts the same orders.
    const allOrders = await Order.find({
      ...scopeFilter,
      isDeleted: { $ne: true },
    }).lean();

    // Debug: inspect actual field names/values from database for first 3 orders
    if (allOrders.length > 0) {
      console.log("SAMPLE ORDER:", JSON.stringify(allOrders[0], null, 2));
      for (let i = 0; i < Math.min(3, allOrders.length); i++) {
        const o = allOrders[i];
        console.log(`[AdminAnalytics Order #${i}] _id=${o._id} status="${o.status}" orderStatus="${o.orderStatus}" paymentStatus="${String(o.paymentStatus || o.payment_status)}" isPaid=${o.isPaid} paidAt=${o.paidAt} paymentMethod="${o.paymentMethod}" orderSource="${o.orderSource}" totalPrice=${o.totalPrice} isCancelled=${isCancelledOrFailed(o)} isValid=${isValidSalesOrder(o)} resolvedAmount=${getOrderAmount(o)} createdAt=${o.createdAt}`);
      }
    } else {
      console.log("[AdminAnalytics] No orders found in query.");
    }

    const allInvoices = await Invoice.find({
      ...scopeFilter,
    }).lean();

    const curStats = calculateStatsForWindow(cur.start, cur.end, allOrders);
    const prevStats = calculateStatsForWindow(prev.start, prev.end, allOrders);

    const salesThisMonth = curStats.revenue;
    const lossThisMonth = calculateLossThisMonth(cur.start, cur.end, allOrders);
    const profitThisMonth = Math.round((salesThisMonth - lossThisMonth) * 100) / 100;

    // Safe backend logs
    const ordersInCurrentMonth = allOrders.filter(o => isDateInWindow(o, cur.start, cur.end)).length;
    const cancelledThisMonth = allOrders.filter(o => isDateInWindow(o, cur.start, cur.end) && isCancelledOrFailed(o)).length;
    const validOrdersFound = curStats.paidOrdersCount;

    console.log("[AdminDashboard] totalOrdersFound:", allOrders.length);
    console.log("[AdminDashboard] ordersInCurrentMonth:", ordersInCurrentMonth);
    console.log("[AdminDashboard] cancelledThisMonth:", cancelledThisMonth);
    console.log("[AdminDashboard] validOrdersFound:", validOrdersFound);
    console.log("[AdminDashboard] totalRevenueCalculated:", Math.round(curStats.revenue * 100) / 100);
    console.log("[AdminDashboard] topProductFound:", (calculateTopProducts(cur.start, cur.end, prev.start, prev.end, allOrders, [], 1)[0]?.name || "None"));
    console.log("[AdminDashboard] Order IDs counted:", curStats.paidOrderIds);

    const calculateConversionRate = async (start, end, filter) => {
      const userQuery = { role: { $in: CUSTOMER_ROLES } };
      applyScope(userQuery, filter);
      const registered = await User.countDocuments(userQuery);
      if (registered === 0) return { rate: 0, registered };

      const orderQuery = {
        createdAt: { $gte: start, $lt: end },
        user: { $exists: true, $ne: null },
      };
      applyScope(orderQuery, filter);

      const withUser = await Order.distinct("user", orderQuery);
      const purchasers = withUser.filter((id) => id != null).length;
      const rate = Math.min(100, (purchasers / registered) * 100);
      return { rate, registered };
    };

    const conversionRateCur = await calculateConversionRate(cur.start, cur.end, scopeFilter);
    const conversionRatePrev = await calculateConversionRate(prev.start, prev.end, scopeFilter);

    const activeCustCur = await activeOrderingCustomersCountForWindow(cur.start, cur.end, scopeFilter);
    const activeCustPrev = await activeOrderingCustomersCountForWindow(prev.start, prev.end, scopeFilter);

    const newCustCur = await User.countDocuments({
      role: { $in: CUSTOMER_ROLES },
      createdAt: { $gte: cur.start, $lt: cur.end },
      ...scopeFilter
    });
    const newCustPrev = await User.countDocuments({
      role: { $in: CUSTOMER_ROLES },
      createdAt: { $gte: prev.start, $lt: prev.end },
      ...scopeFilter
    });

    const clv = await customerLifetimeValueAllTime(scopeFilter);

    const [mrpCur, mrpPrev] = await Promise.all([
      monthlyRevenuePerPayer(cur.start, cur.end, scopeFilter),
      monthlyRevenuePerPayer(prev.start, prev.end, scopeFilter),
    ]);

    const [mauCur, mauPrev] = await Promise.all([
      monthlyActiveCustomers(cur.start, cur.end, scopeFilter),
      monthlyActiveCustomers(prev.start, prev.end, scopeFilter),
    ]);

    const revenueFlow = calculateRevenueFlow(allOrders, allInvoices);
    const topCategories = calculateTopCategories(cur.start, cur.end, allOrders, []);
    const topProducts = calculateTopProducts(cur.start, cur.end, prev.start, prev.end, allOrders, [], 3);

    // Requirement 15: Safe backend debug logs — deleted/cancelled orders, revenue recalculated from DB
    const totalNonDeletedOrdersFound = allOrders.length;
    const paidNonDeletedOrdersFound = curStats.paidOrdersCount;
    const totalRevenueCalculated = Math.round(curStats.revenue * 100) / 100;
    const deletedOrCancelledOrdersExcluded = allOrders.filter(o => {
      const s = String(o.status || o.orderStatus || "").toLowerCase();
      return s === "cancelled" || s === "canceled" || s === "refunded" || s === "failed";
    }).length;
    const topProductFound = topProducts[0]?.name || "None";

    console.log("[Admin Dashboard Stats LOG]:", {
      loggedInRole: userRole,
      scopeLabel: scopeFilter && Object.keys(scopeFilter).length ? "client-scoped" : "Global (All Data)",
      totalNonDeletedOrdersFound,
      paidNonDeletedOrdersFound,
      deletedOrCancelledOrdersExcluded,
      recalculatedRevenue: totalRevenueCalculated,
      lossThisMonth,
      profitThisMonth,
      topProductFound
    });

    console.log("[Dashboard Isolation Log]:", {
      loggedInRole: userRole,
      scopeUsed: scopeFilter && Object.keys(scopeFilter).length ? "client-scoped" : "Global (All Data)",
      totalNonDeletedOrdersFound,
      paidNonDeletedOrdersFound,
      deletedOrCancelledOrdersExcluded,
      recalculatedRevenue: totalRevenueCalculated,
      lossThisMonth
    });


    const conversionRateChange = pctChange(conversionRateCur.rate, conversionRatePrev.rate);
    const avgOrderValueChange = pctChange(curStats.avgOrderValue, prevStats.avgOrderValue);
    const clvTrendChange = pctChange(mrpCur, mrpPrev);
    const sessionsChange = pctChange(mauCur, mauPrev);
    const totalRevenueChange = pctChange(curStats.revenue, prevStats.revenue);
    const orderCountChange = pctChange(curStats.orderCount, prevStats.orderCount);
    const newCustomersChange = pctChange(newCustCur, newCustPrev);
    const activeCustomersChange = pctChange(activeCustCur, activeCustPrev);

    const fullSummary = {
      totalRevenue: Math.round(curStats.revenue * 100) / 100,
      totalRevenueChange: Math.round(totalRevenueChange * 10) / 10,
      totalRevenueTrend: trendFromChange(totalRevenueChange),
      orderCount: curStats.orderCount,
      orderCountChange: Math.round(orderCountChange * 10) / 10,
      orderCountTrend: trendFromChange(orderCountChange),
      activeCustomers: activeCustCur,
      activeCustomersChange: Math.round(activeCustomersChange * 10) / 10,
      activeCustomersTrend: trendFromChange(activeCustomersChange),
      newCustomersThisMonth: newCustCur,
      newCustomersChange: Math.round(newCustomersChange * 10) / 10,
      newCustomersTrend: trendFromChange(newCustomersChange),
      conversionRate: Math.round(conversionRateCur.rate * 100) / 100,
      conversionRateChange: Math.round(conversionRateChange * 10) / 10,
      conversionRateTrend: trendFromChange(conversionRateChange),
      avgOrderValue: Math.round(curStats.avgOrderValue * 100) / 100,
      avgOrderValueChange: Math.round(avgOrderValueChange * 10) / 10,
      avgOrderValueTrend: trendFromChange(avgOrderValueChange),
      customerLifetimeValue: Math.round(clv.customerLifetimeValue * 100) / 100,
      customerLifetimeValueChange: Math.round(clvTrendChange * 10) / 10,
      customerLifetimeValueTrend: trendFromChange(clvTrendChange),
      sessions: mauCur,
      sessionsChange: Math.round(sessionsChange * 10) / 10,
      sessionsTrend: trendFromChange(sessionsChange),
      salesThisMonth,
      lossThisMonth,
      profitThisMonth,
      meta: {
        conversionNote:
          "Registered-customer conversion: share of storefront accounts (user/customer role) that placed at least one order this month with a linked User id. Guest and unlinked POS sales are excluded from the numerator.",
        sessionsNote:
          "Monthly active registered customers: count of customer-role users with lastActiveAt, lastLoginAt, or last seen in this calendar month (proxy for engagement; not raw HTTP session counts).",
        customerLifetimeValueNote:
          "Headline CLV = all-time total order revenue / distinct payers (user or guest email on orders). Month % change compares average monthly revenue per distinct payer vs last month (ARPB-style trend).",
        ordersIncluded:
          "All persisted orders (website and POS) in the orders collection; headline revenue uses totalPrice for the month.",
        totalRevenueNote:
          "Sum of totalPrice for orders placed in the current calendar month (website + POS).",
        salesThisMonthNote:
          "Subset of this month’s orders: not cancelled, and at least one of isPaid, POS (orderSource=pos), delivered, currentStage≥2, or fulfilled orderStatus (confirmed→delivered).",
        lossThisMonthNote:
          "Sum of refundAmount where refundedAt falls in this month, plus totalPrice for orders with cancelledAt in this month when refundAmount is absent or zero (no double-count).",
        profitThisMonthNote:
          "salesThisMonth − lossThisMonth (no product cost field in schema; COGS not applied).",
        orderCountNote:
          "Count of orders created in the current calendar month (same scope as total revenue).",
        activeCustomersNote:
          "Distinct customers who placed at least one order in the current calendar month: linked account (user id) or guest email on the order (same identity rules as conversion metrics). Orders with no user and no email are excluded.",
        newCustomersNote:
          "Count of new storefront accounts (user/customer role) registered in the current calendar month.",
      },
    };

    const periods = {
      summaryMonth: { start: cur.start.toISOString(), end: cur.end.toISOString() },
      previousMonth: { start: prev.start.toISOString(), end: prev.end.toISOString() },
    };

    const fullPayload = {
      analyticsScope: "full",
      summary: fullSummary,
      revenueFlow,
      topCategories,
      topProducts,
      periods,
    };

    if (isSuperAdmin) {
      return res.json({ success: true, data: fullPayload });
    }

    const operationalSummary = {
      totalRevenue: fullSummary.totalRevenue,
      totalRevenueChange: fullSummary.totalRevenueChange,
      totalRevenueTrend: fullSummary.totalRevenueTrend,
      orderCount: fullSummary.orderCount,
      orderCountChange: fullSummary.orderCountChange,
      orderCountTrend: fullSummary.orderCountTrend,
      avgOrderValue: fullSummary.avgOrderValue,
      avgOrderValueChange: fullSummary.avgOrderValueChange,
      avgOrderValueTrend: fullSummary.avgOrderValueTrend,
      salesThisMonth: fullSummary.salesThisMonth,
      lossThisMonth: fullSummary.lossThisMonth,
      profitThisMonth: fullSummary.profitThisMonth,
      meta: {
        operationalNote:
          "Conversion, sessions, new signups, and CLV are available to Super Admin only. This view is limited to revenue and order operations.",
      },
    };

    return res.json({
      success: true,
      data: {
        analyticsScope: "operational",
        summary: operationalSummary,
        revenueFlow,
        topCategories,
        topProducts,
        periods,
      },
    });
  } catch (error) {
    console.error("[adminAnalytics] getAdminAnalytics:", error.message);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

module.exports = {
  getAdminAnalytics,
};
