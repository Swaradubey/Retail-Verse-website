const User = require("../models/User");
const UserSettings = require("../models/UserSettings");
const Client = require("../models/Client");
const fs = require("fs");
const path = require("path");
const { validationResult } = require("express-validator");

/** Base64 data URLs for avatars (~400KB binary) exceed short URL limits; keep under MongoDB practical size. */
const PROFILE_PHOTO_MAX_LENGTH = 600_000;

function userIdFromReq(req) {
  if (!req.user) return null;
  return req.user._id || req.user.id;
}

function subdocToPlain(sub) {
  if (!sub) return {};
  if (typeof sub.toObject === "function") return sub.toObject();
  return { ...sub };
}

async function syncClientLogo(user, logoUrl) {
  try {
    const finalLogo = logoUrl || "";
    let client = null;
    if (user.clientId) {
      client = await Client.findById(user.clientId);
    } else {
      client = await Client.findOne({ userId: user._id });
    }
    if (client) {
      client.logo = finalLogo;
      await client.save();
    }
  } catch (err) {
    console.error("[settingsController] syncClientLogo error:", err.message);
  }
}

function cleanupOldLogoFile(oldLogoUrl, newLogoUrl) {
  if (!oldLogoUrl || oldLogoUrl === newLogoUrl) return;
  if (typeof oldLogoUrl === "string" && oldLogoUrl.startsWith("/uploads/logos/")) {
    const filename = path.basename(oldLogoUrl);
    const logosDir = path.resolve(__dirname, "../uploads/logos");
    const fullPath = path.join(logosDir, filename);
    if (fullPath.startsWith(logosDir) && fs.existsSync(fullPath)) {
      fs.unlink(fullPath, (err) => {
        if (err) console.error("[settingsController] cleanupOldLogoFile error:", err.message);
      });
    }
  }
}

function mergeStore(src) {
  const s = src && typeof src === "object" ? src : {};
  let logoUrl = null;
  if (s.logoUrl !== undefined && s.logoUrl !== null) {
    const str = String(s.logoUrl).trim();
    logoUrl = str.length > 0 ? str : null;
  }
  return {
    storeName: String(s.storeName ?? "").trim(),
    storeEmail: String(s.storeEmail ?? "").trim(),
    storePhone: String(s.storePhone ?? "").trim(),
    storeAddress: String(s.storeAddress ?? "").trim(),
    currency: String(s.currency ?? "USD").trim() || "USD",
    timezone: String(s.timezone ?? "UTC").trim() || "UTC",
    taxRate: Math.min(100, Math.max(0, Number(s.taxRate) || 0)),
    language: String(s.language ?? "en").trim() || "en",
    logoUrl,
  };
}

function mergeNotifications(src) {
  const n = src && typeof src === "object" ? src : {};
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  return {
    emailNotifications: bool(n.emailNotifications, true),
    orderAlerts: bool(n.orderAlerts, true),
    stockAlerts: bool(n.stockAlerts, true),
    marketingEmails: bool(n.marketingEmails, false),
    pushNotifications: bool(n.pushNotifications, false),
    smsNotifications: bool(n.smsNotifications, false),
  };
}

function mergeSecurity(src) {
  const s = src && typeof src === "object" ? src : {};
  const timeout = Number(s.sessionTimeout);
  const devices = Number(s.allowedDevices);
  return {
    twoFactorEnabled: typeof s.twoFactorEnabled === "boolean" ? s.twoFactorEnabled : false,
    loginAlerts: typeof s.loginAlerts === "boolean" ? s.loginAlerts : true,
    sessionTimeout: Number.isFinite(timeout) ? Math.min(1440, Math.max(5, Math.round(timeout))) : 30,
    allowedDevices: Number.isFinite(devices) ? Math.min(100, Math.max(1, Math.round(devices))) : 5,
  };
}

function mergeBilling(src) {
  const b = src && typeof src === "object" ? src : {};
  const last4 = String(b.paymentMethodLast4 ?? "").replace(/\D/g, "").slice(0, 4);
  return {
    currentPlan: String(b.currentPlan ?? "Free").trim() || "Free",
    billingEmail: String(b.billingEmail ?? "").trim(),
    billingAddress: String(b.billingAddress ?? "").trim(),
    autoRenew: typeof b.autoRenew === "boolean" ? b.autoRenew : false,
    paymentMethodLast4: last4,
    subscriptionStatus: String(b.subscriptionStatus ?? "inactive").trim() || "inactive",
  };
}

