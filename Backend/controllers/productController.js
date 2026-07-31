const mongoose = require("mongoose");
const Product = require("../models/Product");
const Inventory = require("../models/Inventory");
const Client = require("../models/Client");
const { validationResult } = require("express-validator");
const {
  resolveProductUpdatePayload,
  isTitleDescriptionOnlyUpdate,
} = require("../utils/productFieldPermissions");
const { formatProductWithClient } = require("../utils/formatInventoryProduct");
const { isClientScopedRole, normalizeRole } = require("../utils/clientScopedRoles");
const { 
  resolveClientId, 
  buildScopeQuery, 
  applyScope, 
  buildProductVisibilityFilter,
  isValidObjectId 
} = require("../utils/tenantResolver");
const { getMerchantId } = require("../utils/merchantHelper");
const { attachMarketplaceStatusToProducts } = require("../utils/marketplaceStatusHelper");

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

async function loadProductFormatted(id, req) {
  const doc = await Product.findById(id).populate({
    path: "clientId",
    select: "companyName shopName email storeName",
  });
  if (!doc) return null;
  const formatted = formatProductWithClient(doc.toObject({ virtuals: true }));
  try {
    const merchantId = getMerchantId(req);
    const [enriched] = await attachMarketplaceStatusToProducts({
      products: [doc],
      merchantId
    });
    formatted.marketplaces = enriched.marketplaces || [];
    const MarketplaceProduct = require("../models/MarketplaceProduct");
    const listings = await MarketplaceProduct.find({ productId: id }).lean();
    formatted.marketplaceListings = listings || [];
  } catch (err) {
    console.error("[productController] Error loading marketplace listings:", err.message);
    formatted.marketplaceListings = [];
    formatted.marketplaces = [];
  }
  return formatted;
}

const INVENTORY_MANAGER_TITLE_DESC_SUCCESS =
  "Inventory manager successfully updated products";

