
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

const path = require("path");

const envPath = path.resolve(__dirname, ".env");
const envLoad = require("dotenv").config({ path: envPath });
if (envLoad.error) {
  console.warn(`[env] dotenv could not read ${envPath}: ${envLoad.error.message}`);
} else {
  console.log(`[env] Loaded ${envPath}`);
}

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const tenantMiddleware = require("./middleware/tenantMiddleware");
const passport = require("./config/passport");
const generateToken = require("./utils/generateToken");

const app = express();

// Middleware
const allowedOrigins = [
  // ── Production custom domains ─────────────────────────────────────────────
  "https://www.daizyhome.com",
  "https://daizyhome.com",
  "https://cartvio.biz",
  "https://www.cartvio.biz",
  // ── Other production domains ──────────────────────────────────────────────
  "https://storesetgo.online",
  "https://www.storesetgo.online",
  "https://retailverse.in",
  "https://www.retailverse.in",
  "https://retail-verse-website-bj2s.vercel.app",
  "https://retail-verse-website-bj2s-a8ccy75yo-swaradubeys-projects.vercel.app",
  // ── Local development ─────────────────────────────────────────────────────
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "http://localhost:4173",
];

// Add environment variable origin(s) if they exist
if (process.env.CLIENT_ORIGIN) {
  const envOrigins = process.env.CLIENT_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
  allowedOrigins.push(...envOrigins);
}
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.trim());
}

app.use(cors({
  origin: async function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests

    // Check statically allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;

      // Allow any subdomain of storesetgo.online and any .vercel.app domain
      if (hostname.endsWith('.storesetgo.online') || hostname.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // Dynamic Custom Domain Check from Database
      if (require("mongoose").connection.readyState === 1) {
        const CustomDomain = require("./models/CustomDomain");

        // Normalize hostname for lookup (remove www.)
        const normalized = hostname.toLowerCase().replace(/^www\./, "");

        const customDomain = await CustomDomain.findOne({
          $or: [
            { domainName: normalized },
            { domainName: `www.${normalized}` },
            { domain: normalized },
            { domain: `www.${normalized}` }
          ]
        });

        if (customDomain) {
          return callback(null, true);
        }
      }
    } catch (err) {
      console.error("[CORS] Error checking origin:", err.message);
    }

    console.error("[CORS] Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-client-id", "x-client-domain", "x-client-origin"]
}));

// Handle OPTIONS preflight requests for all routes
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Session middleware (required for Passport OAuth flow)
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || "google-oauth-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 5 * 60 * 1000, // 5 minutes — only needed during OAuth handshake
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Attach tenant resolution globally before any routes
// app.use(tenantMiddleware); // Disabled global use to follow strict middleware ordering for sensitive routes

