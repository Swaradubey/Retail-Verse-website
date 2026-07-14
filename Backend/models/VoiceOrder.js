const mongoose = require("mongoose");

/**
 * VoiceOrder — stores the full lifecycle of an AI voice-captured order.
 * Supports multi-tenant isolation: every record MUST have a storeId (clientId).
 * Audio is stored on disk; only the storage key is persisted here.
 */

const VOICE_ORDER_STATUSES = [
  "uploaded",
  "transcribing",
  "transcribed",
  "transcription_failed",
  "extracting",
  "extracting_order",
  "needs_review",
  "ready_for_review",
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
    /** True if user manually overrode the AI match */
    manuallyOverridden: { type: Boolean, default: false },
    /** Stock at time of matching (from DB, read-only) */
    matchedProductStock: { type: Number, default: null },
    /** Whether the product was active at time of matching */
    matchedProductIsActive: { type: Boolean, default: null },
    /** True if this item needs the user's attention before confirmation */
    requiresReview: { type: Boolean, default: false },
    /** Human-readable warning shown for review items */
    reviewWarning: { type: String, trim: true, default: null },
    /** Set when confirmation validation fails (product gone, OOS, inactive) */
    confirmationError: { type: String, trim: true, default: null },
    /** True if the spoken quantity was ambiguous and couldn't be parsed */
    quantityAmbiguous: { type: Boolean, default: false },
  },
  { _id: false }
);

const voiceOrderSchema = new mongoose.Schema(
  {
    /** Tenant isolation — always the clientId, resolved server-side. */
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Unique key used to read/delete the audio file from storage. */
    audioStorageKey: { type: String, trim: true, required: false, default: null },
    /** Safe original filename for display (sanitized on upload). */
    originalFileName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    /** File size in bytes. */
    fileSize: { type: Number, default: 0 },
    /** Duration in seconds (populated after transcription or client-side detection). */
    durationSeconds: { type: Number, default: null },
    /** Full transcription text (editable by user). */
    transcription: { type: String, default: "" },
    /** BCP-47 language code detected by transcription provider. */
    transcriptionLanguage: { type: String, default: "en" },
    /**
     * Full validated JSON extracted by the AI extraction provider.
     * Schema shape matches ExtractionResult in orderExtractionProvider.js.
     */
    extractedData: { type: mongoose.Schema.Types.Mixed, default: null },
    /**
     * Resolved line items after product matching (mirrors extractedData.items
     * but enriched with DB-confirmed product IDs, prices, and confidence).
     */
    resolvedItems: { type: [extractedItemSchema], default: [] },
    /** 0–1 overall confidence from the extraction provider. */
    overallConfidence: { type: Number, default: 0, min: 0, max: 1 },
    /** Voice-order lifecycle status. */
    status: {
      type: String,
      enum: VOICE_ORDER_STATUSES,
      default: "uploaded",
      index: true,
    },
    /** Human-readable failure message (no stack traces / secrets). */
    failureReason: { type: String, trim: true, default: null },
    /** Set when the voice order is confirmed and a real order is created. */
    createdOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    /** ISO timestamp when the user clicked "Confirm Order". */
    confirmedAt: { type: Date, default: null },
    /**
     * Draft snapshot: user-edited customer + items + notes before final confirmation.
     * Stored as Mixed so it can flexibly hold partial edits.
     */
    draftData: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
  }
);

/** Composite index for efficient dashboard list queries. */
voiceOrderSchema.index({ storeId: 1, createdAt: -1 });
voiceOrderSchema.index({ storeId: 1, status: 1 });

module.exports = mongoose.model("VoiceOrder", voiceOrderSchema);
