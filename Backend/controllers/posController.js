const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const InventoryLedger = require("../models/InventoryLedger");
const { resolveClientId } = require("../utils/tenantResolver");

const isValidObjectId = (id) => {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!s || s === "null" || s === "undefined" || s === "all") return false;
  return mongoose.Types.ObjectId.isValid(s);
};

const couponRuleCache = new Map();
const COUPON_CACHE_TTL = 60 * 1000;

/**
 * Helper to validate coupon against MongoDB Coupon model or default rule (SAVE1000: min ₹3000 -> ₹500 off)
 */
async function resolveCouponRule(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;

  // 1. Instant check for built-in standard rules (< 1ms)
  if (
    normalized === "SAVE1000" ||
    normalized === "FLAT1000" ||
    normalized === "SAVE500" ||
    normalized === "FLAT500"
  ) {
    return {
      code: normalized,
      discountAmount: 500,
      minOrderSubtotal: 3000,
      description: "Flat ₹500 off on cart subtotal of ₹3,000 or more",
    };
  }

  // 2. Check in-memory cache
  const cached = couponRuleCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < COUPON_CACHE_TTL) {
    return cached.rule;
  }

  // 3. Try finding in MongoDB Coupon collection
  try {
    const dbCoupon = await Coupon.findOne({ code: normalized, isActive: true })
      .select("_id code discountAmount minOrderSubtotal description isActive")
      .lean();
    if (dbCoupon) {
      const rule = {
        code: dbCoupon.code,
        discountAmount: Number(dbCoupon.discountAmount) || 500,
        minOrderSubtotal: Number(dbCoupon.minOrderSubtotal) || 3000,
        description: dbCoupon.description || "Flat ₹500 off on cart subtotal of ₹3,000 or more",
      };
      couponRuleCache.set(normalized, { rule, timestamp: Date.now() });
      return rule;
    }
    couponRuleCache.set(normalized, { rule: null, timestamp: Date.now() });
  } catch (err) {
    console.warn("[posController] Coupon lookup warning:", err.message);
  }

  return null;
}

/**
 * @desc    Validate a coupon code against cart subtotal
 * @route   POST /api/pos/validate-coupon
 * @access  Public / POS Cashier
 */
const validateCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;
    const currentSubtotal = Number(subtotal) || 0;

    if (!couponCode || !String(couponCode).trim()) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Please enter a coupon code.",
      });
    }

    const coupon = await resolveCouponRule(couponCode);
    if (!coupon) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: `Invalid coupon code "${couponCode}". Try using "SAVE1000".`,
      });
    }

    // Check minimum subtotal rule (e.g. ₹3,000)
    if (currentSubtotal < coupon.minOrderSubtotal) {
      const amountNeeded = Math.max(0, coupon.minOrderSubtotal - currentSubtotal);
      return res.status(400).json({
        success: false,
        valid: false,
        couponCode: coupon.code,
        minSubtotal: coupon.minOrderSubtotal,
        discount: coupon.discountAmount,
        amountNeeded,
        message: `Add ₹${amountNeeded.toFixed(2)} more to avail ₹${coupon.discountAmount} OFF`,
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      couponCode: coupon.code,
      discount: coupon.discountAmount,
      minSubtotal: coupon.minOrderSubtotal,
      message: `Coupon "${coupon.code}" applied! ₹${coupon.discountAmount} discount applied.`,
    });
  } catch (error) {
    console.error("[validateCoupon] Error:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      message: error.message || "Failed to validate coupon",
    });
  }
};

/**
 * @desc    Process POS checkout with atomic stock deduction ($inc: { stock: -qty }) and coupon validation
 * @route   POST /api/pos/checkout
 * @access  Public / POS Cashier
 */