// Routes
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminLoginRoutes = require("./routes/adminLoginRoutes");
const userRoutes = require("./routes/userRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const inboxRoutes = require("./routes/inboxRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const adminRoutes = require("./routes/adminRoutes");
const trackOrderRoutes = require("./routes/trackOrderRoutes");
const clientRoutes = require("./routes/clientRoutes");
const clientPaymentSettingsRoutes = require("./routes/clientPaymentSettingsRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const storeManagerRoutes = require("./routes/storeManagerRoutes");
const superadminRoutes = require("./routes/superadminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const helpCenterRoutes = require("./routes/helpCenterRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const supportTicketRoutes = require("./routes/supportTicketRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const quoteRoutes = require("./routes/quoteRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const shiprocketService = require("./services/shiprocketService");

const customDomainRoutes = require("./routes/customDomainRoutes");
const brandingRoutes = require("./routes/brandingRoutes");
const themeRoutes = require("./routes/themeRoutes");
const voiceOrderRoutes = require("./routes/voiceOrderRoutes");

console.log("[Backend Debug] Mounting API routes...");
app.use("/api/auth", authRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/custom-domains", customDomainRoutes);
app.use("/api/users", userRoutes);
app.use("/api/user", userRoutes); // Alias for frontend singular use cases
app.use("/api/settings", settingsRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/track-orders", trackOrderRoutes);
app.use("/api/admin-login", adminLoginRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/client", clientPaymentSettingsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/store-managers", storeManagerRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/help-center", helpCenterRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/razorpay", paymentRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/support/tickets", supportTicketRoutes); // Alias as per request
app.use("/api/invoices", invoiceRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/public", brandingRoutes);
app.use("/api/themes", themeRoutes);
app.use("/api/voice-orders", voiceOrderRoutes);

// Health route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// ── Google OAuth Routes ─────────────────────────────────────────────────────
const googleOAuthEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

app.get("/auth/google", (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.status(503).json({ success: false, message: "Google Sign-In is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env" });
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback", (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.status(503).json({ success: false, message: "Google Sign-In is not configured." });
  }
  passport.authenticate("google", { failureRedirect: "/auth/google/failure" })(req, res, (err) => {
    if (err) {
      console.error("[Google OAuth] Passport authenticate error:", err.message);
      return next(err);
    }
    // Success handler below
    try {
      const user = req.user;
      const frontendUrl = process.env.FRONTEND_URL || "https://www.retailverse.in";

      console.log(`[Google OAuth Debug] FRONTEND_URL: ${frontendUrl}`);

      if (!user) {
        console.error("[Google OAuth] No user after callback");
        return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      }

      // Create JWT using the same method as existing login system
      const token = generateToken(user._id, user.email, user.role);
      console.log(`[Google OAuth Debug] Token generated: ${!!token}`);

      // Update lastLoginAt
      user.lastLoginAt = new Date();
      user.save().catch((err) => console.error("[Google OAuth] Failed to update lastLoginAt:", err.message));

      const params = new URLSearchParams({
        token,
        name: user.name || "",
        email: user.email || "",
        role: user.role || "user",
        id: String(user._id),
        ...(user.clientId ? { clientId: String(user.clientId) } : {}),
      });

      const finalRedirectUrl = `${frontendUrl}/google-auth-callback?${params.toString()}`;
      console.log("GOOGLE_FINAL_REDIRECT_URL:", finalRedirectUrl.split("token=")[0] + "token=[REDACTED]");

      // Redirect to a dedicated callback route — frontend handles the token/params
      return res.redirect(finalRedirectUrl);
    } catch (err) {
      console.error("[Google OAuth] Callback error:", err.message);
      const frontendUrl = process.env.FRONTEND_URL || "https://www.retailverse.in";
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  });
});

app.get("/auth/google/failure", (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://www.retailverse.in";
  res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect before listening so Atlas/network errors fail fast with clear logs
(async () => {
  try {
    console.log("[Backend Debug] Connecting to MongoDB...");
    await connectDB();
    console.log("[Backend Debug] MongoDB Connected successfully.");

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n================================================`);
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`================================================\n`);

      const sr = shiprocketService.getShiprocketEnvDiagnostics();
      if (sr.configuredForTracking) {
        console.log("[Shiprocket] API credentials loaded — courier tracking enabled.");
      } else {
        console.warn(
          `[Shiprocket] Courier tracking disabled: set ${sr.missingAuthEnv.join(", ")} in .env`
        );
      }

      // ── SMTP / Email diagnostics ──────────────────────────────────────────
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpPort = process.env.SMTP_PORT || "587";
      if (smtpHost && smtpUser && smtpPass) {
        console.log(`[SMTP] Email service configured — host=${smtpHost}, port=${smtpPort}, user=${smtpUser}`);

        // Verify SMTP connection on startup
        const { getTransporter } = require("./utils/emailService");
        try {
          const transporter = getTransporter();
          transporter.verify((verifyErr, success) => {
            if (verifyErr) {
              console.error("[SMTP] Connection verification FAILED:", verifyErr.message);
            } else {
              console.log("[SMTP] Server is ready to send emails");
            }
          });
        } catch (smtpErr) {
          if (smtpErr.code === "EMISSINGCONFIG") {
            console.warn(`[SMTP] ${smtpErr.message}`);
          } else {
            console.error("[SMTP] Failed to create transporter:", smtpErr.message);
          }
        }
      } else {
        const missing = [];
        if (!smtpHost) missing.push("SMTP_HOST");
        if (!smtpUser) missing.push("SMTP_USER");
        if (!smtpPass) missing.push("SMTP_PASS");
        console.warn(`[SMTP] Email service NOT configured — missing env vars: ${missing.join(", ")}`);
      }

      // ── AI Voice Order diagnostics ─────────────────────────────────────────
      const aiTxProvider = process.env.AI_TRANSCRIPTION_PROVIDER || "openai";
      const aiExtProvider = process.env.AI_ORDER_EXTRACTION_PROVIDER || "openai";
      const geminiKey = process.env.GEMINI_API_KEY?.trim();
      console.log("[AI Voice] Transcription provider:", aiTxProvider);
      console.log("[AI Voice] Extraction provider:", aiExtProvider);
      console.log("[AI Voice] Gemini API key configured:", !!geminiKey);
      console.log("[AI Voice] Gemini transcription model:", process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash");
      console.log("[AI Voice] Gemini order extraction model:", process.env.GEMINI_ORDER_MODEL || "gemini-2.5-flash");

      if ((aiTxProvider === "gemini" || aiExtProvider === "gemini") && !geminiKey) {
        console.warn("[AI Voice] WARNING: GEMINI_API_KEY is missing from the backend environment. Gemini features will not work.");
      }
    });

    // Handle server-level errors
    server.on('error', (error) => {
      console.error("[CRITICAL] Server failed to start or encountered an error:");
      console.error(error);
      process.exit(1);
    });

  } catch (error) {
    console.error("[CRITICAL] Failed to initialize backend:");
    console.error(error);
    process.exit(1);
  }
})();

// Safety Net for unhandled errors
process.on("unhandledRejection", (err) => {
  console.error(`[CRITICAL] Unhandled Rejection: ${err.message}`);
  console.error(err.stack);
  // Do not exit in dev, but log it clearly
});

process.on("uncaughtException", (err) => {
  console.error(`[CRITICAL] Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});