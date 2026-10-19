const express = require("express");
const router = express.Router();
const { optionalProtect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const {
  validateCoupon,
  checkoutPOS,
  createWhatsAppPaymentLink,
  checkPaymentStatus,
  holdOrder,
  getHeldOrders,
  resumeHeldOrder,
  syncOfflineOrders,
} = require("../controllers/posController");
const { createRazorpayOrder, verifyRazorpayPayment } = require("../controllers/paymentController");
const { sendInvoiceEmail } = require("../controllers/invoiceController");

// @route   POST /api/pos/validate-coupon
// @desc    Validate coupon rule (e.g. SAVE1000 min ₹3000 -> flat ₹500 off)
// @access  Public / POS Cashier
router.post("/validate-coupon", optionalProtect, tenantMiddleware, validateCoupon);

// @route   POST /api/pos/checkout
// @desc    POS checkout order with atomic stock decrement ($inc: { stock: -qty }) and coupon validation
// @access  Public / POS Cashier
router.post("/checkout", optionalProtect, tenantMiddleware, checkoutPOS);

// @route   POST /api/pos/whatsapp-payment-link
// @desc    Generate Razorpay Payment Link and direct WhatsApp URL for POS checkout
// @access  Public / POS Cashier
router.post("/whatsapp-payment-link", optionalProtect, tenantMiddleware, createWhatsAppPaymentLink);
router.post("/create-payment-link", optionalProtect, tenantMiddleware, createWhatsAppPaymentLink);

// @route   POST /api/pos/check-payment-status
// @desc    Check Razorpay payment link status and update order to PAID in MongoDB
// @access  Public / POS Cashier
router.post("/check-payment-status", optionalProtect, tenantMiddleware, checkPaymentStatus);

// @route   POST /api/pos/razorpay-order
// @desc    Create Razorpay order for POS billing
// @access  Public / POS Cashier
router.post("/razorpay-order", optionalProtect, tenantMiddleware, createRazorpayOrder);

// @route   POST /api/pos/verify-payment
// @desc    Verify Razorpay payment signature for POS billing
// @access  Public / POS Cashier
router.post("/verify-payment", optionalProtect, tenantMiddleware, verifyRazorpayPayment);

// @route   POST /api/pos/send-email
// @desc    Send invoice receipt email via Nodemailer & Zendesk
// @access  Public / POS Cashier
router.post("/send-email", optionalProtect, tenantMiddleware, sendInvoiceEmail);

// ── Hold / Park Orders (Multi-Cart) & Offline-First Sync Routes ──────────────

// @route   POST /api/pos/orders/hold
// @desc    Creates or updates a held / parked order in MongoDB
// @access  Public / POS Cashier
router.post("/orders/hold", optionalProtect, tenantMiddleware, holdOrder);
router.post("/hold", optionalProtect, tenantMiddleware, holdOrder);

// @route   GET /api/pos/orders/held
// @desc    Fetches all currently held / parked orders
// @access  Public / POS Cashier
router.get("/orders/held", optionalProtect, tenantMiddleware, getHeldOrders);
router.get("/held", optionalProtect, tenantMiddleware, getHeldOrders);

// @route   DELETE /api/pos/orders/held/:id
// @desc    Archive or free the held status when recalled or discarded
// @access  Public / POS Cashier
router.delete("/orders/held/:id", optionalProtect, tenantMiddleware, resumeHeldOrder);
router.delete("/held/:id", optionalProtect, tenantMiddleware, resumeHeldOrder);

// @route   PATCH /api/pos/orders/held/:id/resume
// @desc    Frees or archives the held status when recalled
// @access  Public / POS Cashier
router.patch("/orders/held/:id/resume", optionalProtect, tenantMiddleware, resumeHeldOrder);
router.patch("/held/:id/resume", optionalProtect, tenantMiddleware, resumeHeldOrder);

// @route   POST /api/pos/orders/sync
// @desc    Batch endpoint to sync locally saved offline orders once network reconnects
// @access  Public / POS Cashier
router.post("/orders/sync", optionalProtect, tenantMiddleware, syncOfflineOrders);
router.post("/sync", optionalProtect, tenantMiddleware, syncOfflineOrders);

module.exports = router;