const checkoutPOS = async (req, res) => {
  const items = req.body.items || [];
  const paymentMethod = (req.body.paymentMethod || "CASH").toUpperCase();
  const defaultStatus = paymentMethod === "WHATSAPP" ? "PENDING" : "PAID";
  const paymentStatus = (req.body.paymentStatus || defaultStatus).toUpperCase();
  const rawCouponCode = req.body.couponCode ? String(req.body.couponCode).trim().toUpperCase() : "";
  const upiId = req.body.upiId ? String(req.body.upiId).trim() : (req.body.paymentDetails?.upiId ? String(req.body.paymentDetails.upiId).trim() : "");
  const whatsappPhone = req.body.whatsappPhone ? String(req.body.whatsappPhone).trim() : (req.body.paymentDetails?.whatsappPhone ? String(req.body.paymentDetails.whatsappPhone).trim() : "");
  const paymentLinkId = req.body.paymentLinkId || req.body.paymentDetails?.paymentLinkId || "";
  const paymentLinkUrl = req.body.paymentLinkUrl || req.body.paymentDetails?.paymentLinkUrl || "";

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cart is empty. Please add products to checkout.",
    });
  }

  // Generate unique invoice number: INV-YYMMDD-XXXX
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  const invoiceNumber = `INV-${yy}${mm}${dd}-${rand4}`;

  // Start MongoDB session if replica set is available; fallback to atomic commands if standalone
  let session = null;
  let useTransaction = true;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (sessErr) {
    useTransaction = false;
    session = null;
  }

  try {
    // 1. Validate items and verify live database stock
    const preparedItems = [];
    let calculatedSubtotal = 0;
    let calculatedTotalGst = 0;

    for (const item of items) {
      const pId = item.productId || item._id;
      const quantity = Number(item.quantity) || 1;

      if (quantity <= 0) {
        throw new Error(`Invalid quantity ${quantity} for product: ${item.name || pId}`);
      }

      let productDoc = null;
      if (isValidObjectId(pId)) {
        productDoc = session
          ? await Product.findById(pId).session(session)
          : await Product.findById(pId);
      } else {
        const query = {
          $or: [
            { barcode: item.barcode || pId },
            { sku: pId },
            { _id: isValidObjectId(pId) ? pId : new mongoose.Types.ObjectId() },
          ],
        };
        productDoc = session
          ? await Product.findOne(query).session(session)
          : await Product.findOne(query);
      }

      if (!productDoc) {
        throw new Error(`Product not found: ${item.name || pId}`);
      }

      // Robust stock resolution across all possible product stock fields:
      const rawStockLevel = Number(productDoc.stockLevel);
      const rawStock = Number(productDoc.stock);
      const rawQty = Number(productDoc.quantity);
      const rawCurrentStock = Number(productDoc.currentStock);

      let availableStock = 0;
      const positiveStockValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
        (v) => !isNaN(v) && v > 0
      );
      if (positiveStockValues.length > 0) {
        availableStock = Math.max(...positiveStockValues);
      } else {
        const nonNaNValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
          (v) => !isNaN(v)
        );
        availableStock = nonNaNValues.length > 0 ? Math.max(...nonNaNValues) : 0;
      }

      if (availableStock <= 0) {
        throw new Error(
          `Product "${productDoc.name}" is out of stock (Available: 0, In Cart: ${quantity}). Please remove it from the cart.`
        );
      }

      if (availableStock < quantity) {
        throw new Error(
          `Insufficient stock for "${productDoc.name}". Available: ${availableStock}, In Cart: ${quantity}`
        );
      }

      const unitPrice = Number(
        item.unitPrice !== undefined
          ? item.unitPrice
          : productDoc.unitPrice || productDoc.price
      ) || 0;

      const rawItemGst = item.gst !== undefined ? item.gst : item.gstRate;
      const rawDocGst = productDoc.gst !== undefined ? productDoc.gst : productDoc.gstRate;
      const gstRate = Number(rawItemGst !== undefined ? rawItemGst : rawDocGst) || 0;

      const lineSubtotal = unitPrice * quantity;
      const lineGst = (lineSubtotal * gstRate) / 100;
      const itemTotal = lineSubtotal + lineGst;

      calculatedSubtotal += lineSubtotal;
      calculatedTotalGst += lineGst;

      preparedItems.push({
        productDoc,
        productId: String(productDoc._id),
        barcode: productDoc.barcode || item.barcode || "",
        name: productDoc.name,
        unitPrice,
        price: unitPrice,
        quantity,
        gst: gstRate,
        gstRate,
        gstAmount: lineGst,
        tax: lineGst,
        itemTotal,
      });
    }

    // 2. Server-side Coupon Verification & Anti-tampering
    let discountAmount = 0;
    let appliedCouponCode = "";

    if (rawCouponCode) {
      const couponRule = await resolveCouponRule(rawCouponCode);
      if (!couponRule) {
        throw new Error(`Invalid or expired coupon code "${rawCouponCode}".`);
      }

      if (calculatedSubtotal < couponRule.minOrderSubtotal) {
        const shortfall = couponRule.minOrderSubtotal - calculatedSubtotal;
        throw new Error(
          `Coupon "${rawCouponCode}" requires minimum subtotal of ₹${couponRule.minOrderSubtotal}. Add ₹${shortfall.toFixed(2)} more to avail.`
        );
      }

      discountAmount = couponRule.discountAmount; // Flat ₹500
      appliedCouponCode = couponRule.code;
    }

    const subtotal = Number(calculatedSubtotal.toFixed(2));
    const totalGst = Number(calculatedTotalGst.toFixed(2));
    const grandTotal = Math.max(0, Number((subtotal - discountAmount + totalGst).toFixed(2)));

    // 3. Atomically deduct inventory stock in MongoDB using $inc: { stock: -quantity }
    const updatedProducts = [];
    for (const pItem of preparedItems) {
      const qtyToDeduct = Math.max(1, Math.floor(Number(pItem.quantity) || 1));

      const filter = {
        _id: pItem.productDoc._id,
        $or: [
          { stock: { $gte: qtyToDeduct } },
          { stockLevel: { $gte: qtyToDeduct } },
          { quantity: { $gte: qtyToDeduct } },
          { currentStock: { $gte: qtyToDeduct } },
        ],
      };

      const update = {
        $inc: {
          stock: -qtyToDeduct,
          stockLevel: -qtyToDeduct,
          quantity: -qtyToDeduct,
        },
      };

      const options = { new: true };
      if (session) options.session = session;

      const updated = await Product.findOneAndUpdate(filter, update, options);
      if (!updated) {
        throw new Error(
          `Stock deduction failed for "${pItem.name}". Insufficient stock during concurrent checkout.`
        );
      }

      // Safeguard against negative field values if fields were out of sync
      const clampUpdates = {};
      if (typeof updated.stock === "number" && updated.stock < 0) clampUpdates.stock = 0;
      if (typeof updated.stockLevel === "number" && updated.stockLevel < 0) clampUpdates.stockLevel = 0;
      if (typeof updated.quantity === "number" && updated.quantity < 0) clampUpdates.quantity = 0;
      if (Object.keys(clampUpdates).length > 0) {
        await Product.updateOne({ _id: updated._id }, { $set: clampUpdates });
      }

      const remainingStock = Math.max(
        0,
        Number(updated.stockLevel !== undefined && updated.stockLevel >= 0 ? updated.stockLevel : updated.stock) || 0
      );

      updatedProducts.push({
        pItem,
        remainingStock,
      });
    }

    // 4. Create and persist Order in MongoDB
    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    const orderPayload = {
      orderId: invoiceNumber,
      invoiceNumber,
      customerName: req.body.customerName || "Walk-in Customer",
      customerEmail: req.body.customerEmail || "",
      items: preparedItems.map((item) => ({
        productId: item.productId,
        barcode: item.barcode,
        name: item.name,
        unitPrice: item.unitPrice,
        price: item.unitPrice,
        quantity: item.quantity,
        gst: item.gstRate,
        gstRate: item.gstRate,
        gstAmount: item.gstAmount,
        tax: item.gstAmount,
        itemTotal: item.itemTotal,
      })),
      subtotal,
      couponCode: appliedCouponCode,
      discountAmount,
      totalGst,
      grandTotal,
      totalPrice: grandTotal,
      taxPrice: totalGst,
      paymentMethod,
      paymentStatus,
      isPaid: paymentStatus === "PAID",
      paidAt: paymentStatus === "PAID" ? new Date() : null,
      upiId: upiId || undefined,
      whatsappPhone: whatsappPhone || undefined,
      paymentLinkId: paymentLinkId || undefined,
      paymentLinkUrl: paymentLinkUrl || undefined,
      paymentDetails: {
        ...(req.body.paymentDetails || {}),
        ...(upiId ? { upiId } : {}),
        ...(whatsappPhone ? { whatsappPhone } : {}),
        ...(paymentLinkId ? { paymentLinkId } : {}),
        ...(paymentLinkUrl ? { paymentLinkUrl } : {}),
      },
      customerPhone: whatsappPhone || req.body.customerPhone || undefined,
      shippingAddress: {
        fullName: req.body.customerName || "Walk-in Customer",
        phone: whatsappPhone || req.body.customerPhone || "",
        email: req.body.customerEmail || "",
      },
      orderSource: "pos",
      orderStatus: paymentStatus === "PAID" ? "delivered" : "placed",
      trackingStatus: paymentStatus === "PAID" ? "Delivered" : "Awaiting Payment",
      clientId: req.body.clientId || resolvedClientId || null,
      user: req.user?._id || null,
      razorpayOrderId: req.body.razorpayOrderId || req.body.razorpay_order_id || null,
      razorpayPaymentId: req.body.razorpayPaymentId || req.body.razorpay_payment_id || null,
      razorpaySignature: req.body.razorpaySignature || req.body.razorpay_signature || null,
    };

    let order = null;
    if (session) {
      const created = await Order.create([orderPayload], { session });
      order = created[0];
    } else {
      order = await Order.create(orderPayload);
    }

    // 5. Create InventoryLedger entries if ledger collection exists
    try {
      const ledgerEntries = updatedProducts.map(({ pItem, remainingStock }) => ({
        productId: pItem.productDoc._id,
        barcode: pItem.barcode || "N/A",
        type: "SALE",
        quantityChanged: -pItem.quantity,
        remainingStock,
        referenceOrderId: order._id,
      }));

      if (session) {
        await InventoryLedger.insertMany(ledgerEntries, { session });
      } else {
        await InventoryLedger.insertMany(ledgerEntries);
      }
    } catch (ledgerErr) {
      console.warn("[posController] Ledger entry warning:", ledgerErr.message);
    }

    if (session && useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    const populatedInvoice = await Order.findById(order._id).populate({
      path: "clientId",
      select: "companyName shopName email storeName address phone",
    });

    return res.status(201).json({
      success: true,
      message: "Order processed and invoice generated successfully",
      invoiceNumber,
      invoice: populatedInvoice || order,
      order: populatedInvoice || order,
    });
  } catch (error) {
    if (session && useTransaction) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortErr) {}
    }
    console.error("[checkoutPOS] Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process checkout",
    });
  }
};

