const mongoose = require('mongoose');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const VendorAllocation = require('../models/VendorAllocation');
const { getFullImageUrl } = require('../utils/formatInventoryProduct');

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
    if (!vIdStr || !mongoose.Types.ObjectId.isValid(vIdStr)) {
      throw new Error(`Invalid vendor ID provided: ${item.vendorId}`);
    }

    const targetOid = new mongoose.Types.ObjectId(vIdStr);

    // 1. Check if target is a User with role VENDOR (from Users & Roles)
    let userDoc = await User.findOne({
      _id: targetOid,
      role: { $in: ['vendor', 'VENDOR', 'Vendor', 'vendor_manager'] },
    })
      .select('_id name email role clientId vendorRef')
      .lean();

    // 2. Check if target is an Employee staff record
    let employeeDoc = null;
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
    let vendorDoc = await Vendor.findById(targetOid).lean();

    // If target matched a Vendor document, resolve its linked user if present
    if (vendorDoc && !userDoc && vendorDoc.userId) {
      userDoc = await User.findById(vendorDoc.userId)
        .select('_id name email role clientId vendorRef')
        .lean();
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
    if (!userDoc && !vendorDoc) {
      userDoc = await User.findById(targetOid).select('_id name email role clientId vendorRef').lean();
    }

    if (!userDoc && !vendorDoc) {
      throw new Error(`Vendor not found or inactive: ${item.vendorId}`);
    }

    const qty = Number(item.allocatedQuantity);
    if (!qty || qty < 1 || isNaN(qty)) {
      throw new Error(
        `Allocated quantity must be at least 1 unit. Provided: ${item.allocatedQuantity}`
      );
    }

    // Determine correct refPath model matching targetOid
    const isVendorCollectionDoc = vendorDoc && String(vendorDoc._id) === String(targetOid);
    const resolvedVendorModel = isVendorCollectionDoc ? 'Vendor' : 'User';

    documentsToInsert.push({
      productId: product._id,
      adminId,
      // Store exact ObjectId of split.vendorId as instructed
      vendorId: targetOid,
      vendorUserId: userDoc ? userDoc._id : (vendorDoc?.userId || (employeeDoc?.userId || null)),
      vendorModel: resolvedVendorModel,
      allocatedQuantity: Math.floor(qty),
      currentStockAtTrigger: currentStock,
      targetDeliveryDate: item.targetDeliveryDate ? new Date(item.targetDeliveryDate) : null,
      status: 'PENDING',
      isSeen: false,
      seenAt: null,
      vendorNotes: item.notes ? String(item.notes).trim() : '',
      clientId: clientId || product.clientId || null,
    });
  }

  const createdAllocations = await VendorAllocation.insertMany(documentsToInsert);

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

/**
 * Retrieves allocations for Admin view with read-receipt and delivery metrics
 */
async function getAdminAllocations({ clientId = null, status = null, productId = null, isSeen = null }) {
  const query = {};

  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    query.clientId = new mongoose.Types.ObjectId(String(clientId));
  }

  if (status) {
    if (Array.isArray(status)) {
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

  const allocations = await VendorAllocation.find(query)
    .sort({ createdAt: -1 })
    .populate('productId', 'name sku category image imageUrl price stock stockLevel')
    .populate('vendorId', 'name companyName email phone address')
    .populate('adminId', 'name email')
    .lean();

  return normalizeAllocations(allocations);
}

/**
 * Retrieves allocations assigned to a specific vendor user.
 * Seamlessly resolves both User _id and Vendor _id to guarantee all split requirements display.
 */
async function getVendorAllocations(vendorUserId, { status = null, isSeen = null, userEmail = '' } = {}) {
  if (!vendorUserId || !mongoose.Types.ObjectId.isValid(vendorUserId)) {
    throw new Error('Valid vendorUserId is required.');
  }

  const userOid = new mongoose.Types.ObjectId(String(vendorUserId));
  const candidateIds = [userOid];

  // Also check if there is a linked Vendor profile or User
  const linkedVendor = await Vendor.findOne({
    $or: [
      { userId: userOid },
      { _id: userOid },
      ...(userEmail ? [{ email: userEmail.toLowerCase().trim() }] : []),
    ],
  }).lean();

  if (linkedVendor) {
    if (linkedVendor._id && !candidateIds.some((id) => String(id) === String(linkedVendor._id))) {
      candidateIds.push(new mongoose.Types.ObjectId(String(linkedVendor._id)));
    }
    if (linkedVendor.userId && !candidateIds.some((id) => String(id) === String(linkedVendor.userId))) {
      candidateIds.push(new mongoose.Types.ObjectId(String(linkedVendor.userId)));
    }
  }

  // Also check if there is a linked Employee staff record
  try {
    const Employee = require('../models/Employee');
    const linkedEmployee = await Employee.findOne({
      $or: [
        { userId: userOid },
        { _id: userOid },
        ...(userEmail ? [{ email: userEmail.toLowerCase().trim() }] : []),
      ],
    }).lean();
    if (linkedEmployee) {
      if (linkedEmployee._id && !candidateIds.some((id) => String(id) === String(linkedEmployee._id))) {
        candidateIds.push(new mongoose.Types.ObjectId(String(linkedEmployee._id)));
      }
      if (linkedEmployee.userId && !candidateIds.some((id) => String(id) === String(linkedEmployee.userId))) {
        candidateIds.push(new mongoose.Types.ObjectId(String(linkedEmployee.userId)));
      }
    }
  } catch {
    // Ignore if employee lookup is unavailable
  }

  const query = {
    $or: [
      { vendorId: { $in: candidateIds } },
      { vendorUserId: { $in: candidateIds } },
      { 'vendorId.userId': { $in: candidateIds } },
    ],
  };

  if (status && status !== 'ALL') {
    query.status = status;
  } else {
    // Default: exclude cancelled items
    query.status = { $ne: 'CANCELLED' };
  }

  if (isSeen !== null && isSeen !== undefined) {
    query.isSeen = isSeen === true || isSeen === 'true';
  }

  // Fast execution leveraging compound index on { vendorId: 1, status: 1 }
  const allocations = await VendorAllocation.find(query)
    .sort({ createdAt: -1 })
    .populate(
      'productId',
      'name sku image imageUrl images price category currentStock stock stockLevel lowStockAlert lowStockThreshold minStock'
    )
    .populate('vendorId', 'name companyName email phone address')
    .populate('adminId', 'name email')
    .lean();

  // Normalize product properties and image URLs
  return normalizeAllocations(allocations);
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
    status: { $in: ['PENDING', 'ACCEPTED', 'DISPATCHED'] },
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
  return deleted;
}

module.exports = {
  ensureDefaultVendors,
  createSplitAllocation,
  getAdminAllocations,
  getVendorAllocations,
  markAllocationAsSeen,
  updateVendorStatus,
  receiveAllocation,
  cancelAllocation,
  getLowStockProductsWithAllocations,
  vendorUpdateStock,
  deleteAllocation,
};
