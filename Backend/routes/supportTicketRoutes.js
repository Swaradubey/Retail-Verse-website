const express = require("express");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const {
  createSupportTicket,
  getMyTickets,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
  deleteTicket,
  createZendeskTicket,
  getZendeskTickets,
  getZendeskStats,
  getMyTicketStats,
  getZendeskTicketComments,
  addZendeskTicketComment,
} = require("../controllers/supportTicketController");

const tenantMiddleware = require("../middleware/tenantMiddleware");

// All routes require authentication
router.use(protect, tenantMiddleware);

// ── User routes ───────────────────────────────────────────────────────────────

// POST /api/support-tickets          — create ticket (any logged-in user)
router.post(
  "/",
  allowRoles(
    "user",
    "customer",
    "admin",
    "super_admin",
    "staff",
    "inventory_manager",
    "cashier",
    "seo_manager",
    "client",
    "store_manager",
    "employee"
  ),
  createSupportTicket
);

// GET /api/support-tickets/my        — my own tickets
router.get(
  "/my",
  allowRoles(
    "user",
    "customer",
    "admin",
    "super_admin",
    "staff",
    "inventory_manager",
    "cashier",
    "seo_manager",
    "client",
    "store_manager",
    "employee"
  ),
  getMyTickets
);

// GET /api/support-tickets/my/stats  — my own ticket stats
router.get(
  "/my/stats",
  allowRoles(
    "user",
    "customer",
    "admin",
    "super_admin",
    "staff",
    "inventory_manager",
    "cashier",
    "seo_manager",
    "client",
    "store_manager",
    "employee"
  ),
  getMyTicketStats
);

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET /api/support-tickets/admin     — all tickets (admin/super_admin/client)
router.get(
  "/admin",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  getAllTickets
);

// ── Admin Zendesk routes ─────────────────────────────────────────────────────
// Order matters: specific paths before generic params

// GET /api/support-tickets/stats — Zendesk Stats
router.get(
  "/stats",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  getZendeskStats
);

// GET /api/support-tickets/zendesk — List Zendesk Tickets
router.get(
  "/zendesk",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  getZendeskTickets
);

// POST /api/support-tickets/zendesk — Create Zendesk Ticket
router.post(
  "/zendesk",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  createZendeskTicket
);

// GET/POST /api/support-tickets/zendesk/:id/comments — Chat messages
router.get(
  "/zendesk/:id/comments",
  allowRoles(
    "admin",
    "super_admin",
    "user",
    "customer",
    "staff",
    "inventory_manager",
    "cashier",
    "seo_manager",
    "client",
    "store_manager",
    "employee"
  ),
  getZendeskTicketComments
);

router.post(
  "/zendesk/:id/comments",
  allowRoles(
    "admin",
    "super_admin",
    "user",
    "customer",
    "staff",
    "inventory_manager",
    "cashier",
    "seo_manager",
    "client",
    "store_manager",
    "employee"
  ),
  addZendeskTicketComment
);

// ── Admin System Ticket routes ───────────────────────────────────────────────

// GET /api/support-tickets/admin — all system tickets
router.get(
  "/admin",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  getAllTickets
);

// PATCH /api/support-tickets/:id/status — update system ticket status
router.patch(
  "/:id/status",
  allowRoles("admin", "super_admin", "client", "store_manager"),
  updateTicketStatus
);


// DELETE /api/support-tickets/:id — delete ticket (admin / super_admin only)
router.delete(
  "/:id",
  allowRoles("admin", "super_admin"),
  deleteTicket
);

// GET /api/support-tickets/:id       — single ticket (owner or admin)
router.get("/:id", getTicketById);

module.exports = router;
