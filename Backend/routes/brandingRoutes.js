const express = require("express");
const router = express.Router();
const { getClientBranding } = require("../controllers/clientController");

// Public branding endpoints (no auth required)
router.get("/branding/:clientId", getClientBranding);
router.get("/branding", getClientBranding);

module.exports = router;
