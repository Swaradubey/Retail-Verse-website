const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Employee = require('../models/Employee');
const VendorAllocation = require('../models/VendorAllocation');
const vendorAllocationService = require('../services/vendorAllocationService');
const { resolveClientId } = require('../utils/tenantResolver');

/**
 * Helper to resolve the vendor document corresponding to the authenticated user
 */
async function resolveVendorForUser(user, explicitVendorId = null) {
  const role = String(user?.role || '').toLowerCase();
  const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'client';

  // If privileged and explicitly provided a vendorId query/param, honor it
  if (isPrivileged && explicitVendorId && mongoose.Types.ObjectId.isValid(explicitVendorId)) {
    const v = await Vendor.findById(explicitVendorId).lean();
    if (v) return v;

    const u = await User.findById(explicitVendorId).lean();
    if (u) {
      return {
        _id: u._id,
        name: u.name,
        companyName: `${u.name} Supplies`,
        email: u.email,
        phone: u.phone || '',
        userId: u._id,
        isActive: true,
      };
    }
  }

  // 1. Look up by user._id directly
  const userOid = new mongoose.Types.ObjectId(String(user._id));

  // 2. Look up by vendorRef or userId
  let vendor = await Vendor.findOne({
    $or: [
      { userId: userOid },
      ...(user?.vendorRef ? [{ _id: user.vendorRef }] : []),
      ...(user?.email ? [{ email: user.email.toLowerCase().trim() }] : []),
    ],
  }).lean();

  if (vendor) return vendor;

  // 3. If user has role VENDOR, auto-provision and link a Vendor record
  if (role === 'vendor' || role === 'vendor_manager') {
    const newVendor = await Vendor.create({
      name: user.name || 'Vendor Partner',
      companyName: user.name ? `${user.name} Supplies` : 'Independent Vendor',
      email: user.email ? user.email.toLowerCase().trim() : `vendor_${user._id}@retailverse.in`,
      phone: user.phone || '',
      userId: user._id,
      clientId: user.clientId || null,
      isActive: true,
    });
    await User.updateOne({ _id: user._id }, { $set: { vendorRef: newVendor._id } });
    return newVendor.toObject ? newVendor.toObject() : newVendor;
  }

  // Fallback: return default vendor for testing
  const fallback = await Vendor.findOne({ isActive: true }).sort({ createdAt: 1 }).lean();
  return fallback;
}

// ── Controller Methods ───────────────────────────────────────────────────────

/**
 * GET /api/admin/vendors & /api/vendor-allocations/vendors & /api/vendors & /api/vendor/vendors
 * Fetch active vendors including users and employees created under "Users & Roles" with role: 'VENDOR'
 */
