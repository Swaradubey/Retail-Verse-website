/**
 * Role-based product update payloads for PUT /api/products and PUT /api/inventory.
 * Schema uses `name` for the product title; `title` in the body is accepted as an alias for `name`.
 */

const { isClientScopedRole, normalizeRole } = require("./clientScopedRoles");

function stripInternalKeys(body) {
  if (!body || typeof body !== "object") return {};
  const out = { ...body };
  delete out._id;
  delete out.__v;
  delete out.createdAt;
  delete out.updatedAt;
  return out;
}

const TITLE_DESCRIPTION_BODY_KEYS = new Set(["name", "title", "description"]);
/** inventory_manager: only these body keys are read; all others are ignored (not rejected). */
const INVENTORY_MANAGER_ALLOWED_KEYS = new Set(["title", "description", "name"]);

function isTitleDescriptionOnlyBody(clean) {
  const keys = Object.keys(clean);
  if (keys.length === 0) return false;
  return keys.every((k) => TITLE_DESCRIPTION_BODY_KEYS.has(k));
}

/**
 * @param {object} clean — stripped request body
 * @returns {{ ok: true, update: object } | { ok: false, status: number, message: string }}
 */
function buildTitleDescriptionOnlyUpdate(clean) {
  const update = {};
  if (clean.name !== undefined) update.name = clean.name;
  else if (clean.title !== undefined) update.name = clean.title;
  if (clean.description !== undefined) update.description = clean.description;
  if (Object.keys(update).length === 0) {
    return {
      ok: false,
      status: 400,
      message: "Provide at least one of: name, description, or title",
    };
  }
  return { ok: true, update };
}

/**
 * True when resolved patch only touches product title (name) and/or description (backend schema).
 * @param {object} update
 */
function isTitleDescriptionOnlyUpdate(update) {
  const keys = Object.keys(update);
  return keys.length > 0 && keys.every((k) => k === "name" || k === "description");
}

function resolveProductUpdatePayload(roleInput, body) {
  const role = normalizeRole(roleInput);
  const clean = stripInternalKeys(body);

  if (role === "admin" || role === "super_admin" || isClientScopedRole(role)) {
    // Only apply strict field checks for SEO Manager and Inventory Manager
    if (role === "seo_manager" || role === "inventory_manager") {
      const update = {};
      if (clean.title !== undefined) update.name = clean.title;
      else if (clean.name !== undefined) update.name = clean.name;
      if (clean.description !== undefined) update.description = clean.description;
      
      // Strict field check for SEO Manager: Reject if other fields are present
      if (role === "seo_manager") {
        const keys = Object.keys(clean);
        const forbiddenKeys = keys.filter(k => k !== "title" && k !== "name" && k !== "description");
        if (forbiddenKeys.length > 0) {
          return {
            ok: false,
            status: 403,
            message: "Permission denied: SEO Manager can only update Product Name and Description",
          };
        }
      }

      if (Object.keys(update).length === 0) {
        return {
          ok: false,
          status: 400,
          message: "Provide at least one of: title, name, or description",
        };
      }
      return { ok: true, update };
    }

    // Default behavior for other client-scoped roles or admins
    if (isTitleDescriptionOnlyBody(clean)) {
      return buildTitleDescriptionOnlyUpdate(clean);
    }

    // Normalize field aliases to ensure parity across Add and Edit product payloads
    if (clean.productName && !clean.name) clean.name = clean.productName;
    if (clean.title && !clean.name) clean.name = clean.title;
    if (clean.unitPrice !== undefined && clean.price === undefined) clean.price = clean.unitPrice;
    if (clean.price !== undefined && clean.unitPrice === undefined) clean.unitPrice = clean.price;
    if (clean.stockLevel !== undefined && clean.stock === undefined) clean.stock = clean.stockLevel;
    if (clean.quantity !== undefined && clean.stock === undefined) clean.stock = clean.quantity;
    if (clean.stock !== undefined && clean.stockLevel === undefined) clean.stockLevel = clean.stock;
    if (clean.gstRate !== undefined && clean.gst === undefined) clean.gst = clean.gstRate;
    if (clean.gst !== undefined && clean.gstRate === undefined) clean.gstRate = clean.gst;
    if (clean.photoUrl && !clean.image) clean.image = clean.photoUrl;
    if (clean.imageUrl && !clean.image) clean.image = clean.imageUrl;
    if (clean.photo && !clean.image) clean.image = clean.photo;
    if (clean.image && !clean.imageUrl) clean.imageUrl = clean.image;

    const { name, sku, category, price, stock } = clean;
    if (
      !name ||
      String(name).trim() === "" ||
      !sku ||
      String(sku).trim() === "" ||
      !category ||
      String(category).trim() === "" ||
      price === undefined ||
      price === null ||
      stock === undefined ||
      stock === null
    ) {
      return {
        ok: false,
        status: 400,
        message: "Name, SKU, category, price, and stock are required",
      };
    }
    return { ok: true, update: clean };
  }

  if (role === "staff") {
    const update = { ...clean };
    delete update.name;
    delete update.description;
    delete update.title;
    if (Object.keys(update).length === 0) {
      return {
        ok: false,
        status: 400,
        message: "No permitted fields to update",
      };
    }
    return { ok: true, update };
  }

  return {
    ok: false,
    status: 403,
    message: "Your role cannot update products",
  };
}

module.exports = {
  resolveProductUpdatePayload,
  stripInternalKeys,
  isTitleDescriptionOnlyUpdate,
};
