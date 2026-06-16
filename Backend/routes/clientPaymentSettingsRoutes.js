const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const { protect, allowRoles } = require("../middleware/authMiddleware");
const Client = require("../models/Client");
const ClientRazorpayConfig = require("../models/ClientRazorpayConfig");
const { encrypt, decrypt } = require("../utils/encryption");
const Razorpay = require("razorpay");

/**
 * Helper to resolve clientId for the logged-in user
 */
async function getClientForUser(user) {
  if (user.clientId) return user.clientId;
  
  // If user doesn't have a direct clientId but is client or admin,
  // find a Client document they own or the first one in the system.
  const ownedClient = await Client.findOne({ userId: user._id });
  if (ownedClient) return ownedClient._id;

  const anyClient = await Client.findOne();
  if (anyClient) return anyClient._id;

  return null;
}

// @desc    Get client-specific Razorpay configuration
// @route   GET /api/client/payment-settings/razorpay
// @access  Private (Client/Admin)
router.get(
  "/payment-settings/razorpay",
  protect,
  allowRoles("client", "admin", "super_admin"),
  async (req, res) => {
    try {
      const clientId = await getClientForUser(req.user);
      if (!clientId) {
        return res.status(404).json({
          success: false,
          message: "No Client profile found associated with this user. Payment settings cannot be configured.",
        });
      }

      let config = await ClientRazorpayConfig.findOne({ clientId });
      if (!config) {
        // Return default empty config if it doesn't exist yet
        return res.status(200).json({
          success: true,
          data: {
            razorpayEnabled: false,
            razorpayKeyId: "",
            razorpayKeySecret: "",
            webhookSecret: "",
            isConnected: false,
          },
        });
      }

      res.status(200).json({
        success: true,
        data: {
          razorpayEnabled: config.razorpayEnabled,
          razorpayKeyId: config.razorpayKeyId || "",
          razorpayKeySecret: config.razorpayKeySecretEncrypted ? "********" : "",
          webhookSecret: config.webhookSecretEncrypted ? "********" : "",
          isConnected: config.isConnected,
        },
      });
    } catch (error) {
      console.error("[GET CLIENT RAZORPAY CONFIG ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve Razorpay settings.",
        error: error.message,
      });
    }
  }
);

// @desc    Save/Update client-specific Razorpay configuration
// @route   POST /api/client/payment-settings/razorpay
// @access  Private (Client/Admin)
router.post(
  "/payment-settings/razorpay",
  protect,
  allowRoles("client", "admin", "super_admin"),
  [
    check("razorpayEnabled").isBoolean().withMessage("Enable toggle must be a boolean"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const clientId = await getClientForUser(req.user);
      if (!clientId) {
        return res.status(404).json({
          success: false,
          message: "No Client profile found associated with this user.",
        });
      }

      const {
        razorpayEnabled,
        razorpayKeyId,
        razorpayKeySecret,
        webhookSecret,
      } = req.body;

      // Validation
      if (razorpayEnabled) {
        if (!razorpayKeyId || typeof razorpayKeyId !== "string" || !razorpayKeyId.trim()) {
          return res.status(400).json({
            success: false,
            message: "Razorpay Key ID is required when Razorpay is enabled.",
          });
        }
      }

      let config = await ClientRazorpayConfig.findOne({ clientId });

      // If Razorpay is enabled, verify we have a secret saved or provided
      if (razorpayEnabled) {
        const hasSavedSecret = config && config.razorpayKeySecretEncrypted;
        const providesNewSecret = razorpayKeySecret && razorpayKeySecret !== "********";
        
        if (!hasSavedSecret && !providesNewSecret) {
          return res.status(400).json({
            success: false,
            message: "Razorpay Key Secret is required when enabling integration.",
          });
        }
      }

      if (!config) {
        config = new ClientRazorpayConfig({ clientId });
      }

      config.razorpayEnabled = razorpayEnabled;
      if (razorpayKeyId !== undefined) {
        config.razorpayKeyId = razorpayKeyId.trim();
      }

      // Handle Key Secret encryption
      if (razorpayKeySecret !== undefined && razorpayKeySecret.trim() !== "") {
        if (razorpayKeySecret !== "********") {
          config.razorpayKeySecretEncrypted = encrypt(razorpayKeySecret.trim());
        }
      } else {
        config.razorpayKeySecretEncrypted = "";
      }

      // Handle Webhook Secret encryption
      if (webhookSecret !== undefined) {
        if (webhookSecret.trim() === "") {
          config.webhookSecretEncrypted = "";
        } else if (webhookSecret !== "********") {
          config.webhookSecretEncrypted = encrypt(webhookSecret.trim());
        }
      }

      await config.save();

      res.status(200).json({
        success: true,
        message: "Razorpay configuration saved successfully.",
        data: {
          razorpayEnabled: config.razorpayEnabled,
          razorpayKeyId: config.razorpayKeyId || "",
          razorpayKeySecret: config.razorpayKeySecretEncrypted ? "********" : "",
          webhookSecret: config.webhookSecretEncrypted ? "********" : "",
          isConnected: config.isConnected,
        },
      });
    } catch (error) {
      console.error("[SAVE CLIENT RAZORPAY CONFIG ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save Razorpay settings.",
        error: error.message,
      });
    }
  }
);

