const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const { 
  submitContact, 
  getContacts, 
  getContactById, 
  updateContactStatus, 
  deleteContact 
} = require("../controllers/contactController");
const { protect, allowRoles } = require("../middleware/authMiddleware");

// Public routes
router.post(
  "/",
  [
    check("firstName", "First name is required").not().isEmpty(),
    check("lastName", "Last name is required").not().isEmpty(),
    check("email", "Please include a valid email").isEmail(),
    check("subject", "Subject is required").not().isEmpty(),
    check("message", "Message is required").not().isEmpty(),
  ],
  submitContact
);

// Protected routes (Admin/Staff/Client)
router.get("/", protect, allowRoles("super_admin", "admin", "staff", "client", "store_manager", "client_admin"), getContacts);
router.get("/:id", protect, allowRoles("super_admin", "admin", "staff", "client", "store_manager", "client_admin"), getContactById);
router.patch("/:id/status", protect, allowRoles("super_admin", "admin", "staff", "client", "store_manager", "client_admin"), updateContactStatus);
router.delete("/:id", protect, allowRoles("super_admin", "admin", "staff", "client", "store_manager", "client_admin"), deleteContact);

module.exports = router;
