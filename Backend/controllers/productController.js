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
const productCache = require("../utils/productCache");

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
      console.error("[productController] Async image write failed:", err.message);
    });
    return publicUrl;
  } catch (err) {
    console.warn("[productController] Base64 image parsing error:", err.message);
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

async function loadProductFormatted(id, req) {
  const doc = await Product.findById(id).populate({
    path: "clientId",
    select: "companyName shopName email storeName",
  }).lean();
  if (!doc) return null;
  const formatted = formatProductWithClient(doc);
  try {
    const merchantId = getMerchantId(req);
    // Non-blocking timeout to ensure instantaneous response in production
    const marketplacePromise = attachMarketplaceStatusToProducts({
      products: [doc],
      merchantId
    });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 500));
    const enrichedList = (await Promise.race([marketplacePromise, timeoutPromise])) || [];
    const enriched = enrichedList[0] || {};
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
    // ── High Performance Memory Cache ──
    const cacheKey = productCache.generateKey(req, "products");
    const cached = productCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=45");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cached);
    }

    const { category, search, minPrice, maxPrice, isActive } = req.query;
    
    // Use shared visibility filter
    let query = await buildProductVisibilityFilter(req);

    if (
      category &&
      category !== "All Categories" &&
      category !== "All Products" &&
      category !== "All" &&
      category !== "undefined" &&
      category !== "null" &&
      String(category).trim() !== ""
    ) {
      const escaped = String(category).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.category = { $regex: new RegExp(`^${escaped}$`, "i") };
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

    // Non-staff (customers/guests) should only see active products (allow true or unset)
    const role = normalizeRole(req.user?.role);
    const isStaff = req.user && (role === "admin" || role === "super_admin" || isClientScopedRole(req.user.role));
    if (!isStaff) {
      query.isActive = { $ne: false };
    } else if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Pagination parameters - default to 50 items per page with skip/limit
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = req.query.limit;
    const limit = rawLimit === "0" || rawLimit === "all" ? 0 : (parseInt(rawLimit, 10) || 50); 
    const skip = limit > 0 ? (page - 1) * limit : 0;

    const isPosRequest = req.query.pos === "true" || req.query.source === "pos";
    const requestedFields = req.query.fields;

    let dbQuery = Product.find(query);

    if (requestedFields) {
      const fieldList = requestedFields.split(",").map(f => f.trim()).join(" ");
      dbQuery = dbQuery.select(fieldList);
    } else if (isPosRequest) {
      // Select only the necessary fields required for the POS catalog (exclude heavy description & reviews)
      dbQuery = dbQuery.select(
        "_id name title sku barcode price unitPrice originalPrice stock stockLevel quantity currentStock lowStockAlert category image imageUrl clientId clientName gst gstRate status isActive"
      );
    } else {
      // High-performance selective projection for list view: excludes heavy reviews array and large data blobs
      dbQuery = dbQuery.select(
        "_id name title sku barcode category price unitPrice originalPrice comparePrice stock stockLevel quantity currentStock lowStockAlert image imageUrl images status isActive isFeatured isOnSale salePercentage rating numReviews brand clientId clientName gst gstRate createdAt updatedAt"
      );
      dbQuery = dbQuery.populate("clientId", "storeName companyName shopName email");
    }

    dbQuery = dbQuery.sort({ createdAt: -1 });

    if (limit > 0) {
      dbQuery = dbQuery.skip(skip).limit(limit);
    }

    // Run count and find concurrently to cut database query latency in half!
    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(query),
      dbQuery.lean()
    ]);

    // Fast path: Only fetch marketplace status when explicitly requested (admin dashboard)
    let productsWithListings = products;
    const shouldFetchMarketplaces = !isPosRequest && (req.query.withMarketplaces === "true" || req.query.marketplaceSync === "true");

    if (shouldFetchMarketplaces) {
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

          const availableStock = Number(
            pObj.stockLevel !== undefined && pObj.stockLevel !== null && Number(pObj.stockLevel) > 0
              ? pObj.stockLevel
              : pObj.stock !== undefined && pObj.stock !== null && Number(pObj.stock) > 0
              ? pObj.stock
              : pObj.quantity !== undefined && pObj.quantity !== null && Number(pObj.quantity) > 0
              ? pObj.quantity
              : pObj.stockLevel ?? pObj.stock ?? pObj.quantity ?? pObj.currentStock ?? 0
          ) || 0;
          pObj.stockLevel = availableStock;
          pObj.stock = availableStock;
          pObj.quantity = availableStock;
          pObj.currentStock = availableStock;
          return pObj;
        });
      } catch (err) {
        console.error("[productController] Error resolving marketplace status in list:", err.message);
      }
    } else {
      // Ultra-fast path for storefront, shop, and POS: directly normalize stock in memory
      productsWithListings = products.map((pObj) => {
        const availableStock = Number(
          pObj.stockLevel !== undefined && pObj.stockLevel !== null && Number(pObj.stockLevel) > 0
            ? pObj.stockLevel
            : pObj.stock !== undefined && pObj.stock !== null && Number(pObj.stock) > 0
            ? pObj.stock
            : pObj.quantity !== undefined && pObj.quantity !== null && Number(pObj.quantity) > 0
            ? pObj.quantity
            : pObj.stockLevel ?? pObj.stock ?? pObj.quantity ?? pObj.currentStock ?? 0
        ) || 0;
        pObj.stockLevel = availableStock;
        pObj.stock = availableStock;
        pObj.quantity = availableStock;
        pObj.currentStock = availableStock;
        pObj.marketplaceListings = [];
        pObj.marketplaces = [];
        return pObj;
      });
    }

    const responsePayload = {
      success: true,
      count: products.length,
      data: productsWithListings,
      products: productsWithListings,
      totalProducts,
      page,
      totalPages: limit > 0 ? Math.ceil(totalProducts / limit) : 1
    };

    // Cache catalog result for 60 seconds
    productCache.set(cacheKey, responsePayload, 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=45");
    res.setHeader("X-Cache", "MISS");

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error("GET PRODUCTS ERROR", error);
    const isPosRequest = req.query?.pos === "true" || req.query?.source === "pos";
    if (isPosRequest) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        products: [],
        totalProducts: 0,
        page: 1,
        totalPages: 1
      });
    }
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
    const cacheKey = productCache.generateKey(req, "featured");
    const cached = productCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cached);
    }

    const resolvedClientId = await resolveClientId(req);
    const scopeQuery = buildScopeQuery(req.user, resolvedClientId);
    let query = { isFeatured: true, isActive: true };
    applyScope(query, scopeQuery);

    const products = await Product.find(query)
      .select(
        "name category price originalPrice isOnSale salePercentage image stock description sku createdAt updatedAt"
      )
      .sort("-createdAt")
      .lean();

    const responsePayload = {
      success: true,
      count: products.length,
      data: products,
    };

    productCache.set(cacheKey, responsePayload, 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.setHeader("X-Cache", "MISS");

    res.status(200).json(responsePayload);
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
    const shouldFetchMarketplaces = req.query.withMarketplaces === "true";
    const cacheKey = `product:${req.params.id}:${shouldFetchMarketplaces}`;
    const cached = productCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(cached);
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

    const product = await Product.findOne(query).lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productObj = { ...product };

    if (shouldFetchMarketplaces) {
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
    } else {
      productObj.marketplaceListings = [];
      productObj.marketplaces = [];
    }

    const responsePayload = {
      success: true,
      data: productObj,
    };

    productCache.set(cacheKey, responsePayload, 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.setHeader("X-Cache", "MISS");

    res.status(200).json(responsePayload);
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
    
    const existingProduct = await Product.findOne(skuQuery).lean();
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

    const existingBarcode = await Product.findOne(barcodeQuery).lean();
    if (existingBarcode) {
      return res.status(409).json({
        success: false,
        message: "A product with this barcode already exists.",
      });
    }

    // Prepare data
    const productData = normalizeSaleFields(req.body);
    const rawImg = req.body.imageUrl !== undefined ? req.body.imageUrl : (req.body.image !== undefined ? req.body.image : req.body.image_url);
    const rawImageUrl = typeof rawImg === "string" ? rawImg.trim() : (rawImg || "");
    const exactImageUrl = processBase64ImageAsync(rawImageUrl);
    productData.image = exactImageUrl;
    productData.images = exactImageUrl ? [exactImageUrl] : [];
    productData.sku = finalSku;
    productData.barcode = finalBarcode;
    productData.createdBy = req.user._id;
    productData.createdByRole = role;
    productData.clientId = targetClientId || null;

    // Explicitly parse stockLevel as Number (single source of truth for quantity)
    const rawStock = req.body.stockLevel !== undefined
      ? req.body.stockLevel
      : (req.body.stock !== undefined ? req.body.stock : req.body.quantity);
    const parsedStockLevel = Math.max(0, parseInt(rawStock, 10) || Number(rawStock) || 0);
    productData.stockLevel = parsedStockLevel;
    productData.stock = parsedStockLevel;
    productData.quantity = parsedStockLevel;

    // Validate that new products are saved with isActive: true
    productData.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;

    // Optional GST support (default 0 if blank/empty)
    const rawGst = req.body.gst !== undefined ? req.body.gst : req.body.gstRate;
    const parsedGst = (rawGst === "" || rawGst === null || rawGst === undefined) ? 0 : Math.max(0, Number(rawGst) || 0);
    productData.gst = parsedGst;
    productData.gstRate = parsedGst;

    // Fetch clientName if possible to persist it for the UI
    if (isValidObjectId(targetClientId)) {
      const Client = require("../models/Client");
      const client = await Client.findById(targetClientId).select("companyName shopName storeName").lean();
      if (client) {
        productData.clientName = client.storeName || client.shopName || client.companyName || "";
      }
    }

    const product = await Product.create(productData);

    // Dispatch background sync job asynchronously if marketplaces are selected
    const { publishTo } = req.body;
    if (Array.isArray(publishTo) && publishTo.length > 0) {
      setImmediate(async () => {
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
              MarketplaceSyncJobService.processJob(job._id).catch(err => {
                 console.error(`[productController] Direct process error for ${marketplace}:`, err.message);
              });
            }
          }
        } catch (queueErr) {
          console.error("[productController] Failed to dispatch sync job:", queueErr.message);
        }
      });
    }

    const populatedDoc = await Product.findById(product._id).populate({
      path: "clientId",
      select: "companyName shopName email storeName",
    }).lean();

    const formatted = formatProductWithClient(populatedDoc || product);
    formatted.marketplaces = [];
    formatted.marketplaceListings = [];

    // Invalidate product cache so new product is immediately visible
    productCache.invalidate();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: formatted,
      product: formatted,
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
      normalizedPayload.image = processedImage;
      normalizedPayload.imageUrl = processedImage;
      normalizedPayload.images = processedImage ? [processedImage] : [];
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
        const existingProduct = await Product.findOne(skuQuery).lean();
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
        const existingBarcode = await Product.findOne(barcodeQuery).lean();
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

    if (normalizedPayload.unitPrice !== undefined || normalizedPayload.price !== undefined) {
      const rawPrice = normalizedPayload.unitPrice !== undefined ? normalizedPayload.unitPrice : normalizedPayload.price;
      const parsedPrice = Math.max(0, Number(rawPrice) || 0);
      normalizedPayload.price = parsedPrice;
      normalizedPayload.unitPrice = parsedPrice;
    }

    if (normalizedPayload.stockLevel !== undefined || normalizedPayload.stock !== undefined || normalizedPayload.quantity !== undefined) {
      const rawStock = normalizedPayload.stockLevel !== undefined
        ? normalizedPayload.stockLevel
        : (normalizedPayload.stock !== undefined ? normalizedPayload.stock : normalizedPayload.quantity);
      const parsedStock = Math.max(0, parseInt(rawStock, 10) || Number(rawStock) || 0);
      normalizedPayload.stockLevel = parsedStock;
      normalizedPayload.stock = parsedStock;
      normalizedPayload.quantity = parsedStock;
    }

    if (normalizedPayload.gst !== undefined || normalizedPayload.gstRate !== undefined) {
      const rawGst = normalizedPayload.gst !== undefined ? normalizedPayload.gst : normalizedPayload.gstRate;
      const parsedGst = (rawGst === "" || rawGst === null || rawGst === undefined) ? 0 : Math.max(0, Number(rawGst) || 0);
      normalizedPayload.gst = parsedGst;
      normalizedPayload.gstRate = parsedGst;
    }

    if (normalizedPayload.name && !normalizedPayload.title) {
      normalizedPayload.title = normalizedPayload.name;
    }

    // High performance MongoDB persistence with findByIdAndUpdate and runValidators
    const updated = await Product.findByIdAndUpdate(
      product._id,
      { $set: normalizedPayload },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Failed to update product (not found)",
      });
    }

    console.log("[Backend Debug] Product After Update:", {
      _id: updated._id,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt,
    });

    // Central inventory service sync (async non-blocking)
    if (normalizedPayload.stockLevel !== undefined || normalizedPayload.stock !== undefined) {
      try {
        const { updateInventory } = require('../services/inventoryService');
        updateInventory({
          tenantId: resolvedClientId || updated.clientId || updated.merchantId,
          productId: updated._id,
          quantity: updated.stockLevel !== undefined ? updated.stockLevel : updated.stock,
          source: 'product_update',
          referenceId: req.user?._id
        }).catch((syncErr) => {
          console.warn(`[productController] Central inventory sync warning: ${syncErr.message}`);
        });
      } catch (syncErr) {
        console.warn(`[productController] Central inventory sync error: ${syncErr.message}`);
      }
    }

    // Sync to inventories collection
    try {
      Inventory.findOneAndUpdate(
        { sku: updated.sku },
        {
          $set: {
            name: updated.name,
            sku: updated.sku,
            description: updated.description || "",
            category: updated.category || "Uncategorized",
            price: updated.price || 0,
            stock: updated.stock || 0,
            image: updated.image || "",
          }
        },
        { upsert: false }
      ).catch((invErr) => {
        console.warn("[Backend Debug] Failed to sync with inventories collection:", invErr.message);
      });
    } catch (invErr) {
      console.warn("[Backend Debug] Failed to sync with inventories collection:", invErr.message);
    }

    const formatted = await loadProductFormatted(updated._id, req);
    const finalProduct = formatted || updated;
    const responsePayload = {
      success: true,
      message: "Product updated successfully",
      product: finalProduct,
      data: finalProduct,
    };
    console.log("[Backend Debug] PUT /api/products/:id - Response:", responsePayload);

    // Invalidate product cache so updates are immediately reflected
    productCache.invalidate();

    return res.status(200).json(responsePayload);
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `A product with this ${field} already exists.`,
      });
    }
    return res.status(500).json({
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
    const rawStock = req.body.stockLevel !== undefined ? req.body.stockLevel : req.body.stock;
    const stock = Number(rawStock);
    if (rawStock === undefined || isNaN(stock)) {
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

    // Invalidate product cache so stock updates reflect instantly
    productCache.invalidate();

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

    // Invalidate product cache
    productCache.invalidate();

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

/**
 * @desc    Lookup product by barcode or SKU
 * @route   GET /api/products/lookup?code=:code
 * @access  Public / Protected
 */
const lookupProduct = async (req, res) => {
  try {
    const rawCode = req.query.code || req.query.barcode || req.params.code;
    const code = rawCode ? String(rawCode).trim() : "";
    if (!code) {
      return res.status(400).json({ success: false, message: "Code parameter is required" });
    }

    const posLookupFields = "_id name title sku barcode category price unitPrice originalPrice stock stockLevel quantity currentStock lowStockAlert image imageUrl clientId clientName gst gstRate status isActive";
    const clientId = req.query.clientId;
    const baseFilter = {};
    if (clientId && isValidObjectId(clientId)) {
      baseFilter.$or = [{ clientId }, { clientId: null }];
    }

    const query = {
      ...baseFilter,
      $or: [
        { barcode: code },
        { sku: code }
      ]
    };

    let product = await Product.findOne(query)
      .select(posLookupFields)
      .lean();

    if (!product) {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      product = await Product.findOne({
        ...baseFilter,
        $or: [
          { barcode: { $regex: new RegExp(`^${escaped}$`, "i") } },
          { sku: { $regex: new RegExp(`^${escaped}$`, "i") } }
        ]
      })
      .select(posLookupFields)
      .lean();
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const formatted = formatProductWithClient(product);
    return res.status(200).json({
      success: true,
      product: formatted,
      data: formatted
    });
  } catch (error) {
    console.error("[productController] lookupProduct error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create product supporting multipart/form-data for productImage
 * @route   POST /api/products/create
 * @access  Private / Optional Auth
 */
const createProductWithImage = async (req, res) => {
  try {
    const body = { ...req.body };
    const name = String(body.name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    // 1. Auto-generate barcode if not provided (Format: RV + Date(YYMMDD) + 4-digit random string)
    let barcode = String(body.barcode || "").trim();
    if (!barcode) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const rand4 = Math.floor(1000 + Math.random() * 9000);
      barcode = `RV${yy}${mm}${dd}${rand4}`;
    }

    // 2. If sku is missing, assign the barcode as SKU
    let sku = String(body.sku || "").trim();
    if (!sku) {
      sku = barcode;
    }

    // Check unique sku
    const existingSku = await Product.findOne({ sku }).lean();
    if (existingSku) {
      return res.status(400).json({
        success: false,
        message: `Product with SKU "${sku}" already exists.`,
      });
    }

    // Check unique barcode
    const existingBarcode = await Product.findOne({ barcode }).lean();
    if (existingBarcode) {
      return res.status(400).json({
        success: false,
        message: `Product with Barcode "${barcode}" already exists.`,
      });
    }

    // 3. Image file handling from Multer or Base64/URL
    let imagePath = "";
    if (req.file) {
      imagePath = `/uploads/products/${req.file.filename}`;
    } else if (body.imageUrl || body.image) {
      imagePath = processBase64ImageAsync(String(body.imageUrl || body.image).trim());
    }

    const unitPrice = Number(body.unitPrice !== undefined ? body.unitPrice : body.price) || 0;
    const rawStock = body.stockLevel !== undefined ? body.stockLevel : (body.stock !== undefined ? body.stock : body.quantity);
    const stockLevel = Math.max(0, parseInt(rawStock, 10) || Number(rawStock) || 0);
    const gstRate = Number(body.gstRate) || 0;
    const lowStockAlert = Number(body.lowStockAlert !== undefined ? body.lowStockAlert : 5);
    const category = String(body.category || "General").trim();

    let resolvedClientId = null;
    try {
      resolvedClientId = await resolveClientId(req);
    } catch (e) {}

    const newProduct = new Product({
      name,
      sku,
      barcode,
      category,
      unitPrice,
      price: unitPrice,
      stockLevel,
      stock: stockLevel,
      quantity: stockLevel,
      gstRate,
      lowStockAlert,
      imageUrl: imagePath,
      image: imagePath,
      images: imagePath ? [imagePath] : [],
      description: body.description || "",
      brand: body.brand || "",
      createdBy: req.user?._id || null,
      createdByRole: req.user?.role || "admin",
      clientId: body.clientId || resolvedClientId || null,
      isActive: true,
    });

    const saved = await newProduct.save();
    const formatted = formatProductWithClient(saved.toObject ? saved.toObject({ virtuals: true }) : saved);

    // Invalidate product cache
    productCache.invalidate();

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: formatted,
      data: formatted,
    });
  } catch (error) {
    console.error("[productController] createProductWithImage error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProducts,
  getFeaturedProducts,
  getProductById,
  lookupProduct,
  createProduct,
  createProductWithImage,
  updateProduct,
  updateProductStock,
  deleteProduct,
  createProductReview,
  syncProductNow,
  getProductSyncStatus,
};