/**
 * @desc    Generate Razorpay Payment Link for POS and construct direct WhatsApp wa.me / API share link
 * @route   POST /api/pos/whatsapp-payment-link
 * @access  Public / POS Cashier
 */
const createWhatsAppPaymentLink = async (req, res) => {
  const items = req.body.items || [];
  const rawPhone = String(req.body.whatsappPhone || req.body.phone || req.body.contact || "").trim();
  const customerName = req.body.customerName ? String(req.body.customerName).trim() : "Walk-in Customer";
  const customerEmail = req.body.customerEmail ? String(req.body.customerEmail).trim() : "";
  const rawCouponCode = req.body.couponCode ? String(req.body.couponCode).trim().toUpperCase() : "";

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Cart is empty. Please add items to checkout.",
    });
  }

  // Validate phone number
  const digitsOnly = rawPhone.replace(/\D/g, "");
  if (!digitsOnly || digitsOnly.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid 10-digit customer mobile number for WhatsApp payment.",
    });
  }

  // Clean phone for wa.me link: format with country code 91
  const cleanPhone = digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;
  const contact10Digit = digitsOnly.slice(-10);

  // Generate unique invoice number: INV-YYMMDD-XXXX
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  const invoiceNumber = `INV-${yy}${mm}${dd}-${rand4}`;

  let session = null;
  let useTransaction = true;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (sessErr) {
    useTransaction = false;
    session = null;
  }

  try {
    // 1. Validate items and verify live database stock
    const preparedItems = [];
    let calculatedSubtotal = 0;
    let calculatedTotalGst = 0;

    for (const item of items) {
      const pId = item.productId || item._id;
      const quantity = Number(item.quantity) || 1;

      if (quantity <= 0) {
        throw new Error(`Invalid quantity ${quantity} for product: ${item.name || pId}`);
      }

      let productDoc = null;
      if (isValidObjectId(pId)) {
        productDoc = session
          ? await Product.findById(pId).session(session)
          : await Product.findById(pId);
      } else {
        const query = {
          $or: [
            { barcode: item.barcode || pId },
            { sku: pId },
            { _id: isValidObjectId(pId) ? pId : new mongoose.Types.ObjectId() },
          ],
        };
        productDoc = session
          ? await Product.findOne(query).session(session)
          : await Product.findOne(query);
      }

      if (!productDoc) {
        throw new Error(`Product not found: ${item.name || pId}`);
      }

      const rawStockLevel = Number(productDoc.stockLevel);
      const rawStock = Number(productDoc.stock);
      const rawQty = Number(productDoc.quantity);
      const rawCurrentStock = Number(productDoc.currentStock);

      let availableStock = 0;
      const positiveStockValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
        (v) => !isNaN(v) && v > 0
      );
      if (positiveStockValues.length > 0) {
        availableStock = Math.max(...positiveStockValues);
      } else {
        const nonNaNValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
          (v) => !isNaN(v)
        );
        availableStock = nonNaNValues.length > 0 ? Math.max(...nonNaNValues) : 0;
      }

      if (availableStock <= 0) {
        throw new Error(
          `Product "${productDoc.name}" is out of stock (Available: 0, In Cart: ${quantity}).`
        );
      }

      if (availableStock < quantity) {
        throw new Error(
          `Insufficient stock for "${productDoc.name}". Available: ${availableStock}, In Cart: ${quantity}`
        );
      }

      const unitPrice = Number(
        item.unitPrice !== undefined
          ? item.unitPrice
          : productDoc.unitPrice || productDoc.price
      ) || 0;

      const gstRate = Number(
        item.gstRate !== undefined ? item.gstRate : productDoc.gstRate
      ) || 0;

      const lineSubtotal = unitPrice * quantity;
      const lineGst = (lineSubtotal * gstRate) / 100;
      const itemTotal = lineSubtotal + lineGst;

      calculatedSubtotal += lineSubtotal;
      calculatedTotalGst += lineGst;

      preparedItems.push({
        productDoc,
        productId: String(productDoc._id),
        barcode: productDoc.barcode || item.barcode || "",
        name: productDoc.name,
        unitPrice,
        price: unitPrice,
        quantity,
        gstRate,
        gstAmount: lineGst,
        itemTotal,
      });
    }

    // 2. Server-side Coupon Verification
    let discountAmount = 0;
    let appliedCouponCode = "";
    let couponRule = null;

    if (rawCouponCode) {
      couponRule = await resolveCouponRule(rawCouponCode);
      if (!couponRule) {
        throw new Error(`Invalid or expired coupon code "${rawCouponCode}".`);
      }
      if (calculatedSubtotal < couponRule.minOrderSubtotal) {
        const shortfall = couponRule.minOrderSubtotal - calculatedSubtotal;
        throw new Error(
          `Coupon "${rawCouponCode}" requires minimum subtotal of ₹${couponRule.minOrderSubtotal}. Add ₹${shortfall.toFixed(2)} more to avail.`
        );
      }
      discountAmount = couponRule.discountAmount;
      appliedCouponCode = couponRule.code;
    }

    const subtotal = Number(calculatedSubtotal.toFixed(2));
    const totalGst = Number(calculatedTotalGst.toFixed(2));
    const grandTotal = Math.max(0, Number((subtotal - discountAmount + totalGst).toFixed(2)));

    // 3. Resolve Razorpay credentials & generate Razorpay Payment Link
    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    let razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    let razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (resolvedClientId) {
      try {
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
          }
        }
      } catch (clientRzpErr) {
        console.warn("[createWhatsAppPaymentLink] Tenant rzp config lookup error:", clientRzpErr.message);
      }
    }

    const amountInPaise = Math.round(grandTotal * 100);
    let paymentLinkId = `plink_${invoiceNumber.replace(/[^a-zA-Z0-9]/g, "")}`;
    let paymentLinkUrl = `https://rzp.io/i/${paymentLinkId}`;
    let rzpPaymentLinkObj = null;

    if (razorpayKeyId && razorpayKeySecret) {
      try {
        const Razorpay = require("razorpay");
        const instance = new Razorpay({
          key_id: razorpayKeyId,
          key_secret: razorpayKeySecret,
        });

        rzpPaymentLinkObj = await instance.paymentLink.create({
          amount: amountInPaise,
          currency: "INR",
          accept_partial: false,
          description: `POS Bill #${invoiceNumber} for ${customerName}`,
          customer: {
            name: customerName,
            contact: contact10Digit,
            email: customerEmail || undefined,
          },
          notify: {
            sms: true,
            whatsapp: true,
            email: Boolean(customerEmail),
          },
          reminder_enable: true,
          notes: {
            invoiceNumber,
            customerPhone: cleanPhone,
            source: "retailverse_pos_whatsapp",
          },
        });

        if (rzpPaymentLinkObj && rzpPaymentLinkObj.short_url) {
          paymentLinkId = rzpPaymentLinkObj.id;
          paymentLinkUrl = rzpPaymentLinkObj.short_url;
        }
      } catch (rzpLinkErr) {
        console.warn("[createWhatsAppPaymentLink] Razorpay API link warning:", rzpLinkErr.message);
        // Clean fallback payment link
      }
    }

    // Construct WhatsApp message & direct URL
    const originalBillAmount = (subtotal + totalGst).toFixed(2);
    const finalAmountStr = grandTotal.toFixed(2);

    let messageText = "";
    if (discountAmount > 0 && appliedCouponCode) {
      const minThreshold = couponRule?.minOrderSubtotal || 3000;
      messageText = `Hello! Your bill amount is ₹${originalBillAmount}. Coupon ${appliedCouponCode} applied (-₹${discountAmount.toFixed(0)} on shopping above ₹${minThreshold}). Total Payable: ₹${finalAmountStr}. Please complete your payment here: ${paymentLinkUrl}`;
    } else {
      messageText = `Hello! Your bill amount is ₹${originalBillAmount}. Total Payable: ₹${finalAmountStr}. Please complete your payment here: ${paymentLinkUrl}`;
    }
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    // 4. Atomically deduct inventory stock in MongoDB using $inc: { stock: -quantity }
    const updatedProducts = [];
    for (const pItem of preparedItems) {
      const qtyToDeduct = Math.max(1, Math.floor(Number(pItem.quantity) || 1));

      const filter = {
        _id: pItem.productDoc._id,
        $or: [
          { stock: { $gte: qtyToDeduct } },
          { stockLevel: { $gte: qtyToDeduct } },
          { quantity: { $gte: qtyToDeduct } },
          { currentStock: { $gte: qtyToDeduct } },
        ],
      };

      const update = {
        $inc: {
          stock: -qtyToDeduct,
          stockLevel: -qtyToDeduct,
          quantity: -qtyToDeduct,
        },
      };

      const options = { new: true };
      if (session) options.session = session;

      const updated = await Product.findOneAndUpdate(filter, update, options);
      if (!updated) {
        throw new Error(
          `Stock deduction failed for "${pItem.name}". Insufficient stock during concurrent checkout.`
        );
      }

      const remainingStock = Math.max(
        0,
        Number(updated.stockLevel !== undefined && updated.stockLevel >= 0 ? updated.stockLevel : updated.stock) || 0
      );

      updatedProducts.push({
        pItem,
        remainingStock,
      });
    }

    // 5. Create and persist Order in MongoDB
    const orderPayload = {
      orderId: invoiceNumber,
      invoiceNumber,
      customerName,
      customerEmail,
      customerPhone: cleanPhone,
      whatsappPhone: cleanPhone,
      shippingAddress: {
        fullName: customerName,
        phone: cleanPhone,
        email: customerEmail || "",
      },
      items: preparedItems.map((item) => ({
        productId: item.productId,
        barcode: item.barcode,
        name: item.name,
        unitPrice: item.unitPrice,
        price: item.unitPrice,
        quantity: item.quantity,
        gstRate: item.gstRate,
        gstAmount: item.gstAmount,
        itemTotal: item.itemTotal,
      })),
      subtotal,
      couponCode: appliedCouponCode,
      discountAmount,
      totalGst,
      grandTotal,
      totalPrice: grandTotal,
      taxPrice: totalGst,
      paymentMethod: "WHATSAPP",
      paymentStatus: "PENDING",
      isPaid: false,
      paidAt: null,
      paymentLinkId,
      paymentLinkUrl,
      paymentDetails: {
        whatsappPhone: cleanPhone,
        paymentLinkId,
        paymentLinkUrl,
        paymentLinkStatus: rzpPaymentLinkObj?.status || "created",
      },
      orderSource: "pos",
      orderStatus: "placed",
      trackingStatus: "Payment Link Sent",
      clientId: req.body.clientId || resolvedClientId || null,
      user: req.user?._id || null,
    };

    let order = null;
    if (session) {
      const created = await Order.create([orderPayload], { session });
      order = created[0];
    } else {
      order = await Order.create(orderPayload);
    }

    // 6. Create InventoryLedger entries
    try {
      const ledgerEntries = updatedProducts.map(({ pItem, remainingStock }) => ({
        productId: pItem.productDoc._id,
        barcode: pItem.barcode || "N/A",
        type: "SALE",
        quantityChanged: -pItem.quantity,
        remainingStock,
        referenceOrderId: order._id,
      }));

      if (session) {
        await InventoryLedger.insertMany(ledgerEntries, { session });
      } else {
        await InventoryLedger.insertMany(ledgerEntries);
      }
    } catch (ledgerErr) {
      console.warn("[createWhatsAppPaymentLink] Ledger warning:", ledgerErr.message);
    }

    if (session && useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    const populatedInvoice = await Order.findById(order._id).populate({
      path: "clientId",
      select: "companyName shopName email storeName address phone",
    });

    return res.status(201).json({
      success: true,
      message: "Razorpay payment link generated and WhatsApp details prepared successfully",
      invoiceNumber,
      paymentLinkId,
      paymentLinkUrl,
      whatsappUrl,
      whatsappPhone: cleanPhone,
      grandTotal,
      order: populatedInvoice || order,
      invoice: populatedInvoice || order,
    });
  } catch (error) {
    if (session && useTransaction) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortErr) {}
    }
    console.error("[createWhatsAppPaymentLink] Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to generate WhatsApp payment link",
    });
  }
};

