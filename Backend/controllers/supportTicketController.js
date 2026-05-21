const SupportTicket = require("../models/SupportTicket");
const Order = require("../models/Order");
const ZendeskService = require("../services/zendeskService");
const { normalizeRole } = require("../utils/clientScopedRoles");

const ALLOWED_USER_ROLES = new Set([
  "user",
  "customer",
  "admin",
  "staff",
  "inventory_manager",
  "cashier",
  "seo_manager",
  "client",
  "store_manager",
  "employee",
]);

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

// ─── Helper ───────────────────────────────────────────────────────────────────

function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return ADMIN_ROLES.has(normalized);
}

const checkTicketAccess = async (ticket, user, resolvedClientId) => {
  if (!ticket || !user) {
    console.log(`[SupportTicket - checkTicketAccess] Denied: Ticket (${!!ticket}) or User (${!!user}) is null`);
    return false;
  }
  
  const userId = String(user._id);
  const userEmail = String(user.email || '').toLowerCase().trim();
  const userRole = String(user.role || '').toLowerCase();
  
  const isSuperAdmin = ["super_admin", "superadmin"].includes(userRole);
  const isAdmin = ["admin"].includes(userRole) || isAdminRole(user.role);
  
  // SuperAdmin and Global Admin can access all tickets
  if (isSuperAdmin) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: SuperAdmin user ${userId}`);
    return true;
  }
  
  const ticketClientId = ticket.clientId ? String(ticket.clientId) : null;
  const userClientId = user.clientId ? String(user.clientId) : (resolvedClientId ? String(resolvedClientId) : null);
  
  // If global admin and ticket has no clientId or we are global scope
  if (isAdmin && !userClientId) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: Global Admin user ${userId}`);
    return true;
  }
  
  // If admin/client/staff/employee of the same tenant
  const isTenantRole = ["client", "store_manager", "client_admin", "staff", "inventory_manager", "cashier", "seo_manager", "employee"].includes(userRole);
  if (isTenantRole && ticketClientId && userClientId && ticketClientId === userClientId) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: Tenant scoped role (${userRole}) for client ${userClientId}`);
    return true;
  }
  
  // Admin checking client scoping (if creator belongs to same client)
  if (isAdmin || userRole === "client" || userRole === "store_manager") {
    const creatorId = ticket.user?._id || ticket.user;
    if (creatorId) {
      const User = require("../models/User");
      const ticketCreator = await User.findById(creatorId).select("clientId").lean();
      const creatorClientId = ticketCreator?.clientId ? String(ticketCreator.clientId) : null;
      if (userClientId && creatorClientId === userClientId) {
        console.log(`[SupportTicket - checkTicketAccess] Allowed: Creator belongs to same client ${userClientId}`);
        return true;
      }
    }
  }

  // Invoice ticket specific fallback: if it's an invoice support ticket, admins of all kinds should have access
  const isInvoiceTicket = ticket.issueType === 'order_support' || (ticket.subject && ticket.subject.startsWith('Invoice Receipt'));
  if (isInvoiceTicket && (isAdmin || userRole === "client" || userRole === "store_manager")) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: Admin/Client accessing Invoice Ticket`);
    return true;
  }

  // Client should be allowed to open ticket (Step 6)
  const userClientIds = [
    user.clientId ? String(user.clientId) : null,
    resolvedClientId ? String(resolvedClientId) : null
  ].filter(Boolean);

  const tClientId = ticket.clientId ? String(ticket.clientId) : null;
  const tTenantId = ticket.tenantId ? String(ticket.tenantId) : null;
  const tCreatedBy = ticket.createdBy ? String(ticket.createdBy) : null;
  const tUserId = ticket.userId ? String(ticket.userId) : null;

  const allowedByClientRule = 
    (tClientId && userClientIds.includes(tClientId)) ||
    (tTenantId && userClientIds.includes(tTenantId)) ||
    (tCreatedBy === userId) ||
    (tUserId === userId);

  if (allowedByClientRule) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: Explicit Client ownership rule match for user ${userId}`);
    return true;
  }
  
  // Check ownership
  const isOwner = 
    String(ticket.user?._id || ticket.user || '') === userId ||
    String(ticket.userId || '') === userId ||
    String(ticket.createdBy || '') === userId ||
    (ticket.userEmail && String(ticket.userEmail).toLowerCase().trim() === userEmail) ||
    (ticket.customerEmail && String(ticket.customerEmail).toLowerCase().trim() === userEmail);
    
  if (isOwner) {
    console.log(`[SupportTicket - checkTicketAccess] Allowed: Owner user ${userId} / ${userEmail}`);
    return true;
  }
  
  console.log(`[SupportTicket - checkTicketAccess] Denied: User ${userId} has no access to ticket ${ticket._id || ticket.zendeskTicketId}`);
  return false;
};

// ─── POST /api/support-tickets ───────────────────────────────────────────────
// @desc    Create a support ticket (authenticated user only)
// @access  Private (any logged-in user with a dashboard role)
const createSupportTicket = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { subject, issueType, description, orderId, priority } = req.body;

    // Validate required fields
    const errors = [];
    if (!subject || !String(subject).trim()) errors.push("Subject is required");
    if (!issueType || !String(issueType).trim()) errors.push("Issue type is required");
    if (!description || !String(description).trim()) errors.push("Description is required");
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(". ") });
    }

    // Resolve optional order — must belong to the requesting user
    let orderRef = null;
    let orderDoc = null;
    if (orderId && String(orderId).trim()) {
      orderDoc = await Order.findOne({
        _id: orderId,
        user: userId,
      }).select("_id orderId").lean();

      if (!orderDoc) {
        return res.status(404).json({
          success: false,
          message: "Order not found or does not belong to your account",
        });
      }
      orderRef = orderDoc.orderId || null;
    }

    // Attempt to create a Zendesk ticket if integrated
    let zendeskTicketId = null;
    try {
      const zdTicket = await ZendeskService.createTicket({
        subject: String(subject).trim(),
        description: String(description).trim(),
        name: req.user.name || "User",
        email: req.user.email || "user@example.com",
        tags: [issueType, "user_raised", orderRef].filter(Boolean)
      });
      if (zdTicket) {
        zendeskTicketId = String(zdTicket.id);
        console.log(`[SupportTicket] createSupportTicket - Zendesk ticket ID returned: ${zendeskTicketId}`);
      }
    } catch (zdErr) {
      console.warn("[SupportTicket] Zendesk sync failed (skipping):", zdErr.message);
      // We continue since local database persistence is the primary goal
    }

    // Safe debugging log (Requirement 10)
    console.log(`[SupportTicket] createSupportTicket - Role: ${req.user?.role}, userId: ${req.user?._id}, clientId: ${req.user?.clientId || req.clientId || "none"}`);

    const ticket = await SupportTicket.create({
      user: userId,
      userName: req.user.name || "",
      userEmail: req.user.email || "",
      role: req.user.role || "user",
      order: orderDoc?._id || undefined,
      orderRef,
      subject: String(subject).trim(),
      issueType: String(issueType).trim(),
      description: String(description).trim(),
      status: "open",
      priority: priority || "normal",
      zendeskTicketId,
      clientId: req.user?.clientId || req.clientId || null,
      userId: userId,
      createdBy: userId,
      orderId: orderRef || undefined,
      customerEmail: req.user.email || ""
    });

    return res.status(201).json({
      success: true,
      message: "Support ticket submitted successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("[SupportTicket] createSupportTicket:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/support-tickets/my ─────────────────────────────────────────────
// @desc    Get all tickets for the logged-in user
// @access  Private (any authenticated user)
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const email = req.user?.email ? String(req.user.email).toLowerCase().trim() : null;

    const query = {
      $or: [
        { user: userId }
      ]
    };

    if (email) {
      query.$or.push({ userEmail: email });
      query.$or.push({ customerEmail: email });
    }

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    return res.json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error("[SupportTicket] getMyTickets:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/support-tickets/admin ──────────────────────────────────────────
// @desc    Get all tickets (admin view)
// @access  Private (admin / super_admin only)
const getAllTickets = async (req, res) => {
  try {
    const isSuperAdmin = req.user && ["super_admin", "superadmin"].includes(String(req.user.role).toLowerCase());
    const isAdmin = req.user && ["admin"].includes(String(req.user.role).toLowerCase());
    const isClient = req.user && ["client", "store_manager", "client_admin"].includes(String(req.user.role).toLowerCase());
    const clientId = req.user?.clientId || req.clientId;

    if (!isSuperAdmin && !isAdmin && !isClient && !isAdminRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    // Requirement 10 & 16: Log data retrieval details
    console.log(`[SupportTicket] getAllTickets - Page: Support, Role: ${req.user?.role}, ClientId: ${clientId || "global"}`);

    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
      filter.status = status;
    }

    // Apply tenant scoping for non-super_admin and non-admin (e.g. client)
    if (!isSuperAdmin && !isAdmin) {
      const mongoose = require("mongoose");
      const ids = [
        req.user?._id,
        req.user?.clientId,
        req.user?.tenantId
      ].filter(Boolean);

      const mongooseIds = [];
      ids.forEach(id => {
        const strVal = String(id);
        mongooseIds.push(strVal);
        if (mongoose.Types.ObjectId.isValid(strVal)) {
          mongooseIds.push(new mongoose.Types.ObjectId(strVal));
        }
      });

      filter.$or = [
        { clientId: { $in: mongooseIds } },
        { tenantId: { $in: mongooseIds } },
        { createdBy: { $in: mongooseIds } },
        { userId: { $in: mongooseIds } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Requirement 16: Log DB query details & debug logs (Requirement 7)
    console.log(`[DEBUG] Client Ticket query filter: ${JSON.stringify(filter)}`);
    console.log(`[SupportTicket] DB Query - Collection: supporttickets, Filter: ${JSON.stringify(filter)}`);

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "name email role")
        .populate("order", "orderId totalPrice orderStatus createdAt items")
        .select("-__v")
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    // Temporary debug log (Requirement 7)
    const newestTicket = tickets && tickets.length > 0 ? tickets[0] : null;
    console.log(`[DEBUG] Number of tickets returned: ${tickets.length}, newest ticket createdAt: ${newestTicket ? newestTicket.createdAt : "N/A"}`);

    return res.json({
      success: true,
      count: tickets.length,
      total,
      data: tickets,
    });
  } catch (error) {
    console.error("[SupportTicket] getAllTickets:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/support-tickets/:id ────────────────────────────────────────────
// @desc    Get single ticket (owner or admin)
// @access  Private
const getTicketById = async (req, res) => {
  try {
    const userId = req.user?._id;
    const ticketId = req.params.id;

    console.log(`[SupportTicket - getTicketById] Requested Ticket ID: ${ticketId}`);

    let ticket = null;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(ticketId)) {
      ticket = await SupportTicket.findById(ticketId)
        .populate("user", "name email role")
        .populate("order", "orderId totalPrice orderStatus createdAt items")
        .lean();
    }
    if (!ticket) {
      ticket = await SupportTicket.findOne({ zendeskTicketId: String(ticketId) })
        .populate("user", "name email role")
        .populate("order", "orderId totalPrice orderStatus createdAt items")
        .lean();
    }

    // Fallback Zendesk Auto-Sync Check
    if (!ticket) {
      const isNumeric = /^\d+$/.test(String(ticketId));
      if (isNumeric || !mongoose.Types.ObjectId.isValid(ticketId)) {
        try {
          console.log(`[SupportTicket - getTicketById] Local ticket not found. Fetching Zendesk ticket: ${ticketId}`);
          const zdTicket = await ZendeskService.getTicket(ticketId);
          if (zdTicket) {
            console.log(`[SupportTicket - getTicketById] Zendesk Response for ticket ${ticketId}:`, JSON.stringify(zdTicket));
            const User = require("../models/User");
            let ticketUser = req.user._id;
            const email = zdTicket.requester?.email || zdTicket.submitter?.email;
            if (email) {
              const foundUser = await User.findOne({ email: email.toLowerCase().trim() }).select("_id name email role clientId").lean();
              if (foundUser) {
                ticketUser = foundUser._id;
              }
            }

            const newTicketDoc = await SupportTicket.create({
              user: ticketUser,
              userName: zdTicket.requester?.name || req.user.name || "",
              userEmail: zdTicket.requester?.email || req.user.email || "",
              role: req.user.role || "user",
              subject: zdTicket.subject || "Zendesk Sync Ticket",
              issueType: "other",
              description: zdTicket.description || "Synced from Zendesk",
              status: zdTicket.status || "open",
              zendeskTicketId: String(zdTicket.id),
              zendeskSyncStatus: "synced",
              clientId: req.user?.clientId || req.clientId || null,
              userId: ticketUser,
              createdBy: ticketUser,
              customerEmail: zdTicket.requester?.email || req.user.email || ""
            });
            console.log(`[SupportTicket - getTicketById] Auto-synced Zendesk ticket ${ticketId} to local DB: ${newTicketDoc._id}`);
            ticket = await SupportTicket.findById(newTicketDoc._id)
              .populate("user", "name email role")
              .populate("order", "orderId totalPrice orderStatus createdAt items")
              .lean();
          }
        } catch (zdErr) {
          console.warn(`[SupportTicket - getTicketById] Could not auto-sync Zendesk ticket ${ticketId}:`, zdErr.message);
        }
      }
    }

    if (!ticket) {
      console.log(`[SupportTicket - getTicketById] Ticket ${ticketId} NOT FOUND in local DB or Zendesk`);
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    console.log(`[SupportTicket - getTicketById] Fetched DB Ticket:`, JSON.stringify(ticket));

    const resolvedClientId = req.user?.clientId || req.clientId;
    const hasAccess = await checkTicketAccess(ticket, req.user, resolvedClientId);

    console.log(`[SupportTicket - getTicketById] Permission validation result: ${hasAccess}`);

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[SupportTicket] getTicketById:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /api/support-tickets/:id/status ───────────────────────────────────
// @desc    Update ticket status (admin only) + optional admin response
// @access  Private (admin / super_admin)
const updateTicketStatus = async (req, res) => {
  try {
    const isClient = req.user && req.user.role === "client";
    if (!isClient && !isAdminRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    // Get ticket first to check authorization
    const ticketDoc = await SupportTicket.findById(req.params.id);
    if (!ticketDoc) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const userRole = String(req.user?.role || "").toLowerCase();
    const isSuperAdmin = ["super_admin", "superadmin"].includes(userRole);
    const isGlobalAdmin = userRole === "admin" || isAdminRole(req.user?.role);

    // SuperAdmin and global Admin can always update any ticket — no tenant scoping needed
    if (!isSuperAdmin && !isGlobalAdmin) {
      const clientId = req.user?.clientId || req.clientId;
      if (!clientId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const User = require("../models/User");
      const ticketCreator = await User.findById(ticketDoc.user).select("clientId").lean();
      
      const hasDirectAccess = ticketDoc.clientId && String(ticketDoc.clientId) === String(clientId);
      const hasCreatorAccess = ticketCreator && String(ticketCreator.clientId) === String(clientId);
      
      if (!hasDirectAccess && !hasCreatorAccess) {
        return res.status(403).json({ success: false, message: "Access denied. Ticket belongs to another client." });
      }
    }

    console.log(`[SupportTicket] updateTicketStatus - Access granted for role: ${userRole}, ticketId: ${req.params.id}`);

    let status = req.body.status;
    const { adminResponse } = req.body;
    const VALID_STATUSES = ["open", "pending", "in_progress", "resolved", "closed"];

    // Check for status mismatch issues and normalize uppercase/lowercase variations
    if (status && typeof status === "string") {
      const normalizedStatus = status.trim().toLowerCase();
      if (normalizedStatus === "solved" || normalizedStatus === "resolved") {
        status = "resolved";
      } else if (normalizedStatus === "in-progress" || normalizedStatus === "in progress") {
        status = "in_progress";
      } else {
        status = normalizedStatus;
      }
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    // Safe debugging log for updated ticket status (Requirement 9)
    console.log(`[SupportTicket] updateTicketStatus - Ticket: ${req.params.id}, Updated status: ${status}`);

    const update = {
      status,
      resolvedBy: req.user._id,
    };
    if (adminResponse && String(adminResponse).trim()) {
      update.adminResponse = String(adminResponse).trim();
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate("user", "name email role")
      .populate("order", "orderId totalPrice orderStatus")
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    return res.json({
      success: true,
      message: "Ticket updated",
      data: ticket,
    });
  } catch (error) {
    console.error("[SupportTicket] updateTicketStatus:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── ZENDESK INTEGRATION FOR ADMIN SUPPORT PAGE ──────────────────────────────

// @desc    Create a Zendesk support ticket from dashboard
// @access  Private (admin / super_admin / client)
const createZendeskTicket = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const isClient = userRole === "client";
    if (!isClient && !isAdminRole(userRole)) {
      console.warn(`[Zendesk] Access denied for role: ${userRole}`);
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { subject, description, category, priority } = req.body;
    // Use provided name/email or fallback to authenticated user's data
    const name = req.body.name || req.user?.name || "Support Admin";
    const email = req.body.email || req.user?.email;

    if (!subject || !description || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "Subject, description, and email are required" 
      });
    }

    // Map category to tags (Exact mapping requested)
    let tags = [];
    if (category) {
      const mapping = {
        'Customer Queries': 'customer_query',
        'Reported Issues': 'reported_issue',
        'Order Support': 'order_support'
      };
      const mappedTag = mapping[category] || String(category).toLowerCase().replace(/\s+/g, '_');
      tags.push(mappedTag);
    }
    if (priority) {
      tags.push(`priority_${priority}`);
    }

    // Check if service is configured
    try {
      const ticket = await ZendeskService.createTicket({
        subject,
        description,
        name,
        email,
        tags
      });

      if (!ticket) {
        console.error("[Zendesk] createTicket returned null (likely missing config)");
        return res.status(500).json({ 
          success: false, 
          message: "Zendesk API is not configured on the backend" 
        });
      }

      // Safe debugging log (Requirement 10)
      console.log(`[SupportTicket] createZendeskTicket - Zendesk ticket ID returned: ${ticket.id}, Role: ${req.user?.role}, userId: ${req.user?._id}, clientId: ${req.user?.clientId || req.clientId || "none"}`);

      // Optionally save mapping locally
      await SupportTicket.create({
        user: req.user._id,
        userName: name,
        userEmail: email,
        subject,
        issueType: tags[0] || "other", 
        description,
        status: "open",
        zendeskTicketId: String(ticket.id),
        clientId: req.user?.clientId || req.clientId || null,
        userId: req.user._id,
        createdBy: req.user._id,
        customerEmail: email
      });

      return res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        data: ticket
      });
    } catch (zdErr) {
      console.error("[Zendesk Service Error]", zdErr);
      const isAuthError = zdErr.message.includes('401') || zdErr.message.toLowerCase().includes('unauthorized');
      return res.status(isAuthError ? 401 : 500).json({ 
        success: false, 
        message: isAuthError ? "Invalid Zendesk API credentials" : `Zendesk API Error: ${zdErr.message}`
      });
    }

  } catch (error) {
    console.error("[Zendesk] createZendeskTicket unexpected error: ", error);
    return res.status(500).json({ success: false, message: "Internal server error during ticket creation" });
  }
};

// @desc    Get Zendesk tickets for Admin Support Page
// @access  Private (admin / super_admin / client)
const getZendeskTickets = async (req, res) => {
  try {
    const isSuperAdmin = req.user && ["super_admin", "superadmin"].includes(String(req.user.role).toLowerCase());
    const isAdmin = req.user && ["admin"].includes(String(req.user.role).toLowerCase());
    const isClient = req.user && ["client", "store_manager", "client_admin"].includes(String(req.user.role).toLowerCase());
    
    if (!isSuperAdmin && !isAdmin && !isClient) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    try {
      const tickets = await ZendeskService.getTickets();
      
      if (!tickets || tickets.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          message: "No tickets found"
        });
      }

      // Normalize properties as requested
      let normalizedTickets = tickets.map(t => {
        let mappedStatus = t.status ? String(t.status).toLowerCase().trim() : "open";
        if (mappedStatus === "solved" || mappedStatus === "closed") {
          mappedStatus = "resolved";
        } else if (mappedStatus === "new" || mappedStatus === "hold" || mappedStatus === "open") {
          mappedStatus = "open";
        } else if (mappedStatus === "pending") {
          mappedStatus = "pending";
        }

        return {
          id: t.id,
          subject: t.subject,
          requesterName: t.requester?.name || 'Unknown',
          requesterEmail: t.requester?.email || 'N/A',
          status: mappedStatus,
          priority: t.priority || "normal",
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          tags: t.tags || []
        };
      });

      if (!isSuperAdmin && !isAdmin) {
        const clientId = req.user?.clientId || req.clientId;
        if (clientId) {
          const User = require("../models/User");
          const tenantUsers = await User.find({ clientId }).select("_id email").lean();
          const tenantUserEmails = new Set(
            tenantUsers
              .map(u => u.email ? u.email.toLowerCase().trim() : null)
              .filter(Boolean)
          );
          const tenantUserIds = tenantUsers.map(u => u._id);

          // Find local tickets belonging to this tenant
          const localTickets = await SupportTicket.find({
            $or: [
              { clientId },
              { user: { $in: tenantUserIds } }
            ]
          }).select("zendeskTicketId").lean();
          const tenantZendeskIds = new Set(
            localTickets
              .map(t => String(t.zendeskTicketId))
              .filter(Boolean)
          );

          // Filter Zendesk tickets
          normalizedTickets = normalizedTickets.filter(t => {
            const emailMatch = t.requesterEmail && tenantUserEmails.has(t.requesterEmail.toLowerCase().trim());
            const idMatch = t.id && tenantZendeskIds.has(String(t.id));
            return emailMatch || idMatch;
          });
        } else {
          normalizedTickets = [];
        }
      }

      return res.status(200).json({
        success: true,
        data: normalizedTickets
      });
    } catch (zdErr) {
      console.error("[Zendesk Service Error] getTickets:", zdErr);
      const isAuthError = zdErr.message.includes('401') || zdErr.message.toLowerCase().includes('unauthorized');
      return res.status(isAuthError ? 401 : 500).json({ 
        success: false, 
        message: isAuthError ? "Invalid Zendesk API credentials" : `Failed to load Zendesk tickets: ${zdErr.message}`
      });
    }
  } catch (error) {
    console.error("[Zendesk Controller Error] getZendeskTickets:", error);
    return res.status(500).json({ success: false, message: "Internal server error while fetching tickets" });
  }
};

// @desc    Get Zendesk and system stats for Admin Support Page
// @access  Private (admin / super_admin / client)
const getZendeskStats = async (req, res) => {
  try {
    const isSuperAdmin = req.user && ["super_admin", "superadmin"].includes(String(req.user.role).toLowerCase());
    const isAdmin = req.user && ["admin"].includes(String(req.user.role).toLowerCase());
    const isClient = req.user && ["client", "store_manager", "client_admin"].includes(String(req.user.role).toLowerCase());
    
    if (!isSuperAdmin && !isAdmin && !isClient) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const clientId = req.user?.clientId || req.clientId;

    const filter = {};
    if (!isSuperAdmin && !isAdmin) {
      const mongoose = require("mongoose");
      const ids = [
        req.user?._id,
        req.user?.clientId,
        req.user?.tenantId
      ].filter(Boolean);

      const mongooseIds = [];
      ids.forEach(id => {
        const strVal = String(id);
        mongooseIds.push(strVal);
        if (mongoose.Types.ObjectId.isValid(strVal)) {
          mongooseIds.push(new mongoose.Types.ObjectId(strVal));
        }
      });

      filter.$or = [
        { clientId: { $in: mongooseIds } },
        { tenantId: { $in: mongooseIds } },
        { createdBy: { $in: mongooseIds } },
        { userId: { $in: mongooseIds } }
      ];
    }

    // Safe debugging log (Requirement 10)
    console.log(`[SupportTicket] getZendeskStats - Role: ${req.user?.role}, userId: ${req.user?._id}, clientId: ${clientId || "global"}, ticket count query filters: ${JSON.stringify(filter)}`);

    // Query MongoDB for system ticket statistics with case-insensitivity and status variations
    const [total, open, resolved, pending] = await Promise.all([
      SupportTicket.countDocuments(filter),
      SupportTicket.countDocuments({ 
        ...filter, 
        status: { $in: ["open", "Open", "OPEN", "in_progress", "in-progress", "In Progress", "IN_PROGRESS"] } 
      }),
      SupportTicket.countDocuments({ 
        ...filter, 
        status: { $in: ["resolved", "Resolved", "RESOLVED", "closed", "Closed", "CLOSED", "solved", "Solved", "SOLVED"] } 
      }),
      SupportTicket.countDocuments({ 
        ...filter, 
        status: { $in: ["pending", "Pending", "PENDING"] } 
      }),
    ]);

    let finalStats = { total, open, resolved, pending };

    // Try to merge with Zendesk stats if available
    try {
      const stats = await ZendeskService.getStats();
      if (stats && typeof stats === "object") {
        // Fetch all local zendeskTicketIds to deduplicate
        const localTickets = await SupportTicket.find({
          zendeskTicketId: { $exists: true, $ne: null }
        }).select("zendeskTicketId").lean();
        const allLocalZendeskIds = new Set(
          localTickets.map(t => String(t.zendeskTicketId))
        );

        let filteredZd = [];
        const tickets = await ZendeskService.getTickets();
        if (tickets && tickets.length > 0) {
          if (!isSuperAdmin && !isAdmin && clientId) {
            const User = require("../models/User");
            const tenantUsers = await User.find({ clientId }).select("_id email").lean();
            const tenantUserEmails = new Set(
              tenantUsers
                .map(u => u.email ? u.email.toLowerCase().trim() : null)
                .filter(Boolean)
            );
            const tenantUserIds = tenantUsers.map(u => u._id);
            const tenantLocalTickets = await SupportTicket.find({
              $or: [
                { clientId },
                { user: { $in: tenantUserIds } }
              ]
            }).select("zendeskTicketId").lean();
            const tenantZendeskIds = new Set(
              tenantLocalTickets
                .map(t => String(t.zendeskTicketId))
                .filter(Boolean)
            );

            filteredZd = tickets.filter(t => {
              const email = t.requester?.email || '';
              const emailMatch = email && tenantUserEmails.has(email.toLowerCase().trim());
              const idMatch = t.id && tenantZendeskIds.has(String(t.id));
              return emailMatch || idMatch;
            });
          } else {
            filteredZd = tickets;
          }
        }

        // Deduplicate: only count Zendesk tickets that do NOT exist in MongoDB
        const uniqueZd = filteredZd.filter(t => !allLocalZendeskIds.has(String(t.id)));

        let zdTotal = uniqueZd.length;
        let zdOpen = uniqueZd.filter(t => ["open", "new", "hold"].includes(t.status?.toLowerCase())).length;
        let zdResolved = uniqueZd.filter(t => ["solved", "closed"].includes(t.status?.toLowerCase())).length;
        let zdPending = uniqueZd.filter(t => ["pending"].includes(t.status?.toLowerCase())).length;

        finalStats.total += zdTotal;
        finalStats.open += zdOpen;
        finalStats.resolved += zdResolved;
        finalStats.pending += zdPending;
      }
    } catch (zdErr) {
      console.warn("[SupportTicket] Zendesk stats retrieval skipped or failed:", zdErr.message);
    }

    // Safe debugging log for resolved ticket count query result (Requirement 9)
    console.log(`[SupportTicket] getZendeskStats - Resolved ticket count query result from DB: ${resolved}, Final combined resolved count: ${finalStats.resolved}`);

    return res.status(200).json({
      success: true,
      data: finalStats
    });
  } catch (error) {
    console.error("[SupportTicket] getZendeskStats Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get stats for user's own tickets
// @access  Private (any authenticated user)
const getMyTicketStats = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Query user's tickets in MongoDB with case-insensitivity and status variations
    const [total, open, resolved, pending] = await Promise.all([
      SupportTicket.countDocuments({ user: userId }),
      SupportTicket.countDocuments({ 
        user: userId, 
        status: { $in: ["open", "Open", "OPEN", "in_progress", "in-progress", "In Progress", "IN_PROGRESS"] } 
      }),
      SupportTicket.countDocuments({ 
        user: userId, 
        status: { $in: ["resolved", "Resolved", "RESOLVED", "closed", "Closed", "CLOSED", "solved", "Solved", "SOLVED"] } 
      }),
      SupportTicket.countDocuments({ 
        user: userId, 
        status: { $in: ["pending", "Pending", "PENDING"] } 
      }),
    ]);

    // Safe debugging log for resolved ticket count query result (Requirement 9)
    console.log(`[SupportTicket] getMyTicketStats - User: ${userId}, Resolved ticket count query result from DB: ${resolved}`);

    return res.json({
      success: true,
      data: { total, open, resolved, pending }
    });
  } catch (error) {
    console.error("[SupportTicket] getMyTicketStats:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get comments/messages for a specific Zendesk ticket (Chat)
// @access  Private (admin or ticket owner)
const getZendeskTicketComments = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Ticket ID is required" });
    }

    console.log(`[SupportTicket - getZendeskTicketComments] Requested Ticket ID for comments: ${id}`);

    const userId = req.user?._id;
    const role = String(req.user?.role || '').toLowerCase();
    const isSuperAdmin = ["super_admin", "superadmin"].includes(role);
    const isAdmin = ["admin"].includes(role) || isAdminRole(req.user?.role);
    const isClient = ["client", "store_manager", "client_admin"].includes(role);
    const clientId = req.user?.clientId || req.clientId;

    // Find local ticket from id (could be local _id or zendeskTicketId)
    let ticketDoc = null;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(id)) {
      ticketDoc = await SupportTicket.findById(id);
    }
    if (!ticketDoc) {
      ticketDoc = await SupportTicket.findOne({ zendeskTicketId: String(id) });
    }

    // Fallback Zendesk Auto-Sync Check
    if (!ticketDoc) {
      const isNumeric = /^\d+$/.test(String(id));
      if (isNumeric || !mongoose.Types.ObjectId.isValid(id)) {
        try {
          console.log(`[SupportTicket - getZendeskTicketComments] Local ticket not found. Fetching Zendesk ticket: ${id}`);
          const zdTicket = await ZendeskService.getTicket(id);
          if (zdTicket) {
            console.log(`[SupportTicket - getZendeskTicketComments] Zendesk Response for ticket ${id}:`, JSON.stringify(zdTicket));
            const User = require("../models/User");
            let ticketUser = req.user._id;
            const email = zdTicket.requester?.email || zdTicket.submitter?.email;
            if (email) {
              const foundUser = await User.findOne({ email: email.toLowerCase().trim() }).select("_id name email role clientId").lean();
              if (foundUser) {
                ticketUser = foundUser._id;
              }
            }
            
            // Auto-create local record
            ticketDoc = await SupportTicket.create({
              user: ticketUser,
              userName: zdTicket.requester?.name || req.user.name || "",
              userEmail: zdTicket.requester?.email || req.user.email || "",
              role: req.user.role || "user",
              subject: zdTicket.subject || "Zendesk Sync Ticket",
              issueType: "other",
              description: zdTicket.description || "Synced from Zendesk",
              status: zdTicket.status || "open",
              zendeskTicketId: String(zdTicket.id),
              zendeskSyncStatus: "synced",
              clientId: req.user?.clientId || req.clientId || null,
              userId: ticketUser,
              createdBy: ticketUser,
              customerEmail: zdTicket.requester?.email || req.user.email || ""
            });
            console.log(`[SupportTicket - getZendeskTicketComments] Auto-created local ticket for Zendesk ID ${id}: ${ticketDoc._id}`);
          }
        } catch (zdErr) {
          console.warn(`[SupportTicket - getZendeskTicketComments] Failed to fetch/create Zendesk ticket ${id}:`, zdErr.message);
        }
      }
    }

    if (!ticketDoc) {
      console.log(`[SupportTicket - getZendeskTicketComments] Ticket ${id} NOT FOUND in local DB or Zendesk`);
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    console.log(`[SupportTicket - getZendeskTicketComments] Fetched DB Ticket:`, JSON.stringify(ticketDoc));

    // Evaluate permissions
    const resolvedClientId = req.user?.clientId || req.clientId;
    const hasAccess = await checkTicketAccess(ticketDoc, req.user, resolvedClientId);

    console.log(`[SupportTicket - getZendeskTicketComments] Permission validation result: ${hasAccess}`);

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied. You do not have permission for this ticket." });
    }

    let normalizedComments = [];

    // 1. Fetch from Zendesk if synced
    if (ticketDoc.zendeskTicketId) {
      try {
        console.log(`[SupportTicket - getZendeskTicketComments] Fetching comments from Zendesk for Ticket ID: ${ticketDoc.zendeskTicketId}`);
        const comments = await ZendeskService.getTicketComments(ticketDoc.zendeskTicketId);
        if (comments && Array.isArray(comments)) {
          normalizedComments = comments.map(c => ({
            id: c.id,
            body: c.body,
            authorName: c.author?.name || 'Unknown',
            authorRole: c.author?.role || 'end-user',
            isPublic: c.public,
            createdAt: c.created_at,
          }));
        }
        console.log(`[SupportTicket - getZendeskTicketComments] Zendesk comments response count: ${normalizedComments.length}`);
      } catch (zdErr) {
        console.warn(`[SupportTicket - getZendeskTicketComments] Failed to load Zendesk comments for ticket ${ticketDoc.zendeskTicketId}:`, zdErr.message);
      }
    }

    // 2. Fetch/Merge from local messages
    if (ticketDoc.localMessages && ticketDoc.localMessages.length > 0) {
      const localMsgs = ticketDoc.localMessages.map((m, idx) => ({
        id: m._id || `local-${idx}`,
        body: m.body,
        authorName: m.authorName || 'User',
        authorRole: m.authorRole || 'end-user',
        isPublic: true,
        createdAt: m.createdAt,
      }));
      // Combine and sort by createdAt
      normalizedComments = [...normalizedComments, ...localMsgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      console.log(`[SupportTicket - getZendeskTicketComments] Combined with local messages. Total comments: ${normalizedComments.length}`);
    }

    // 3. Fallback/Prepend ticket description for invoice receipt tickets as the first message
    const hasInitialDesc = normalizedComments.some(c => c.body === ticketDoc.description || c.id === 'initial-desc');
    if (!hasInitialDesc && ticketDoc.description) {
      normalizedComments.unshift({
        id: 'initial-desc',
        body: ticketDoc.description,
        authorName: ticketDoc.userName || 'System',
        authorRole: 'end-user',
        isPublic: true,
        createdAt: ticketDoc.createdAt || new Date(),
      });
      console.log(`[SupportTicket - getZendeskTicketComments] Prepended initial ticket description`);
    }

    // Filter out internal/private notes if user is not admin/client
    if (!isSuperAdmin && !isClient && !isAdmin) {
      normalizedComments = normalizedComments.filter(c => c.isPublic === true);
    }

    console.log(`[SupportTicket - getZendeskTicketComments] Returning ${normalizedComments.length} conversation messages`);

    return res.status(200).json({
      success: true,
      data: normalizedComments
    });
  } catch (error) {
    console.error("[Zendesk Controller Error] getZendeskTicketComments:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const addZendeskTicketComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    // Default to true if not explicitly false
    const isPublic = req.body.isPublic !== false;

    if (!id) {
      return res.status(400).json({ success: false, message: "Ticket ID is required" });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message cannot be empty" });
    }

    console.log(`[SupportTicket - addZendeskTicketComment] Adding comment to Ticket ID: ${id}`);

    const userId = req.user?._id;
    const role = String(req.user?.role || '').toLowerCase();
    const isSuperAdmin = ["super_admin", "superadmin"].includes(role);
    const isAdmin = ["admin"].includes(role) || isAdminRole(req.user?.role);
    const isClient = ["client", "store_manager", "client_admin"].includes(role);
    const clientId = req.user?.clientId || req.clientId;

    // Find local ticket from id (could be local _id or zendeskTicketId)
    let ticketDoc = null;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(id)) {
      ticketDoc = await SupportTicket.findById(id);
    }
    if (!ticketDoc) {
      ticketDoc = await SupportTicket.findOne({ zendeskTicketId: String(id) });
    }

    // Fallback Zendesk Auto-Sync Check
    if (!ticketDoc) {
      const isNumeric = /^\d+$/.test(String(id));
      if (isNumeric || !mongoose.Types.ObjectId.isValid(id)) {
        try {
          console.log(`[SupportTicket - addZendeskTicketComment] Local ticket not found. Fetching Zendesk ticket: ${id}`);
          const zdTicket = await ZendeskService.getTicket(id);
          if (zdTicket) {
            console.log(`[SupportTicket - addZendeskTicketComment] Zendesk Response for ticket ${id}:`, JSON.stringify(zdTicket));
            const User = require("../models/User");
            let ticketUser = req.user._id;
            const email = zdTicket.requester?.email || zdTicket.submitter?.email;
            if (email) {
              const foundUser = await User.findOne({ email: email.toLowerCase().trim() }).select("_id name email role clientId").lean();
              if (foundUser) {
                ticketUser = foundUser._id;
              }
            }
            
            // Auto-create local record
            ticketDoc = await SupportTicket.create({
              user: ticketUser,
              userName: zdTicket.requester?.name || req.user.name || "",
              userEmail: zdTicket.requester?.email || req.user.email || "",
              role: req.user.role || "user",
              subject: zdTicket.subject || "Zendesk Sync Ticket",
              issueType: "other",
              description: zdTicket.description || "Synced from Zendesk",
              status: zdTicket.status || "open",
              zendeskTicketId: String(zdTicket.id),
              zendeskSyncStatus: "synced",
              clientId: req.user?.clientId || req.clientId || null,
              userId: ticketUser,
              createdBy: ticketUser,
              customerEmail: zdTicket.requester?.email || req.user.email || ""
            });
            console.log(`[SupportTicket - addZendeskTicketComment] Auto-created local ticket for Zendesk ID ${id}: ${ticketDoc._id}`);
          }
        } catch (zdErr) {
          console.warn(`[SupportTicket - addZendeskTicketComment] Failed to fetch/create Zendesk ticket ${id}:`, zdErr.message);
        }
      }
    }

    if (!ticketDoc) {
      console.log(`[SupportTicket - addZendeskTicketComment] Ticket ${id} NOT FOUND in local DB or Zendesk`);
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    console.log(`[SupportTicket - addZendeskTicketComment] Fetched DB Ticket:`, JSON.stringify(ticketDoc));

    // Evaluate permissions
    const resolvedClientId = req.user?.clientId || req.clientId;
    const hasAccess = await checkTicketAccess(ticketDoc, req.user, resolvedClientId);

    console.log(`[SupportTicket - addZendeskTicketComment] Permission validation result: ${hasAccess}`);

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied. You do not have permission for this ticket." });
    }

    // 1. Save message locally in localMessages
    const authorName = req.user?.name || (isSuperAdmin || isAdmin ? 'Support Agent' : 'User');
    const authorRole = isSuperAdmin || isAdmin ? 'admin' : 'end-user';

    if (!ticketDoc.localMessages) {
      ticketDoc.localMessages = [];
    }

    ticketDoc.localMessages.push({
      body: String(message).trim(),
      authorName,
      authorRole,
      createdAt: new Date(),
    });

    await ticketDoc.save();
    console.log(`[SupportTicket - addZendeskTicketComment] Comment successfully saved locally in DB.`);

    // 2. Add comment to Zendesk if integrated
    let zendeskResult = null;
    if (ticketDoc.zendeskTicketId) {
      try {
        let authorId = null;
        if (!isSuperAdmin && !isAdmin) {
          // Find the Zendesk requester ID so the comment is authored by the user
          try {
            console.log(`[SupportTicket - addZendeskTicketComment] Fetching Zendesk ticket to retrieve requester_id: ${ticketDoc.zendeskTicketId}`);
            const zdTicket = await ZendeskService.getTicket(ticketDoc.zendeskTicketId);
            if (zdTicket && zdTicket.requester_id) {
              authorId = zdTicket.requester_id;
            }
          } catch (err) {
            console.warn("[SupportTicket - addZendeskTicketComment] Could not fetch requester_id for user reply:", err.message);
          }
        }

        console.log(`[SupportTicket - addZendeskTicketComment] Sending comment to Zendesk for ticket: ${ticketDoc.zendeskTicketId}`);
        zendeskResult = await ZendeskService.addTicketComment(
          ticketDoc.zendeskTicketId,
          String(message).trim(),
          isPublic,
          authorId
        );
        console.log(`[SupportTicket - addZendeskTicketComment] Zendesk comment result:`, JSON.stringify(zendeskResult));
      } catch (zdErr) {
        console.warn("[SupportTicket] Zendesk comment submission failed (skipping):", zdErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: zendeskResult || ticketDoc,
      message: "Message sent successfully"
    });
  } catch (error) {
    console.error("[Zendesk Controller Error] addZendeskTicketComment:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ─── DELETE /api/support-tickets/:id ─────────────────────────────────────────
// @desc    Delete a support ticket (admin / super_admin only)
// @access  Private (admin / super_admin)
const deleteTicket = async (req, res) => {
  try {
    const userRole = String(req.user?.role || "").toLowerCase();
    const isSuperAdmin = ["super_admin", "superadmin"].includes(userRole);
    const isGlobalAdmin = userRole === "admin" || isAdminRole(req.user?.role);

    if (!isSuperAdmin && !isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admins can delete support tickets.",
      });
    }

    const ticketId = req.params.id;
    const mongoose = require("mongoose");

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID" });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    console.log(`[SupportTicket] deleteTicket - Deleting ticket ${ticketId} by ${req.user?.email} (${userRole})`);

    await SupportTicket.findByIdAndDelete(ticketId);

    return res.json({
      success: true,
      message: "Ticket deleted successfully",
    });
  } catch (error) {
    console.error("[SupportTicket] deleteTicket:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};
