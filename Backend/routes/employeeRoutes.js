const express = require("express");
const { check } = require("express-validator");
const { protect, allowRoles } = require("../middleware/authMiddleware");
const {
  createEmployee,
  listEmployees,
  getEmployeesByClientId,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employeeController");

const router = express.Router();

const phoneValidator = check("phone")
  .optional({ checkFalsy: true })
  .trim()
  .custom((value) => {
    if (!value) return true;
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 10) {
      throw new Error("Enter a valid phone number (at least 10 digits)");
    }
    return true;
  });

const createValidators = [
    
  check("name", "Name is required").trim().notEmpty(),
  check("email", "Email is required").trim().notEmpty().isEmail().withMessage("Please enter a valid email"),
  phoneValidator,
  check("address").optional({ checkFalsy: true }).trim(),
  check("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  check("clientId")
    .optional()
    .trim(),
  check("managerId").optional().trim(),
  check("shopName").optional().trim(),
  check("role")
    .optional()
    .trim()
    .customSanitizer((value) => {
      const s = String(value || "").trim();
      if (s.toUpperCase() === "VENDOR") return "VENDOR";
      return s.toLowerCase().replace(/\s+/g, "_");
    })
    .isIn([
      "employee",
      "staff",
      "seo_manager",
      "store_manager",
      "manager",
      "inventory_manager",
      "counter_manager",
      "user",
      "viewer",
      "admin",
      "super_admin",
      "vendor",
      "VENDOR",
    ])
    .withMessage("Role must be one of: employee, staff, seo_manager, store_manager, manager, inventory_manager, counter_manager, user, viewer, admin, super_admin, VENDOR"),
  check("vendorRef").optional().trim(),
];

const updatePhoneOptional = check("phone")
  .optional({ checkFalsy: true })
  .trim()
  .custom((value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length < 10) {
      throw new Error("Enter a valid phone number (at least 10 digits)");
    }
    return true;
  });

const updateValidators = [
  check("name").optional().trim().notEmpty(),
  updatePhoneOptional,
  check("address").optional().trim().notEmpty(),
  check("shopName").optional().trim(),
  check("status").optional().isIn(["active", "inactive"]),
  check("managerId").optional().trim(),
];

router.post("/", protect, allowRoles("super_admin", "admin", "client", "employee"), createValidators, createEmployee);

router.get("/", protect, allowRoles("super_admin", "client", "employee"), listEmployees);

router.get(
  "/client/:clientId",
  protect,
  allowRoles("super_admin", "client"),
  getEmployeesByClientId
);

router.get("/:id", protect, allowRoles("super_admin", "client"), getEmployeeById);

router.put(
  "/:id",
  protect,
  allowRoles("super_admin", "client"),
  updateValidators,
  updateEmployee
);

router.delete("/:id", protect, allowRoles("super_admin", "client"), deleteEmployee);

module.exports = router;
