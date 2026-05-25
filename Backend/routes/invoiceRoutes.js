const express = require("express");
const router = express.Router();
const { getInvoices, getInvoiceById, sendInvoiceEmail, sendInvoiceSMS, deleteInvoice } = require("../controllers/invoiceController");
const { protect, allowRoles } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

// All invoice routes must be protected and restricted to SuperAdmins, Admins, and Clients
router.use(protect, allowRoles("super_admin", "admin", "client", "store_manager", "client_admin"), tenantMiddleware);

router.route("/").get(getInvoices);
router.route("/send-email").post(sendInvoiceEmail);
router.route("/send-sms").post(sendInvoiceSMS);
router.route("/:id")
  .get(getInvoiceById)
  .delete(deleteInvoice);


module.exports = router;
