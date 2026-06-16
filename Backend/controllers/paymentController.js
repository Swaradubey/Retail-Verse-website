const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const Quote = require("../models/Quote");
const Invoice = require("../models/Invoice");

// @desc    Create Razorpay order
// @route   POST /api/payments/razorpay/create-order  (also mounted at /api/razorpay/create-order)
// @access  Public
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", quotationId, invoiceId } = req.body;

    // [CREATE ORDER BODY] — full incoming payload (no secret logged)
    console.log("[CREATE ORDER BODY]", { amount, currency, quotationId, invoiceId });

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    // Resolve client ID from headers, JWT, body, or database lookups for Quote/Invoice
    const { resolveClientId } = require("../utils/tenantResolver");
    let resolvedClientId = req.clientId;
    if (!resolvedClientId) {
      resolvedClientId = await resolveClientId(req);
    }
    if (!resolvedClientId) {
      if (quotationId) {
        const quote = await Quote.findById(quotationId).select("clientId");
        if (quote) resolvedClientId = quote.clientId;
      }
      if (!resolvedClientId && invoiceId) {
        const invoice = await Invoice.findById(invoiceId).select("clientId");
        if (invoice) resolvedClientId = invoice.clientId;
      }
    }

    let razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    let razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    let isClientSpecific = false;

    if (resolvedClientId) {
      const ClientRazorpayConfig = require("../models/ClientRazorpayConfig");
      const clientConfig = await ClientRazorpayConfig.findOne({
        clientId: resolvedClientId,
        razorpayEnabled: true,
      });

      if (clientConfig && clientConfig.razorpayKeyId && clientConfig.razorpayKeySecretEncrypted) {
        const { decrypt } = require("../utils/encryption");
        const decryptedSecret = decrypt(clientConfig.razorpayKeySecretEncrypted);
        if (decryptedSecret) {
          razorpayKeyId = clientConfig.razorpayKeyId;
          razorpayKeySecret = decryptedSecret;
          isClientSpecific = true;
          console.log(`[RAZORPAY CREATE ORDER] Using client-specific config for client: ${resolvedClientId}`);
        }
      }
    }

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("[RAZORPAY ERROR]: Missing Razorpay credentials (neither client nor global config exists/enabled)");
      return res.status(400).json({
        success: false,
        message: "Payment gateway is currently unavailable for this store. Please contact the administrator/seller.",
      });
    }

    // Key ID only — never log the secret
    console.log("[RAZORPAY CREATE ORDER] Key ID:", razorpayKeyId, "isClientSpecific:", isClientSpecific);
    console.log("[RAZORPAY CREATE ORDER] Amount received (INR):", amount, "→ paise:", Math.round(Number(amount) * 100));

    const instance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    // Frontend sends raw INR value. Backend multiplies by 100 to convert to paise.
    // DEV NOTE: Do NOT multiply on the frontend — that would double-count.
    const options = {
      amount: Math.round(Number(amount) * 100), // convert INR → paise
      currency,
      receipt: `receipt_${Date.now()}`,
    };

    const order = await instance.orders.create(options);

    if (!order) {
      return res.status(500).json({
        success: false,
        message: "Failed to create Razorpay order",
      });
    }

    console.log("[RAZORPAY ORDER CREATED]", {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });

    // ── Save Razorpay order ID against Quote before checkout opens ──────────
    // Requirement 7: When create-order is called, store razorpay_order_id + amount
    // + currency + paymentStatus = "pending" against the quote record.
    if (quotationId) {
      try {
        const quote = await Quote.findById(quotationId);
        if (quote) {
          quote.razorpayOrderId = order.id;
          quote.paymentStatus = "pending";
          await quote.save();
          console.log("[CREATE ORDER] Saved razorpayOrderId to quote:", quotationId);
        } else {
          console.warn("[CREATE ORDER] quotationId provided but quote not found:", quotationId);
        }
      } catch (qErr) {
        // Non-fatal — checkout can still proceed
        console.error("[CREATE ORDER] Failed to update quote with razorpayOrderId:", qErr.message);
      }
    }

    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpayKeyId,
    });
  } catch (error) {
    console.error("[RAZORPAY CREATE ORDER ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// @desc    Verify Razorpay payment
// @route   POST /api/payments/razorpay/verify-payment  (also /api/razorpay/verify-payment)
// @access  Public
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      internal_order_id,    // legacy: our business orderId
      internal_quote_id,    // legacy: quote _id
      quotationId,          // new: quote _id (preferred)
      invoiceId,            // new: Invoice _id
      orderId,              // new: human-readable quote/invoice reference
    } = req.body;

    // [VERIFY PAYMENT BODY] — log all identifiers (no secret logged)
    console.log("[VERIFY PAYMENT BODY]", {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature: razorpay_signature ? "(received)" : "(MISSING)",
      internal_order_id,
      internal_quote_id,
      quotationId,
      invoiceId,
      orderId,
    });

    // Resolve client ID from headers, JWT, body, or database lookups for Quote/Invoice/Order
    const { resolveClientId } = require("../utils/tenantResolver");
    let resolvedClientId = req.clientId;
    if (!resolvedClientId) {
      resolvedClientId = await resolveClientId(req);
    }
    if (!resolvedClientId) {
      if (quotationId || internal_quote_id) {
        const quote = await Quote.findById(quotationId || internal_quote_id).select("clientId");
        if (quote) resolvedClientId = quote.clientId;
      }
      if (!resolvedClientId && invoiceId) {
        const invoice = await Invoice.findById(invoiceId).select("clientId");
        if (invoice) resolvedClientId = invoice.clientId;
      }
      if (!resolvedClientId && internal_order_id) {
        const order = await Order.findOne({ orderId: internal_order_id }).select("clientId");
        if (order) resolvedClientId = order.clientId;
      }
    }

    let razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (resolvedClientId) {
      const ClientRazorpayConfig = require("../models/ClientRazorpayConfig");
      const clientConfig = await ClientRazorpayConfig.findOne({
        clientId: resolvedClientId,
        razorpayEnabled: true,
      });

      if (clientConfig && clientConfig.razorpayKeySecretEncrypted) {
        const { decrypt } = require("../utils/encryption");
        const decryptedSecret = decrypt(clientConfig.razorpayKeySecretEncrypted);
        if (decryptedSecret) {
          razorpayKeySecret = decryptedSecret;
          console.log(`[RAZORPAY VERIFY] Using client-specific secret for client: ${resolvedClientId}`);
        }
      }
    }

    if (!razorpayKeySecret) {
      console.error("[RAZORPAY ERROR]: Missing Razorpay key secret for verification");
      return res.status(500).json({
        success: false,
        message: "Razorpay configuration is incomplete. Verification failed.",
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error("[VERIFY PAYMENT] Missing required Razorpay fields");
      return res.status(400).json({
        success: false,
        message: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature",
      });
    }

    // ── Exact signature verification per Razorpay docs ───────────────────────
    const generatedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    console.log("[SIGNATURE MATCH]", generatedSignature === razorpay_signature);

    if (generatedSignature !== razorpay_signature) {
      // Verification failed — signature mismatch
      console.error("[RAZORPAY VERIFICATION FAILED]: Signature mismatch");

      // Mark quote as failed if identifiable
      const failQuoteId = quotationId || internal_quote_id;
      if (failQuoteId) {
        try {
          const quote = await Quote.findById(failQuoteId);
          if (quote) { quote.paymentStatus = "failed"; await quote.save(); }
        } catch (_) { /* non-fatal */ }
      }
      // Mark order as failed if identifiable
      if (internal_order_id) {
        try {
          const order = await Order.findOne({ orderId: internal_order_id });
          if (order) { order.paymentStatus = "failed"; await order.save(); }
        } catch (_) { /* non-fatal */ }
      }

      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay signature",
      });
    }

    // ── Signature verified — update records ──────────────────────────────────
    console.log("[RAZORPAY PAYMENT VERIFIED]:", { razorpay_payment_id });

    // 1. Update Quote (prefer quotationId, fall back to internal_quote_id)
    const quoteId = quotationId || internal_quote_id;
    if (quoteId) {
      try {
        const quote = await Quote.findById(quoteId);
        if (quote) {
          quote.razorpayOrderId = razorpay_order_id;
          quote.razorpayPaymentId = razorpay_payment_id;
          quote.razorpaySignature = razorpay_signature;
          quote.paymentStatus = "paid";
          // NOTE: Quote.status enum is ["pending","countered","accepted","rejected"].
          // "accepted" is the correct terminal state; paymentStatus="paid" tracks payment.
          // Do NOT set status="paid" — it is not in the enum and causes Mongoose validation error.
          quote.paidAt = new Date();
          await quote.save();
          console.log("[VERIFY PAYMENT] Quote updated to paid:", quoteId);
        } else {
          console.warn("[VERIFY PAYMENT] Quote not found for id:", quoteId);
        }
      } catch (qErr) {
        console.error("[VERIFY PAYMENT] Failed to update quote:", qErr.message);
      }
    }

    // 2. Update Invoice if invoiceId provided
    if (invoiceId) {
      try {
        const invoice = await Invoice.findById(invoiceId);
        if (invoice) {
          invoice.paymentStatus = "paid";
          invoice.razorpayOrderId = razorpay_order_id;
          invoice.razorpayPaymentId = razorpay_payment_id;
          invoice.paidAt = new Date();
          await invoice.save();
          console.log("[VERIFY PAYMENT] Invoice updated to paid:", invoiceId);
        } else {
          console.warn("[VERIFY PAYMENT] Invoice not found for id:", invoiceId);
        }
      } catch (invErr) {
        console.error("[VERIFY PAYMENT] Failed to update invoice:", invErr.message);
      }
    }

    // 3. Update Order if internal_order_id provided (legacy flow)
    if (internal_order_id) {
      try {
        const order = await Order.findOne({ orderId: internal_order_id });
        if (order) {
          order.razorpayOrderId = razorpay_order_id;
          order.razorpayPaymentId = razorpay_payment_id;
          order.razorpaySignature = razorpay_signature;
          order.paymentStatus = "paid";
          order.isPaid = true;
          order.paidAt = Date.now();
          await order.save();
          console.log("[VERIFY PAYMENT] Order updated to paid:", internal_order_id);
        }
      } catch (ordErr) {
        console.error("[VERIFY PAYMENT] Failed to update order:", ordErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("[RAZORPAY VERIFY ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
};