/**
 * @desc    Check Razorpay Payment Link status and update Order in MongoDB if paid
 * @route   POST /api/pos/check-payment-status
 * @access  Public / POS Cashier
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId, invoiceNumber, paymentLinkId, confirmPayment, cancelPayment } = req.body;
    const query = {};
    if (orderId) {
      query.$or = [{ orderId }, { invoiceNumber: orderId }];
      if (isValidObjectId(orderId)) query.$or.push({ _id: orderId });
    } else if (invoiceNumber) {
      query.invoiceNumber = invoiceNumber;
    } else if (paymentLinkId) {
      query.paymentLinkId = paymentLinkId;
    }

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // ── Handle Cashier Cancellation of Pending WhatsApp Payment ──────────────
    if (cancelPayment) {
      if (!order.isPaid && order.paymentStatus !== "PAID") {
        order.paymentStatus = "CANCELLED";
        order.orderStatus = "cancelled";
        order.trackingStatus = "Cancelled";
        await order.save();

        // Restore stock atomically in MongoDB
        if (Array.isArray(order.items)) {
          for (const item of order.items) {
            const pId = item.productId || item._id;
            const qty = Number(item.quantity) || 1;
            if (pId) {
              await Product.updateOne(
                { _id: pId },
                { $inc: { stock: qty, stockLevel: qty, quantity: qty } }
              );
            }
          }
        }
      }
      return res.status(200).json({
        success: true,
        isCancelled: true,
        paymentStatus: order.paymentStatus,
        message: "Payment link cancelled and product stock restored.",
        order,
      });
    }

    // ── Handle Manual Cashier Confirmation (e.g. customer shows payment success screen)
    if (confirmPayment) {
      order.paymentStatus = "PAID";
      order.isPaid = true;
      order.paidAt = new Date();
      order.orderStatus = "delivered";
      order.trackingStatus = "Delivered";
      await order.save();
      return res.status(200).json({
        success: true,
        isPaid: true,
        paymentStatus: "PAID",
        order,
      });
    }

    if (order.isPaid || order.paymentStatus === "PAID") {
      return res.status(200).json({ success: true, isPaid: true, paymentStatus: "PAID", order });
    }

    const pLinkId = order.paymentLinkId || paymentLinkId;
    let isPaidNow = false;

    // Resolve Razorpay credentials (tenant specific or global)
    let razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    let razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (order.clientId) {
      try {
        const ClientRazorpayConfig = require("../models/ClientRazorpayConfig");
        const clientConfig = await ClientRazorpayConfig.findOne({
          clientId: order.clientId,
          razorpayEnabled: true,
        });
        if (clientConfig && clientConfig.razorpayKeyId && clientConfig.razorpayKeySecretEncrypted) {
          const { decrypt } = require("../utils/encryption");
          const decryptedSecret = decrypt(clientConfig.razorpayKeySecretEncrypted);
          if (decryptedSecret) {
            razorpayKeyId = clientConfig.razorpayKeyId;
            razorpayKeySecret = decryptedSecret;
          }
        }
      } catch (clientRzpErr) {
        console.warn("[checkPaymentStatus] Tenant config lookup error:", clientRzpErr.message);
      }
    }

    if (pLinkId && razorpayKeyId && razorpayKeySecret) {
      try {
        const Razorpay = require("razorpay");
        const instance = new Razorpay({
          key_id: razorpayKeyId,
          key_secret: razorpayKeySecret,
        });
        const rzpLink = await instance.paymentLink.fetch(pLinkId);
        if (rzpLink && (rzpLink.status === "paid" || (rzpLink.amount_paid && rzpLink.amount_paid > 0))) {
          isPaidNow = true;
          order.paymentStatus = "PAID";
          order.isPaid = true;
          order.paidAt = new Date();
          order.orderStatus = "delivered";
          order.trackingStatus = "Delivered";
          if (rzpLink.payments && rzpLink.payments.length > 0) {
            order.razorpayPaymentId = rzpLink.payments[0].payment_id;
          }
          await order.save();
        }
      } catch (rzpFetchErr) {
        console.warn("[checkPaymentStatus] Razorpay fetch warning:", rzpFetchErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      isPaid: order.isPaid || isPaidNow,
      paymentStatus: order.paymentStatus,
      order,
    });
  } catch (error) {
    console.error("[checkPaymentStatus] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Hold / Park an active POS order in MongoDB
 * @route   POST /api/pos/orders/hold
 * @access  Public / POS Cashier
 */
