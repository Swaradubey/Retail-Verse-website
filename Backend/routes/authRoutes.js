const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const {
  registerUser,
  loginUser,
  loginSuperAdmin,
  getUserProfile,
  getCaptcha,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Get CAPTCHA
router.get("/captcha", getCaptcha);

// Register route with validation
router.post(
  "/register",
  [
    check("name", "Name is required").not().isEmpty().trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters long"),
    check("email", "Please include a valid email").isEmail().normalizeEmail(),
    check("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/[A-Z]/)
      .withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number")
      .matches(/[!@#$%^&*(),.?":{}|<>]/)
      .withMessage("Password must contain at least one special character"),
    check("confirmPassword", "Passwords must match")
      .exists()
      .custom((value, { req }) => value === req.body.password),
    check("captcha", "CAPTCHA is required").not().isEmpty(),
    check("captchaId", "CAPTCHA ID is required").not().isEmpty(),
  ],
  registerUser
);

// Login route with validation
router.post(
  "/login",
  [
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password is required").exists(),
  ],
  loginUser
);

// Super Admin login — only accepts the seeded super admin account (see ensurePrivilegedUsers)
router.post(
  "/super-admin/login",
  [
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password is required").exists(),
  ],
  loginSuperAdmin
);

// Profile route - protected
router.get("/profile", protect, getUserProfile);

// Forgot password
router.post(
  "/forgot-password",
  [check("email", "Please include a valid email").isEmail()],
  forgotPassword
);

// Reset password
router.post("/reset-password/:token", resetPassword);

module.exports = router;