// @desc    Test client-specific Razorpay credentials
// @route   POST /api/client/payment-settings/razorpay/test
// @access  Private (Client/Admin)
router.post(
  "/payment-settings/razorpay/test",
  protect,
  allowRoles("client", "admin", "super_admin"),
  async (req, res) => {
    try {
      const clientId = await getClientForUser(req.user);
      if (!clientId) {
        return res.status(404).json({
          success: false,
          message: "No Client profile found associated with this user.",
        });
      }

      let { razorpayKeyId, razorpayKeySecret } = req.body;

      if (!razorpayKeyId || !razorpayKeyId.trim()) {
        return res.status(400).json({
          success: false,
          message: "Razorpay Key ID is required to test connection.",
        });
      }

      // If masked value is passed, load from DB
      if (razorpayKeySecret === "********") {
        const config = await ClientRazorpayConfig.findOne({ clientId });
        if (config && config.razorpayKeySecretEncrypted) {
          razorpayKeySecret = decrypt(config.razorpayKeySecretEncrypted);
        } else {
          return res.status(400).json({
            success: false,
            message: "No saved secret found to test with.",
          });
        }
      }

      if (!razorpayKeySecret || !razorpayKeySecret.trim()) {
        return res.status(400).json({
          success: false,
          message: "Razorpay Key Secret is required to test connection.",
        });
      }

      console.log(`[RAZORPAY TEST] Testing connection for Key ID: ${razorpayKeyId.trim()}`);

      // Attempt to instantiate and hit Razorpay endpoint
      const instance = new Razorpay({
        key_id: razorpayKeyId.trim(),
        key_secret: razorpayKeySecret.trim(),
      });

      // Call payments list with limit 1 (neutral read-only test)
      try {
        await instance.payments.all({ count: 1 });
      } catch (rzpErr) {
        console.error("[RAZORPAY TEST API ERROR]:", rzpErr);
        
        // Update connection status in DB to false
        await ClientRazorpayConfig.findOneAndUpdate(
          { clientId },
          { isConnected: false }
        );

        return res.status(400).json({
          success: false,
          message: `Connection test failed: ${rzpErr.description || rzpErr.message || "Invalid credentials"}`,
        });
      }

      // Update connection status in DB to true
      await ClientRazorpayConfig.findOneAndUpdate(
        { clientId },
        { isConnected: true }
      );

      res.status(200).json({
        success: true,
        message: "Razorpay connection test succeeded!",
      });
    } catch (error) {
      console.error("[TEST CLIENT RAZORPAY CONFIG ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Failed to run connection test.",
        error: error.message,
      });
    }
  }
);

module.exports = router;