const holdOrder = async (req, res) => {
  try {
    const {
      reference,
      items = [],
      totalAmount,
      grandTotal,
      subtotal,
      discountAmount,
      couponCode,
      customerName,
      customerPhone,
      customerEmail,
      offlineOrderId,
      localId,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot hold an empty cart.",
      });
    }

    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rand4 = Math.floor(1000 + Math.random() * 9000);
    const generatedHoldId = `HOLD-${yy}${mm}${dd}-${rand4}`;

    const effectiveId = offlineOrderId || localId || req.body.orderId || generatedHoldId;
    const finalTotal = Number(totalAmount !== undefined ? totalAmount : (grandTotal || 0)) || 0;

    // Check if order already exists in MongoDB
    let existingOrder = null;
    if (req.body._id && isValidObjectId(req.body._id)) {
      existingOrder = await Order.findById(req.body._id);
    } else if (effectiveId) {
      existingOrder = await Order.findOne({
        $or: [
          { offlineOrderId: effectiveId },
          { orderId: effectiveId },
          { invoiceNumber: effectiveId },
        ],
      });
    }

    const preparedItems = items.map((it) => {
      const pId = it.productId || it._id || it.id || "GENERIC";
      const uPrice = Number(it.unitPrice !== undefined ? it.unitPrice : it.price) || 0;
      const qty = Number(it.quantity) || 1;
      const taxRate = Number(it.gstRate || it.taxRate) || 0;
      const taxAmt = Number(
        it.tax !== undefined
          ? it.tax
          : it.gstAmount !== undefined
          ? it.gstAmount
          : (uPrice * qty * taxRate) / 100
      ) || 0;

      return {
        productId: String(pId),
        barcode: it.barcode || "",
        name: it.name || "Item",
        price: uPrice,
        unitPrice: uPrice,
        quantity: qty,
        tax: taxAmt,
        gstRate: taxRate,
        gstAmount: taxAmt,
        itemTotal: uPrice * qty + taxAmt,
        image: it.imageUrl || it.image || "",
        category: it.category || "",
      };
    });

    const calculatedSubtotal = Number(
      subtotal !== undefined
        ? subtotal
        : preparedItems.reduce((acc, it) => acc + it.price * it.quantity, 0)
    ) || 0;

    const payload = {
      orderId: existingOrder ? existingOrder.orderId : effectiveId,
      invoiceNumber: existingOrder ? existingOrder.invoiceNumber : effectiveId,
      offlineOrderId: effectiveId,
      reference: reference || `HOLD-#${String(Date.now()).slice(-4)}`,
      customerName: customerName || "Walk-in Customer",
      customerPhone: customerPhone || "",
      customerEmail: customerEmail || "",
      items: preparedItems,
      subtotal: calculatedSubtotal,
      discountAmount: Number(discountAmount) || 0,
      couponCode: couponCode || "",
      totalAmount: finalTotal,
      grandTotal: finalTotal,
      totalPrice: finalTotal,
      taxPrice: preparedItems.reduce((acc, it) => acc + (it.tax || 0), 0),
      totalGst: preparedItems.reduce((acc, it) => acc + (it.gstAmount || 0), 0),
      paymentMethod: "HOLD",
      paymentStatus: "HELD",
      status: "HELD",
      orderStatus: "held",
      trackingStatus: "Order Parked / Held",
      isSynced: true,
      orderSource: "pos",
      clientId: req.body.clientId || resolvedClientId || null,
      user: req.user?._id || null,
      isDeleted: false,
    };

    let savedOrder;
    if (existingOrder) {
      Object.assign(existingOrder, payload);
      savedOrder = await existingOrder.save();
    } else {
      savedOrder = await Order.create(payload);
    }

    return res.status(200).json({
      success: true,
      message: "Order successfully held / parked",
      order: savedOrder,
    });
  } catch (error) {
    console.error("[holdOrder] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to hold order",
    });
  }
};

