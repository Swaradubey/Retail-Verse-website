const mongoose = require('mongoose');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const VendorAllocation = require('../models/VendorAllocation');
const { getFullImageUrl } = require('../utils/formatInventoryProduct');
const vendorAllocationCache = require('../utils/vendorAllocationCache');

function normalizeAllocatedProduct(productDoc) {
  if (!productDoc || typeof productDoc !== 'object') return productDoc;
  const p = productDoc.toObject ? productDoc.toObject() : { ...productDoc };
  const stockVal =
    p.currentStock !== undefined
      ? p.currentStock
      : p.stockLevel !== undefined
      ? p.stockLevel
      : p.stock;
  p.currentStock = Number(stockVal || 0);
  p.stock = p.currentStock;
  p.threshold = Number(p.lowStockAlert ?? p.lowStockThreshold ?? p.minStock ?? 5);

  const rawImg = p.imageUrl || p.image || '';
  const fullUrl = getFullImageUrl(rawImg);
  p.imageUrl = fullUrl || '';
  p.image = fullUrl || p.image || '';
  if (!p.images || !Array.isArray(p.images) || p.images.length === 0) {
    p.images = [fullUrl].filter(Boolean);
  } else {
    p.images = p.images.map((img) => (typeof img === 'string' ? getFullImageUrl(img) : img));
  }
  return p;
}

function normalizeAllocation(allocDoc) {
  if (!allocDoc || typeof allocDoc !== 'object') return allocDoc;
  const alloc = allocDoc.toObject ? allocDoc.toObject() : { ...allocDoc };
  if (alloc.productId) {
    alloc.productId = normalizeAllocatedProduct(alloc.productId);
  }
  if (!alloc.vendorId || typeof alloc.vendorId !== 'object') {
    alloc.vendorId = {
      _id: alloc.vendorId || alloc.vendorUserId || '',
      name: alloc.vendorName || (typeof alloc.vendorId === 'string' ? alloc.vendorId : 'Assigned Vendor'),
      companyName: alloc.vendorName ? `${alloc.vendorName} Supplies` : 'Vendor Partner',
      email: alloc.vendorEmail || '',
    };
  }
  return alloc;
}

function normalizeAllocations(allocDocs) {
  if (!Array.isArray(allocDocs)) return [];
  return allocDocs.map(normalizeAllocation);
}

/**
 * Ensure default vendors:
 * Static/dummy vendors are completely disabled.
 * The system exclusively displays registered vendors created under Users & Roles or active Vendors.
 */
async function ensureDefaultVendors(clientId = null) {
  try {
    // Clean up any previously seeded static vendors so dropdown remains 100% clean
    await Vendor.deleteMany({
      $or: [
        { email: { $in: ['vendor.apex@retailverse.in', 'vendor.prime@retailverse.in', 'vendor.global@retailverse.in'] } },
        { name: { $in: ['Apex Wholesale & Logistics', 'Prime Retail Distributors', 'Global Sourcing & Hardware', 'Apex Global Supplies', 'National Component Hub', 'Premier Components Ltd'] } },
      ],
    });
  } catch {
    // Non-blocking cleanup
  }
}

/**
 * Creates multi-vendor split allocations for a low-stock product.
 * Seamlessly handles vendors created under "Users & Roles" (role: VENDOR) as well as Vendor profiles.
 */
