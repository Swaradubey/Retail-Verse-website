const User = require("../models/User");
const mongoose = require("mongoose");
const generateToken = require("../utils/generateToken");
const { createLoginLog } = require("../utils/createLoginLog");
const {
  syncUserOnLogin,
  upsertNonAdminUserOnLogin,
} = require("../utils/syncUserOnLogin");
const {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} = require("../utils/authConstants");
const { validationResult } = require("express-validator");
const crypto = require("crypto");
const { sendEmail, buildResetPasswordEmailHtml } = require("../utils/emailService");

/**
 * Generates a simple SVG CAPTCHA
 */
const generateCaptcha = () => {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Avoid ambiguous chars like 0, O, 1, I
  let text = "";
  for (let i = 0; i < 6; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Simple SVG representation
  const width = 150;
  const height = 50;
  const fontSize = 30;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#f3f4f6"/>`;
  
  // Add some noise lines
  for (let i = 0; i < 5; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d1d5db" stroke-width="1"/>`;
  }

  // Add text with slight random rotation and position
  for (let i = 0; i < text.length; i++) {
    const x = 20 + i * 20;
    const y = 35;
    const rotate = (Math.random() - 0.5) * 40;
    svg += `<text x="${x}" y="${y}" fill="#374151" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" transform="rotate(${rotate}, ${x}, ${y})">${text[i]}</text>`;
  }
  
  svg += `</svg>`;
  
  return {
    text,
    data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  };
};

const CAPTCHA_SECRET = process.env.JWT_SECRET || "captcha-secret-key";

const encryptCaptcha = (text) => {
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
  const data = `${text}:${expiry}`;
  const hmac = crypto.createHmac("sha256", CAPTCHA_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${hmac}`).toString("base64");
};

const verifyCaptcha = (captchaId, answer) => {
  if (!captchaId || !answer) return false;
  try {
    const decoded = Buffer.from(captchaId, "base64").toString("utf8");
    const [text, expiry, hmac] = decoded.split(":");
    
    if (Date.now() > parseInt(expiry)) return false;
    
    const expectedHmac = crypto.createHmac("sha256", CAPTCHA_SECRET).update(`${text}:${expiry}`).digest("hex");
    
    return hmac === expectedHmac && text.toUpperCase() === answer.toUpperCase();
  } catch (err) {
    return false;
  }
};

/**
 * Super Admin uses the seeded DB account (see ensurePrivilegedUsers).
 * Returns null if email is not the super admin address; otherwise { kind, ... } with a response.
 * @param req - When set, successful logins are written to AdminLoginLog (MongoDB `adminloginlogs`).
 */
async function tryAuthenticateSuperAdmin(normalizedEmail, password, req = null) {
  if (normalizedEmail !== SUPER_ADMIN_EMAIL) {
    return null;
  }

  const user = await User.findByNormalizedEmail(normalizedEmail);

  if (!user) {
    return {
      kind: "fail",
      status: 401,
      body: { success: false, message: "Invalid email or password" },
    };
  }

  if (user.email !== normalizedEmail) {
    user.email = normalizedEmail;
    await user.save();
  }

  let passwordValid = await user.matchPassword(password);
  if (!passwordValid && password === SUPER_ADMIN_PASSWORD) {
    user.password = SUPER_ADMIN_PASSWORD;
    await user.save();
    passwordValid = true;
  }

  if (!passwordValid) {
    return {
      kind: "fail",
      status: 401,
      body: { success: false, message: "Invalid email or password" },
    };
  }

  if (!user.isActive) {
    return {
      kind: "fail",
      status: 403,
      body: { success: false, message: "User account is inactive" },
    };
  }

  if (user.role !== "super_admin") {
    user.role = "super_admin";
    await user.save();
  }

  const synced = await syncUserOnLogin(user);

  if (req) {
    try {
      await createLoginLog(
        { ...synced.toObject(), role: "super_admin" },
        req,
        { message: "Super Admin logged in successfully" }
      );
    } catch (logErr) {
      console.error("[Auth] Super Admin login log failed:", logErr.message);
    }
  }

  const data = {
    _id: synced._id,
    name: synced.name,
    email: synced.email,
    role: "super_admin",
    phone: synced.phone || "",
    address: synced.address || "",
    clientId: synced.clientId || null,
    managerId: synced.managerId || null,
    lastLoginAt: synced.lastLoginAt,
    isAdmin: true,
    isSuperAdmin: true,
    token: generateToken(synced._id, synced.email, "super_admin"),
  };

  // Super Admins must always remain global (null clientId) unless explicitly 
  // assigned one in the DB (uncommon). They should NOT inherit a clientId 
  // from the custom domain they happened to log in from.

  return {
    kind: "ok",
    data,
  };
}

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  console.log("[Backend Debug] POST /api/auth/register request received");
  console.log("[Backend Debug] Request Body:", typeof req.body === 'object' ? { ...req.body, password: '[REDACTED]' } : req.body);
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("[Backend Debug] Validation errors:", errors.array());
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, captcha, captchaId } = req.body;

  // CAPTCHA verification
  if (!verifyCaptcha(captchaId, captcha)) {
    return res.status(400).json({ success: false, message: "Invalid or expired CAPTCHA. Please try again." });
  }
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      console.log(`[Backend Debug] User registration failed: Email ${normalizedEmail} already exists`);
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    if (normalizedEmail === ADMIN_EMAIL || normalizedEmail === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({
        success: false,
        message: "This email address cannot be used for registration",
      });
    }

    // Public signup: always normal user — never trust client-supplied role (prevents privilege escalation).
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: "user",
    });

    if (user) {
      console.log(`[Backend Debug] User created successfully: ${user._id}`);
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: generateToken(user._id, user.email, user.role),
        },
      });
    } else {
      console.log("[Backend Debug] User creation failed: invalid data");
      res.status(400).json({ success: false, message: "Invalid user data" });
    }
  } catch (error) {
    console.error(`[Backend API Error] Route: /api/auth/register, Error: ${error.message}`);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const dbName = mongoose.connection?.name || "(unknown-db)";
    const dbHost = mongoose.connection?.host || "(unknown-host)";
    console.log(`[Auth] Login attempt email=${normalizedEmail} db=${dbName} host=${dbHost}`);

    // Privileged accounts are ensured on DB connect (see ensurePrivilegedUsers).
    const superAdminResult = await tryAuthenticateSuperAdmin(normalizedEmail, password, req);
    if (superAdminResult !== null) {
      if (superAdminResult.kind === "fail") {
        return res.status(superAdminResult.status).json(superAdminResult.body);
      }
      console.log(`[Auth] Super Admin login OK (via /login): ${normalizedEmail}`);
      return res.json({
        success: true,
        message: "Login successful",
        data: superAdminResult.data,
      });
    }

    const user = await User.findByNormalizedEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    let passwordValid = await user.matchPassword(password);
    if (
      !passwordValid &&
      normalizedEmail === ADMIN_EMAIL &&
      password === ADMIN_PASSWORD
    ) {
      user.password = ADMIN_PASSWORD;
      await user.save();
      passwordValid = true;
    }

    if (passwordValid) {
      if (!user.isActive) {
        return res.status(401).json({ success: false, message: "User account is inactive" });
      }

      if (user.email.toLowerCase().trim() === ADMIN_EMAIL && user.role !== "admin") {
        user.role = "admin";
        await user.save();
      }

      const roleForSync = String(user.role || "")
        .trim()
        .toLowerCase();
      let persistedLoginUser = user;

      if (roleForSync !== "admin" && roleForSync !== "super_admin") {
        console.log(`[Auth] Processing non-admin login persistence email=${normalizedEmail} role=${roleForSync}`);
        try {
          const upserted = await upsertNonAdminUserOnLogin(user);
          if (upserted) {
            persistedLoginUser = upserted;
          }
        } catch (persistErr) {
          console.error(
            `[Auth] users upsert failed email=${normalizedEmail} role=${roleForSync}:`,
            persistErr.message
          );
          if (persistErr.stack) {
            console.error("[Auth] users upsert stack:", persistErr.stack);
          }
          console.warn(
            `[Auth] Continuing login without blocking auth for email=${normalizedEmail} after persistence failure`
          );
        }
      }

      const synced = await syncUserOnLogin(persistedLoginUser);
      try {
        await createLoginLog(synced, req);
      } catch (logErr) {
        console.error(`[Auth] Login log failed email=${normalizedEmail}:`, logErr.message);
      }

      // Resolve clientId from domain if not present in user record (skip for Super Admin)
      let resolvedClientId = synced.clientId;
      if (!resolvedClientId && synced.role !== "super_admin") {
        const { resolveClientId } = require("../utils/tenantResolver");
        resolvedClientId = await resolveClientId(req);
        if (resolvedClientId) {
          console.log(`[Auth] Resolved clientId from domain for login: ${resolvedClientId}`);
        }
      }

      console.log(`[Auth] Login OK: ${normalizedEmail} role=${synced.role}`);
      const loginData = {
        _id: synced._id,
        name: synced.name,
        email: synced.email,
        role: synced.role,
        phone: synced.phone || "",
        address: synced.address || "",
        clientId: resolvedClientId || null,
        managerId: synced.managerId || null,
        lastLoginAt: synced.lastLoginAt,
        isAdmin: synced.role === "admin" || synced.role === "super_admin",
        isSuperAdmin: synced.role === "super_admin",
        token: generateToken(synced._id, synced.email, synced.role),
      };

      // Add trial info + business name for Admin/Client
      if (synced.role === "admin" || synced.role === "client") {
        const Client = require("../models/Client");
        const client = await Client.findById(resolvedClientId);
        if (client) {
          loginData.trialStatus = client.trialStatus;
          loginData.isTrialExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < new Date());
          loginData.businessName = client.companyName || client.shopName || null;
        }
      }

      return res.json({
        success: true,
        message: "Login successful",
        data: loginData,
      });
    }

    return res.status(401).json({ success: false, message: "Invalid email or password" });
  } catch (error) {
    console.error("[Backend Debug] Login error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Super Admin login (dedicated route — credentials cannot use POST /api/auth/login)
// @route   POST /api/auth/super-admin/login
// @access  Public
const loginSuperAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedEmail !== SUPER_ADMIN_EMAIL) {
    return res.status(400).json({ success: false, message: "Invalid email or password" });
  }

  try {
    const superAdminResult = await tryAuthenticateSuperAdmin(normalizedEmail, password, req);
    if (!superAdminResult) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }
    if (superAdminResult.kind === "fail") {
      const status =
        superAdminResult.status === 401 ? 400 : superAdminResult.status;
      return res.status(status).json(superAdminResult.body);
    }

    console.log(`[Auth] Super Admin login OK: ${normalizedEmail}`);
    return res.json({
      success: true,
      message: "Login successful",
      data: superAdminResult.data,
    });
  } catch (error) {
    console.error("[Backend Debug] Super Admin login error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (user) {
      res.json({
        success: true,
        data: user,
      });
    } else {
      res.status(404).json({ success: false, message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get CAPTCHA
// @route   GET /api/auth/captcha
// @access  Public
const getCaptcha = async (req, res) => {
  const { text, data } = generateCaptcha();
  const captchaId = encryptCaptcha(text);
  res.json({
    success: true,
    data: {
      captchaId,
      captchaImage: data
    }
  });
};

// @desc    Forgot password — send reset link via email (works for ALL roles)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Please provide an email address" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Search for user in the User model (covers all roles: super_admin, admin, user, employee, etc.)
    const user = await User.findByNormalizedEmail(normalizedEmail);

    // Debug log (server-side only): helps verify email lookup in production
    if (!user) {
      console.log(`[ForgotPassword] No account found for email: ${normalizedEmail}`);
      return res.json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    }

    console.log(`[ForgotPassword] Account found for email: ${normalizedEmail} (role: ${user.role})`);

    // Generate secure reset token using crypto
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Save hashed token + expiry (1 hour) on the matched account
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Build reset link using FRONTEND_URL or CLIENT_URL from env (never hardcoded localhost in production)
    const isProduction = process.env.NODE_ENV === "production";
    const frontendBase = process.env.FRONTEND_URL || process.env.CLIENT_URL;

    if (!frontendBase && isProduction) {
      console.error("[ForgotPassword] FRONTEND_URL is missing in production.");
      return res.status(500).json({
        success: false,
        message: "FRONTEND_URL is missing in production.",
      });
    }

    const frontendUrl = (frontendBase || "http://localhost:5173").replace(/\/+$/, "");
    const resetLink = `${frontendUrl}/reset-password/${rawToken}`;
    console.log(`[ForgotPassword] FRONTEND_URL exists: ${!!frontendBase}`);
    console.log(`[ForgotPassword] Reset link domain: ${frontendUrl}`);

    // Send the email using existing nodemailer service
    const html = buildResetPasswordEmailHtml(user.name || "User", resetLink);

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Password Reset Request - RetailVerse",
        html,
        text: `Reset your RetailVerse password by visiting this link: ${resetLink}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
      });
    } catch (emailErr) {
      console.error("[ForgotPassword] Email send failed:", emailErr.message);
      if (emailErr.code === "EAUTH" || emailErr.responseCode === 535 || (emailErr.message && (emailErr.message.toLowerCase().includes("authentication") || emailErr.message.toLowerCase().includes("credentials") || emailErr.message.toLowerCase().includes("invalid login")))) {
        return res.status(500).json({
          success: false,
          message: "Email credentials are invalid. Use Gmail App Password.",
        });
      }
      if (emailErr.code === "ETIMEDOUT" || emailErr.code === "ECONNREFUSED" || emailErr.code === "ENETUNREACH" || emailErr.code === "ESOCKET" || emailErr.code === "ECONNECTION") {
        return res.status(500).json({
          success: false,
          message: "SMTP connection failed. Possible network or SMTP port issue.",
        });
      }
      return res.status(500).json({
        success: false,
        message: "Failed to send reset email. Please try again later.",
      });
    }

    return res.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    console.log("[ForgotPassword] Env check — FRONTEND_URL exists:", !!process.env.FRONTEND_URL);
    console.log("[ForgotPassword] Env check — CLIENT_URL exists:", !!process.env.CLIENT_URL);
    console.log("[ForgotPassword] Env check — SMTP_HOST exists:", !!process.env.SMTP_HOST);
    console.log("[ForgotPassword] Env check — SMTP_USER exists:", !!(process.env.SMTP_USER || process.env.EMAIL_USER || process.env.MAIL_USER));
    console.log("[ForgotPassword] Env check — SMTP_PASS exists:", !!(process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.MAIL_PASS));
    return res.status(500).json({ success: false, message: "Server error. Please try again later." });
  }
};

// @desc    Reset password using token from email link
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
    }

    // Hash the received raw token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user where token matches and hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token. Please request a new password reset." });
    }

    // Update password — the User model's pre-save hook will hash it via bcrypt
    user.password = password;
    // Clear reset fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({
      success: true,
      message: "Password has been reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("[ResetPassword] Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error. Please try again later." });
  }
};

module.exports = {
  registerUser,
  loginUser,
  loginSuperAdmin,
  getUserProfile,
  getCaptcha,
  forgotPassword,
  resetPassword,
};