/**
 * @desc    Fetch all currently held orders
 * @route   GET /api/pos/orders/held
 * @access  Public / POS Cashier
 */
const getHeldOrders = async (req, res) => {
  try {
    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    const filter = {
      $and: [
        {
          $or: [
            { status: "HELD" },
            { orderStatus: "held" },
            { paymentStatus: "HELD" },
          ],
        },
        { isDeleted: { $ne: true } },
      ],
    };

    if (resolvedClientId) {
      filter.$and.push({
        $or: [{ clientId: resolvedClientId }, { clientId: null }],
      });
    }

    const orders = await Order.find(filter)
      .select("_id orderId invoiceNumber offlineOrderId reference customerName customerPhone items subtotal discountAmount totalAmount grandTotal paymentMethod paymentStatus status orderStatus createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("[getHeldOrders] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch held orders",
    });
  }
};

/**
 * @desc    Resume or archive/delete a held order
 * @route   PATCH /api/pos/orders/held/:id/resume or DELETE /api/pos/orders/held/:id
 * @access  Public / POS Cashier
 */
const resumeHeldOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const query = {};
    if (isValidObjectId(id)) {
      query.$or = [{ _id: id }, { orderId: id }, { offlineOrderId: id }];
    } else {
      query.$or = [{ orderId: id }, { invoiceNumber: id }, { offlineOrderId: id }];
    }

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Held order not found",
      });
    }

    // Archive / free held status so it is no longer listed in active held orders
    order.status = "CANCELLED";
    order.orderStatus = "cancelled";
    order.trackingStatus = "Held Order Recalled / Archived";
    order.isDeleted = true;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Held order recalled successfully",
      order,
    });
  } catch (error) {
    console.error("[resumeHeldOrder] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to resume held order",
    });
  }
};

