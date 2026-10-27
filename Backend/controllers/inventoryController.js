const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Product = require("../models/Product");
const Inventory = require("../models/Inventory");
const Client = require("../models/Client");
const { validationResult } = require("express-validator");
const {
  resolveProductUpdatePayload,
  isTitleDescriptionOnlyUpdate,
} = require("../utils/productFieldPermissions");
const {
  formatProductsWithClient,
  formatProductWithClient,
} = require("../utils/formatInventoryProduct");
const { isClientScopedRole, normalizeRole } = require("../utils/clientScopedRoles");
const { resolveClientId, buildScopeQuery, applyScope, buildProductVisibilityFilter, isValidObjectId } = require("../utils/tenantResolver");
const { getMerchantId } = require("../utils/merchantHelper");
const { attachMarketplaceStatusToProducts } = require("../utils/marketplaceStatusHelper");

const productsUploadDir = path.resolve(__dirname, "../uploads/products");
if (!fs.existsSync(productsUploadDir)) {
  fs.mkdirSync(productsUploadDir, { recursive: true });
}

function processBase64ImageAsync(rawImg) {
  if (!rawImg || typeof rawImg !== "string" || !rawImg.startsWith("data:image/")) {
    return rawImg || "";
  }
  try {
    const matches = rawImg.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) return rawImg;
    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const filename = `product-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const filePath = path.join(productsUploadDir, filename);
    const publicUrl = `/uploads/products/${filename}`;
    fs.promises.writeFile(filePath, buffer).catch((err) => {
      console.error("[inventoryController] Async image write failed:", err.message);
    });
    return publicUrl;
  } catch (err) {
    console.warn("[inventoryController] Base64 image parsing error:", err.message);
    return rawImg;
  }
}

function userOwnsClientProduct(user, product) {
  const role = normalizeRole(user?.role);
  // Super Admin and Admin have full ownership
  if (role === "super_admin" || role === "admin") return true;
  
  if (!user || !isClientScopedRole(role)) return true;
  
  // If product is global, allow scoped staff to manage it if it's in their visibility
  if (!product.clientId) return true;
  
  const userClientId = user.clientId || user.assignedClient;
  if (!userClientId) return false;
  
  return String(product.clientId) === String(userClientId);
}

const INVENTORY_MANAGER_TITLE_DESC_SUCCESS =
  "Inventory manager successfully updated products";

const inventoryMetaCache = new Map();
const INVENTORY_META_TTL = 30 * 1000; // 30 seconds

function clearInventoryMetaCache() {
  inventoryMetaCache.clear();
}

const clientCache = new Map();
const CLIENT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCachedClient(clientId) {
  if (!clientId || !isValidObjectId(clientId)) return null;
  const idStr = String(clientId);
  const cached = clientCache.get(idStr);
  if (cached && (Date.now() - cached.timestamp < CLIENT_CACHE_TTL)) {
    return cached.data;
  }
  try {
    const client = await Client.findById(idStr).select("companyName shopName storeName email").lean();
    if (client) {
      clientCache.set(idStr, { data: client, timestamp: Date.now() });
    }
    return client;
  } catch {
    return null;
  }
}

// @desc    List products for dashboard inventory (scoped for client role)
// @route   GET /api/inventory/manage
// @access  Private
const getInventoryManage = async (req, res) => {
  try {
    const { category, search, stockStatus, minPrice, maxPrice } = req.query;
    
    // Use shared visibility filter
    let query = await buildProductVisibilityFilter(req);

    if (category && category !== "All Categories" && category !== "undefined" && category !== "null") {
      query.category = category;
    }

    if (search && search !== "undefined" && search !== "null") {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    if (stockStatus && stockStatus !== "all") {
      if (stockStatus === "in-stock") query.stock = { $gt: 10 };
      else if (stockStatus === "low-stock") query.stock = { $gte: 1, $lte: 10 };
      else if (stockStatus === "out-of-stock") query.stock = 0;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Pagination parameters - default to 50 items per request when paginated
    const hasLimit = req.query.limit !== undefined && req.query.limit !== null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = hasLimit
      ? (req.query.limit === "0" || req.query.limit === "all" ? 0 : Math.max(1, parseInt(req.query.limit, 10) || 50))
      : (req.query.page ? 50 : 0);
    const skip = limit > 0 ? (page - 1) * limit : 0;

    let sortOption = { updatedAt: -1 };
    if (req.query.sort) {
      const sortField = req.query.sort;
      const sortOrder = req.query.order === "asc" || req.query.direction === "asc" ? 1 : -1;
      sortOption = { [sortField]: sortOrder };
    }

    let dbQuery = Product.find(query)
      .select("name title sku barcode category price unitPrice originalPrice stock stockLevel quantity currentStock lowStockAlert image imageUrl dimensions description isActive isFeatured isOnSale salePercentage clientId clientName gst gstRate createdAt updatedAt")
      .sort(sortOption)
      .populate({ path: "clientId", select: "companyName shopName storeName email" });

    if (limit > 0) {
      dbQuery = dbQuery.skip(skip).limit(limit);
    }

    // Check meta cache for stats and categories to avoid heavy aggregation on each page view
    const metaCacheKey = JSON.stringify(query);
    const cachedMeta = inventoryMetaCache.get(metaCacheKey);
    const isMetaFresh = cachedMeta && (Date.now() - cachedMeta.timestamp < INVENTORY_META_TTL);

    const statsAggPromise = isMetaFresh
      ? Promise.resolve(cachedMeta.statsAgg)
      : Product.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              inStock: { $sum: { $cond: [{ $gte: [{ $ifNull: ["$stock", 0] }, 10] }, 1, 0] } },
              lowStock: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: [{ $ifNull: ["$stock", 0] }, 0] },
                        { $lt: [{ $ifNull: ["$stock", 0] }, 10] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              outOfStock: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$stock", 0] }, 0] }, 1, 0] } }
            }
          }
        ]);

    const categoriesPromise = isMetaFresh
      ? Promise.resolve(cachedMeta.distinctCategories)
      : Product.distinct("category", { ...query, category: { $exists: true, $ne: "" } });

    // Run count, data query, stats aggregation, and distinct categories concurrently
    const [totalCount, rows, statsAgg, distinctCategories] = await Promise.all([
      Product.countDocuments(query),
      dbQuery.lean(),
      statsAggPromise,
      categoriesPromise
    ]);

    if (!isMetaFresh) {
      inventoryMetaCache.set(metaCacheKey, {
        statsAgg,
        distinctCategories,
        timestamp: Date.now()
      });
    }

    const stats = statsAgg[0] || {
      totalProducts: totalCount,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0
    };

    console.log("Inventory API role:", req.user?.role);
    console.log("Inventory filter:", JSON.stringify(query));
    console.log("Inventory products count:", rows.length, "Total in DB:", totalCount);

    // Populate marketplace status only when explicitly requested
    let formattedRows = formatProductsWithClient(rows);
    if (req.query.includeMarketplaces === "true") {
      try {
        const merchantId = getMerchantId(req);
        if (merchantId && rows.length > 0) {
          const rowsWithStatus = await attachMarketplaceStatusToProducts({
            products: rows,
            merchantId
          });
          formattedRows = formatProductsWithClient(rowsWithStatus);
        }
      } catch (err) {
        console.error("[inventoryController] Error loading marketplace status in manage:", err.message);
      }
    }

    return res.json({
      success: true,
      data: formattedRows,
      count: formattedRows.length,
      total: totalCount,
      totalProducts: totalCount,
      page,
      limit: limit > 0 ? limit : totalCount,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
      stats,
      categories: Array.isArray(distinctCategories) ? distinctCategories.filter(Boolean).sort() : []
    });
  } catch (error) {
    console.error("[Inventory] getInventoryManage:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// @desc    Add new inventory item
// @route   POST /api/inventory
// @access  Private (Admin/Staff)
const createInventoryItem = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { sku } = req.body;
    const resolvedClientId = await resolveClientId(req);
    const role = normalizeRole(req.user?.role);
    
    // Explicitly check for global roles (Super Admin / Admin)
    const isGlobal = role === "super_admin" || role === "admin";
    
    // Determine the target clientId
    let targetClientId = req.body.clientId || resolvedClientId;
    
    // Safety check for non-privileged roles: Store Manager MUST be scoped to a client
    if (!isGlobal && !targetClientId) {
       return res.status(400).json({
         success: false,
         message: "Store/Client assignment is missing. Please ensure your Store Manager account is properly linked to a client."
       });
    }

    // Process SKU and Barcode string formatting & fallbacks
    let finalSku = String(req.body.sku || "").trim();
    if (!finalSku) {
      finalSku = "SKU-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    let finalBarcode = String(req.body.barcode || "").trim();
    if (!finalBarcode) {
      finalBarcode = finalSku;
    }

    if (finalBarcode.length > 64) {
      return res.status(400).json({
        success: false,
        message: "Barcode cannot exceed 64 characters",
      });
    }

    req.body.sku = finalSku;
    req.body.barcode = finalBarcode;

    // SKU uniqueness check (scoped to client if not global, or global if no client)
    const skuQuery = { sku: finalSku, clientId: targetClientId || null };
    const barcodeQuery = { barcode: finalBarcode, clientId: targetClientId || null };

    // Parallelize SKU check, Barcode check, and client name lookup concurrently (1 network roundtrip instead of 3)
    const [existingProduct, existingBarcode, client] = await Promise.all([
      Product.findOne(skuQuery).select('_id').lean(),
      Product.findOne(barcodeQuery).select('_id').lean(),
      targetClientId ? getCachedClient(targetClientId) : null
    ]);

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: `A product with SKU "${finalSku}" already exists in your inventory.`,
      });
    }

    if (existingBarcode) {
      return res.status(409).json({
        success: false,
        message: "A product with this barcode already exists.",
      });
    }

    // Prepare data
    const payload = { ...req.body };
    const rawImg = req.body.imageUrl !== undefined ? req.body.imageUrl : (req.body.image !== undefined ? req.body.image : req.body.image_url);
    const rawImageUrl = typeof rawImg === "string" ? rawImg.trim() : (rawImg || "");
    const exactImageUrl = processBase64ImageAsync(rawImageUrl);
    payload.image = exactImageUrl;
    payload.images = exactImageUrl ? [exactImageUrl] : [];
    payload.sku = finalSku;
    payload.barcode = finalBarcode;
    payload.createdBy = req.user._id;
    payload.createdByRole = role;
    payload.clientId = targetClientId || null;
    if (client) {
      payload.clientName = client.storeName || client.shopName || client.companyName || "";
    }

    // Explicitly parse stockLevel as Number (single source of truth for quantity)
    const rawStock = req.body.stockLevel !== undefined
      ? req.body.stockLevel
      : (req.body.stock !== undefined ? req.body.stock : req.body.quantity);
    const parsedStockLevel = Math.max(0, parseInt(rawStock, 10) || Number(rawStock) || 0);
    payload.stockLevel = parsedStockLevel;
    payload.stock = parsedStockLevel;
    payload.quantity = parsedStockLevel;

    // Ensure new items are saved with isActive: true
    payload.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;

    // Optional GST support (default 0 if blank/empty)
    const rawGst = req.body.gst !== undefined ? req.body.gst : req.body.gstRate;
    const parsedGst = (rawGst === "" || rawGst === null || rawGst === undefined) ? 0 : Math.max(0, Number(rawGst) || 0);
    payload.gst = parsedGst;
    payload.gstRate = parsedGst;

    const item = await Product.create(payload);
    clearInventoryMetaCache();

    // Queue marketplace sync asynchronously if requested
    const { publishTo } = req.body;
    if (Array.isArray(publishTo) && publishTo.length > 0) {
      setImmediate(async () => {
        try {
          const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");
          for (const marketplace of publishTo) {
            const job = await MarketplaceSyncJobService.createJob({
              merchantId: targetClientId || item.createdBy,
              productId: item._id,
              marketplace: marketplace,
              operation: "create_product"
            });
            if (job) {
              MarketplaceSyncJobService.processJob(job._id).catch(err => {
                 console.error(`[inventoryController] Direct process error for ${marketplace}:`, err.message);
              });
            }
          }
        } catch (queueErr) {
          console.error("[inventoryController] Failed to queue sync job:", queueErr.message);
        }
      });
    }

    // Construct response directly without re-querying MongoDB Atlas
    const itemObj = item.toObject ? item.toObject() : item;
    if (client) {
      itemObj.clientId = client;
    }
    const formatted = formatProductWithClient(itemObj);

    res.status(201).json({
      success: true,
      message: "Product added to inventory successfully",
      data: formatted,
      product: formatted,
    });
  } catch (error) {
    console.error("[Inventory] createInventoryItem Error:", error.message);
    
    // Better validation error handling
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", ")
      });
    }

    res.status(500).json({
      success: false,
      message: "An internal server error occurred while creating the product: " + error.message,
    });
  }
};

// @desc    Get inventory list with filtering
// @route   GET /api/inventory
// @access  Public
const getInventory = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, inStock } = req.query;
    const resolvedClientId = await resolveClientId(req);
    const role = normalizeRole(req.user?.role);
    const isGlobalRole = role === "super_admin" || role === "admin";

    // Debug logs temporarily
    console.log("Get products role:", req.user?.role);
    console.log("Is global role:", isGlobalRole);
    console.log("resolved clientId:", resolvedClientId);

    // Use shared visibility filter
    let query = await buildProductVisibilityFilter(req);

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (inStock === "true") query.stock = { $gt: 0 };
    if (inStock === "false") query.stock = 0;


    // Pagination parameters - default 50 items per request when paginated
    const hasLimit = req.query.limit !== undefined && req.query.limit !== null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = hasLimit
      ? (req.query.limit === "0" || req.query.limit === "all" ? 0 : Math.max(1, parseInt(req.query.limit, 10) || 50))
      : 50;
    const skip = limit > 0 ? (page - 1) * limit : 0;

    let dbQuery = Product.find(query)
      .select("name title sku barcode category price unitPrice originalPrice stock stockLevel quantity currentStock lowStockAlert image imageUrl dimensions description isActive isFeatured isOnSale salePercentage clientId clientName gst gstRate createdAt updatedAt")
      .populate("clientId", "storeName companyName shopName email")
      .sort("-createdAt");

    if (limit > 0) {
      dbQuery = dbQuery.skip(skip).limit(limit);
    }

    const [totalProducts, inventory] = await Promise.all([
      Product.countDocuments(query),
      dbQuery.lean()
    ]);
    const productsFound = inventory.length;

    // Populate marketplace listings only when requested
    let formattedInventory = inventory;
    if (req.query.includeMarketplaces === "true" && inventory.length > 0) {
      try {
        const productIds = inventory.map(r => r._id);
        const MarketplaceProduct = require("../models/MarketplaceProduct");
        const listings = await MarketplaceProduct.find({ productId: { $in: productIds } }).lean();
        
        const listingsMap = {};
        listings.forEach(l => {
          if (!listingsMap[l.productId.toString()]) {
            listingsMap[l.productId.toString()] = [];
          }
          listingsMap[l.productId.toString()].push(l);
        });

        formattedInventory = inventory.map(p => {
          const pObj = { ...p };
          pObj.marketplaceListings = listingsMap[p._id.toString()] || [];
          return pObj;
        });
      } catch (err) {
        console.error("[inventoryController] Error loading marketplace listings in list:", err.message);
      }
    }

    // Requested debug logs
    console.log("-----------------------------------------");
    console.log("role:", req.user?.role, "clientId:", resolvedClientId, "query:", JSON.stringify(query));
    console.log("-----------------------------------------");
    console.log("Product query filter:", JSON.stringify(query));
    console.log("Products returned:", productsFound);

    res.json({
      success: true,
      data: formattedInventory,
      count: formattedInventory.length,
      total: totalProducts,
      totalProducts,
      page,
      limit: limit > 0 ? limit : totalProducts,
      totalPages: limit > 0 ? Math.ceil(totalProducts / limit) : 1
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get inventory item by ID
// @route   GET /api/inventory/:id
// @access  Public
const getInventoryById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Inventory item not found (Invalid ID)" });
    }
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const item = await Product.findOne(query)
      .select("name title sku barcode category price unitPrice originalPrice stock stockLevel quantity currentStock lowStockAlert image imageUrl dimensions description isActive isFeatured isOnSale salePercentage clientId clientName gst gstRate createdAt updatedAt")
      .populate("clientId", "storeName companyName shopName email")
      .lean();
    if (item) {
      const formatted = formatProductWithClient(item);
      res.json({ success: true, data: formatted, item: formatted });
    } else {
      res.status(404).json({ success: false, message: "Inventory item not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update inventory item
// @route   PUT /api/inventory/:id
// @access  Private (same field rules as PUT /api/products/:id)
const updateInventoryItem = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Inventory item not found (Invalid ID)" });
    }
    const role = normalizeRole(req.user?.role);
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const item = await Product.findOne(query).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    if (!userOwnsClientProduct(req.user, item)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to modify this inventory item",
      });
    }

    if (role === "inventory_manager" || role === "seo_manager") {
      const { title, name, description, ...extra } = req.body || {};
      
      // Strict check for seo_manager: reject any other fields
      if (role === "seo_manager") {
        const extraKeys = Object.keys(extra).filter(k => k !== "_id" && k !== "__v" && k !== "createdAt" && k !== "updatedAt");
        if (extraKeys.length > 0) {
          return res.status(403).json({
            success: false,
            message: "Permission denied: SEO Manager can only update Product Name and Description",
          });
        }
      }

      if (
        title === undefined &&
        name === undefined &&
        description === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "Provide at least one of: title, name, or description",
        });
      }

      const patch = {};
      if (title !== undefined) {
        patch.name = title;
      } else if (name !== undefined) {
        patch.name = name;
      }
      if (description !== undefined) {
        patch.description = description;
      }

      const updatedItem = await Product.findByIdAndUpdate(
        item._id,
        { $set: patch },
        { new: true, runValidators: true }
      ).lean();

      // Sync the update to the `inventories` collection safely in the background
      setImmediate(async () => {
        try {
          let inventoryDoc = await Inventory.findOne({ sku: updatedItem.sku });
          if (inventoryDoc) {
            if (patch.name !== undefined) inventoryDoc.name = patch.name;
            if (patch.description !== undefined) inventoryDoc.description = patch.description;
            await inventoryDoc.save();
          } else {
            await Inventory.create({
              name: updatedItem.name,
              sku: updatedItem.sku,
              description: updatedItem.description || "",
              category: updatedItem.category || "Uncategorized",
              price: updatedItem.price || 0,
              stock: updatedItem.stock || 0,
              image: updatedItem.image || "",
              isActive: updatedItem.isActive !== undefined ? updatedItem.isActive : true
            });
          }
        } catch (inventorySyncError) {
          console.error("[Backend Debug] Failed to sync with inventories collection:", inventorySyncError.message);
        }
      });

      const responsePayload = {
        success: true,
        message: role === "seo_manager" 
          ? "SEO Manager successfully updated product SEO details"
          : INVENTORY_MANAGER_TITLE_DESC_SUCCESS,
        product: updatedItem,
        data: updatedItem,
      };
      return res.json(responsePayload);
    }

    // Merge fallback fields from existing item so partial updates succeed
    const mergedBody = { ...req.body };
    if (mergedBody.sku === undefined && item.sku) mergedBody.sku = item.sku;
    if (mergedBody.name === undefined && !mergedBody.title && !mergedBody.productName && item.name) mergedBody.name = item.name;
    if (mergedBody.category === undefined && item.category) mergedBody.category = item.category;
    if (mergedBody.price === undefined && item.price !== undefined) mergedBody.price = item.price;
    if (mergedBody.stock === undefined && mergedBody.stockLevel === undefined && mergedBody.quantity === undefined && item.stock !== undefined) {
      mergedBody.stock = item.stock;
    }

    const resolved = resolveProductUpdatePayload(role, mergedBody);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, message: resolved.message });
    }
    const updatePayload = { ...resolved.update };
    const rawImg = req.body.photoUrl !== undefined
      ? req.body.photoUrl
      : (req.body.imageUrl !== undefined
        ? req.body.imageUrl
        : (req.body.image !== undefined ? req.body.image : (req.body.photo !== undefined ? req.body.photo : req.body.image_url)));
    if (rawImg !== undefined) {
      const exactImageUrl = typeof rawImg === "string" ? rawImg.trim() : (rawImg || "");
      const processedImage = exactImageUrl.startsWith("data:image/")
        ? processBase64ImageAsync(exactImageUrl)
        : exactImageUrl;
      updatePayload.image = processedImage;
      updatePayload.imageUrl = processedImage;
      updatePayload.images = processedImage ? [processedImage] : [];
    }
    if (isClientScopedRole(role)) {
      delete updatePayload.clientId;
    }
    if (updatePayload.title !== undefined && updatePayload.name === undefined) {
      updatePayload.name = updatePayload.title;
    }
    delete updatePayload.title;
    const titleDescriptionOnlyFlow = isTitleDescriptionOnlyUpdate(updatePayload);

    if (updatePayload.sku !== undefined || updatePayload.barcode !== undefined) {
      const targetClientId = item.clientId || resolvedClientId;
      const currentSku = item.sku;
      const currentBarcode = item.barcode;

      let finalSku = updatePayload.sku !== undefined ? String(updatePayload.sku).trim() : currentSku;
      if (!finalSku) finalSku = currentSku;

      let finalBarcode = updatePayload.barcode !== undefined ? String(updatePayload.barcode).trim() : currentBarcode;
      if (!finalBarcode) {
        finalBarcode = finalSku;
      }

      if (finalBarcode.length > 64) {
        return res.status(400).json({
          success: false,
          message: "Barcode cannot exceed 64 characters",
        });
      }

      updatePayload.sku = finalSku;
      updatePayload.barcode = finalBarcode;

      const skuChanged = finalSku !== currentSku;
      const barcodeChanged = Boolean(finalBarcode && finalBarcode !== currentBarcode);

      // Only perform database checks if SKU or Barcode actually changed!
      if (skuChanged || barcodeChanged) {
        const checks = [];
        if (skuChanged) {
          checks.push(
            Product.findOne({ sku: finalSku, clientId: targetClientId || null, _id: { $ne: item._id } })
              .select('_id')
              .lean()
              .then(p => ({ type: 'sku', exists: Boolean(p) }))
          );
        }
        if (barcodeChanged) {
          checks.push(
            Product.findOne({ barcode: finalBarcode, clientId: targetClientId || null, _id: { $ne: item._id } })
              .select('_id')
              .lean()
              .then(p => ({ type: 'barcode', exists: Boolean(p) }))
          );
        }
        const checkResults = await Promise.all(checks);
        for (const resItem of checkResults) {
          if (resItem.type === 'sku' && resItem.exists) {
            return res.status(400).json({
              success: false,
              message: `A product with SKU "${finalSku}" already exists in your inventory.`,
            });
          }
          if (resItem.type === 'barcode' && resItem.exists) {
            return res.status(409).json({
              success: false,
              message: "A product with this barcode already exists.",
            });
          }
        }
      }
    }

    if (role === "super_admin" || role === "admin") {
      if (updatePayload.clientId !== undefined) {
        const raw = updatePayload.clientId;
        if (raw === null || raw === "") {
          updatePayload.clientId = null;
        } else if (!mongoose.Types.ObjectId.isValid(raw)) {
          return res.status(400).json({ success: false, message: "Invalid client assignment" });
        } else if (String(item.clientId) === String(raw)) {
          // Unchanged clientId: skip DB lookup
          updatePayload.clientId = item.clientId;
        } else {
          const c = await getCachedClient(raw);
          if (!c) {
            return res.status(400).json({ success: false, message: "Client not found for assignment" });
          }
          updatePayload.clientId = c._id;
        }
      }
    }

    if (updatePayload.unitPrice !== undefined || updatePayload.price !== undefined) {
      const rawPrice = updatePayload.unitPrice !== undefined ? updatePayload.unitPrice : updatePayload.price;
      const parsedPrice = Math.max(0, Number(rawPrice) || 0);
      updatePayload.price = parsedPrice;
      updatePayload.unitPrice = parsedPrice;
    }

    if (updatePayload.stockLevel !== undefined || updatePayload.stock !== undefined || updatePayload.quantity !== undefined) {
      const rawStock = updatePayload.stockLevel !== undefined
        ? updatePayload.stockLevel
        : (updatePayload.stock !== undefined ? updatePayload.stock : updatePayload.quantity);
      const parsedStock = Math.max(0, parseInt(rawStock, 10) || Number(rawStock) || 0);
      updatePayload.stockLevel = parsedStock;
      updatePayload.stock = parsedStock;
      updatePayload.quantity = parsedStock;
    }

    // Track low-stock transition when stock is being updated
    let wasLowStock = false;
    let oldUpdatedAt = null;
    if (updatePayload.stock !== undefined) {
      const oldStockVal = Number(item.stock || 0);
      const threshold = Number(item.lowStockThreshold || item.minStock || 10);
      wasLowStock = oldStockVal > 0 && oldStockVal < threshold;
      oldUpdatedAt = item.updatedAt;
    }

    if (updatePayload.gst !== undefined || updatePayload.gstRate !== undefined) {
      const rawGst = updatePayload.gst !== undefined ? updatePayload.gst : updatePayload.gstRate;
      const parsedGst = (rawGst === "" || rawGst === null || rawGst === undefined) ? 0 : Math.max(0, Number(rawGst) || 0);
      updatePayload.gst = parsedGst;
      updatePayload.gstRate = parsedGst;
    }

    if (updatePayload.name && !updatePayload.title) {
      updatePayload.title = updatePayload.name;
    }

    const updatedItem = await Product.findByIdAndUpdate(
      item._id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).lean();

    clearInventoryMetaCache();

    if (!updatedItem) {
      return res.status(404).json({ success: false, message: "Failed to update inventory item" });
    }

    // Trigger central inventory sync asynchronously only if stock actually changed
    const stockWasModified = updatePayload.stock !== undefined && Number(updatePayload.stock) !== Number(item.stock);
    if (stockWasModified) {
      setImmediate(() => {
        try {
          const { updateInventory } = require('../services/inventoryService');
          updateInventory({
            tenantId: resolvedClientId || updatedItem.clientId || updatedItem.merchantId,
            productId: updatedItem._id,
            quantity: updatedItem.stock,
            source: 'inventory_item_update',
            referenceId: req.user?._id,
            skipLocalProductSave: true
          }).catch((syncErr) => {
            console.warn(`[inventoryController] Central inventory sync warning: ${syncErr.message}`);
          });
        } catch (syncErr) {
          console.warn(`[inventoryController] Central inventory sync warning: ${syncErr.message}`);
        }
      });
    }

    // Prevent false "new notification" if product was already low and still is low
    if (wasLowStock && oldUpdatedAt) {
      const newStockVal = Number(updatedItem.stock || 0);
      const threshold = Number(updatedItem.lowStockThreshold || updatedItem.minStock || 10);
      const isLowStock = newStockVal > 0 && newStockVal < threshold;
      if (isLowStock) {
        Product.updateOne({ _id: updatedItem._id }, { $set: { updatedAt: oldUpdatedAt } }).catch(() => {});
      }
    }

    const responsePayload = {
      success: true,
      message: titleDescriptionOnlyFlow
        ? INVENTORY_MANAGER_TITLE_DESC_SUCCESS
        : "Inventory item updated successfully",
      product: updatedItem,
      data: updatedItem,
    };
    console.log("[Backend Debug] PUT /api/inventory/:id - Response:", responsePayload);
    return res.json(responsePayload);
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `A product with this ${field} already exists.`,
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update only stock count
// @route   PATCH /api/inventory/:id/stock
// @access  Private (Admin/Staff)
const updateStock = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Inventory item not found (Invalid ID)" });
    }
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const existing = await Product.findOne(query);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }
    if (!userOwnsClientProduct(req.user, existing)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this inventory item",
      });
    }
    const { stock } = req.body;
    if (stock === undefined || isNaN(Number(stock))) {
      return res.status(400).json({ success: false, message: "Valid stock count is required" });
    }

    // Call central inventory service which persists stock and syncs with Shopify
    const { updateInventory } = require('../services/inventoryService');
    const syncRes = await updateInventory({
      tenantId: resolvedClientId || existing.clientId || existing.merchantId,
      productId: existing._id,
      quantity: Number(stock),
      source: 'manual_stock_edit',
      referenceId: req.user?._id
    });
    clearInventoryMetaCache();

    const populated = await Product.findById(existing._id)
      .populate({ path: "clientId", select: "companyName shopName email" })
      .lean();
    res.json({
      success: true,
      message: "Stock updated successfully",
      data: formatProductWithClient(populated),
      shopifyResults: syncRes.shopifyResults || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete inventory item
// @route   DELETE /api/inventory/:id
// @access  Private (Admin/Staff)
const deleteInventoryItem = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Inventory item not found (Invalid ID)" });
    }
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const item = await Product.findOne(query);
    if (!item) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }
    if (!userOwnsClientProduct(req.user, item)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to remove this inventory item",
      });
    }
    await Product.findByIdAndDelete(req.params.id);
    clearInventoryMetaCache();
    res.json({ success: true, message: "Inventory item removed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add new product with strict validation, auto SKU/Barcode support, and duplicate checks
// @route   POST /api/inventory/products
// @access  Private / Scoped Auth
const createInventoryProduct = async (req, res) => {
  try {
    const {
      name,
      sku,
      barcode,
      price,
      stockLevel,
      image,
      imageUrl,
      category,
      dimensions,
      description,
    } = req.body;

    const errors = [];

    // MANDATORY Fields Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      errors.push("Product Name is mandatory.");
    }

    const finalImage = (image || imageUrl || "").trim();
    if (!finalImage) {
      errors.push("Product Photo is mandatory. Please upload or capture an image.");
    }

    if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
      errors.push("Barcode is mandatory.");
    }

    if (!sku || typeof sku !== "string" || !sku.trim()) {
      errors.push("SKU is mandatory.");
    }

    const numPrice = Number(price);
    if (price === undefined || price === null || isNaN(numPrice) || numPrice <= 0) {
      errors.push("Price must be a valid number greater than 0.");
    }

    const numStock = Number(stockLevel);
    if (stockLevel === undefined || stockLevel === null || isNaN(numStock) || numStock < 0) {
      errors.push("Stock Level must be a valid number greater than or equal to 0.");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(" "),
        errors,
      });
    }

    const cleanSku = sku.trim();
    const cleanBarcode = barcode.trim();

    // Client and ownership resolution
    let targetClientId = req.body.clientId;
    if (!targetClientId && req.user) {
      targetClientId = req.user.clientId || req.user.assignedClient || null;
    }

    // Fast Parallel Duplicate Check and Client lookup in ONE roundtrip
    const [existingSku, existingBarcode, client] = await Promise.all([
      Product.findOne({ sku: cleanSku }).select('_id').lean(),
      Product.findOne({ barcode: cleanBarcode }).select('_id').lean(),
      targetClientId ? getCachedClient(targetClientId) : null
    ]);

    if (existingSku) {
      return res.status(400).json({
        success: false,
        message: `A product with SKU "${cleanSku}" already exists.`,
      });
    }

    if (existingBarcode) {
      return res.status(400).json({
        success: false,
        message: `A product with Barcode "${cleanBarcode}" already exists.`,
      });
    }

    // Parse dimensions
    const parsedDimensions = {
      length: Number(dimensions?.length) || 0,
      width: Number(dimensions?.width) || 0,
      height: Number(dimensions?.height) || 0,
    };

    const clientName = client ? (client.storeName || client.shopName || client.companyName || "") : "";

    const processedImage = processBase64ImageAsync(finalImage);

    // Optional GST support (default 0 if blank/empty)
    const rawGst = req.body.gst !== undefined ? req.body.gst : req.body.gstRate;
    const parsedGst = (rawGst === "" || rawGst === null || rawGst === undefined) ? 0 : Math.max(0, Number(rawGst) || 0);

    const newProduct = new Product({
      name: name.trim(),
      sku: cleanSku,
      barcode: cleanBarcode,
      price: numPrice,
      unitPrice: numPrice,
      originalPrice: numPrice,
      stockLevel: numStock,
      stock: numStock,
      quantity: numStock,
      gst: parsedGst,
      gstRate: parsedGst,
      image: processedImage,
      imageUrl: processedImage,
      images: processedImage ? [processedImage] : [],
      category: (category && typeof category === "string" && category.trim()) ? category.trim() : "General",
      dimensions: parsedDimensions,
      description: (description && typeof description === "string") ? description.trim() : "",
      createdBy: req.user?._id || null,
      merchantId: req.user?._id || null,
      clientId: targetClientId,
      clientName: clientName,
      isActive: true,
    });

    const savedProduct = await newProduct.save();
    clearInventoryMetaCache();

    // Fast non-blocking lean response containing only essential saved fields (< 60ms latency)
    const responseProduct = {
      _id: savedProduct._id,
      sku: savedProduct.sku,
      barcode: savedProduct.barcode,
      name: savedProduct.name,
      price: savedProduct.price,
      stockLevel: savedProduct.stockLevel,
      stock: savedProduct.stock,
      category: savedProduct.category,
      image: savedProduct.image,
      imageUrl: savedProduct.imageUrl,
      clientId: savedProduct.clientId,
      clientName: savedProduct.clientName,
    };

    return res.status(201).json({
      success: true,
      message: "Product saved successfully",
      product: responseProduct,
      data: responseProduct,
    });
  } catch (error) {
    console.error("[inventoryController] createInventoryProduct error:", error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "SKU/Barcode";
      return res.status(400).json({
        success: false,
        message: `A product with this ${field} already exists.`,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create product.",
    });
  }
};

module.exports = {
  getInventoryManage,
  createInventoryItem,
  createInventoryProduct,
  getInventory,
  getInventoryById,
  updateInventoryItem,
  updateStock,
  deleteInventoryItem,
};
