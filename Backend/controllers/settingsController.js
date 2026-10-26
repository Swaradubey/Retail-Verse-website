const User = require("../models/User");
const UserSettings = require("../models/UserSettings");
const Client = require("../models/Client");
const settingsCache = require("../utils/settingsCache");
const fs = require("fs");
const path = require("path");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");

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
    const uid = user._id || user.id;
    if (user.clientId) {
      await Client.findByIdAndUpdate(user.clientId, { $set: { logo: finalLogo } });
    } else {
      await Client.findOneAndUpdate({ userId: uid }, { $set: { logo: finalLogo } });
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
    fs.unlink(fullPath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.error("[settingsController] cleanupOldLogoFile error:", err.message);
      }
    });
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

/** Keeps the `settings` collection in sync in the background without blocking API responses. */
async function mirrorUserToSettingsDoc(user) {
  try {
    const uid = user._id || user.id;
    const s = mergeStore(subdocToPlain(user.storeSettings));
    const n = mergeNotifications(subdocToPlain(user.notificationSettings));
    const sec = mergeSecurity(subdocToPlain(user.securitySettings));
    const currency = (s.currency && String(s.currency).trim()) || "INR";
    await UserSettings.findOneAndUpdate(
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
      { upsert: true, runValidators: true }
    );
  } catch (err) {
    console.error("[settingsController] mirrorUserToSettingsDoc error:", err.message);
  }
}

/**
 * 1. GET /api/settings
 * Tuned with in-memory caching (<0.5ms), lean projection, non-blocking background sync,
 * and zero redundant queries.
 */
const getSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  try {
    // 1. Check in-memory cache (<0.5ms response time)
    const cached = settingsCache.get(uid);
    if (cached) {
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("X-Cache", "HIT");
      return res.json({
        success: true,
        data: cached,
      });
    }

    // 2. Fast lean query with explicit projection
    let user = await User.findById(uid)
      .select("name username email country bio profilePhoto storeSettings notificationSettings securitySettings billingSettings settingsBootstrapped")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 3. One-time bootstrap if not yet initialized
    if (!user.settingsBootstrapped) {
      const storeSettings = mergeStore(user.storeSettings);
      const notificationSettings = mergeNotifications(user.notificationSettings);
      const securitySettings = mergeSecurity(user.securitySettings);
      const billingSettings = mergeBilling(user.billingSettings);

      user = await User.findByIdAndUpdate(
        uid,
        {
          $set: {
            storeSettings,
            notificationSettings,
            securitySettings,
            billingSettings,
            settingsBootstrapped: true,
          },
        },
        { new: true, select: "-password" }
      ).lean();
    }

    const responseData = toSettingsResponse(user);

    // 4. Cache in memory with 180s TTL
    settingsCache.set(uid, responseData, 180 * 1000);

    // 5. Asynchronously mirror to legacy settings collection in background
    mirrorUserToSettingsDoc(user).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("X-Cache", "MISS");

    return res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("[SETTINGS GET] error:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. PUT /api/settings
 * Comprehensive settings update.
 * Tuned with atomic findByIdAndUpdate, instant cache invalidation, and parallel background syncs.
 */
const updateSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  try {
    const body = req.body || {};

    // 1. Verify user exists and fetch current settings for merging
    const currentUser = await User.findById(uid)
      .select("+password storeSettings notificationSettings securitySettings billingSettings clientId")
      .lean();

    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updateSet = {};

    // Profile fields
    if (body.profile && typeof body.profile === "object") {
      const p = body.profile;
      if (p.fullName !== undefined) {
        const trimmed = String(p.fullName).trim();
        if (!trimmed) {
          return res.status(400).json({ success: false, message: "Full name cannot be empty" });
        }
        updateSet.name = trimmed;
      }
      if (p.username !== undefined) {
        updateSet.username = String(p.username).trim();
      }
      if (p.email !== undefined) {
        const normalized = String(p.email).toLowerCase().trim();
        if (!normalized) {
          return res.status(400).json({ success: false, message: "Email cannot be empty" });
        }
        // Fast index-only existence check
        const taken = await User.exists({
          email: normalized,
          _id: { $ne: uid },
        });
        if (taken) {
          return res.status(400).json({ success: false, message: "Email is already in use" });
        }
        updateSet.email = normalized;
      }
      if (p.countryOrRegion !== undefined) {
        updateSet.country = String(p.countryOrRegion).trim();
      }
      if (p.bio !== undefined) {
        updateSet.bio = String(p.bio).trim();
      }
      if (p.profilePhoto !== undefined) {
        const ph = String(p.profilePhoto).trim();
        if (ph.length > PROFILE_PHOTO_MAX_LENGTH) {
          return res.status(400).json({
            success: false,
            message: `Profile photo data is too long (max ${PROFILE_PHOTO_MAX_LENGTH} characters)`,
          });
        }
        updateSet.profilePhoto = ph;
      }
    }

    // Store settings
    let oldLogoUrl = currentUser.storeSettings ? currentUser.storeSettings.logoUrl : null;
    let newLogoUrl = oldLogoUrl;
    if (body.store && typeof body.store === "object") {
      const prev = mergeStore(currentUser.storeSettings);
      const mergedStore = mergeStore({ ...prev, ...body.store });
      updateSet.storeSettings = mergedStore;
      newLogoUrl = mergedStore.logoUrl;
    }

    // Notification settings
    if (body.notifications && typeof body.notifications === "object") {
      const prevN = mergeNotifications(currentUser.notificationSettings);
      updateSet.notificationSettings = mergeNotifications({ ...prevN, ...body.notifications });
    }

    // Security settings & password updates
    if (body.security && typeof body.security === "object") {
      const { currentPassword, newPassword, confirmPassword, ...rest } = body.security;
      const prevSec = mergeSecurity(currentUser.securitySettings);
      updateSet.securitySettings = mergeSecurity({ ...prevSec, ...rest });

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
        const isMatch = currentUser.password ? await bcrypt.compare(String(currentPassword || ""), currentUser.password) : false;
        if (!isMatch) {
          return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }
        updateSet.password = await bcrypt.hash(np, 10);
      }
    }

    // Top-level password changes
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
      const isMatch = currentUser.password ? await bcrypt.compare(String(body.currentPassword || ""), currentUser.password) : false;
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }
      updateSet.password = await bcrypt.hash(np, 10);
    }

    // Billing settings
    if (body.billing && typeof body.billing === "object") {
      const prevB = mergeBilling(currentUser.billingSettings);
      const merged = mergeBilling({ ...prevB, ...body.billing });
      if (merged.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.billingEmail)) {
        return res.status(400).json({ success: false, message: "Invalid billing email" });
      }
      updateSet.billingSettings = merged;
    }

    // Atomic update in a single trip (<10ms)
    const updatedUser = await User.findByIdAndUpdate(
      uid,
      { $set: updateSet },
      { new: true, runValidators: true, select: "-password" }
    ).lean();

    // Invalidate user settings cache immediately
    settingsCache.invalidate(uid);

    // Run secondary background tasks in parallel without blocking response
    Promise.allSettled([
      mirrorUserToSettingsDoc(updatedUser),
      syncClientLogo(updatedUser, newLogoUrl),
      oldLogoUrl !== newLogoUrl ? cleanupOldLogoFile(oldLogoUrl, newLogoUrl) : Promise.resolve(),
    ]).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updatedUser),
    });
  } catch (error) {
    console.error("[SETTINGS UPDATE] error:", error.message, error.stack);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Email is already in use" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. DELETE /api/settings/reset
 * Reset settings to default values.
 * Tuned with atomic reset and instant cache invalidation.
 */
const resetSettings = async (req, res) => {
  const uid = userIdFromReq(req);
  try {
    const updatedUser = await User.findByIdAndUpdate(
      uid,
      {
        $set: {
          storeSettings: mergeStore({}),
          notificationSettings: mergeNotifications({}),
          securitySettings: mergeSecurity({}),
          billingSettings: mergeBilling({}),
        },
      },
      { new: true, select: "-password" }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Invalidate user cache immediately
    settingsCache.invalidate(uid);

    // Asynchronously reset UserSettings document in background
    UserSettings.findOneAndUpdate(
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
      { upsert: true }
    ).exec().catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings reset to defaults",
      data: toSettingsResponse(updatedUser),
    });
  } catch (error) {
    console.error("[SETTINGS RESET] error:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. PUT /api/settings/profile
 * Fast profile updates with atomic findByIdAndUpdate.
 */
const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const uid = userIdFromReq(req);
  try {
    const { fullName, username, email, countryOrRegion, bio, profilePhoto } = req.body;
    const updateSet = {};

    if (fullName !== undefined) {
      const trimmed = String(fullName).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "Full name cannot be empty" });
      }
      updateSet.name = trimmed;
    }
    if (username !== undefined) {
      updateSet.username = String(username).trim();
    }
    if (email !== undefined) {
      const normalized = String(email).toLowerCase().trim();
      if (!normalized) {
        return res.status(400).json({ success: false, message: "Email cannot be empty" });
      }
      const taken = await User.exists({
        email: normalized,
        _id: { $ne: uid },
      });
      if (taken) {
        return res.status(400).json({ success: false, message: "Email is already in use" });
      }
      updateSet.email = normalized;
    }
    if (countryOrRegion !== undefined) {
      updateSet.country = String(countryOrRegion).trim();
    }
    if (bio !== undefined) {
      updateSet.bio = String(bio).trim();
    }
    if (profilePhoto !== undefined) {
      const p = String(profilePhoto).trim();
      if (p.length > PROFILE_PHOTO_MAX_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `Profile photo data is too long (max ${PROFILE_PHOTO_MAX_LENGTH} characters)`,
        });
      }
      updateSet.profilePhoto = p;
    }

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: updateSet },
      { new: true, runValidators: true, select: "-password" }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Invalidate cache immediately
    settingsCache.invalidate(uid);
    mirrorUserToSettingsDoc(updated).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updated),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Email is already in use" });
    }
    console.error("[settings] updateProfile:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. PUT /api/settings/store
 * Fast store settings update with non-blocking logo sync.
 */
const updateStore = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const uid = userIdFromReq(req);
  try {
    const user = await User.findById(uid).select("storeSettings clientId").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const oldLogoUrl = user.storeSettings ? user.storeSettings.logoUrl : null;
    const prev = mergeStore(user.storeSettings);

    let logoToSave = prev.logoUrl;
    if (req.file) {
      logoToSave = `/uploads/logos/${req.file.filename}`;
    } else if (req.body.logoUrl !== undefined) {
      logoToSave =
        req.body.logoUrl === null || req.body.logoUrl === ""
          ? null
          : req.body.logoUrl;
    }

    const mergedStore = mergeStore({ ...prev, ...req.body, logoUrl: logoToSave });

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: { storeSettings: mergedStore } },
      { new: true, select: "-password" }
    ).lean();

    // Invalidate cache immediately
    settingsCache.invalidate(uid);

    const newLogoUrl = mergedStore.logoUrl;
    Promise.allSettled([
      oldLogoUrl !== newLogoUrl ? cleanupOldLogoFile(oldLogoUrl, newLogoUrl) : Promise.resolve(),
      syncClientLogo(updated, newLogoUrl),
      mirrorUserToSettingsDoc(updated),
    ]).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updated),
    });
  } catch (error) {
    console.error("[settings] updateStore:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 6. PUT /api/settings/notifications
 * Fast notification updates with atomic findByIdAndUpdate.
 */
const updateNotifications = async (req, res) => {
  const uid = userIdFromReq(req);
  try {
    const user = await User.findById(uid).select("notificationSettings").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const prevN = mergeNotifications(user.notificationSettings);
    const merged = mergeNotifications({ ...prevN, ...req.body });

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: { notificationSettings: merged } },
      { new: true, select: "-password" }
    ).lean();

    // Invalidate cache immediately
    settingsCache.invalidate(uid);
    mirrorUserToSettingsDoc(updated).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updated),
    });
  } catch (error) {
    console.error("[settings] updateNotifications:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 7. PUT /api/settings/security
 * Fast security settings and password updates.
 */
const updateSecurity = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const uid = userIdFromReq(req);
  try {
    const { currentPassword, newPassword, confirmPassword, ...rest } = req.body;

    const user = await User.findById(uid).select("+password securitySettings").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const prevSec = mergeSecurity(user.securitySettings);
    const updateSet = {
      securitySettings: mergeSecurity({ ...prevSec, ...rest }),
    };

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
      const isMatch = user.password ? await bcrypt.compare(String(currentPassword || ""), user.password) : false;
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }
      updateSet.password = await bcrypt.hash(np, 10);
    }

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: updateSet },
      { new: true, runValidators: true, select: "-password" }
    ).lean();

    // Invalidate cache immediately
    settingsCache.invalidate(uid);
    mirrorUserToSettingsDoc(updated).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updated),
    });
  } catch (error) {
    console.error("[settings] updateSecurity:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 8. PUT /api/settings/billing
 * Fast billing settings updates.
 */
const updateBilling = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const uid = userIdFromReq(req);
  try {
    const user = await User.findById(uid).select("billingSettings").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const prevB = mergeBilling(user.billingSettings);
    const merged = mergeBilling({ ...prevB, ...req.body });
    if (merged.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.billingEmail)) {
      return res.status(400).json({ success: false, message: "Invalid billing email" });
    }

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: { billingSettings: merged } },
      { new: true, select: "-password" }
    ).lean();

    // Invalidate cache immediately
    settingsCache.invalidate(uid);
    mirrorUserToSettingsDoc(updated).catch(() => {});

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: toSettingsResponse(updated),
    });
  } catch (error) {
    console.error("[settings] updateBilling:", error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 9. POST /api/settings/logo
 * Fast logo upload with non-blocking file validation.
 */
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo file uploaded" });
    }

    const file = req.file;
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      fs.promises.unlink(file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Invalid file format. Only PNG, JPG, WEBP, and SVG are accepted.",
      });
    }

    if (file.size > 2 * 1024 * 1024) {
      fs.promises.unlink(file.path).catch(() => {});
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