const normalizeSaleFields = (payload = {}) => {
  const normalized = { ...payload };
  const price = Number(normalized.price);
  const originalPrice = Number(normalized.originalPrice);
  const hasValidDiscount =
    Number.isFinite(price) &&
    Number.isFinite(originalPrice) &&
    originalPrice > 0 &&
    originalPrice > price;

  if (hasValidDiscount) {
    const salePercentage = Math.round(
      ((originalPrice - price) / originalPrice) * 100
    );
    normalized.isOnSale = true;
    normalized.salePercentage = Math.max(0, salePercentage);
  } else {
    normalized.isOnSale = false;
    normalized.salePercentage = 0;
  }

  return normalized;
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, isActive } = req.query;
    
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
        { description: { $regex: search, $options: "i" } }
      ];
    }

    if ((minPrice && minPrice !== "undefined") || (maxPrice && maxPrice !== "undefined")) {
      query.price = {};
      if (minPrice && minPrice !== "undefined") query.price.$gte = Number(minPrice);
      if (maxPrice && maxPrice !== "undefined") query.price.$lte = Number(maxPrice);
    }

    // Non-staff (customers/guests) should only see active products
    const role = normalizeRole(req.user?.role);
    const isStaff = req.user && (role === "admin" || role === "super_admin" || isClientScopedRole(req.user.role));
    if (!isStaff) {
      query.isActive = true;
    } else if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Pagination parameters - 0 or no limit means return all
    const page = parseInt(req.query.page, 10) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0; 
    const skip = limit ? (page - 1) * limit : 0;

    console.log("-----------------------------------------");
    console.log("role:", req.user?.role, "clientId:", (req.query?.clientId || req.headers["x-client-id"]), "query:", JSON.stringify(query));
    console.log("-----------------------------------------");
    const totalProducts = await Product.countDocuments(query);

    let dbQuery = Product.find(query)
      .populate("clientId", "storeName companyName shopName email")
      .sort("-createdAt");
    
    if (limit > 0) {
      dbQuery = dbQuery.skip(skip).limit(limit);
    }

    const products = await dbQuery;
    console.log("Returned count:", products.length);

    // Dynamic Marketplace Status mapping to prevent N+1 queries
    let productsWithListings = products;
    try {
      const merchantId = getMerchantId(req);
      productsWithListings = await attachMarketplaceStatusToProducts({
        products,
        merchantId
      });
      productsWithListings = productsWithListings.map(pObj => {
        pObj.marketplaceListings = (pObj.marketplaces || []).map(m => ({
          _id: m.connectionId,
          marketplace: m.provider,
          syncStatus: m.status === 'not_connected' ? 'not_connected' :
                      m.status === 'not_synced' ? 'pending' :
                      m.status === 'queued' ? 'queued' :
                      m.status === 'processing' ? 'syncing' :
                      m.status === 'failed' ? 'failed' :
                      m.status === 'synced' ? 'success' : 'pending',
          syncError: m.error || ''
        }));
        return pObj;
      });
    } catch (err) {
      console.error("[productController] Error resolving marketplace status in list:", err.message);
    }

    res.status(200).json({
      success: true,
      count: products.length,
      data: productsWithListings,
      products: productsWithListings,
      totalProducts,
      page,
      totalPages: limit > 0 ? Math.ceil(totalProducts / limit) : 1
    });
  } catch (error) {
    console.error("GET PRODUCTS ERROR", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = async (req, res) => {
  try {
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { isFeatured: true, isActive: true };
    applyScope(query, scopeQuery);

    const products = await Product.find(query)
      .select(
        "name category price originalPrice isOnSale salePercentage image stock description sku createdAt updatedAt"
      )
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found (Invalid ID)",
      });
    }
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const product = await Product.findOne(query);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productObj = product.toObject ? product.toObject({ virtuals: true }) : product;
    try {
      const merchantId = getMerchantId(req);
      const [enriched] = await attachMarketplaceStatusToProducts({
        products: [product],
        merchantId
      });
      productObj.marketplaces = enriched.marketplaces || [];
      const MarketplaceProduct = require("../models/MarketplaceProduct");
      const listings = await MarketplaceProduct.find({ productId: product._id }).lean();
      productObj.marketplaceListings = listings || [];
    } catch (err) {
      console.error("[productController] Error resolving listings for product:", err.message);
      productObj.marketplaceListings = [];
      productObj.marketplaces = [];
    }

    res.status(200).json({
      success: true,
      data: productObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private (Admin/Staff)
const createProduct = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
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
         message: "Store/Client assignment is missing. Please ensure your account is properly linked to a client."
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
    const skuQuery = { sku: finalSku };
    if (targetClientId) {
      skuQuery.clientId = targetClientId;
    } else {
      skuQuery.clientId = null;
    }
    
    const existingProduct = await Product.findOne(skuQuery);
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: `A product with SKU "${finalSku}" already exists in your inventory.`,
      });
    }

    // Barcode uniqueness check (scoped to client/tenant)
    const barcodeQuery = { barcode: finalBarcode };
    if (targetClientId) {
      barcodeQuery.clientId = targetClientId;
    } else {
      barcodeQuery.clientId = null;
    }

    const existingBarcode = await Product.findOne(barcodeQuery);
    if (existingBarcode) {
      return res.status(409).json({
        success: false,
        message: "A product with this barcode already exists.",
      });
    }

    // Prepare data
    const productData = normalizeSaleFields(req.body);
    const rawImg = req.body.imageUrl !== undefined ? req.body.imageUrl : (req.body.image !== undefined ? req.body.image : req.body.image_url);
    const exactImageUrl = typeof rawImg === "string" ? rawImg.trim() : (rawImg || "");
    productData.image = exactImageUrl;
    productData.images = exactImageUrl ? [exactImageUrl] : [];
    productData.sku = finalSku;
    productData.barcode = finalBarcode;
    productData.createdBy = req.user._id;
    productData.createdByRole = role;
    productData.clientId = targetClientId || null;

    // Fetch clientName if possible to persist it for the UI
    if (isValidObjectId(targetClientId)) {
      const Client = require("../models/Client");
      const client = await Client.findById(targetClientId).select("companyName shopName storeName");
      if (client) {
        productData.clientName = client.storeName || client.shopName || client.companyName || "";
      }
    }

    const product = await Product.create(productData);

    // Dispatch background sync job if marketplaces are selected
    const { publishTo } = req.body;
    if (Array.isArray(publishTo) && publishTo.length > 0) {
      try {
        const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");
        for (const marketplace of publishTo) {
          const job = await MarketplaceSyncJobService.createJob({
            merchantId: targetClientId || product.createdBy,
            productId: product._id,
            marketplace: marketplace,
            operation: "create_product"
          });
          if (job) {
            // Direct execution async mode (Now a no-op, handled by worker)
            MarketplaceSyncJobService.processJob(job._id).catch(err => {
               console.error(`[productController] Direct process error for ${marketplace}:`, err.message);
            });
          }
        }
      } catch (queueErr) {
        console.error("[productController] Failed to dispatch sync job:", queueErr.message);
      }
    }

    const formatted = await loadProductFormatted(product._id, req);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: formatted,
    });
  } catch (error) {
    console.error("CREATE PRODUCT ERROR", error);

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

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private (admin only; route enforces via allowRoles)
const updateProduct = async (req, res) => {
  try {
    let role = normalizeRole(req.user?.role);
    
    // Check if the request body only contains title/description
    if (req.body && typeof req.body === 'object') {
      const allowedKeys = ['title', 'name', 'description'];
      const bodyKeys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      const isOnlyTitleDesc = bodyKeys.length > 0 && bodyKeys.every(k => allowedKeys.includes(k));
      
      if (isOnlyTitleDesc) {
        role = 'inventory_manager';
      }
    }

    console.log("[Backend Debug] PUT /api/products/:id - Product ID:", req.params.id);
    console.log("[Backend Debug] PUT /api/products/:id - Incoming Body:", req.body);
    
    if (role === 'inventory_manager') {
      console.log('Role: inventory_manager');
    } else {
      console.log(`PUT /api/products/${req.params.id} - Role: ${role}`);
    }
    
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found (Invalid ID)",
      });
    }
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const product = await Product.findOne(query);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!userOwnsClientProduct(req.user, product)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to modify this product",
      });
    }

    // inventory_manager: persist only title (stored as `name` in schema) and `description` via direct assignment + save.
    // Avoid Object.assign here — some Mongoose setups do not mark top-level fields modified reliably from assign.
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

      console.log(`[Backend Debug] ${role} — product before update:`, {
        _id: product._id,
        name: product.name,
        description: product.description,
      });

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

      if (title !== undefined) {
        product.name = title;
      } else if (name !== undefined) {
        product.name = name;
      }
      if (description !== undefined) {
        product.description = description;
      }

      const updated = await product.save();
      console.log(`[Backend Debug] ${role} — product after save:`, {
        _id: updated._id,
        name: updated.name,
        description: updated.description,
        updatedAt: updated.updatedAt,
      });

      // Sync the update to the `inventories` collection safely
      try {
        let inventoryDoc = await Inventory.findOne({ sku: updated.sku });
        let inventoryAction = "none";
        
        if (inventoryDoc) {
          if (title !== undefined) {
            inventoryDoc.name = title;
          } else if (name !== undefined) {
            inventoryDoc.name = name;
          }
          if (description !== undefined) {
            inventoryDoc.description = description;
          }
          await inventoryDoc.save();
          inventoryAction = "updated";
        } else {
          // Create document if project expects one
          inventoryDoc = await Inventory.create({
            name: updated.name,
            sku: updated.sku,
            description: updated.description || "",
            category: updated.category || "Uncategorized", // Fallback just in case
            price: updated.price || 0,
            stock: updated.stock || 0,
            image: updated.image || "",
            isActive: updated.isActive !== undefined ? updated.isActive : true
          });
          inventoryAction = "created";
        }
        
        console.log(`[Backend Debug] inventories collection ${inventoryAction}:`, inventoryDoc._id);
      } catch (inventorySyncError) {
        console.error("[Backend Debug] Failed to sync with inventories collection:", inventorySyncError.message);
        // Continue and return success anyway since product was saved
      }

      const formatted = await loadProductFormatted(updated._id, req);
      const responsePayload = {
        success: true,
        message: role === "seo_manager"
          ? "SEO Manager successfully updated product SEO details"
          : INVENTORY_MANAGER_TITLE_DESC_SUCCESS,
        product: formatted,
        data: formatted,
      };
      console.log(`[Backend Debug] PUT /api/products/:id — final response (${role}):`, responsePayload);
      return res.status(200).json(responsePayload);
    }

    const resolved = resolveProductUpdatePayload(role, req.body);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        message: resolved.message,
      });
    }
    const payload = { ...resolved.update };
    if (isClientScopedRole(role)) {
      delete payload.clientId;
    }
    if (payload.title !== undefined && payload.name === undefined) {
      payload.name = payload.title;
    }
    delete payload.title;
    const normalizedPayload = normalizeSaleFields(payload);
    if (req.body.imageUrl !== undefined || req.body.image !== undefined || req.body.image_url !== undefined) {
      const rawImg = req.body.imageUrl !== undefined ? req.body.imageUrl : (req.body.image !== undefined ? req.body.image : req.body.image_url);
      const exactImageUrl = typeof rawImg === "string" ? rawImg.trim() : (rawImg || "");
      normalizedPayload.image = exactImageUrl;
      normalizedPayload.images = exactImageUrl ? [exactImageUrl] : [];
    }
    console.log("[Backend Debug] PUT /api/products/:id - Allowed Fields Extracted:", normalizedPayload);
    console.log("[Backend Debug] Product Before Update:", {
      _id: product._id,
      name: product.name,
      description: product.description,
    });

    if (normalizedPayload.sku !== undefined || normalizedPayload.barcode !== undefined) {
      const targetClientId = product.clientId || resolvedClientId;
      const currentSku = product.sku;
      const currentBarcode = product.barcode;

      let finalSku = normalizedPayload.sku !== undefined ? String(normalizedPayload.sku).trim() : currentSku;
      if (!finalSku) finalSku = currentSku;

      let finalBarcode = normalizedPayload.barcode !== undefined ? String(normalizedPayload.barcode).trim() : currentBarcode;
      if (!finalBarcode) {
        finalBarcode = finalSku;
      }

      if (finalBarcode.length > 64) {
        return res.status(400).json({
          success: false,
          message: "Barcode cannot exceed 64 characters",
        });
      }

      normalizedPayload.sku = finalSku;
      normalizedPayload.barcode = finalBarcode;

      if (finalSku !== currentSku) {
        let skuQuery = { sku: finalSku, _id: { $ne: product._id } };
        if (targetClientId) {
          skuQuery.clientId = targetClientId;
        } else {
          skuQuery.clientId = null;
        }
        const existingProduct = await Product.findOne(skuQuery);
        if (existingProduct) {
          return res.status(400).json({
            success: false,
            message: `A product with SKU "${finalSku}" already exists in your inventory.`,
          });
        }
      }

      if (finalBarcode && finalBarcode !== currentBarcode) {
        let barcodeQuery = { barcode: finalBarcode, _id: { $ne: product._id } };
        if (targetClientId) {
          barcodeQuery.clientId = targetClientId;
        } else {
          barcodeQuery.clientId = null;
        }
        const existingBarcode = await Product.findOne(barcodeQuery);
        if (existingBarcode) {
          return res.status(409).json({
            success: false,
            message: "A product with this barcode already exists.",
          });
        }
      }
    }

    if (role === "super_admin" || role === "admin") {
      if (normalizedPayload.clientId !== undefined) {
        const raw = normalizedPayload.clientId;
        if (raw === null || raw === "") {
          normalizedPayload.clientId = null;
        } else if (!isValidObjectId(raw)) {
          return res.status(400).json({ success: false, message: "Invalid client assignment" });
        } else {
          const c = await Client.findById(String(raw));
          if (!c) {
            return res.status(400).json({ success: false, message: "Client not found for assignment" });
          }
          normalizedPayload.clientId = c._id;
        }
      }
    }

    Object.assign(product, normalizedPayload);
    const updated = await product.save();
    console.log("[Backend Debug] Product After Update:", {
      _id: updated._id,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt,
    });

    if (normalizedPayload.stock !== undefined) {
      try {
        const { updateInventory } = require('../services/inventoryService');
        await updateInventory({
          tenantId: resolvedClientId || updated.clientId || updated.merchantId,
          productId: updated._id,
          quantity: updated.stock,
          source: 'product_update',
          referenceId: req.user?._id
        });
      } catch (syncErr) {
        console.error(`[productController] Central inventory sync warning: ${syncErr.message}`);
      }
    }

    const formatted = await loadProductFormatted(updated._id, req);
    const responsePayload = {
      success: true,
      message: "Product updated successfully",
      product: formatted,
      data: formatted,
    };
    console.log("[Backend Debug] PUT /api/products/:id - Response:", responsePayload);

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Update only stock
// @route   PATCH /api/products/:id/stock
// @access  Private (Admin/Staff)
const updateProductStock = async (req, res) => {
  try {
    const { stock } = req.body;
    if (stock === undefined || isNaN(stock)) {
      return res.status(400).json({
        success: false,
        message: "Valid stock count is required",
      });
    }

    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found (Invalid ID)",
      });
    }
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const existing = await Product.findOne(query);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    if (!userOwnsClientProduct(req.user, existing)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this product",
      });
    }

    const { updateInventory } = require('../services/inventoryService');
    const syncRes = await updateInventory({
      tenantId: resolvedClientId || existing.clientId || existing.merchantId,
      productId: existing._id,
      quantity: Number(stock),
      source: 'manual_stock_edit',
      referenceId: req.user?._id
    });

    const formatted = await loadProductFormatted(existing._id, req);

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: formatted,
      shopifyResults: syncRes.shopifyResults || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private (Admin/Staff)
