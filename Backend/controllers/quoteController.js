const Quote = require("../models/Quote");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const { resolveClientId, isValidObjectId } = require("../utils/tenantResolver");
const mongoose = require("mongoose");

const generateQuoteNumber = () => {
  return `QT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
};

const generateInvoiceNumber = () => {
  return `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
};

// @desc    Get all quotes
// @route   GET /api/quotes
// @access  Private
const getQuotes = async (req, res) => {
  try {
    const isSuperAdmin = req.user && req.user.role === "super_admin";
    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "client");
    const isVendor = req.user && (req.user.role === "vendor" || req.user.role === "VENDOR");
    const clientId = isSuperAdmin ? null : (req.user?.clientId || req.clientId || (await resolveClientId(req)));

    let query = {};

    if (isSuperAdmin) {
      // Super Admin sees all
      query = {};
    } else if (isAdmin) {
      // Admin sees client-specific
      query = { clientId };
    } else if (isVendor) {
      // Vendor sees client requirements / quotes
      query = clientId ? { clientId } : { userId: req.user._id };
    } else {
      // Regular user sees their own
      query = { userId: req.user._id };
    }

    // Keep base scope query for calculating overall stats
    const baseScopeQuery = { ...query };

    // Dynamic search filtering (quoteNumber, customerName, customerEmail)
    if (req.query.search && String(req.query.search).trim()) {
      const sanitized = String(req.query.search).trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const searchRegex = new RegExp(sanitized, "i");
      query.$or = [
        { quoteNumber: searchRegex },
        { customerName: searchRegex },
        { customerEmail: searchRegex },
      ];
    }

    // Dynamic status filtering - exact indexed matching
    if (req.query.status && String(req.query.status).trim() && String(req.query.status).toLowerCase() !== "all") {
      const s = String(req.query.status).trim().toLowerCase();
      query.status = s;
    }

    // Pagination parameters
    const isAll = req.query.all === "true" || req.query.limit === "0";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = isAll ? 0 : Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Projection: essential fields for list & details (avoiding heavy overhead)
    const projection = "_id quoteNumber customerName customerEmail products originalTotal requestedPrice counterPrice finalPrice message adminMessage status paymentStatus paidAt validUntil clientId userId createdAt";

    // Run count, paginated lean find, and tenant-wide stats aggregation concurrently
    const queryChain = Quote.find(query)
      .select(projection)
      .sort({ createdAt: -1 })
      .lean();

    if (!isAll) {
      queryChain.skip(skip).limit(limit);
    }

    const hasFilter = Boolean(
      (req.query.search && String(req.query.search).trim()) ||
      (req.query.status && String(req.query.status).trim() && String(req.query.status).toLowerCase() !== "all")
    );

    const [quotes, statsResult, filterCount] = await Promise.all([
      queryChain,
      Quote.aggregate([
        { $match: baseScopeQuery },
        {
          $project: {
            status: 1,
            paymentStatus: 1,
            amount: { $ifNull: ["$finalPrice", { $ifNull: ["$requestedPrice", 0] }] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
            pending: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "countered"]] },
                  1,
                  0
                ]
              }
            },
            paid: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
            totalAmount: { $sum: "$amount" }
          }
        }
      ]),
      hasFilter ? Quote.countDocuments(query) : null
    ]);

    const stats = statsResult[0] || { total: 0, accepted: 0, pending: 0, paid: 0, totalAmount: 0 };
    const total = hasFilter ? (filterCount || 0) : (stats.total || quotes.length);
    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      count: quotes.length,
      total,
      page: isAll ? 1 : page,
      limit: isAll ? total : limit,
      totalPages,
      pagination: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
      stats,
      data: quotes,
    });
  } catch (error) {
    console.error("[quoteController] getQuotes error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get quote by ID
// @route   GET /api/quotes/:id
// @access  Private
const getQuoteById = async (req, res) => {
  try {
    const isSuperAdmin = req.user && req.user.role === "super_admin";
    const clientId = req.user?.clientId || req.clientId || (await resolveClientId(req));

    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Quote not found or access denied (Invalid ID)" });
    }

    let query = { _id: req.params.id };
    if (!isSuperAdmin) {
      if (req.user.role === "admin" || req.user.role === "client") {
        query.clientId = clientId;
      } else {
        query.userId = req.user._id;
      }
    }

    const quote = await Quote.findOne(query).lean();

    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found or access denied" });
    }

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error("[quoteController] getQuoteById error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new quote
// @route   POST /api/quotes
// @access  Private
const createQuote = async (req, res) => {
  try {
    const { products, originalTotal, requestedPrice, message, userId, customerName, customerEmail } = req.body;
    
    // Improved clientId resolution: Body -> Headers -> User Context -> Tenant Resolver -> TenantId
    let clientId = req.body.clientId || req.headers["x-client-id"] || req.user?.clientId || req.clientId || req.tenantId;
    
    if (!clientId) {
      clientId = await resolveClientId(req);
    }

    // Requirement 8.3: Resolve from product if still missing
    if (!clientId && products && products.length > 0) {
      const firstProductId = products[0].productId;
      if (isValidObjectId(firstProductId)) {
        const product = await Product.findById(String(firstProductId)).select("clientId");
        if (product && product.clientId) {
          clientId = product.clientId.toString();
          console.log(`[quoteController] Resolved clientId ${clientId} from product ${firstProductId}`);
        }
      }
    }

    if (!clientId) {
      console.warn("[quoteController] Could not resolve clientId for quote request");
      return res.status(400).json({ success: false, message: "Client ID is required for quote request" });
    }

    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "super_admin" || req.user.role === "client");

    const quote = await Quote.create({
      quoteNumber: generateQuoteNumber(),
      userId: (isAdmin && userId) ? userId : req.user._id,
      clientId,
      customerName: (isAdmin && customerName) ? customerName : (req.user.name || req.user.email),
      customerEmail: (isAdmin && customerEmail) ? customerEmail : req.user.email,
      products,
      originalTotal,
      requestedPrice,
      message,
      status: "pending",
    });

    res.status(201).json({ success: true, data: quote });
  } catch (error) {
    console.error("[quoteController] createQuote error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send counter offer (Admin)
// @route   PATCH /api/quotes/:id/counter
// @access  Private (Admin/SuperAdmin)
const sendCounterOffer = async (req, res) => {
  try {
    const { counterPrice, adminMessage } = req.body;
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Quote not found (Invalid ID)" });
    }
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    quote.counterPrice = counterPrice;
    quote.adminMessage = adminMessage;
    quote.status = "countered";
    await quote.save();

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error("[quoteController] sendCounterOffer error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accept quote/counter offer
// @route   PATCH /api/quotes/:id/accept
// @access  Private
const acceptQuote = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Quote not found (Invalid ID)" });
    }
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    // If admin is accepting user's requested price
    if (req.user.role === "admin" || req.user.role === "super_admin") {
      quote.finalPrice = quote.requestedPrice;
    } 
    // If user is accepting admin's counter price
    else {
      if (quote.status !== "countered") {
        return res.status(400).json({ success: false, message: "Quote must be countered to accept counter price" });
      }
      quote.finalPrice = quote.counterPrice;
    }

    quote.status = "accepted";
    await quote.save();

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error("[quoteController] acceptQuote error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reject quote
// @route   PATCH /api/quotes/:id/reject
// @access  Private
const rejectQuote = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Quote not found (Invalid ID)" });
    }
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    quote.status = "rejected";
    await quote.save();

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error("[quoteController] rejectQuote error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Convert quote to invoice
// @route   POST /api/quotes/:id/convert-to-invoice
// @access  Private (Admin/SuperAdmin)
const convertToInvoice = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Quote not found (Invalid ID)" });
    }
    const quote = await Quote.findById(req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found" });
    }

    if (quote.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Only accepted quotes can be converted to invoices" });
    }

    const invoice = await Invoice.create({
      invoiceNumber: generateInvoiceNumber(),
      orderId: quote.quoteNumber, // Use quote number as reference
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      items: quote.products.map(p => ({
        name: p.name,
        quantity: p.quantity,
        price: p.price,
        subtotal: p.price * p.quantity,
      })),
      subtotal: quote.finalPrice,
      totalAmount: quote.finalPrice,
      paymentStatus: "paid",
      clientId: quote.clientId,
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    console.error("[quoteController] convertToInvoice error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getQuotes,
  getQuoteById,
  createQuote,
  sendCounterOffer,
  acceptQuote,
  rejectQuote,
  convertToInvoice,
};

