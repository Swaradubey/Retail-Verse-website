const express = require("express");
const router = express.Router();
const { 
  getQuotes, 
  getQuoteById, 
  createQuote,
  sendCounterOffer,
  acceptQuote,
  rejectQuote,
  convertToInvoice,
  deleteQuote,
} = require("../controllers/quoteController");
const { protect, allowRoles } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// All quote routes must be protected
router.use(protect);

// Get and create quotes
router.route("/")
  .get(tenantMiddleware, getQuotes)
  .post(tenantMiddleware, createQuote);

router.route("/:id")
  .get(tenantMiddleware, getQuoteById)
  .delete(allowRoles("super_admin", "admin", "client", "store_manager"), tenantMiddleware, deleteQuote);

// Bargaining actions
router.patch("/:id/counter", allowRoles("super_admin", "admin", "client", "store_manager"), tenantMiddleware, sendCounterOffer);
router.patch("/:id/accept", tenantMiddleware, acceptQuote);
router.patch("/:id/reject", tenantMiddleware, rejectQuote);

// Conversion
router.post("/:id/convert-to-invoice", allowRoles("super_admin", "admin", "client"), tenantMiddleware, convertToInvoice);

module.exports = router;

