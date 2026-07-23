const mongoose = require("mongoose");

const VOICE_ORDER_STATUSES = [
  "uploaded",
  "transcribing",
  "transcribed",
  "transcription_failed",
  "extracting",
  "extracting_order",
  "extraction_failed",
  "needs_review",
  "ready_for_review",
  "review_ready",
  "draft",
  "confirmed",
  "order_created",
  "failed",
  "order_extraction_failed",
  "cancelled",
];

const extractedItemSchema = new mongoose.Schema(
  {
    spokenName: { type: String, required: true, trim: true },
    requestedQuantity: { type: Number, default: 1, min: 0 },
    requestedUnit: { type: String, trim: true, default: null },
    matchedProductId: { type: String, default: null },
    matchedProductName: { type: String, trim: true, default: null },
    matchedProductPrice: { type: Number, default: null },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    alternativeProductIds: { type: [String], default: [] },
    notes: { type: String, trim: true, default: null },
    manuallyOverridden: { type: Boolean, default: false },
    matchedProductStock: { type: Number, default: null },
    matchedProductIsActive: { type: Boolean, default: null },
    requiresReview: { type: Boolean, default: false },
    reviewWarning: { type: String, trim: true, default: null },
    confirmationError: { type: String, trim: true, default: null },
    quantityAmbiguous: { type: Boolean, default: false },
  },
  { _id: false }
);

const voiceOrderSchema = new mongoose.Schema(
  {
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    audioStorageKey: { type: String, trim: true, required: false, default: null },
    originalFileName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    fileSize: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: null },
    transcription: { type: String, default: "" },
    transcriptionLanguage: { type: String, default: "en" },
    transcriptionStatus: { type: String, trim: true, default: "pending" },
    matchingStatus: { type: String, trim: true, default: "pending" },
    extractedData: { type: mongoose.Schema.Types.Mixed, default: null },
    resolvedItems: { type: [extractedItemSchema], default: [] },
    overallConfidence: { type: Number, default: 0, min: 0, max: 1 },
    status: {
      type: String,
      enum: VOICE_ORDER_STATUSES,
      default: "uploaded",
      index: true,
    },
    failureReason: { type: String, trim: true, default: null },
    createdOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    confirmedAt: { type: Date, default: null },
    draftData: { type: mongoose.Schema.Types.Mixed, default: null },
    processingStartedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

voiceOrderSchema.index({ createdByUserId: 1, createdAt: -1 });
voiceOrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("VoiceOrder", voiceOrderSchema);