async function createSplitAllocation({ productId, adminId, allocations, clientId = null }) {
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error('A valid productId is required.');
  }

  if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
    throw new Error('A valid adminId is required.');
  }

  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('At least one vendor allocation split is required.');
  }

  const product = await Product.findById(productId)
    .select('name sku stock stockLevel clientId lowStockAlert lowStockThreshold minStock')
    .lean();

  if (!product) {
    throw new Error(`Product not found with ID: ${productId}`);
  }

  const currentStock = Number(
    product.stockLevel !== undefined ? product.stockLevel : (product.stock || 0)
  );

  const documentsToInsert = [];

  for (const item of allocations) {
    const vIdStr = String(item.vendorId || '').trim();
    if (!vIdStr) {
      throw new Error(`A valid vendor ID or name is required.`);
    }

    const isValidOid = mongoose.Types.ObjectId.isValid(vIdStr);
    const targetOid = isValidOid ? new mongoose.Types.ObjectId(vIdStr) : null;

    let userDoc = null;
    let employeeDoc = null;
    let vendorDoc = null;

    if (isValidOid) {
      // 1. Check if target is a User with role VENDOR (from Users & Roles)
      userDoc = await User.findOne({
        _id: targetOid,
        role: { $in: ['vendor', 'VENDOR', 'Vendor', 'vendor_manager'] },
      })
        .select('_id name email role clientId vendorRef')
        .lean();

      // 2. Check if target is an Employee staff record
      try {
        const Employee = require('../models/Employee');
        employeeDoc = await Employee.findById(targetOid).lean();
        if (employeeDoc && !userDoc && employeeDoc.userId) {
          userDoc = await User.findById(employeeDoc.userId)
            .select('_id name email role clientId vendorRef')
            .lean();
        }
      } catch {
        // Ignore if Employee model not found
      }

      // 3. Check if target is a Vendor document
      vendorDoc = await Vendor.findById(targetOid).lean();
    }

    // If not resolved by ObjectId, or if vIdStr is a string name (e.g. "shreya" or "shreya Supplies")
    if (!userDoc && !employeeDoc && !vendorDoc) {
      const escaped = vIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const baseName = vIdStr.replace(/\s+Supplies$/i, '').trim();
      const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePatterns = [
        new RegExp(`^${escaped}$`, 'i'),
        new RegExp(`^${escapedBase}$`, 'i'),
      ];

      userDoc = await User.findOne({
        $or: [
          { name: { $in: namePatterns } },
          { email: vIdStr.toLowerCase() },
        ],
        role: { $in: ['vendor', 'VENDOR', 'Vendor', 'vendor_manager'] },
      })
        .select('_id name email role clientId vendorRef')
        .lean();

      try {
        const Employee = require('../models/Employee');
        employeeDoc = await Employee.findOne({
          $or: [
            { name: { $in: namePatterns } },
            { shopName: { $in: namePatterns } },
            { email: vIdStr.toLowerCase() },
          ],
        }).lean();
        if (employeeDoc && !userDoc && employeeDoc.userId) {
          userDoc = await User.findById(employeeDoc.userId)
            .select('_id name email role clientId vendorRef')
            .lean();
        }
      } catch {}

      vendorDoc = await Vendor.findOne({
        $or: [
          { name: { $in: namePatterns } },
          { companyName: { $in: namePatterns } },
          { email: vIdStr.toLowerCase() },
        ],
      }).lean();
    }

    // If target matched a Vendor document, resolve its linked user if present
    if (vendorDoc && !userDoc && vendorDoc.userId) {
      userDoc = await User.findById(vendorDoc.userId)
        .select('_id name email role clientId vendorRef')
        .lean();
    }

    // If target matched an Employee document, resolve its linked vendor if present
    if (employeeDoc && !vendorDoc) {
      vendorDoc = await Vendor.findOne({
        $or: [
          ...(employeeDoc.userId ? [{ userId: employeeDoc.userId }] : []),
          ...(employeeDoc.vendorRef ? [{ _id: employeeDoc.vendorRef }] : []),
          ...(employeeDoc.email ? [{ email: employeeDoc.email.toLowerCase().trim() }] : []),
        ],
      }).lean();
    }

    // If target matched a User, find or auto-link their Vendor profile
    if (userDoc && !vendorDoc) {
      vendorDoc = await Vendor.findOne({
        $or: [
          { userId: userDoc._id },
          { email: userDoc.email.toLowerCase().trim() },
          ...(userDoc.vendorRef ? [{ _id: userDoc.vendorRef }] : []),
        ],
      }).lean();

      if (!vendorDoc) {
        vendorDoc = await Vendor.create({
          name: userDoc.name || 'Vendor Partner',
          companyName: `${userDoc.name} Supplies`,
          email: userDoc.email.toLowerCase().trim(),
          userId: userDoc._id,
          clientId: userDoc.clientId || null,
          isActive: true,
        });
        await User.updateOne({ _id: userDoc._id }, { $set: { vendorRef: vendorDoc._id } });
      }
    }

    // Fallback: check if target is any User doc
    if (!userDoc && !vendorDoc && isValidOid) {
      userDoc = await User.findById(targetOid).select('_id name email role clientId vendorRef').lean();
    }

    if (!userDoc && !vendorDoc && !employeeDoc && !isValidOid) {
      vendorDoc = await Vendor.create({
        name: vIdStr,
        companyName: `${vIdStr} Supplies`,
        email: `vendor_${Date.now()}@retailverse.in`,
        isActive: true,
      });
    }

    if (!userDoc && !vendorDoc && !employeeDoc) {
      throw new Error(`Vendor not found or inactive: ${item.vendorId}`);
    }

    const qty = Number(item.allocatedQuantity);
    if (!qty || qty < 1 || isNaN(qty)) {
      throw new Error(
        `Allocated quantity must be at least 1 unit. Provided: ${item.allocatedQuantity}`
      );
    }

    const resolvedName =
      vendorDoc?.name ||
      vendorDoc?.companyName ||
      employeeDoc?.name ||
      employeeDoc?.shopName ||
      userDoc?.name ||
      vIdStr;

    const resolvedEmail =
      vendorDoc?.email ||
      employeeDoc?.email ||
      userDoc?.email ||
      '';

    const resolvedVendorId =
      targetOid ||
      vendorDoc?._id ||
      employeeDoc?._id ||
      userDoc?._id ||
      vIdStr;

    const resolvedVendorUserId =
      userDoc?._id ||
      employeeDoc?.userId ||
      vendorDoc?.userId ||
      (isValidOid ? targetOid : null);

    let resolvedVendorModel = 'Vendor';
    if (vendorDoc && String(vendorDoc._id) === String(resolvedVendorId)) {
      resolvedVendorModel = 'Vendor';
    } else if (employeeDoc && String(employeeDoc._id) === String(resolvedVendorId)) {
      resolvedVendorModel = 'Employee';
    } else if (userDoc && String(userDoc._id) === String(resolvedVendorId)) {
      resolvedVendorModel = 'User';
    }

    documentsToInsert.push({
      productId: product._id,
      adminId,
      vendorId: resolvedVendorId,
      vendorUserId: resolvedVendorUserId,
      vendorName: resolvedName,
      vendorEmail: resolvedEmail,
      vendorModel: resolvedVendorModel,
      allocatedQuantity: Math.floor(qty),
      currentStockAtTrigger: currentStock,
      targetDeliveryDate: item.targetDeliveryDate ? new Date(item.targetDeliveryDate) : null,
      status: item.status || 'PENDING',
      isSeen: false,
      seenAt: null,
      vendorNotes: item.notes ? String(item.notes).trim() : '',
      clientId: clientId || product.clientId || null,
    });
  }

  const createdAllocations = await VendorAllocation.insertMany(documentsToInsert);
  vendorAllocationCache.invalidate();

  // Return populated documents using lean queries
  const populated = await VendorAllocation.find({
    _id: { $in: createdAllocations.map((a) => a._id) },
  })
    .populate('productId', 'name sku category image imageUrl price stock stockLevel')
    .populate('vendorId', 'name companyName email phone')
    .populate('adminId', 'name email')
    .lean();

  return normalizeAllocations(populated);
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves candidate ObjectIds, string IDs, candidate names, and candidate emails
 * associated with a vendor user across User, Employee, and Vendor collections.
 */
