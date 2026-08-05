const mongoose = require("mongoose");

const trackingHistoryEntrySchema = new mongoose.Schema(
  {
    stage: { type: Number, min: 1, max: 6 },
    label: { type: String },
    message: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Snapshot of line items at full-order cancellation (subtotal = price × quantity). */
const cancelledItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    cancellationReason: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    /** Snapshot for admin analytics / email match when user link was missing (guest checkout). */
    customerName: {
      type: String,
      trim: true,
      required: false,
    },
    /** Stored lowercase for reliable matching to User.email in admin aggregations. */
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      required: false,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: false,
      default: null,
    },
    items: [
      {
        productId: {
          type: String, // String to handle both ObjectId and static IDs
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        image: { type: String, required: false },
        category: { type: String, required: false },
        gstRate: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 },
      },
    ],
    /** Set to "pos" for in-store sales; "ai_voice" for voice orders; website checkout omits (legacy orders have no value). */
    orderSource: {
      type: String,
      required: false,
    },
    /** Links this order back to the VoiceOrder that created it. Null for non-voice orders. */
    voiceOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VoiceOrder",
      required: false,
      default: null,
    },
    /** Client-generated id for offline POS sync; unique when present (sparse index). */
    offlineOrderId: {
      type: String,
      required: false,
      sparse: true,
      unique: true,
    },
    // Subfields optional at schema level; createOrder enforces completeness for non-POS requests.
    shippingAddress: {
      fullName: { type: String, required: false },
      /** Optional; POS may store account email here for admin customer linking when body.customerEmail is empty. */
      email: { type: String, required: false, trim: true, lowercase: true },
      phone: { type: String, required: false },
      address: { type: String, required: false },
      city: { type: String, required: false },
      state: { type: String, required: false },
      zipCode: { type: String, required: false },
      country: { type: String, required: false },
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentDetails: {
      cardName: { type: String },
      cardLast4: { type: String },
      expiryDate: { type: String },
      upiId: { type: String },
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      default: 0.0,
    },
    cgstAmount: {
      type: Number,
      default: 0.0,
    },
    sgstAmount: {
      type: Number,
      default: 0.0,
    },
    razorpayOrderId: {
      type: String,
      required: false,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
    },
    razorpaySignature: {
      type: String,
      required: false,
    },
    paymentStatus: {
      type: String,
      required: false,
      default: 'pending',
    },
    paidAt: {
      type: Date,
      required: false,
    },
    amount: {
      type: Number,
      required: false,
    },
    currency: {
      type: String,
      required: false,
      default: 'INR',
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** Fulfillment tracking — optional on legacy documents; populated on new orders at creation. */
    trackingId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    /** Machine-friendly lifecycle: placed | confirmed | packed | shipped | out_for_delivery | delivered | cancelled */
    orderStatus: {
      type: String,
      trim: true,
      default: "placed",
    },
    /** Primary status field for explicit MongoDB visibility requirements */
    status: {
      type: String,
      trim: true,
      default: "placed",
    },
    /** Human-readable status for UI */
    trackingStatus: {
      type: String,
      trim: true,
    },
    /** 1–6 aligned with standard stages (Order Placed … Delivered) */
    currentStage: {
      type: Number,
      min: 1,
      max: 6,
      default: 1,
    },
    estimatedDelivery: {
      type: Date,
      required: false,
    },
    trackingHistory: {
      type: [trackingHistoryEntrySchema],
      default: [],
    },
    shipmentCarrier: {
      type: String,
      trim: true,
      required: false,
    },
    /** Shiprocket / courier integration (optional; legacy orders omit). */
    shiprocketOrderId: {
      type: String,
      trim: true,
      required: false,
    },
    shiprocketShipmentId: {
      type: String,
      trim: true,
      required: false,
    },
    /** Carrier AWB — used with Shiprocket courier track API */
    awbCode: {
      type: String,
      trim: true,
      required: false,
      sparse: true,
    },
    /** Courier display name from Shiprocket (or mirrored into shipmentCarrier when set). */
    courierName: {
      type: String,
      trim: true,
      required: false,
    },
    trackingUrl: {
      type: String,
      trim: true,
      required: false,
    },
    /** Normalized snapshot of courier scan stages for quick reads */
    trackingStages: {
      type: [
        {
          label: { type: String },
          message: { type: String },
          at: { type: Date },
        },
      ],
      default: [],
    },
    /** Courier timeline checkpoints (mirrors trackingStages when synced from Shiprocket; optional on legacy docs). */
    trackingTimeline: {
      type: [
        {
          label: { type: String },
          message: { type: String },
          at: { type: Date },
        },
      ],
      default: [],
    },
    /** Last raw Shiprocket API payload (tracking or create); optional */
    shipmentResponse: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    /** Snapshot of Shiprocket create/adhoc API response (not overwritten by courier track sync). */
    shiprocketRawResponse: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    /** When a Shiprocket shipment was first created for this order. */
    shipmentCreatedAt: {
      type: Date,
      required: false,
    },
    /** Set when auto or admin-triggered shipment creation fails (does not block checkout). */
    shiprocketShipmentError: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    /** Short human-readable reason (e.g. AWB assign / KYC); complements shiprocketShipmentError. */
    shipmentCreateError: {
      type: String,
      trim: true,
      required: false,
    },
    lastTrackingSyncAt: {
      type: Date,
      required: false,
    },
    shippedAt: {
      type: Date,
      required: false,
    },
    /** Set when admin advances to Confirmed (stage 2). */
    confirmedAt: {
      type: Date,
      required: false,
    },
    /** Set when admin advances to Packed (stage 3). */
    packedAt: {
      type: Date,
      required: false,
    },
    /** Set when admin advances to Out for Delivery (stage 5). */
    outForDeliveryAt: {
      type: Date,
      required: false,
    },
    deliveredAt: {
      type: Date,
      required: false,
    },
    /** Last admin who changed tracking via dashboard (optional). */
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    /** Financial loss KPIs (optional; set via admin PATCH /api/orders/:id/tracking). */
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedAt: {
      type: Date,
      required: false,
    },
    cancelledAt: {
      type: Date,
      required: false,
    },
    /** Set on user-initiated (or admin) cancellation — same ref as `user` for customer cancels. */
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    cancellationReason: {
      type: String,
      trim: true,
      required: false,
    },
    /** Lifecycle value before `orderStatus` became `cancelled` (e.g. placed, confirmed). */
    previousStatus: {
      type: String,
      trim: true,
      required: false,
    },
    /** Line-item snapshot when the order is cancelled (full-order cancel: mirrors `items`). */
    cancelledItems: {
      type: [cancelledItemSchema],
      default: [],
    },
    /** Optional: e.g. pending | not_applicable — no automatic refund processing in this app. */
    refundStatus: {
      type: String,
      trim: true,
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
