const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const storeSettingsSchema = new mongoose.Schema(
  {
    storeName: { type: String, trim: true, default: "" },
    storeEmail: { type: String, trim: true, default: "" },
    storePhone: { type: String, trim: true, default: "" },
    storeAddress: { type: String, trim: true, default: "" },
    currency: { type: String, trim: true, default: "USD" },
    timezone: { type: String, trim: true, default: "UTC" },
    taxRate: { type: Number, default: 0 },
    language: { type: String, trim: true, default: "en" },
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    emailNotifications: { type: Boolean, default: true },
    orderAlerts: { type: Boolean, default: true },
    stockAlerts: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    pushNotifications: { type: Boolean, default: false },
    smsNotifications: { type: Boolean, default: false },
  },
  { _id: false }
);

const securitySettingsSchema = new mongoose.Schema(
  {
    twoFactorEnabled: { type: Boolean, default: false },
    loginAlerts: { type: Boolean, default: true },
    sessionTimeout: { type: Number, default: 30 },
    allowedDevices: { type: Number, default: 5 },
  },
  { _id: false }
);

const billingSettingsSchema = new mongoose.Schema(
  {
    currentPlan: { type: String, trim: true, default: "Free" },
    billingEmail: { type: String, trim: true, default: "" },
    billingAddress: { type: String, trim: true, default: "" },
    autoRenew: { type: Boolean, default: false },
    paymentMethodLast4: { type: String, trim: true, default: "" },
    subscriptionStatus: { type: String, trim: true, default: "inactive" },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      default: "employee",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    username: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    profilePhoto: {
      type: String,
      trim: true,
      default: "",
    },
    storeSettings: {
      type: storeSettingsSchema,
      default: () => ({}),
    },
    notificationSettings: {
      type: notificationSettingsSchema,
      default: () => ({}),
    },
    securitySettings: {
      type: securitySettingsSchema,
      default: () => ({}),
    },
    billingSettings: {
      type: billingSettingsSchema,
      default: () => ({}),
    },
    /** Once true, GET /api/settings has persisted merged defaults to MongoDB for this user. */
    settingsBootstrapped: {
      type: Boolean,
      default: false,
    },
    /** Set on successful password login (see authController.loginUser). */
    lastLoginAt: {
      type: Date,
      default: null,
    },
    /**
     * Updated on login and throttled on authenticated requests for customer-like roles
     * (see authMiddleware + utils/touchLastActive). Used for admin customer analytics.
     */
    lastActiveAt: {
      type: Date,
      default: null,
    },
    /** Set for `client` role — links to Client (company) profile for inventory scope. */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    /** For `employee` role — optional reporting line to a store manager user. */
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Denormalized from linked Client / Employee when available (see utils/syncUserOnLogin). */
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exact match on normalized email, then case-insensitive (legacy documents). */
userSchema.statics.findByNormalizedEmail = async function (normalizedEmail) {
  if (!normalizedEmail || typeof normalizedEmail !== "string") {
    return null;
  }
  const exact = await this.findOne({ email: normalizedEmail });
  if (exact) return exact;
  return this.findOne({
    email: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i"),
  });
};

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Automatically sync customer records on save if role is "user"
userSchema.post("save", async function (doc, next) {
  if (doc.role === "user") {
    try {
      const Customer = require("./Customer");
      const emailNorm = doc.email.toLowerCase().trim();
      let customer = await Customer.findOne({
        $or: [
          { userId: doc._id },
          { email: emailNorm }
        ]
      });

      const customerData = {
        userId: doc._id,
        name: doc.name,
        email: emailNorm,
        phone: doc.phone || "",
        status: doc.isActive ? "active" : "inactive",
        createdAt: doc.createdAt || new Date(),
      };

      if (customer) {
        let hasChanges = false;
        for (const k of Object.keys(customerData)) {
          if (String(customer[k]) !== String(customerData[k])) {
            customer[k] = customerData[k];
            hasChanges = true;
          }
        }
        if (hasChanges) {
          await customer.save();
        }
      } else {
        await Customer.create(customerData);
      }
    } catch (err) {
      console.error("[User Model Post-Save Customer Sync Error]:", err.message);
    }
  }
  if (typeof next === "function") next();
});

module.exports = mongoose.model("User", userSchema);
