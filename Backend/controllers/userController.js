const mongoose = require("mongoose");
const User = require("../models/User");
const Client = require("../models/Client");
const { SUPER_ADMIN_EMAIL } = require("../utils/authConstants");
const { ensureRoleProfilesForUser } = require("../utils/ensureRoleProfiles");
const { isValidObjectId } = require("../utils/tenantResolver");
const { normalizeRole } = require("../utils/clientScopedRoles");

/** Roles Super Admin may assign (never `super_admin` via API — use seeded account only). */
const ASSIGNABLE_ROLES = [
  "admin",
  "counter_manager",
  "seo_manager",
  "store_manager",
  "inventory_manager",
  "employee",
  "user",
  "client",
];

const getMe = async (req, res) => {
  try {
    const userDoc = await User.findById(req.user._id).select("-password");
    if (!userDoc) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    await ensureRoleProfilesForUser(userDoc);
    const user = await User.findById(req.user._id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const data = { ...user };
    if (req.tokenPayload?.impersonatedBy) {
      const sa = await User.findById(req.tokenPayload.impersonatedBy).select("name email").lean();
      data.impersonation = {
        active: true,
        superAdminId: String(req.tokenPayload.impersonatedBy),
        superAdminName: sa?.name || "Super Admin",
        superAdminEmail: sa?.email || "",
      };
    }

    // Include trial info + business name for Admin/Client
    if (user.role === "admin" || user.role === "client") {
      if (user.clientId) {
        const client = await Client.findById(user.clientId);
        if (client) {
          data.trialStatus = client.trialStatus;
          data.isTrialExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < new Date());
          data.trialEndDate = client.trialEndDate;
          data.businessName = client.companyName || client.shopName || null;
        }
      }
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateMe = async (req, res) => {
  try {
    const { name, username, country, bio } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "Name cannot be empty" });
      }
      user.name = trimmed;
    }
    if (username !== undefined) {
      user.username = String(username).trim();
    }
    if (country !== undefined) {
      user.country = String(country).trim();
    }
    if (bio !== undefined) {
      user.bio = String(bio).trim();
    }

    await user.save();
    const fresh = await User.findById(user._id).select("-password");
    res.json({
      success: true,
      message: "Profile updated",
      data: fresh,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/users  (alias)  |  GET /api/users/platform/list
// @access  Super Admin / Admin / Client
const listPlatformUsers = async (req, res) => {
  try {
    const userRole = normalizeRole(req.user?.role);
    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin";
    const isClientAdmin = userRole === "client" || userRole === "client_admin";
    
    // Privileged roles can access the directory
    const isPrivileged = isSuperAdmin || isAdmin || isClientAdmin;

    const clientId = req.user?.clientId || req.clientId;

    console.log(`[UserController] listPlatformUsers - Role: ${userRole}, ResolvedClientId: ${clientId || "global"}`);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = String(req.query.search || "").trim();
    const roleFilter = req.query.role ? String(req.query.role).trim() : "";

    const q = {};

    // Requirement 3: Exclude seeded Super Admin from general directory list
    q.email = { $ne: SUPER_ADMIN_EMAIL };

    if (isSuperAdmin || isAdmin) {
      // Global Admins see everything. 
      // If ?clientId is provided, filter by it (Admin intentional filtering).
      if (isValidObjectId(req.query.clientId)) {
        q.clientId = req.query.clientId;
      }
    } else if (isClientAdmin) {
      // Client Admins see only their own organization's users
      if (clientId) {
        q.clientId = clientId;
      } else {
        // If no clientId resolved for client role, they see nothing
        return res.json({
          success: true,
          data: { users: [], total: 0, page, limit, pages: 1 }
        });
      }
    } else {
      // Non-privileged roles see nothing or only themselves (strict isolation)
      // Usually they shouldn't even reach here due to allowRoles middleware
      if (clientId) {
        q.clientId = clientId;
      } else {
        return res.json({
          success: true,
          data: { users: [], total: 0, page, limit, pages: 1 }
        });
      }
    }

    if (search) {
      const esc = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Requirement 4: Search should work by name, email, and phone
      q.$or = [
        { name: new RegExp(esc, "i") }, 
        { email: new RegExp(esc, "i") },
        { phone: new RegExp(esc, "i") }
      ];
    }
    
    if (roleFilter) {
      q.role = roleFilter;
    }

    console.log("[UserController] listPlatformUsers Query:", JSON.stringify(q));

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(q).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(q),
    ]);

    res.json({
      success: true,
      data: {
        users,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("[UserController] listPlatformUsers error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PATCH /api/users/platform/:id/role
// @access  Super Admin  (MongoDB User collection; preserves other fields)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (!role || typeof role !== "string") {
      return res.status(400).json({ success: false, message: "Role is required" });
    }
    // Normalize to lowercase so "Client" → "client", etc.
    const nextRole = role.trim().toLowerCase();
    if (!nextRole) {
      return res.status(400).json({ success: false, message: "Role cannot be empty" });
    }

    if (nextRole === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin role cannot be assigned from user management.",
      });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userRole = normalizeRole(req.user?.role);
    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin";
    const clientId = req.user?.clientId || req.clientId;

    if (!isSuperAdmin && !isAdmin) {
      // Tenant-scoped management (Client / Client Admin)
      if (!clientId) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Organization scope not identified.",
        });
      }
      if (target.clientId && String(target.clientId) !== String(clientId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only manage users within your own organization.",
        });
      }

      // Cannot modify Admin or Super Admin roles
      if (target.role === "admin" || target.role === "super_admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied. You cannot modify Admin or Super Admin roles.",
        });
      }

      const ADMIN_ALLOWED_ROLES = ["counter_manager", "seo_manager", "store_manager", "inventory_manager", "employee", "client", "user"];
      if (!ADMIN_ALLOWED_ROLES.includes(nextRole)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only assign Counter Manager, SEO Manager, Store Manager, Inventory Manager, Employee, Client, or User roles.",
        });
      }
    }

    if (target.role === "super_admin" || target.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        message: "The seeded Super Admin account cannot be modified via API",
      });
    }

    target.role = nextRole;
    
    let linkedStore = null;

    // Requirement 1 & 2: Provision store for client, check existing
    if (nextRole === "client") {
      const Client = require("../models/Client");
      
      // 1. Check if user already has a clientId
      if (target.clientId && isValidObjectId(target.clientId)) {
        linkedStore = await Client.findById(target.clientId);
      }
      
      // 2. Fallback check by userId or email to avoid duplicates
      if (!linkedStore) {
        linkedStore = await Client.findOne({ 
          $or: [
            { userId: target._id },
            { email: target.email.toLowerCase().trim() }
          ] 
        });
      }

      // 3. Create if doesn't exist
      if (!linkedStore) {
        const storeName = target.businessName || target.name || target.email.split('@')[0];
        // Generate a simple slug for reference if needed (even though Client model might not use it natively, we provide an identifier)
        const slugBase = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const slug = `${slugBase}-${Date.now().toString().slice(-4)}`;

        linkedStore = await Client.create({
          companyName: storeName,
          shopName: storeName,
          email: target.email.toLowerCase().trim(),
          phone: target.phone || "0000000000",
          gst: `PENDING-${Date.now().toString().slice(-6)}`,
          userId: target._id,
          createdBy: req.user?._id || target._id,
          trialStatus: "active",
          trialStartDate: new Date(),
          trialEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        });
      }

      // 4. Ensure relationship is linked
      target.clientId = linkedStore._id;
    }

    try {
      await target.save();
    } catch (saveErr) {
      if (saveErr.name === "ValidationError" && saveErr.errors?.role) {
        return res.status(400).json({
          success: false,
          message: saveErr.errors.role.message || "Invalid role for user model",
        });
      }
      throw saveErr;
    }

    // Sync to Customer collection if the next role is "user" (case-insensitive "User")
    if (nextRole === "user") {
      try {
        const Customer = require("../models/Customer");
        const emailNorm = target.email.toLowerCase().trim();
        
        // Find existing customer by email or userId to avoid duplicates
        let customer = await Customer.findOne({
          $or: [
            { userId: target._id },
            { email: emailNorm }
          ]
        });

        const customerData = {
          userId: target._id,
          name: target.name,
          email: emailNorm,
          phone: target.phone || "",
          status: target.isActive ? "active" : "inactive",
          createdAt: target.createdAt || new Date(),
        };

        if (customer) {
          // Update existing customer record
          Object.assign(customer, customerData);
          await customer.save();
        } else {
          // Create new customer record
          await Customer.create(customerData);
        }
      } catch (syncErr) {
        console.error("[Customer Sync Error] Failed to sync customer record:", syncErr.message);
      }
    }

    await ensureRoleProfilesForUser(target);
    const fresh = await User.findById(target._id).select("-password").lean();
    
    // Requirement 7: Return updated user and linked store
    const responsePayload = {
      success: true,
      message: nextRole === "client" ? "Role updated and store linked successfully" : "Role updated",
      data: fresh,
    };

    if (nextRole === "client" && linkedStore) {
      responsePayload.store = {
        _id: linkedStore._id,
        name: linkedStore.shopName || linkedStore.companyName,
        slug: linkedStore._id, // Using ID as identifier
      };
      
      // Also look up custom domain if exists
      const CustomDomain = require("../models/CustomDomain");
      const domainRec = await CustomDomain.findOne({ clientId: linkedStore._id, status: "Verified" });
      if (domainRec) {
        responsePayload.store.customDomain = domainRec.domainName;
      }
    }

    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PATCH /api/users/platform/:id/status
