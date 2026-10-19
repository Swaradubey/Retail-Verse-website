const express = require("express");
const router = express.Router();
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require("../controllers/paymentController");

// Use specific path as requested: /api/payments/razorpay/...
router.post("/razorpay/create-order", (req, res, next) => {
  console.log("[Payment Route] POST /api/payments/razorpay/create-order");
  next();
}, createRazorpayOrder);

// Alias for requested path /api/razorpay/create-order (if mounted at /api/razorpay)
router.post("/create-order", createRazorpayOrder);

// Alias for requested path /api/payment/razorpay-order
router.post("/razorpay-order", createRazorpayOrder);

router.post("/razorpay/verify", (req, res, next) => {
  console.log("[Payment Route] POST /api/payments/razorpay/verify");
  next();
}, verifyRazorpayPayment);

// Alias for requested path /api/razorpay/verify-payment (if mounted at /api/razorpay)
router.post("/verify-payment", verifyRazorpayPayment);
router.post("/verify", verifyRazorpayPayment); // keep existing just in case

// WhatsApp payment link generation aliases
const { createWhatsAppPaymentLink, checkPaymentStatus } = require("../controllers/posController");
router.post("/whatsapp-payment-link", createWhatsAppPaymentLink);
router.post("/create-payment-link", createWhatsAppPaymentLink);
router.post("/check-payment-status", checkPaymentStatus);


module.exports = router;