/**
 * @desc    Batch sync locally saved offline orders (held carts & offline cash checkouts)
 * @route   POST /api/pos/orders/sync
 * @access  Public / POS Cashier
 */
const syncOfflineOrders = async (req, res) => {
  try {
    const ordersList = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.orders)
      ? req.body.orders
      : [];

    if (ordersList.length === 0) {
      return res.status(200).json({
        success: true,
        syncedCount: 0,
        message: "No orders to sync",
        results: [],
      });
    }

    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    const results = [];

    for (const rawOrder of ordersList) {
      try {
        const offlineId =
          rawOrder.offlineOrderId || rawOrder.localId || rawOrder.orderId || rawOrder.id;
        const isHeld =
          (rawOrder.status || "").toUpperCase() === "HELD" ||
          (rawOrder.orderStatus || "").toLowerCase() === "held";

        // Check if order already exists in MongoDB
        let existing = null;
        if (offlineId) {
          existing = await Order.findOne({
            $or: [
              { offlineOrderId: offlineId },
              { orderId: offlineId },
              { invoiceNumber: offlineId },
            ],
          });
        }

        if (isHeld) {
          // Sync held order
          const preparedItems = (rawOrder.items || []).map((it) => ({
            productId: String(it.productId || it._id || "GENERIC"),
            barcode: it.barcode || "",
            name: it.name || "Item",
            price: Number(it.unitPrice || it.price) || 0,
            unitPrice: Number(it.unitPrice || it.price) || 0,
            quantity: Number(it.quantity) || 1,
            tax: Number(it.tax || it.gstAmount) || 0,
            gstRate: Number(it.gstRate) || 0,
            gstAmount: Number(it.gstAmount || it.tax) || 0,
            itemTotal: (Number(it.unitPrice || it.price) || 0) * (Number(it.quantity) || 1),
          }));

          const totalAmt = Number(rawOrder.totalAmount || rawOrder.grandTotal || 0);

          if (existing) {
            existing.items = preparedItems;
            existing.totalAmount = totalAmt;
            existing.grandTotal = totalAmt;
            existing.totalPrice = totalAmt;
            existing.reference = rawOrder.reference || existing.reference;
            existing.status = rawOrder.isDeleted ? "CANCELLED" : "HELD";
            existing.orderStatus = rawOrder.isDeleted ? "cancelled" : "held";
            existing.isDeleted = Boolean(rawOrder.isDeleted);
            existing.isSynced = true;
            await existing.save();
            results.push({ offlineId, status: "UPDATED", orderId: existing.orderId });
          } else if (!rawOrder.isDeleted) {
            const created = await Order.create({
              orderId: offlineId || `HOLD-${Date.now()}`,
              invoiceNumber: offlineId || `HOLD-${Date.now()}`,
              offlineOrderId: offlineId,
              reference: rawOrder.reference || `HOLD-#${String(Date.now()).slice(-4)}`,
              customerName: rawOrder.customerName || "Walk-in Customer",
              customerPhone: rawOrder.customerPhone || "",
              customerEmail: rawOrder.customerEmail || "",
              items: preparedItems,
              subtotal: Number(rawOrder.subtotal) || 0,
              discountAmount: Number(rawOrder.discountAmount) || 0,
              couponCode: rawOrder.couponCode || "",
              totalAmount: totalAmt,
              grandTotal: totalAmt,
              totalPrice: totalAmt,
              paymentMethod: "HOLD",
              paymentStatus: "HELD",
              status: "HELD",
              orderStatus: "held",
              trackingStatus: "Order Parked / Held",
              isSynced: true,
              orderSource: "pos",
              clientId: rawOrder.clientId || resolvedClientId || null,
            });
            results.push({ offlineId, status: "CREATED", orderId: created.orderId });
          }
        } else {
          // Completed offline order (e.g. Offline Cash checkout)
          if (existing) {
            results.push({ offlineId, status: "ALREADY_EXISTS", orderId: existing.orderId });
            continue;
          }

          const preparedItems = [];
          for (const item of rawOrder.items || []) {
            const pId = item.productId || item._id;
            const qty = Number(item.quantity) || 1;
            const uPrice = Number(item.unitPrice || item.price) || 0;
            const gstRate = Number(item.gstRate) || 0;
            const gstAmount =
              Number(item.gstAmount || item.tax || (uPrice * qty * gstRate) / 100) || 0;

            // Attempt stock deduction atomically
            if (isValidObjectId(pId)) {
              await Product.updateOne(
                { _id: pId },
                { $inc: { stock: -qty, stockLevel: -qty, quantity: -qty } }
              ).catch((e) =>
                console.warn("[syncOfflineOrders] Stock decrement err:", e.message)
              );
            }

            preparedItems.push({
              productId: String(pId),
              barcode: item.barcode || "",
              name: item.name,
              unitPrice: uPrice,
              price: uPrice,
              quantity: qty,
              tax: gstAmount,
              gstRate,
              gstAmount,
              itemTotal: uPrice * qty + gstAmount,
            });
          }

          const totalAmt = Number(
            rawOrder.totalAmount || rawOrder.grandTotal || rawOrder.totalPrice || 0
          );

          const createdOrder = await Order.create({
            orderId:
              rawOrder.orderId ||
              rawOrder.invoiceNumber ||
              offlineId ||
              `INV-OFFLINE-${Date.now()}`,
            invoiceNumber:
              rawOrder.invoiceNumber ||
              rawOrder.orderId ||
              offlineId ||
              `INV-OFFLINE-${Date.now()}`,
            offlineOrderId: offlineId,
            customerName: rawOrder.customerName || "Walk-in Customer",
            customerEmail: rawOrder.customerEmail || "",
            customerPhone: rawOrder.customerPhone || "",
            items: preparedItems,
            subtotal: Number(rawOrder.subtotal) || 0,
            couponCode: rawOrder.couponCode || "",
            discountAmount: Number(rawOrder.discountAmount) || 0,
            totalGst: Number(rawOrder.totalGst || rawOrder.taxPrice) || 0,
            grandTotal: totalAmt,
            totalPrice: totalAmt,
            totalAmount: totalAmt,
            taxPrice: Number(rawOrder.totalGst || rawOrder.taxPrice) || 0,
            paymentMethod: rawOrder.paymentMethod || "CASH",
            paymentStatus: "PAID",
            status: "COMPLETED",
            isPaid: true,
            paidAt: rawOrder.paidAt || rawOrder.createdAt || new Date(),
            orderSource: "pos",
            orderStatus: "delivered",
            trackingStatus: "Delivered",
            isSynced: true,
            clientId: rawOrder.clientId || resolvedClientId || null,
          });

          results.push({ offlineId, status: "SYNCED", orderId: createdOrder.orderId });
        }
      } catch (itemErr) {
        console.error("[syncOfflineOrders] Item sync error:", itemErr);
        results.push({
          offlineId: rawOrder.offlineOrderId || rawOrder.localId,
          error: itemErr.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Batch sync completed. ${results.filter((r) => !r.error).length} processed.`,
      syncedCount: results.filter((r) => !r.error).length,
      results,
    });
  } catch (error) {
    console.error("[syncOfflineOrders] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to batch sync offline orders",
    });
  }
};

module.exports = {
  validateCoupon,
  checkoutPOS,
  createWhatsAppPaymentLink,
  checkPaymentStatus,
  holdOrder,
  getHeldOrders,
  resumeHeldOrder,
  syncOfflineOrders,
};