function toSettingsResponse(user) {
  const store = mergeStore(user.storeSettings);
  const notifications = mergeNotifications(user.notificationSettings);
  const security = mergeSecurity(user.securitySettings);
  const billing = mergeBilling(user.billingSettings);

  return {
    profile: {
      fullName: user.name || "",
      username: user.username || "",
      email: user.email || "",
      countryOrRegion: user.country || "",
      bio: user.bio || "",
      profilePhoto: user.profilePhoto || "",
    },
    store,
    notifications,
    security,
    billing,
  };
}

/** Keeps the `settings` collection in sync with embedded User settings (store / notifications / 2FA). */
async function mirrorUserToSettingsDoc(user) {
  const uid = user._id || user.id;
  const s = mergeStore(subdocToPlain(user.storeSettings));
  const n = mergeNotifications(subdocToPlain(user.notificationSettings));
  const sec = mergeSecurity(subdocToPlain(user.securitySettings));
  const currency = (s.currency && String(s.currency).trim()) || "INR";
  const doc = await UserSettings.findOneAndUpdate(
    { user: uid },
    {
      $set: {
        storeName: s.storeName,
        email: s.storeEmail,
        phone: s.storePhone,
        address: s.storeAddress,
        currency,
        notifications: n.emailNotifications,
        security2FA: sec.twoFactorEnabled,
        logoUrl: s.logoUrl,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );
  return doc;
}

const getSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  console.log("[SETTINGS GET] user:", String(uid));
  try {
    const user = await User.findById(uid).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.settingsBootstrapped) {
      user.storeSettings = mergeStore(subdocToPlain(user.storeSettings));
      user.notificationSettings = mergeNotifications(subdocToPlain(user.notificationSettings));
      user.securitySettings = mergeSecurity(subdocToPlain(user.securitySettings));
      user.billingSettings = mergeBilling(subdocToPlain(user.billingSettings));
      user.settingsBootstrapped = true;
      await user.save();
    }

    const fresh = await User.findById(uid).select("-password");
    const settingsDoc = await mirrorUserToSettingsDoc(fresh);
    console.log("[SETTINGS GET] mirrored settings doc id:", String(settingsDoc._id));
    res.json({
      success: true,
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[SETTINGS GET] error:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  console.log("[SETTINGS UPDATE] user:", String(uid));
  console.log("[SETTINGS UPDATE] payload:", JSON.stringify(req.body));
  try {
    const body = req.body || {};
    const user = await User.findById(uid).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (body.profile && typeof body.profile === "object") {
      const p = body.profile;
      if (p.fullName !== undefined) {
        const trimmed = String(p.fullName).trim();
        if (!trimmed) {
          return res.status(400).json({ success: false, message: "Full name cannot be empty" });
        }
        user.name = trimmed;
      }
      if (p.username !== undefined) {
        user.username = String(p.username).trim();
      }
      if (p.email !== undefined) {
        const normalized = String(p.email).toLowerCase().trim();
        if (!normalized) {
          return res.status(400).json({ success: false, message: "Email cannot be empty" });
        }
        const taken = await User.findOne({
          email: normalized,
          _id: { $ne: user._id },
        });
        if (taken) {
          return res.status(400).json({ success: false, message: "Email is already in use" });
        }
        user.email = normalized;
      }
      if (p.countryOrRegion !== undefined) {
        user.country = String(p.countryOrRegion).trim();
      }
      if (p.bio !== undefined) {
        user.bio = String(p.bio).trim();
      }
      if (p.profilePhoto !== undefined) {
        const ph = String(p.profilePhoto).trim();
        if (ph.length > PROFILE_PHOTO_MAX_LENGTH) {
          return res.status(400).json({
            success: false,
            message: `Profile photo data is too long (max ${PROFILE_PHOTO_MAX_LENGTH} characters)`,
          });
        }
        user.profilePhoto = ph;
      }
    }

    let oldLogoUrl = user.storeSettings ? user.storeSettings.logoUrl : null;
    if (body.store && typeof body.store === "object") {
      const prev = mergeStore(subdocToPlain(user.storeSettings));
      user.storeSettings = mergeStore({ ...prev, ...body.store });
    }

    if (body.notifications && typeof body.notifications === "object") {
      const prevN = mergeNotifications(subdocToPlain(user.notificationSettings));
      user.notificationSettings = mergeNotifications({ ...prevN, ...body.notifications });
    }

    if (body.security && typeof body.security === "object") {
      const { currentPassword, newPassword, confirmPassword, ...rest } = body.security;
      const prevSec = subdocToPlain(user.securitySettings);
      user.securitySettings = mergeSecurity({ ...prevSec, ...rest });

      const wantsNestedPwd =
        (newPassword !== undefined && String(newPassword).length > 0) ||
        (confirmPassword !== undefined && String(confirmPassword).length > 0);
      if (wantsNestedPwd) {
        const np = String(newPassword || "");
        const cp = String(confirmPassword || "");
        if (np.length < 6) {
          return res.status(400).json({
            success: false,
            message: "New password must be at least 6 characters",
          });
        }
        if (np !== cp) {
          return res.status(400).json({ success: false, message: "Passwords do not match" });
        }
        if (!currentPassword || !(await user.matchPassword(String(currentPassword)))) {
          return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }
        user.password = np;
      }
    }

    const topNew = body.newPassword;
    const topConf = body.confirmPassword;
    if (
      (topNew !== undefined && String(topNew).length > 0) ||
      (topConf !== undefined && String(topConf).length > 0)
    ) {
      const np = String(topNew || "");
      const cp = String(topConf || "");
      if (np.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters",
        });
      }
      if (np !== cp) {
        return res.status(400).json({ success: false, message: "Passwords do not match" });
      }
      if (!body.currentPassword || !(await user.matchPassword(String(body.currentPassword)))) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }
      user.password = np;
    }

    if (body.billing && typeof body.billing === "object") {
      const prevB = mergeBilling(subdocToPlain(user.billingSettings));
      const merged = mergeBilling({ ...prevB, ...body.billing });
      if (merged.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.billingEmail)) {
        return res.status(400).json({ success: false, message: "Invalid billing email" });
      }
      user.billingSettings = merged;
      user.markModified('billingSettings');
    }

    await user.save();
    const newLogoUrl = user.storeSettings ? user.storeSettings.logoUrl : null;
    if (oldLogoUrl !== newLogoUrl) {
      cleanupOldLogoFile(oldLogoUrl, newLogoUrl);
    }
    await syncClientLogo(user, newLogoUrl);

    const settingsDoc = await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(uid).select("-password");
    console.log("[SETTINGS UPDATE] saved doc:", settingsDoc?.toObject?.() ? settingsDoc.toObject() : settingsDoc);
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[SETTINGS UPDATE] error:", error.message, error.stack);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Email is already in use" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  console.log("[SETTINGS RESET] user:", String(uid));
  try {
    const user = await User.findById(uid);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.storeSettings = mergeStore({});
    user.notificationSettings = mergeNotifications({});
    user.securitySettings = mergeSecurity({});
    user.billingSettings = mergeBilling({});
    await user.save();

    const settingsDoc = await UserSettings.findOneAndUpdate(
      { user: uid },
      {
        $set: {
          storeName: "",
          email: "",
          phone: "",
          address: "",
          currency: "INR",
          notifications: true,
          security2FA: false,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    const fresh = await User.findById(uid).select("-password");
    console.log(
      "[SETTINGS RESET] saved doc:",
      settingsDoc?.toObject?.() ? settingsDoc.toObject() : settingsDoc
    );
    res.json({
      success: true,
      message: "Settings reset to defaults",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[SETTINGS RESET] error:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { fullName, username, email, countryOrRegion, bio, profilePhoto } = req.body;

    const user = await User.findById(userIdFromReq(req));
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (fullName !== undefined) {
      const trimmed = String(fullName).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "Full name cannot be empty" });
      }
      user.name = trimmed;
    }
    if (username !== undefined) {
      user.username = String(username).trim();
    }
    if (email !== undefined) {
      const normalized = String(email).toLowerCase().trim();
      if (!normalized) {
        return res.status(400).json({ success: false, message: "Email cannot be empty" });
      }
      const taken = await User.findOne({
        email: normalized,
        _id: { $ne: user._id },
      });
      if (taken) {
        return res.status(400).json({ success: false, message: "Email is already in use" });
      }
      user.email = normalized;
    }
    if (countryOrRegion !== undefined) {
      user.country = String(countryOrRegion).trim();
    }
    if (bio !== undefined) {
      user.bio = String(bio).trim();
    }
    if (profilePhoto !== undefined) {
      const p = String(profilePhoto).trim();
      if (p.length > PROFILE_PHOTO_MAX_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `Profile photo data is too long (max ${PROFILE_PHOTO_MAX_LENGTH} characters)`,
        });
      }
      user.profilePhoto = p;
    }

    await user.save();
    await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Email is already in use" });
    }
    console.error("[settings] updateProfile:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateStore = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const user = await User.findById(userIdFromReq(req));
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const oldLogoUrl = user.storeSettings ? user.storeSettings.logoUrl : null;
    const prev = mergeStore(subdocToPlain(user.storeSettings));
    
    let logoToSave = prev.logoUrl;
    if (req.file) {
      logoToSave = `/uploads/logos/${req.file.filename}`;
    } else if (req.body.logoUrl !== undefined) {
      logoToSave =
        req.body.logoUrl === null || req.body.logoUrl === ""
          ? null
          : req.body.logoUrl;
    }

    user.storeSettings = mergeStore({ ...prev, ...req.body, logoUrl: logoToSave });
    await user.save();
    const newLogoUrl = user.storeSettings ? user.storeSettings.logoUrl : null;
    if (oldLogoUrl !== newLogoUrl) {
      cleanupOldLogoFile(oldLogoUrl, newLogoUrl);
    }
    await syncClientLogo(user, newLogoUrl);

    await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[settings] updateStore:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateNotifications = async (req, res) => {
  try {
    const user = await User.findById(userIdFromReq(req));
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const prevN = mergeNotifications(subdocToPlain(user.notificationSettings));
    user.notificationSettings = mergeNotifications({ ...prevN, ...req.body });
    await user.save();
    await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[settings] updateNotifications:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSecurity = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { currentPassword, newPassword, confirmPassword, ...rest } = req.body;

    const user = await User.findById(userIdFromReq(req)).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const prevSec =
      user.securitySettings && typeof user.securitySettings.toObject === "function"
        ? user.securitySettings.toObject()
        : user.securitySettings || {};
    user.securitySettings = mergeSecurity({ ...prevSec, ...rest });

    const wantsPasswordChange =
      (newPassword !== undefined && String(newPassword).length > 0) ||
      (confirmPassword !== undefined && String(confirmPassword).length > 0);

    if (wantsPasswordChange) {
      const np = String(newPassword || "");
      const cp = String(confirmPassword || "");
      if (np.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters",
        });
      }
      if (np !== cp) {
        return res.status(400).json({ success: false, message: "Passwords do not match" });
      }
      if (!currentPassword || !(await user.matchPassword(String(currentPassword)))) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }
      user.password = np;
    }

    await user.save();
    await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[settings] updateSecurity:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBilling = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const user = await User.findById(userIdFromReq(req));
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const prevB = mergeBilling(subdocToPlain(user.billingSettings));
    const merged = mergeBilling({ ...prevB, ...req.body });
    if (merged.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.billingEmail)) {
      return res.status(400).json({ success: false, message: "Invalid billing email" });
    }
    user.billingSettings = merged;
    user.markModified('billingSettings');
    await user.save();
    await mirrorUserToSettingsDoc(user);
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(fresh),
    });
  } catch (error) {
    console.error("[settings] updateBilling:", error.message, error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo file uploaded" });
    }

    const file = req.file;
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Invalid file format. Only PNG, JPG, WEBP, and SVG are accepted.",
      });
    }

    if (file.size > 2 * 1024 * 1024) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({
        success: false,
        message: "File size exceeds maximum limit of 2 MB.",
      });
    }

    const publicUrl = `/uploads/logos/${file.filename}`;
    return res.json({
      success: true,
      message: "Logo uploaded successfully",
      logoUrl: publicUrl,
    });
  } catch (error) {
    console.error("[settingsController] uploadLogo error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to upload logo" });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  resetSettings,
  updateProfile,
  updateStore,
  updateNotifications,
  updateSecurity,
  updateBilling,
  uploadLogo,
};
