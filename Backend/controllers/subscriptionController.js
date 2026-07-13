const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 999,
    durationDays: 30,
    features: ["Basic analytics", "Up to 50 products", "Email support"],
  },
  {
    id: "plus",
    name: "Plus",
    price: 1999,
    durationDays: 30,
    features: ["Advanced analytics", "Up to 200 products", "Priority email support", "Custom domain"],
  },
  {
    id: "premium",
    name: "Premium",
    price: 4999,
    durationDays: 30,
    features: ["All analytics", "Unlimited products", "24/7 priority support", "Custom domain", "API access"],
  },
];

const getRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
};

const getSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("billingSettings").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const bs = user.billingSettings || {};
    const now = new Date();
    const endDate = bs.subscriptionEndDate ? new Date(bs.subscriptionEndDate) : null;
    const isExpired = endDate && endDate < now;

    let status = bs.subscriptionStatus || "inactive";
    if (status === "active" && isExpired) {
      status = "expired";
    }

    res.json({
      success: true,
      data: {
        currentPlan: bs.currentPlan || "Free",
        premium: !!(bs.premium && status === "active" && !isExpired),
        subscriptionStatus: status,
        expiryDate: bs.subscriptionEndDate || null,
        startDate: bs.subscriptionStartDate || null,
        paymentId: bs.razorpayPaymentId || null,
        orderId: bs.razorpayOrderId || null,
      },
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        durationDays: p.durationDays,
        features: p.features,
      })),
    });
  } catch (error) {
    console.error("[Subscription] getSubscription error:", error?.message || error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const createSubscriptionOrder = async (req, res) => {
  try {
    const { planName } = req.body;
    if (!planName || typeof planName !== "string" || !planName.trim()) {
      return res.status(400).json({ success: false, message: "Invalid plan name" });
    }

    const normalizedName = planName.trim().toLowerCase();
    const plan = PLANS.find((p) => p.name.toLowerCase() === normalizedName);
    if (!plan) {
      return res.status(404).json({ success: false, message: `Plan "${planName}" not found` });
    }

    const credentials = getRazorpayCredentials();
    if (!credentials) {
      console.error("[Subscription] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing in environment");
      return res.status(503).json({
        success: false,
        message: "Razorpay is not configured on the server.",
      });
    }

    const amountPaise = Math.round(Number(plan.price));
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return res.status(500).json({ success: false, message: "Invalid plan price configuration" });
    }
    const amountInPaise = amountPaise * 100;

    const instance = new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });

    const userId = String(req.user._id);
    const shortUserId = userId.slice(-8);
    const receipt = `sub_${plan.id}_${shortUserId}_${Date.now()}`.slice(0, 40);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        userId,
        planId: plan.id,
        planName: plan.name,
        userEmail: req.user.email || "",
      },
    };

    console.log("[Subscription] Creating Razorpay order for plan:", plan.name, "amount (paise):", amountInPaise);
    const order = await instance.orders.create(options);
    console.log("[Subscription] Razorpay order created:", order.id);

    await User.findByIdAndUpdate(req.user._id, {
      "billingSettings.razorpayOrderId": order.id,
      "billingSettings.currentPlan": plan.name,
      "billingSettings.subscriptionStatus": "pending",
    });

    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: credentials.keyId,
      plan: plan.name,
    });
  } catch (error) {
    const errMsg = error?.error?.description || error?.message || error || "Unknown error";
    console.error("[Subscription] createSubscriptionOrder error:", errMsg);
    if (error?.statusCode) {
      console.error("[Subscription] Razorpay statusCode:", error.statusCode);
    }
    res.status(500).json({ success: false, message: "Unable to start payment. Please try again." });
  }
};

const verifySubscriptionPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature",
      });
    }

    const credentials = getRazorpayCredentials();
    if (!credentials) {
      console.error("[Subscription] RAZORPAY_KEY_SECRET is missing for verification");
      return res.status(503).json({
        success: false,
        message: "Razorpay is not configured on the server.",
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", credentials.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("[Subscription] Signature mismatch for order:", razorpay_order_id);
      return res.status(403).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const existingPaymentId = user.billingSettings?.razorpayPaymentId;
    if (existingPaymentId && existingPaymentId === razorpay_payment_id) {
      return res.status(409).json({
        success: true,
        message: "Payment already verified.",
        data: {
          currentPlan: user.billingSettings.currentPlan,
          premium: true,
          subscriptionStatus: "active",
          expiryDate: user.billingSettings.subscriptionEndDate,
          startDate: user.billingSettings.subscriptionStartDate,
        },
      });
    }

    const plan = PLANS.find(
      (p) => p.name.toLowerCase() === (user.billingSettings?.currentPlan || "").toLowerCase()
    );
    const durationDays = plan ? plan.durationDays : 30;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    user.billingSettings.premium = true;
    user.billingSettings.subscriptionStatus = "active";
    user.billingSettings.subscriptionStartDate = startDate;
    user.billingSettings.subscriptionEndDate = endDate;
    user.billingSettings.razorpayPaymentId = razorpay_payment_id;
    user.billingSettings.razorpayOrderId = razorpay_order_id;

    await user.save();

    console.log("[Subscription] Plan activated for user:", req.user._id, "plan:", user.billingSettings.currentPlan);

    res.json({
      success: true,
      message: "Your Premium plan has been activated.",
      data: {
        currentPlan: user.billingSettings.currentPlan,
        premium: true,
        subscriptionStatus: "active",
        expiryDate: endDate,
        startDate: startDate,
      },
    });
  } catch (error) {
    const errMsg = error?.message || error || "Unknown error";
    console.error("[Subscription] verifySubscriptionPayment error:", errMsg);
    res.status(500).json({ success: false, message: "Payment verification failed." });
  }
};

module.exports = { getSubscription, createSubscriptionOrder, verifySubscriptionPayment };
