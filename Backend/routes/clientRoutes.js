const express = require("express");
const { check } = require("express-validator");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const { createClient, listClients, deleteClient } = require("../controllers/clientController");

router.post(
  "/",
  protect,
  allowRoles("super_admin"),
  [
    check("companyName", "Company name is required").trim().not().isEmpty(),
    check("gst", "GST is required").trim().not().isEmpty(),
    check("phone", "Phone is required").trim().not().isEmpty(),
    check("phone", "Enter a valid phone number (at least 10 digits)").custom((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      if (digits.length < 10) {
        throw new Error("Enter a valid phone number (at least 10 digits)");
      }
      return true;
    }),
    check("email", "Email is required").trim().not().isEmpty(),
    check("email", "Please enter a valid email").isEmail(),
    check("panNo", "PAN is required").trim().not().isEmpty(),
    check("permanentAddress", "Permanent address is required").trim().not().isEmpty(),
    check("shopName", "Shop name is required").trim().not().isEmpty(),
    check("password", "Login password is required").trim().not().isEmpty(),
    check("password", "Password must be at least 8 characters").isLength({ min: 8 }),
  ],
  createClient
);

/**
 * @route   GET /api/clients/available
 * @desc    Returns a minimal list of stores (id + display name) for the store-selector UI.
 *          Accessible to all authenticated roles including user/customer.
 */
router.get(
  "/available",
  protect,
  allowRoles("super_admin", "admin", "client", "client_admin", "store_manager", "employee", "staff", "user", "customer"),
  async (req, res) => {
    try {
      const Client = require("../models/Client");
      const stores = await Client.find({})
        .select("_id companyName shopName logo brandingName")
        .sort({ companyName: 1 })
        .lean();
      const data = stores.map((s) => ({
        id: String(s._id),
        name: s.shopName || s.brandingName || s.companyName || "Unnamed Store",
        logo: s.logo || null,
      }));
      return res.json({ success: true, data });
    } catch (err) {
      console.error("[ClientRoutes] /available error:", err.message);
      return res.status(500).json({ success: false, message: "Failed to load available stores." });
    }
  }
);

router.get("/", protect, allowRoles("super_admin", "admin"), listClients);

router.delete("/:id", protect, allowRoles("super_admin"), deleteClient);

module.exports = router;