async function resolveVendorContext(vendorUserId, { userEmail = '', userName = '', vendorId = null } = {}) {
  const candidateObjectIds = [];
  const candidateIdStrings = new Set();
  const candidateNames = new Set();
  const candidateEmails = new Set();

  const addId = (id) => {
    if (!id) return;
    const str = String(id).trim();
    if (!str) return;
    if (mongoose.Types.ObjectId.isValid(str)) {
      const oid = new mongoose.Types.ObjectId(str);
      if (!candidateObjectIds.some((existing) => existing.equals(oid))) {
        candidateObjectIds.push(oid);
      }
      candidateIdStrings.add(str);
    } else {
      candidateNames.add(str);
    }
  };

  const addName = (name) => {
    if (!name) return;
    const str = String(name).trim();
    if (str) {
      candidateNames.add(str);
      if (/\s+Supplies$/i.test(str)) {
        candidateNames.add(str.replace(/\s+Supplies$/i, '').trim());
      } else {
        candidateNames.add(`${str} Supplies`);
      }
    }
  };

  const addEmail = (email) => {
    if (!email) return;
    const str = String(email).trim().toLowerCase();
    if (str) {
      candidateEmails.add(str);
    }
  };

  addId(vendorUserId);
  addId(vendorId);
  addName(userName);
  addEmail(userEmail);

  const initialIds = [...candidateObjectIds];
  const initialEmails = [...candidateEmails];
  const initialNames = [...candidateNames];

  // 1. Find matching Users
  const userOr = [];
  if (initialIds.length > 0) {
    userOr.push({ _id: { $in: initialIds } });
    userOr.push({ vendorRef: { $in: initialIds } });
  }
  if (initialEmails.length > 0) {
    userOr.push({ email: { $in: initialEmails } });
  }
  for (const name of initialNames) {
    userOr.push({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  }

  if (userOr.length > 0) {
    try {
      const matchedUsers = await User.find({ $or: userOr })
        .select('_id name email role vendorRef clientId')
        .lean();
      for (const u of matchedUsers) {
        addId(u._id);
        addId(u.vendorRef);
        addName(u.name);
        addEmail(u.email);
      }
    } catch {}
  }

  // 2. Find matching Vendors
  const vendorOr = [];
  if (candidateObjectIds.length > 0) {
    vendorOr.push({ _id: { $in: candidateObjectIds } });
    vendorOr.push({ userId: { $in: candidateObjectIds } });
  }
  if (candidateEmails.size > 0) {
    vendorOr.push({ email: { $in: [...candidateEmails] } });
  }
  for (const name of [...candidateNames]) {
    const escaped = escapeRegex(name);
    vendorOr.push({ name: new RegExp(`^${escaped}$`, 'i') });
    vendorOr.push({ companyName: new RegExp(`^${escaped}$`, 'i') });
  }

  if (vendorOr.length > 0) {
    try {
      const matchedVendors = await Vendor.find({ $or: vendorOr })
        .select('_id userId name companyName email phone')
        .lean();
      for (const v of matchedVendors) {
        addId(v._id);
        addId(v.userId);
        addName(v.name);
        addName(v.companyName);
        addEmail(v.email);
      }
    } catch {}
  }

  // 3. Find matching Employees
  try {
    const Employee = require('../models/Employee');
    const empOr = [];
    if (candidateObjectIds.length > 0) {
      empOr.push({ _id: { $in: candidateObjectIds } });
      empOr.push({ userId: { $in: candidateObjectIds } });
      empOr.push({ vendorRef: { $in: candidateObjectIds } });
    }
    if (candidateEmails.size > 0) {
      empOr.push({ email: { $in: [...candidateEmails] } });
    }
    for (const name of [...candidateNames]) {
      const escaped = escapeRegex(name);
      empOr.push({ name: new RegExp(`^${escaped}$`, 'i') });
      empOr.push({ shopName: new RegExp(`^${escaped}$`, 'i') });
    }

    if (empOr.length > 0) {
      const matchedEmployees = await Employee.find({ $or: empOr })
        .select('_id userId vendorRef name shopName email phone')
        .lean();
      for (const emp of matchedEmployees) {
        addId(emp._id);
        addId(emp.userId);
        addId(emp.vendorRef);
        addName(emp.name);
        addName(emp.shopName);
        addEmail(emp.email);
      }
    }
  } catch {}

  return {
    candidateObjectIds,
    candidateIdStrings: [...candidateIdStrings],
    candidateNames: [...candidateNames],
    candidateEmails: [...candidateEmails],
  };
}

/**
 * Constructs MongoDB match query for vendor allocations matching EITHER:
 * - vendorId === currentUser._id
 * - vendorId === currentUser.vendorId / vendorRef
 * - vendorUserId === currentUser._id
 * - vendorId === "shreya" (string ID or name)
 * - case-insensitive vendorName === currentUser.name or vendorEmail match
 */
function buildVendorMatchQuery(context) {
  const { candidateObjectIds, candidateIdStrings, candidateNames, candidateEmails } = context;
  const matchOr = [];

  if (candidateObjectIds.length > 0) {
    matchOr.push({ vendorId: { $in: candidateObjectIds } });
    matchOr.push({ vendorUserId: { $in: candidateObjectIds } });
    matchOr.push({ 'vendorId.userId': { $in: candidateObjectIds } });
  }

  if (candidateIdStrings.length > 0) {
    matchOr.push({ vendorId: { $in: candidateIdStrings } });
    matchOr.push({ vendorUserId: { $in: candidateIdStrings } });
  }

  if (candidateNames.length > 0) {
    const nameRegexes = candidateNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i'));
    matchOr.push({ vendorName: { $in: nameRegexes } });
    matchOr.push({ vendorId: { $in: nameRegexes } });
  }

  if (candidateEmails.length > 0) {
    matchOr.push({ vendorEmail: { $in: candidateEmails } });
  }

  return matchOr.length > 0 ? { $or: matchOr } : { _id: null };
}

/**
 * Resolves candidate ObjectIds associated with a vendor user (User._id, Vendor._id, Employee._id, linked IDs)
 */
async function resolveVendorCandidateIds(vendorUserId, userEmail = '') {
  const context = await resolveVendorContext(vendorUserId, { userEmail });
  return context.candidateObjectIds;
}

/**
 * Retrieves summary metrics for Vendor portal via a single optimized aggregation query
 */
async function getVendorMetrics(vendorUserId, options = {}) {
  const opts = typeof options === 'string' ? { userEmail: options } : (options || {});
  if (!vendorUserId) {
    return {
      totalAllocations: 0,
      totalUnits: 0,
      pending: 0,
      accepted: 0,
      dispatched: 0,
      received: 0,
      unreadCount: 0,
    };
  }

  const context = await resolveVendorContext(vendorUserId, opts);
  const vendorMatch = buildVendorMatchQuery(context);

  const [agg] = await VendorAllocation.aggregate([
    {
      $match: {
        ...vendorMatch,
        status: { $ne: 'CANCELLED' },
      },
    },
    {
      $group: {
        _id: null,
        totalAllocations: { $sum: 1 },
        totalUnits: { $sum: { $ifNull: ['$allocatedQuantity', 0] } },
        pending: {
          $sum: {
            $cond: [
              { $in: ['$status', ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED']] },
              1,
              0,
            ],
          },
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] },
        },
        dispatched: {
          $sum: { $cond: [{ $eq: ['$status', 'DISPATCHED'] }, 1, 0] },
        },
        received: {
          $sum: { $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0] },
        },
        unreadCount: {
          $sum: { $cond: [{ $ne: ['$isSeen', true] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    totalAllocations: agg?.totalAllocations || 0,
    totalUnits: agg?.totalUnits || 0,
    pending: agg?.pending || 0,
    accepted: agg?.accepted || 0,
    dispatched: agg?.dispatched || 0,
    received: agg?.received || 0,
    unreadCount: agg?.unreadCount || 0,
  };
}

/**
 * Retrieves allocations for Admin view with server-side pagination, search, projections, and delivery metrics
 */
async function getAdminAllocations({
  clientId = null,
  page = 1,
  limit = 10,
  status = null,
  search = '',
  productId = null,
  isSeen = null,
}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const cacheKey = vendorAllocationCache.generateAdminKey(clientId, {
    page: parsedPage,
    limit: parsedLimit,
    status,
    search,
    productId,
    isSeen,
  });

  const cached = vendorAllocationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const query = {};

  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    query.clientId = new mongoose.Types.ObjectId(String(clientId));
  }

  if (status && status !== 'ALL') {
    if (status === 'PENDING' || status === 'PENDING_ACCEPTANCE' || status === 'PUBLISHED') {
      query.status = { $in: ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED'] };
    } else if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    query.productId = new mongoose.Types.ObjectId(String(productId));
  }

  if (isSeen !== null && isSeen !== undefined) {
    query.isSeen = isSeen === true || isSeen === 'true';
  }

  if (search && String(search).trim()) {
    const clean = String(search).trim();
    const regex = new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [matchingProducts, matchingVendors, matchingUsers] = await Promise.all([
      Product.find({ $or: [{ name: regex }, { sku: regex }] }).select('_id').lean(),
      Vendor.find({ $or: [{ name: regex }, { companyName: regex }] }).select('_id').lean(),
      User.find({ name: regex }).select('_id').lean(),
    ]);

    const pIds = matchingProducts.map((p) => p._id);
    const vIds = [
      ...matchingVendors.map((v) => v._id),
      ...matchingUsers.map((u) => u._id),
    ];

    const searchOr = [];
    if (pIds.length > 0) searchOr.push({ productId: { $in: pIds } });
    if (vIds.length > 0) searchOr.push({ vendorId: { $in: vIds } });
    if (mongoose.Types.ObjectId.isValid(clean)) {
      searchOr.push({ _id: new mongoose.Types.ObjectId(clean) });
    }

    if (searchOr.length > 0) {
      query.$and = (query.$and || []).concat([{ $or: searchOr }]);
    } else {
      query._id = new mongoose.Types.ObjectId('000000000000000000000000');
    }
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const allocationFields =
    'productId vendorId adminId vendorModel vendorUserId allocatedQuantity currentStockAtTrigger targetDeliveryDate status isSeen seenAt vendorNotes fulfilledQuantity stockUpdatedToInventory stockUpdatedAt dispatchedAt receivedAt clientId createdAt updatedAt';
  const productFields =
    'name sku category image imageUrl images price stock stockLevel lowStockAlert lowStockThreshold minStock';
  const vendorFields = 'name companyName email phone address';
  const adminFields = 'name email';

  const metricsMatch = clientId && mongoose.Types.ObjectId.isValid(clientId)
    ? { clientId: new mongoose.Types.ObjectId(String(clientId)) }
    : {};

  const dataPromise = VendorAllocation.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .select(allocationFields)
    .populate('productId', productFields)
    .populate('vendorId', vendorFields)
    .populate('adminId', adminFields)
    .lean();

  const countPromise = VendorAllocation.countDocuments(query);

  const metricsPromise = VendorAllocation.aggregate([
    { $match: metricsMatch },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalUnits: { $sum: { $ifNull: ['$allocatedQuantity', 0] } },
        inTransit: {
          $sum: { $cond: [{ $eq: ['$status', 'DISPATCHED'] }, 1, 0] },
        },
        received: {
          $sum: { $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0] },
        },
        unread: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ['$isSeen', true] }, { $ne: ['$status', 'RECEIVED'] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const [rawDocs, totalCount, metricsAggResult] = await Promise.all([
    dataPromise,
    countPromise,
    metricsPromise,
  ]);

  const normalizedDocs = normalizeAllocations(rawDocs);
  const totalPages = Math.ceil(totalCount / parsedLimit) || 1;
  const agg = metricsAggResult && metricsAggResult[0] ? metricsAggResult[0] : null;
  const metrics = {
    total: agg?.total || 0,
    totalUnits: agg?.totalUnits || 0,
    inTransit: agg?.inTransit || 0,
    received: agg?.received || 0,
    unread: agg?.unread || 0,
  };

  const result = {
    data: normalizedDocs,
    allocations: normalizedDocs,
    pagination: {
      total: totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
    metrics,
  };

  vendorAllocationCache.set(cacheKey, result);
  return result;
}

/**
 * Retrieves allocations assigned to a specific vendor user with server-side pagination, search, and metrics.
 * Seamlessly resolves both User _id and Vendor _id to guarantee all split requirements display.
 */
async function getVendorAllocations(
  vendorUserId,
  { page = 1, limit = 10, status = null, search = '', isSeen = null, userEmail = '', userName = '', vendorId = null } = {}
) {
  if (!vendorUserId) {
    throw new Error('Valid vendor identifier is required.');
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const cacheKey = vendorAllocationCache.generateVendorKey(vendorUserId, {
    page: parsedPage,
    limit: parsedLimit,
    status,
    search,
    isSeen,
  });

  const cached = vendorAllocationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const context = await resolveVendorContext(vendorUserId, { userEmail, userName, vendorId });
  const vendorMatch = buildVendorMatchQuery(context);

  const query = {
    ...vendorMatch,
  };

  if (status && status !== 'ALL') {
    if (status === 'PENDING' || status === 'PENDING_ACCEPTANCE' || status === 'PUBLISHED') {
      query.status = { $in: ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED'] };
    } else if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  } else {
    // Default: exclude cancelled items
    query.status = { $ne: 'CANCELLED' };
  }

  if (isSeen !== null && isSeen !== undefined) {
    query.isSeen = isSeen === true || isSeen === 'true';
  }

  if (search && String(search).trim()) {
    const clean = String(search).trim();
    const regex = new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingProducts = await Product.find({
      $or: [{ name: regex }, { sku: regex }],
    })
      .select('_id')
      .lean();

    const pIds = matchingProducts.map((p) => p._id);
    const searchOr = [];
    if (pIds.length > 0) searchOr.push({ productId: { $in: pIds } });
    if (mongoose.Types.ObjectId.isValid(clean)) {
      searchOr.push({ _id: new mongoose.Types.ObjectId(clean) });
    }

    if (searchOr.length > 0) {
      query.$and = (query.$and || []).concat([{ $or: searchOr }]);
    } else {
      query._id = new mongoose.Types.ObjectId('000000000000000000000000');
    }
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const allocationFields =
    'productId vendorId adminId vendorModel vendorUserId vendorName vendorEmail allocatedQuantity currentStockAtTrigger targetDeliveryDate status isSeen seenAt vendorNotes fulfilledQuantity stockUpdatedToInventory stockUpdatedAt dispatchedAt receivedAt clientId createdAt updatedAt';
  const productFields =
    'name sku category image imageUrl images price currentStock stock stockLevel lowStockAlert lowStockThreshold minStock';
  const vendorFields = 'name companyName email phone address';
  const adminFields = 'name email';

  const vendorMetricsMatch = {
    ...vendorMatch,
    status: { $ne: 'CANCELLED' },
  };

  // Fast execution leveraging compound indexes on { vendorId: 1, createdAt: -1 } and { vendorUserId: 1, createdAt: -1 }
  const dataPromise = VendorAllocation.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .select(allocationFields)
    .populate('productId', productFields)
    .populate('vendorId', vendorFields)
    .populate('adminId', adminFields)
    .lean();

  const countPromise = VendorAllocation.countDocuments(query);

  const metricsPromise = VendorAllocation.aggregate([
    { $match: vendorMetricsMatch },
    {
      $group: {
        _id: null,
        totalAllocations: { $sum: 1 },
        totalUnits: { $sum: { $ifNull: ['$allocatedQuantity', 0] } },
        pending: {
          $sum: {
            $cond: [
              { $in: ['$status', ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED']] },
              1,
              0,
            ],
          },
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] },
        },
        dispatched: {
          $sum: { $cond: [{ $eq: ['$status', 'DISPATCHED'] }, 1, 0] },
        },
        received: {
          $sum: { $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0] },
        },
        unreadCount: {
          $sum: { $cond: [{ $ne: ['$isSeen', true] }, 1, 0] },
        },
      },
    },
  ]);

  const [rawDocs, totalCount, metricsAggResult] = await Promise.all([
    dataPromise,
    countPromise,
    metricsPromise,
  ]);

  const normalizedDocs = normalizeAllocations(rawDocs);
  const totalPages = Math.ceil(totalCount / parsedLimit) || 1;
  const agg = metricsAggResult && metricsAggResult[0] ? metricsAggResult[0] : null;
  const metrics = {
    totalAllocations: agg?.totalAllocations || 0,
    totalUnits: agg?.totalUnits || 0,
    pending: agg?.pending || 0,
    accepted: agg?.accepted || 0,
    dispatched: agg?.dispatched || 0,
    received: agg?.received || 0,
    unreadCount: agg?.unreadCount || 0,
  };

  const result = {
    data: normalizedDocs,
    allocations: normalizedDocs,
    pagination: {
      total: totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
    metrics,
    stats: metrics,
  };

  vendorAllocationCache.set(cacheKey, result);
  return result;
}

/**
 * Updates read-receipt timestamp when a vendor views the requirement in their portal
 */
async function markAllocationAsSeen(allocationId) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  // Atomically mark seenAt timestamp
  const updated = await VendorAllocation.findByIdAndUpdate(
    allocationId,
    {
      $set: {
        isSeen: true,
        seenAt: new Date(),
      },
    },
    { new: true }
  )
    .populate(
      'productId',
      'name sku image imageUrl images price category currentStock stock stockLevel lowStockAlert lowStockThreshold minStock'
    )
    .populate('vendorId', 'name companyName email phone address')
    .lean();

  vendorAllocationCache.invalidate();
  return normalizeAllocation(updated);
}

/**
 * Vendor updates status (ACCEPTED, DISPATCHED)
 */
async function updateVendorStatus(allocationId, { status, vendorNotes = '' }) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  const validTransitions = ['ACCEPTED', 'DISPATCHED'];
  if (!validTransitions.includes(status)) {
    throw new Error(`Vendor can only transition status to ACCEPTED or DISPATCHED.`);
  }

  const updateFields = {
    status,
    isSeen: true,
    seenAt: new Date(),
  };

  if (vendorNotes) {
    updateFields.vendorNotes = String(vendorNotes).trim();
  }

  if (status === 'DISPATCHED') {
    updateFields.dispatchedAt = new Date();
  }

  const updated = await VendorAllocation.findByIdAndUpdate(
    allocationId,
    { $set: updateFields },
    { new: true }
  )
    .populate(
      'productId',
      'name sku image imageUrl images price category currentStock stock stockLevel lowStockAlert lowStockThreshold minStock'
    )
    .populate('vendorId', 'name companyName email phone address')
    .lean();

  vendorAllocationCache.invalidate();
  return updated;
}

/**
 * Admin confirms receipt of replenishment, automatically incrementing product stock
 */
async function receiveAllocation(allocationId, adminId) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  const allocation = await VendorAllocation.findById(allocationId);
  if (!allocation) {
    throw new Error('Allocation not found.');
  }

  if (allocation.status === 'RECEIVED') {
    throw new Error('This allocation has already been marked as RECEIVED.');
  }

  const qty = Number(allocation.allocatedQuantity);
  if (!qty || qty <= 0) {
    throw new Error('Invalid allocated quantity on document.');
  }

  // 1. Mark status as RECEIVED
  allocation.status = 'RECEIVED';
  allocation.receivedAt = new Date();
  await allocation.save();

  // 2. Automatically increment product stock in DB
  const updatedProduct = await Product.findByIdAndUpdate(
    allocation.productId,
    {
      $inc: {
        stock: qty,
        stockLevel: qty,
      },
    },
    { new: true }
  ).lean();

  // 3. Non-blocking inventory synchronization for central cache / pos
  setImmediate(async () => {
    try {
      if (updatedProduct) {
        const { updateInventory } = require('./inventoryService');
        await updateInventory({
          tenantId: updatedProduct.clientId || null,
          productId: updatedProduct._id,
          quantity: updatedProduct.stock,
          source: 'vendor_replenishment_received',
          referenceId: adminId,
          skipLocalProductSave: true,
        });
      }
    } catch (syncErr) {
      console.warn(`[VendorAllocationService] Background sync warning: ${syncErr.message}`);
    }
  });

  const populatedAllocation = await VendorAllocation.findById(allocationId)
    .populate('productId', 'name sku category image imageUrl price stock stockLevel')
    .populate('vendorId', 'name companyName email phone')
    .populate('adminId', 'name email')
    .lean();

  vendorAllocationCache.invalidate();

  return {
    allocation: normalizeAllocation(populatedAllocation),
    product: normalizeAllocatedProduct(updatedProduct),
  };
}

/**
 * Admin cancels an allocation
 */
async function cancelAllocation(allocationId, adminId) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  const allocation = await VendorAllocation.findById(allocationId);
  if (!allocation) {
    throw new Error('Allocation not found.');
  }

  if (allocation.status === 'RECEIVED') {
    throw new Error('Cannot cancel an allocation that has already been received.');
  }

  allocation.status = 'CANCELLED';
  await allocation.save();

  vendorAllocationCache.invalidate();

  return normalizeAllocation(allocation);
}

/**
 * Returns low-stock products with active allocation summaries
 */
async function getLowStockProductsWithAllocations(clientId = null) {
  const query = {
    $or: [
      { stock: { $lte: 5 } },
      {
        $expr: {
          $lte: [
            '$stock',
            { $ifNull: ['$lowStockAlert', { $ifNull: ['$lowStockThreshold', 5] }] },
          ],
        },
      },
    ],
  };

  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    query.clientId = new mongoose.Types.ObjectId(String(clientId));
  }

  const products = await Product.find(query)
    .select(
      'name sku category price image imageUrl stock stockLevel lowStockAlert lowStockThreshold minStock clientId'
    )
    .sort({ stock: 1 })
    .limit(100)
    .lean();

  if (products.length === 0) {
    return [];
  }

  const productIds = products.map((p) => p._id);
  const activeAllocations = await VendorAllocation.find({
    productId: { $in: productIds },
    status: { $in: ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED', 'ACCEPTED', 'DISPATCHED'] },
  })
    .populate('vendorId', 'name companyName email')
    .lean();

  const allocationsByProduct = new Map();
  for (const alloc of activeAllocations) {
    const pId = String(alloc.productId);
    if (!allocationsByProduct.has(pId)) {
      allocationsByProduct.set(pId, []);
    }
    allocationsByProduct.get(pId).push(alloc);
  }

  return products.map((prod) => {
    const list = allocationsByProduct.get(String(prod._id)) || [];
    const totalAllocated = list.reduce(
      (sum, item) => sum + (Number(item.allocatedQuantity) || 0),
      0
    );
    const threshold = Number(prod.lowStockAlert ?? prod.lowStockThreshold ?? prod.minStock ?? 5);

    return normalizeAllocatedProduct({
      ...prod,
      threshold,
      activeAllocationsCount: list.length,
      totalUnitsAllocated: totalAllocated,
      allocations: normalizeAllocations(list),
      suggestedReplenishment: Math.max(10, threshold * 3 - (prod.stock || 0)),
    });
  });
}

/**
 * Fetches real-time low-stock replenishment alerts for products across the store/tenant.
 * Does NOT filter by specific product-vendor assignment: any vendor sees all low-stock products storewide.
 */
async function getVendorLowStockAlerts(
  vendorUserId,
  { userEmail = '', userName = '', vendorId = null, threshold = 5, clientId = null } = {}
) {
  const numThreshold = Number(threshold) > 0 ? Number(threshold) : 5;
  const effectiveThreshold = Math.max(numThreshold, 10);

  const stockCondition = [
    { stock: { $lte: effectiveThreshold } },
    { stockLevel: { $lte: effectiveThreshold } },
    { quantity: { $lte: effectiveThreshold } },
    { stock: { $lte: 10 } },
    { stockLevel: { $lte: 10 } },
    { quantity: { $lte: 10 } },
    {
      $expr: {
        $lte: [
          { $ifNull: ['$stockLevel', { $ifNull: ['$stock', { $ifNull: ['$quantity', 0] }] }] },
          { $ifNull: ['$lowStockAlert', { $ifNull: ['$lowStockThreshold', { $ifNull: ['$minStock', effectiveThreshold] }] }] },
        ],
      },
    },
  ];

  const productQuery = {
    isActive: { $ne: false },
    $or: stockCondition,
  };

  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    productQuery.$and = [
      { $or: stockCondition },
      {
        $or: [
          { clientId: new mongoose.Types.ObjectId(String(clientId)) },
          { clientId: null },
          { clientId: { $exists: false } },
        ],
      },
    ];
    delete productQuery.$or;
  }

  let lowStockProducts = await Product.find(productQuery)
    .sort({ stock: 1 })
    .limit(100)
    .lean();

  // If scoped query returned nothing, fall back to global store products so vendor always sees low-stock items
  if ((!lowStockProducts || lowStockProducts.length === 0) && productQuery.$and) {
    lowStockProducts = await Product.find({
      isActive: { $ne: false },
      $or: stockCondition,
    })
      .sort({ stock: 1 })
      .limit(100)
      .lean();
  }

  if (!lowStockProducts || lowStockProducts.length === 0) {
    return {
      success: true,
      count: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      threshold: numThreshold,
      items: [],
      data: [],
    };
  }

  const productIds = lowStockProducts.map((p) => p._id);
  const activeAllocations = await VendorAllocation.find({
    productId: { $in: productIds },
    status: { $ne: 'CANCELLED' },
  })
    .populate('vendorId', 'name companyName email')
    .sort({ createdAt: -1 })
    .lean();

  const allocationsByProduct = new Map();
  for (const alloc of activeAllocations) {
    const pId = String(alloc.productId?._id || alloc.productId);
    if (!allocationsByProduct.has(pId)) {
      allocationsByProduct.set(pId, []);
    }
    allocationsByProduct.get(pId).push(alloc);
  }

  const lowStockItems = [];
  let outOfStockCount = 0;
  let lowStockCount = 0;

  for (const rawProd of lowStockProducts) {
    const prod = normalizeAllocatedProduct(rawProd);
    const pId = String(prod._id);
    const currentStock = Number(
      rawProd.stockLevel !== undefined && rawProd.stockLevel !== null
        ? rawProd.stockLevel
        : rawProd.stock !== undefined && rawProd.stock !== null
        ? rawProd.stock
        : rawProd.quantity !== undefined && rawProd.quantity !== null
        ? rawProd.quantity
        : prod.currentStock !== undefined
        ? prod.currentStock
        : (prod.stock ?? 0)
    );
    const itemThreshold = Number(
      rawProd.lowStockAlert !== undefined && rawProd.lowStockAlert !== null
        ? rawProd.lowStockAlert
        : rawProd.lowStockThreshold !== undefined && rawProd.lowStockThreshold !== null
        ? rawProd.lowStockThreshold
        : rawProd.minStock !== undefined && rawProd.minStock !== null
        ? rawProd.minStock
        : prod.threshold !== undefined && prod.threshold !== null
        ? prod.threshold
        : numThreshold
    );

    // Real-time automatic trigger: alert if stock <= itemThreshold or <= 10 or <= numThreshold or <= 5
    if (currentStock <= itemThreshold || currentStock <= numThreshold || currentStock <= 10 || currentStock <= 5) {
      if (currentStock === 0) {
        outOfStockCount++;
      } else {
        lowStockCount++;
      }

      const relatedAllocations = allocationsByProduct.get(pId) || [];
      const totalUnitsAllocated = relatedAllocations.reduce(
        (sum, item) => sum + (Number(item.allocatedQuantity) || 0),
        0
      );

      lowStockItems.push({
        ...prod,
        currentStock,
        stock: currentStock,
        threshold: itemThreshold,
        totalUnitsAllocated,
        activeAllocationCount: relatedAllocations.filter((a) =>
          ['PENDING', 'PENDING_ACCEPTANCE', 'PUBLISHED', 'ACCEPTED', 'DISPATCHED'].includes(a.status)
        ).length,
        allocations: normalizeAllocations(relatedAllocations),
        latestAllocation:
          relatedAllocations.length > 0 ? normalizeAllocation(relatedAllocations[0]) : null,
      });
    }
  }

  // Sort lowest stock first
  lowStockItems.sort((a, b) => (a.currentStock ?? 0) - (b.currentStock ?? 0));

  return {
    success: true,
    count: lowStockItems.length,
    lowStockCount: lowStockItems.length,
    outOfStockCount,
    threshold: numThreshold,
    items: lowStockItems,
    data: lowStockItems,
  };
}

/**
 * Vendor updates and fulfills replenishment stock directly into product and inventory.
 * Immediately increments Product.stock, Product.stockLevel, Product.quantity, and Inventory.stock.
 */
async function vendorUpdateStock({ allocationId, vendorUserId, quantity = null, vendorNotes = '' }) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  const allocation = await VendorAllocation.findById(allocationId);
  if (!allocation) {
    throw new Error('Vendor allocation record not found.');
  }

  const qty = Math.max(
    1,
    Math.floor(
      Number(
        quantity !== null && quantity !== undefined && !isNaN(Number(quantity))
          ? quantity
          : allocation.allocatedQuantity
      )
    )
  );

  // 1. Fetch and update Product stock
  const product = await Product.findById(allocation.productId);
  if (!product) {
    throw new Error(`Product not found for allocation: ${allocation.productId}`);
  }

  const previousStock = Number(
    product.stockLevel !== undefined ? product.stockLevel : (product.stock || 0)
  );
  const newStock = previousStock + qty;

  product.stock = newStock;
  product.stockLevel = newStock;
  product.quantity = newStock;
  product.updatedAt = new Date();
  await product.save({ validateBeforeSave: true });

  // 2. Synchronize to Inventory collection
  try {
    const Inventory = require('../models/Inventory');
    if (product.sku) {
      await Inventory.updateOne(
        { sku: product.sku },
        { $set: { stock: newStock, updatedAt: new Date() } }
      );
    }
  } catch (invErr) {
    console.warn(`[VendorAllocationService] Inventory sync notice: ${invErr.message}`);
  }

  // 3. Mark allocation as fulfilled/received and stock incremented
  allocation.status = 'RECEIVED';
  allocation.receivedAt = new Date();
  allocation.dispatchedAt = allocation.dispatchedAt || new Date();
  allocation.isSeen = true;
  allocation.seenAt = allocation.seenAt || new Date();
  allocation.fulfilledQuantity = qty;
  allocation.stockUpdatedToInventory = true;
  allocation.stockUpdatedAt = new Date();
  if (vendorNotes) {
    allocation.vendorNotes = String(vendorNotes).trim();
  }
  await allocation.save();

  // 4. Non-blocking inventory event and background sync
  setImmediate(async () => {
    try {
      const { updateInventory } = require('./inventoryService');
      await updateInventory({
        tenantId: product.clientId || null,
        productId: product._id,
        quantity: newStock,
        source: 'vendor_replenishment_received',
        referenceId: vendorUserId,
        skipLocalProductSave: true,
      });
    } catch (syncErr) {
      console.warn(`[VendorAllocationService] Background worker sync notice: ${syncErr.message}`);
    }
  });

  const populated = await VendorAllocation.findById(allocationId)
    .populate(
      'productId',
      'name sku image imageUrl images price category currentStock stock stockLevel lowStockAlert lowStockThreshold minStock'
    )
    .populate('vendorId', 'name companyName email phone address')
    .populate('adminId', 'name email')
    .lean();

  vendorAllocationCache.invalidate();

  return {
    success: true,
    allocation: normalizeAllocation(populated),
    product: normalizeAllocatedProduct({
      _id: product._id,
      name: product.name,
      sku: product.sku,
      image: product.image,
      imageUrl: product.imageUrl,
      previousStock,
      newStock,
      addedStock: qty,
    }),
    newStock,
    addedQuantity: qty,
  };
}

/**
 * Deletes a vendor allocation record efficiently using indexed _id
 */
async function deleteAllocation(allocationId) {
  if (!allocationId || !mongoose.Types.ObjectId.isValid(allocationId)) {
    throw new Error('Valid allocationId is required.');
  }

  const deleted = await VendorAllocation.findByIdAndDelete(allocationId).lean();
  vendorAllocationCache.invalidate();
  return deleted;
}

module.exports = {
  ensureDefaultVendors,
  createSplitAllocation,
  getAdminAllocations,
  getVendorAllocations,
  getVendorMetrics,
  markAllocationAsSeen,
  updateVendorStatus,
  receiveAllocation,
  cancelAllocation,
  getLowStockProductsWithAllocations,
  getVendorLowStockAlerts,
  vendorUpdateStock,
  deleteAllocation,
};