exports.getVendors = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    await vendorAllocationService.ensureDefaultVendors(clientId);

    // 1. Fetch from User collection (Users & Roles where role: VENDOR)
    const userVendorQuery = {
      role: { $in: ['vendor', 'VENDOR', 'Vendor', 'vendor_manager'] },
      isActive: { $ne: false },
      status: { $ne: 'inactive' },
    };
    if (clientId) {
      userVendorQuery.$or = [{ clientId }, { clientId: null }, { clientId: { $exists: false } }];
    }
    const usersWithVendorRole = await User.find(userVendorQuery)
      .select('_id name email phone role clientId vendorRef')
      .sort({ name: 1 })
      .lean();

    // 2. Fetch from Employee collection (staff created with VENDOR role)
    const employeeVendorQuery = {
      role: { $in: ['vendor', 'VENDOR', 'Vendor', 'vendor_manager'] },
      status: { $ne: 'inactive' },
    };
    if (clientId) {
      employeeVendorQuery.$or = [{ clientId }, { clientId: null }, { clientId: { $exists: false } }];
    }
    const employeesWithVendorRole = await Employee.find(employeeVendorQuery)
      .select('_id name email phone role clientId userId vendorRef shopName')
      .sort({ name: 1 })
      .lean();

    // 3. Fetch from Vendor collection
    const vendorQuery = { isActive: { $ne: false } };
    if (clientId) {
      vendorQuery.$or = [{ clientId }, { clientId: null }, { clientId: { $exists: false } }];
    }
    const vendorsFromDb = await Vendor.find(vendorQuery).sort({ name: 1 }).lean();

    // Deduplication sets
    const seenEmails = new Set();
    const seenUserIds = new Set();
    const mergedList = [];

    const registerVendor = (item) => {
      const email = String(item.email || '').toLowerCase().trim();
      const idStr = String(item._id);
      const userIdStr = item.userId ? String(item.userId) : '';

      if (email && seenEmails.has(email)) return;
      if (idStr && seenUserIds.has(idStr)) return;
      if (userIdStr && seenUserIds.has(userIdStr)) return;

      if (email) seenEmails.add(email);
      if (idStr) seenUserIds.add(idStr);
      if (userIdStr) seenUserIds.add(userIdStr);

      mergedList.push(item);
    };

    // First: Register User accounts so their exact user._id is selected for split allocations
    for (const u of usersWithVendorRole) {
      registerVendor({
        _id: u._id,
        name: u.name || u.email,
        companyName: u.companyName || u.shopName || '',
        email: u.email,
        phone: u.phone || '',
        userId: u._id,
        role: u.role,
        isUserAccount: true,
        isActive: true,
      });
    }

    // Second: Register Employee staff with VENDOR role
    for (const emp of employeesWithVendorRole) {
      const targetId = emp.userId || emp._id;
      registerVendor({
        _id: targetId,
        name: emp.name || emp.email,
        companyName: emp.shopName || '',
        email: emp.email,
        phone: emp.phone || '',
        userId: emp.userId || emp._id,
        role: emp.role,
        isUserAccount: true,
        isActive: true,
      });
    }

    // Third: Register standalone Vendor collection documents (strictly excluding any seeded dummy entries)
    for (const v of vendorsFromDb) {
      const vEmail = String(v.email || '').toLowerCase().trim();
      if (
        vEmail.endsWith('@retailverse.in') ||
        v.name?.includes('Apex') ||
        v.name?.includes('Global Sourcing') ||
        v.name?.includes('National Component')
      ) {
        continue;
      }
      registerVendor({
        _id: v._id,
        name: v.name || v.companyName || v.email,
        companyName: v.companyName && v.companyName !== v.name ? v.companyName : '',
        email: v.email,
        phone: v.phone || '',
        userId: v.userId || null,
        category: v.category || 'General Supplies',
        isUserAccount: !!v.userId,
        isActive: true,
      });
    }

    res.json({
      success: true,
      vendors: mergedList,
      count: mergedList.length,
      data: mergedList,
      items: mergedList,
    });
  } catch (error) {
    console.error('[vendorAllocationController] getVendors error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getVendorsList = exports.getVendors;

/**
 * POST /api/vendor-allocations/vendors
 * Create a new vendor
 */
exports.createVendor = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    const { name, companyName, email, phone, address, category, contactPerson } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Vendor name and email are required.' });
    }

    const existing = await Vendor.findOne({ email: email.toLowerCase().trim() }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'A vendor with this email already exists.' });
    }

    const vendor = await Vendor.create({
      name: name.trim(),
      companyName: (companyName || '').trim(),
      email: email.toLowerCase().trim(),
      phone: (phone || '').trim(),
      address: (address || '').trim(),
      category: (category || 'General Supplies').trim(),
      contactPerson: (contactPerson || '').trim(),
      clientId: clientId || null,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      vendor,
      data: vendor,
    });
  } catch (error) {
    console.error('[vendorAllocationController] createVendor error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor-allocations/allocate
 * Admin creates multi-vendor split allocations for replenishment
 */
exports.createSplitAllocation = async (req, res) => {
  try {
    const adminId = req.user._id;
    const clientId = await resolveClientId(req);
    const { productId, allocations } = req.body;

    if (!productId || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'productId and allocations array are required.',
      });
    }

    const created = await vendorAllocationService.createSplitAllocation({
      productId,
      adminId,
      allocations,
      clientId,
    });

    res.status(201).json({
      success: true,
      message: `Successfully allocated across ${created.length} vendor(s)`,
      allocations: created,
      data: created,
    });
  } catch (error) {
    console.error('[vendorAllocationController] createSplitAllocation error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/vendor-allocations/admin
 * Admin fetches all vendor allocations with read-receipt and progress badges
 */
exports.getAdminAllocations = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    const { status, productId, isSeen } = req.query;

    const allocations = await vendorAllocationService.getAdminAllocations({
      clientId,
      status,
      productId,
      isSeen,
    });

    res.json({
      success: true,
      allocations,
      count: allocations.length,
      data: allocations,
    });
  } catch (error) {
    console.error('[vendorAllocationController] getAdminAllocations error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/vendor-allocations/low-stock-summary
 * Low-stock inventory trigger list with active allocation status
 */
exports.getLowStockSummary = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    const items = await vendorAllocationService.getLowStockProductsWithAllocations(clientId);

    res.json({
      success: true,
      items,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error('[vendorAllocationController] getLowStockSummary error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/vendor/allocations & /api/vendor/requirements & /api/vendor-allocations/vendor
 * Fetches allocations directly assigned to this logged-in vendor user.
 * Seamlessly matches req.user._id, linked vendor profile ID, or vendorUserId.
 */
exports.getVendorAllocations = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'client';

    // Target user ID to lookup: either explicit vendorId for privileged tester, or req.user._id
    let targetId = req.user._id;
    if (isPrivileged && req.query.vendorId && mongoose.Types.ObjectId.isValid(req.query.vendorId)) {
      targetId = req.query.vendorId;
    }

    const { status, isSeen } = req.query;
    const allocations = await vendorAllocationService.getVendorAllocations(targetId, {
      status,
      isSeen,
      userEmail: req.user.email,
    });

    const vendor = await resolveVendorForUser(req.user, req.query.vendorId);

    res.json({
      success: true,
      vendor: vendor || { _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
      allocations,
      count: allocations.length,
      data: allocations, // Supports both res.allocations and res.data
    });
  } catch (error) {
    console.error('[vendorAllocationController] getVendorAllocations error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor/allocations/:id/seen & PATCH /api/vendor/allocations/:id/seen
 * Read-Receipt ("Seen" Feature): Vendor opens/views requirement
 */
exports.markAllocationSeen = async (req, res) => {
  try {
    const allocationId = req.params.id;
    if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
      return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
    }

    const updated = await vendorAllocationService.markAllocationAsSeen(allocationId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    res.json({
      success: true,
      message: 'Marked as seen',
      allocation: updated,
      data: updated,
    });
  } catch (error) {
    console.error('[vendorAllocationController] markAllocationSeen error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor/allocations/:id/status & PATCH /api/vendor/allocations/:id/status
 * Vendor updates status (ACCEPTED or DISPATCHED)
 */
exports.updateVendorStatus = async (req, res) => {
  try {
    const allocationId = req.params.id;
    const { status, vendorNotes, notes } = req.body;
    const finalNotes = vendorNotes !== undefined ? vendorNotes : (notes || '');

    const updated = await vendorAllocationService.updateVendorStatus(allocationId, {
      status,
      vendorNotes: finalNotes,
    });

    res.json({
      success: true,
      message: `Allocation status updated to ${status}`,
      allocation: updated,
      data: updated,
    });
  } catch (error) {
    console.error('[vendorAllocationController] updateVendorStatus error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor/allocations/:id/update-stock & /api/vendor-allocations/:id/update-stock
 * Vendor updates and fulfills replenishment stock directly into Product and Inventory
 */
exports.vendorUpdateStock = async (req, res) => {
  try {
    const allocationId = req.params.id;
    const vendorUserId = req.user._id;
    const { quantity, vendorNotes, notes } = req.body;
    const finalNotes = vendorNotes !== undefined ? vendorNotes : (notes || '');

    const result = await vendorAllocationService.vendorUpdateStock({
      allocationId,
      vendorUserId,
      quantity,
      vendorNotes: finalNotes,
    });

    res.json({
      success: true,
      message: `Stock updated successfully! Added ${result.addedQuantity} units directly into inventory (New Stock: ${result.newStock}).`,
      allocation: result.allocation,
      newStock: result.newStock,
      product: result.product,
      data: result.allocation,
    });
  } catch (error) {
    console.error('[vendorAllocationController] vendorUpdateStock error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor/allocations/:id/dispatch
 * Vendor marks order as dispatched & updates inventory stock immediately
 */
exports.dispatchAllocation = async (req, res) => {
  try {
    const allocationId = req.params.id;
    const vendorUserId = req.user._id;
    const { quantity, vendorNotes, notes } = req.body;
    const finalNotes = vendorNotes !== undefined ? vendorNotes : (notes || '');

    // Increment inventory stock and mark dispatched/received
    const result = await vendorAllocationService.vendorUpdateStock({
      allocationId,
      vendorUserId,
      quantity,
      vendorNotes: finalNotes,
    });

    res.json({
      success: true,
      message: `Order dispatched and stock updated successfully! Added ${result.addedQuantity} units to inventory (New Stock: ${result.newStock}).`,
      allocation: result.allocation,
      newStock: result.newStock,
      product: result.product,
      data: result.allocation,
    });
  } catch (error) {
    console.error('[vendorAllocationController] dispatchAllocation error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor-allocations/:id/receive
 * Admin confirms receipt of dispatched goods, automatically incrementing product stock
 */
exports.receiveAllocation = async (req, res) => {
  try {
    const allocationId = req.params.id;
    const adminId = req.user._id;

    const result = await vendorAllocationService.receiveAllocation(allocationId, adminId);

    res.json({
      success: true,
      message: `Stock replenished successfully. Product stock increased by ${result.allocation.allocatedQuantity} units.`,
      allocation: result.allocation,
      newStock: result.product?.stock,
      data: result.allocation,
    });
  } catch (error) {
    console.error('[vendorAllocationController] receiveAllocation error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/vendor-allocations/:id/cancel
 * Admin cancels an allocation
 */
exports.cancelAllocation = async (req, res) => {
  try {
    const allocationId = req.params.id;
    const adminId = req.user._id;

    const cancelled = await vendorAllocationService.cancelAllocation(allocationId, adminId);

    res.json({
      success: true,
      message: 'Allocation cancelled successfully',
      allocation: cancelled,
      data: cancelled,
    });
  } catch (error) {
    console.error('[vendorAllocationController] cancelAllocation error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/vendor-allocations/vendor/stats & /api/vendor/stats
 * Vendor portal KPI metrics
 */
exports.getVendorStats = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'client';

    let targetId = req.user._id;
    if (isPrivileged && req.query.vendorId && mongoose.Types.ObjectId.isValid(req.query.vendorId)) {
      targetId = req.query.vendorId;
    }

    const allocations = await vendorAllocationService.getVendorAllocations(targetId, {
      userEmail: req.user.email,
    });

    const vendor = await resolveVendorForUser(req.user, req.query.vendorId);

    const stats = {
      totalAllocations: allocations.length,
      pending: allocations.filter((a) => a.status === 'PENDING').length,
      accepted: allocations.filter((a) => a.status === 'ACCEPTED').length,
      dispatched: allocations.filter((a) => a.status === 'DISPATCHED').length,
      received: allocations.filter((a) => a.status === 'RECEIVED').length,
      totalUnitsAllocated: allocations.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0),
      seenCount: allocations.filter((a) => a.isSeen).length,
      unseenCount: allocations.filter((a) => !a.isSeen).length,
    };

    res.json({
      success: true,
      vendor: vendor || { _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
      stats,
      data: stats,
    });
  } catch (error) {
    console.error('[vendorAllocationController] getVendorStats error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/vendor-allocations/:id & /api/vendor/allocations/:id
 * Delete a vendor allocation record efficiently
 */
exports.deleteAllocation = async (req, res) => {
  try {
    const allocationId = req.params.id;
    if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
      return res.status(400).json({ success: false, message: 'Invalid allocation ID' });
    }

    const deleted = await vendorAllocationService.deleteAllocation(allocationId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    return res.json({
      success: true,
      message: 'Allocation deleted successfully',
      allocation: deleted,
      data: deleted,
    });
  } catch (error) {
    console.error('[vendorAllocationController] deleteAllocation error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