// @access  Super Admin / Admin
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive status is required" });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userRole = normalizeRole(req.user?.role);
    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin";
    const clientId = req.user?.clientId || req.clientId;

    if (!isSuperAdmin && !isAdmin) {
      if (!clientId || (target.clientId && String(target.clientId) !== String(clientId))) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    if (target.role === "super_admin" || target.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
      return res.status(403).json({ success: false, message: "Super Admin status cannot be changed via API" });
    }

    target.isActive = isActive;
    await target.save();

    res.json({ success: true, message: `User ${isActive ? "activated" : "deactivated"}`, data: { _id: target._id, isActive: target.isActive } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/users/platform/:id/reset-password
// @access  Super Admin / Admin
const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userRole = normalizeRole(req.user?.role);
    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin";
    const clientId = req.user?.clientId || req.clientId;

    if (!isSuperAdmin && !isAdmin) {
      if (!clientId || (target.clientId && String(target.clientId) !== String(clientId))) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    if (target.role === "super_admin" || target.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
      return res.status(403).json({ success: false, message: "Super Admin password cannot be reset via API" });
    }

    target.password = password; // Mongoose 'pre-save' hook will hash it
    await target.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   DELETE /api/users/platform/:id
// @access  Super Admin
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    // Do not allow Super Admin to delete their own account
    if (String(id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userRole = normalizeRole(req.user?.role);
    if (userRole !== "super_admin") {
      return res.status(403).json({ success: false, message: "Access denied. Only Super Admin can delete users." });
    }

    // Protect seeded Super Admin
    if (target.role === "super_admin" || target.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
      return res.status(403).json({ success: false, message: "The seeded Super Admin account cannot be deleted" });
    }

    await User.findByIdAndDelete(id);

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getMe, updateMe, listPlatformUsers, updateUserRole, updateUserStatus, resetUserPassword, deleteUser };

