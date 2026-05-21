const Order = require("../models/Order");
const Product = require("../models/Product");

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function monthWindowContaining(ref) {
  const start = startOfMonth(ref);
  const end = addMonths(start, 1);
  return { start, end };
}

function previousMonthWindow(ref) {
  const thisStart = startOfMonth(ref);
  const prevEnd = thisStart;
  const prevStart = addMonths(thisStart, -1);
  return { start: prevStart, end: prevEnd };
}

function pctChange(current, previous) {
  if (previous == null || Number.isNaN(previous) || previous === 0) {
    if (current == null || Number.isNaN(current) || current === 0) return 0;
    return 100;
  }
  return ((current - previous) / previous) * 100;
}

async function userOrderTotalsForWindow(userId, start, end) {
  const match = { 
    user: userId, 
    createdAt: { $gte: start, $lt: end },
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
  };
  const [agg] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
      },
    },
  ]);
  const orderCount = agg?.orderCount ?? 0;
  const revenue = agg?.revenue ?? 0;
  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
  return { orderCount, revenue, avgOrderValue };
}

async function userRevenueFlowLast7Days(userId) {
  const now = new Date();
  const days = [];
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
    const [agg] = await Order.aggregate([
      { 
        $match: { 
          user: userId, 
          createdAt: { $gte: day, $lt: next },
          isDeleted: { $ne: true },
          deletedAt: { $exists: false },
          status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
          orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
        } 
      },
      {
        $group: {
          _id: null,
          sales: { $sum: { $ifNull: ["$totalPrice", 0] } },
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

async function userCategoryDistribution(userId) {
  const rows = await Order.aggregate([
    { 
      $match: { 
        user: userId,
        isDeleted: { $ne: true },
        deletedAt: { $exists: false },
        status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
        orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
      } 
    },
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
    // Use safe localField/foreignField — pidForLookup was guarded by $regexMatch above.
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
        }
      },
    },
    {
      $group: {
        _id: "$categoryName",
        value: { $sum: "$lineRevenue" },
        count: { $sum: 1 },
      },
    },
    { $sort: { value: -1 } },
    { $limit: 8 },
  ]);

  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  return rows.map((r, i) => {
    const value = Math.round((r.value || 0) * 100) / 100;
    const percent = total > 0 ? Math.round(((r.value || 0) / total) * 1000) / 10 : 0;
    return {
      name: r._id || "Uncategorized",
      value,
      count: r.count || 0,
      percent,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  });
}

async function userTotalOrdersAllTime(userId) {
  return Order.countDocuments({ 
    user: userId,
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
    orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
  });
}

async function userTotalSpentAllTime(userId) {
  const [agg] = await Order.aggregate([
    { 
      $match: { 
        user: userId,
        isDeleted: { $ne: true },
        deletedAt: { $exists: false },
        status: { $nin: ["deleted", "cancelled", "refunded", "failed"] },
        orderStatus: { $nin: ["deleted", "cancelled", "refunded", "failed"] }
      } 
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: { $ifNull: ["$totalPrice", 0] } },
      },
    },
  ]);
  return Math.round((agg?.totalSpent ?? 0) * 100) / 100;
}

const getUserAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const cur = monthWindowContaining(now);
    const prev = previousMonthWindow(now);

    const [revenueFlow, topCategories, totCur, totPrev, totalOrders, totalSpent] = await Promise.all([
      userRevenueFlowLast7Days(userId),
      userCategoryDistribution(userId),
      userOrderTotalsForWindow(userId, cur.start, cur.end),
      userOrderTotalsForWindow(userId, prev.start, prev.end),
      userTotalOrdersAllTime(userId),
      userTotalSpentAllTime(userId),
    ]);

    const revenueChange = Math.round(pctChange(totCur.revenue, totPrev.revenue) * 10) / 10;
    const orderCountChange = Math.round(pctChange(totCur.orderCount, totPrev.orderCount) * 10) / 10;

    res.json({
      success: true,
      data: {
        analyticsScope: "user",
        summary: {
          totalRevenue: Math.round(totCur.revenue * 100) / 100,
          totalRevenueChange: revenueChange,
          totalRevenueTrend: revenueChange > 0 ? "up" : revenueChange < 0 ? "down" : "neutral",
          orderCount: totCur.orderCount,
          orderCountChange: orderCountChange,
          orderCountTrend: orderCountChange > 0 ? "up" : orderCountChange < 0 ? "down" : "neutral",
          avgOrderValue: Math.round(totCur.avgOrderValue * 100) / 100,
          totalOrders,
          totalSpent,
        },
        revenueFlow,
        topCategories,
        periods: {
          summaryMonth: { start: cur.start.toISOString(), end: cur.end.toISOString() },
          previousMonth: { start: prev.start.toISOString(), end: prev.end.toISOString() },
        },
      },
    });
  } catch (error) {
    console.error("[userAnalytics] getUserAnalytics:", error.message);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

module.exports = {
  getUserAnalytics,
};