const mongoose = require("mongoose");

const ISSUE_TYPES = [
  "order_not_delivered",
  "wrong_product_received",
  "refund_issue",
  "payment_issue",
  "cancel_order_issue",
  "order_tracking_issue",
  "return_replacement_issue",
  "order_support",
  "other",
];

const TICKET_STATUSES = ["open", "pending", "in_progress", "resolved", "closed"];

const supportTicketSchema = new mongoose.Schema(
  {
    /** Logged-in user who created the ticket */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Snapshot of user name for quick reads without populate */
    userName: { type: String, trim: true, required: false },
    /** Snapshot of user email */
    userEmail: { type: String, trim: true, lowercase: true, required: false },
    /** Snapshot of user role */
    role: { type: String, trim: true, required: false },

    /** Optional: linked order (user's own order) */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
    },
    /** Snapshot of order's business orderId (e.g. "ORD-12345") for quick admin reads */
    orderRef: { type: String, trim: true, required: false },

    /** Short title / subject of the ticket */
    subject: {
      type: String,
      trim: true,
      required: true,
      maxlength: 200,
    },

    /** Category of issue */
    issueType: {
      type: String,
      enum: ISSUE_TYPES,
      required: true,
    },

    /** Full description from the user */
    description: {
      type: String,
      trim: true,
      required: true,
      maxlength: 5000,
    },

    /** Lifecycle status managed by admin */
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "open",
    },

    /** Optional: Zendesk Ticket ID mapping */
    zendeskTicketId: { type: String, trim: true, required: false },

    /** Ticket priority */
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal"
    },

    /** Optional admin reply / remark */
    adminResponse: {
      type: String,
      trim: true,
      required: false,
      maxlength: 5000,
    },

    /** Admin who last updated the ticket */
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    /** Client/Tenant ID for scoping */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    /** Store ID for multi-store client scoping */
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    source: { type: String, trim: true, required: false },
    category: { type: String, trim: true, required: false },
    type: { type: String, trim: true, required: false },

    /** Explicit ownership & tracking fields */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    orderId: { type: String, trim: true, required: false },
    customerEmail: { type: String, trim: true, lowercase: true, required: false },

    /** Embedded local messages for chat history fallback */
    localMessages: [
      {
        body: { type: String, required: true },
        authorName: { type: String, required: true },
        authorRole: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Index for fast per-user lookups
supportTicketSchema.index({ user: 1, createdAt: -1 });
// Index for admin/client list view (newest first)
supportTicketSchema.index({ clientId: 1, createdAt: -1 });
supportTicketSchema.index({ storeId: 1, createdAt: -1 });
supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ zendeskTicketId: 1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);

