const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    address: {
      type: String,
      required: false,
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: [
          "store_manager",
          "manager",
          "employee",
          "staff",
          "seo_manager",
          "inventory_manager",
          "counter_manager",
          "viewer",
          "vendor",
          "VENDOR",
          "ADMIN",
          "MANAGER",
          "CASHIER",
          "EMPLOYEE",
        ],
        message: "{VALUE} is not a valid staff role",
      },
      required: true,
    },
    /** Optional reference to linked Vendor document for multi-tenant vendor linkage. */
    vendorRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: false,
      index: true,
    },
    /** Store manager Employee doc when role is employee (optional). */
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    shopName: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Role of the user who created this record (for audit/hierarchy). */
    createdByRole: {
      type: String,
      trim: true,
      default: null,
    },
    /** Linked dashboard login user when credentials were provisioned. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

employeeSchema.index({ clientId: 1, role: 1, createdAt: -1 });
employeeSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $type: "string", $nin: [null, ""] },
    },
  }
);

module.exports = mongoose.model("Employee", employeeSchema);
