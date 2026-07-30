const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");

const logosDir = path.resolve(__dirname, "../uploads/logos");
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const uid = req.user ? (req.user._id || req.user.id) : "user";
    const safeName = `logo-${uid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    cb(null, safeName);
  },
});

const uploadLogoMiddleware = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Only PNG, JPG, WEBP, and SVG are accepted."));
    }
  },
});

const PROFILE_PHOTO_MAX_LENGTH = 600_000;
const {
  getSettings,
  updateSettings,
  resetSettings,
  updateProfile,
  updateStore,
  updateNotifications,
  updateSecurity,
  updateBilling,
  uploadLogo,
} = require("../controllers/settingsController");

router.get("/", protect, getSettings);
router.put("/", protect, updateSettings);
router.delete("/reset", protect, resetSettings);

router.post("/logo", protect, (req, res, next) => {
  uploadLogoMiddleware.single("logo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: "File size exceeds maximum limit of 2 MB." });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, uploadLogo);

router.put(
  "/profile",
  protect,
  [
    body("fullName").optional().trim().notEmpty().withMessage("Full name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email required"),
    body("username").optional().isString(),
    body("countryOrRegion").optional().isString(),
    body("bio").optional().isString().isLength({ max: 5000 }),
    body("profilePhoto").optional().isString().isLength({ max: PROFILE_PHOTO_MAX_LENGTH }),
  ],
  updateProfile
);

router.put(
  "/store",
  protect,
  [
    body("storeName").optional().isString(),
    body("storeEmail").optional().isString(),
    body("storePhone").optional().isString(),
    body("storeAddress").optional().isString(),
    body("currency").optional().isString(),
    body("timezone").optional().isString(),
    body("taxRate")
      .optional()
      .custom((v) => {
        const n = Number(v);
        return !Number.isNaN(n) && n >= 0 && n <= 100;
      })
      .withMessage("taxRate must be between 0 and 100"),
    body("language").optional().isString(),
    body("logoUrl")
      .optional({ nullable: true, checkFalsy: false })
      .isString()
      .withMessage("logoUrl must be a string or null"),
  ],
  updateStore
);

router.put("/notifications", protect, updateNotifications);

router.put(
  "/security",
  protect,
  [
    body("twoFactorEnabled").optional().isBoolean(),
    body("loginAlerts").optional().isBoolean(),
    body("sessionTimeout").optional().isInt({ min: 5, max: 1440 }),
    body("allowedDevices").optional().isInt({ min: 1, max: 100 }),
    body("currentPassword").optional().isString(),
    body("newPassword").optional().isString(),
    body("confirmPassword").optional().isString(),
  ],
  updateSecurity
);

router.put(
  "/billing",
  protect,
  [
    body("currentPlan").optional().isString(),
    body("billingEmail").optional().isString(),
    body("billingAddress").optional().isString(),
    body("autoRenew").optional().isBoolean(),
    body("paymentMethodLast4").optional().isString(),
    body("subscriptionStatus").optional().isString(),
  ],
  updateBilling
);

module.exports = router;