const deleteProduct = async (req, res) => {
  try {
    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found (Invalid ID)",
      });
    }
    let query = { _id: req.params.id };
    applyScope(query, scopeQuery);

    const product = await Product.findOne(query);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    if (!userOwnsClientProduct(req.user, product)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this product",
      });
    }
    await Product.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

// @desc    Create new review
// @route   POST /api/products/:id/rating
// @access  Private
const createProductReview = async (req, res) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Please provide a rating between 1 and 5",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Product not found (Invalid ID)",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Initialize fields if missing
    if (!product.reviews) product.reviews = [];
    if (product.numReviews === undefined) product.numReviews = 0;
    if (product.rating === undefined) product.rating = 0;

    const alreadyReviewed = product.reviews.find(
      (r) => r.userId.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      alreadyReviewed.rating = Number(rating);
      alreadyReviewed.updatedAt = Date.now();
    } else {
      const review = {
        userId: req.user._id,
        rating: Number(rating),
      };
      product.reviews.push(review);
      product.numReviews = product.reviews.length;
    }

    // Recalculate average rating
    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) /
      product.reviews.length;

    await product.save();

    res.status(201).json({
      success: true,
      message: "Rating added successfully",
      rating: product.rating,
      numReviews: product.numReviews,
    });
  } catch (error) {
    console.error("CREATE REVIEW ERROR", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
};

const syncProductNow = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    let marketplacesToSync = req.body.marketplaces;
    
    if (!marketplacesToSync || !Array.isArray(marketplacesToSync) || marketplacesToSync.length === 0) {
      const MarketplaceProduct = require("../models/MarketplaceProduct");
      const failedListings = await MarketplaceProduct.find({
        productId,
        syncStatus: { $in: ['failed', 'pending'] }
      });
      marketplacesToSync = failedListings.map(l => l.marketplace);
    }

    if (marketplacesToSync.length === 0) {
      const MarketplaceConnection = require("../models/MarketplaceConnection");
      const connections = await MarketplaceConnection.find({
        merchantId: product.merchantId || product.clientId || product.createdBy,
        status: 'connected',
        isSyncEnabled: true
      });
      marketplacesToSync = connections.map(c => c.marketplace);
    }

    if (marketplacesToSync.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No connected marketplaces or failed listings found to synchronize."
      });
    }

    const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");
    for (const marketplace of marketplacesToSync) {
      const job = await MarketplaceSyncJobService.createJob({
        merchantId: product.merchantId || product.clientId || product.createdBy,
        productId: product._id,
        marketplace: marketplace,
        operation: "update_product"
      });
      // Direct execution async mode
      MarketplaceSyncJobService.processJob(job._id).catch(err => {
         console.error(`[productController] Direct process error for ${marketplace}:`, err.message);
      });
    }

    res.status(200).json({
      success: true,
      message: `Product synchronization job queued for: ${marketplacesToSync.join(", ")}`,
      marketplaces: marketplacesToSync
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Sync retry failed: " + error.message });
  }
};

const getProductSyncStatus = async (req, res) => {
  try {
    const MarketplaceProduct = require("../models/MarketplaceProduct");
    const listings = await MarketplaceProduct.find({ productId: req.params.id }).lean();
    res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProducts,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
  createProductReview,
  syncProductNow,
  getProductSyncStatus,
};
