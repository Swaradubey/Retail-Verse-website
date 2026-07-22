/**
 * resolveAccessibleStore.js
 *
 * Shared, role-aware store-resolution utility for the AI Voice Orders feature.
 *
 * Rules:
 *  - super_admin  → must supply storeId in body/query; validated against Client collection.
 *  - client / client_admin / store_manager / employee / staff
 *               → resolved via user.clientId or resolveClientId() (existing CLIENT flow).
 *  - user / customer
 *               → must supply storeId in body/query; validated that the Client exists
 *                 (future: can be extended to check a store-user membership table).
 *
 * Returns the valid storeId string (MongoDB ObjectId string).
 * Throws a descriptive Error with a `status` code (400 or 403) on failure.
 */

const mongoose = require("mongoose");
const Client = require("../models/Client");
const { normalizeRole } = require("./clientScopedRoles");
const { resolveClientId } = require("./tenantResolver");

const isValidObjectId = (id) => {
  if (!id) return false;
  const s = String(id).trim();
  return s && s !== "null" && s !== "undefined" && mongoose.Types.ObjectId.isValid(s);
};

/**
 * CLIENT_SCOPED_ROLES — roles whose store is resolved from their own profile.
 * Users are NOT in this set; they must pass a storeId explicitly.
 */
const CLIENT_PROFILE_ROLES = new Set([
  "client",
  "client_admin",
  "store_manager",
  "employee",
  "staff",
  "seo_manager",
  "inventory_manager",
  "counter_manager",
]);

/**
 * Resolves and validates the storeId for a given authenticated request.
 *
 * @param {import("express").Request} req
 * @returns {Promise<string>} Validated storeId (MongoDB ObjectId string)
 */
async function resolveAccessibleStore(req) {
  const role = normalizeRole(req.user?.role);

  // ── 1. Super Admin: must explicitly select a store ─────────────────────────
  if (role === "super_admin") {
    const supplied = req.body?.storeId || req.query?.storeId;
    if (!isValidObjectId(supplied)) {
      const err = new Error("Super Admin must select a store before performing this action.");
      err.status = 400;
      err.code = "STORE_REQUIRED";
      throw err;
    }
    const client = await Client.findById(supplied).select("_id companyName shopName");
    if (!client) {
      const err = new Error(`Selected store (${supplied}) does not exist.`);
      err.status = 404;
      err.code = "STORE_NOT_FOUND";
      throw err;
    }
    return String(client._id);
  }

  // ── 2. Client-profile roles: resolve via user.clientId / tenantResolver ────
  if (CLIENT_PROFILE_ROLES.has(role)) {
    const cId = req.user?.clientId || (await resolveClientId(req));
    if (!isValidObjectId(cId)) {
      const err = new Error(
        "Your account is not linked to a store. Please contact the administrator."
      );
      err.status = 403;
      err.code = "NO_STORE";
      throw err;
    }
    return String(cId);
  }

  // ── 3. User / Customer: must pass storeId; backend validates access ─────────
  if (role === "user" || role === "customer") {
    // Priority 1: explicit storeId in body or query
    const supplied =
      req.body?.storeId ||
      req.query?.storeId ||
      req.headers?.["x-store-id"];

    if (!isValidObjectId(supplied)) {
      const err = new Error(
        "Please select a store before generating the transcription."
      );
      err.status = 400;
      err.code = "NO_STORE_SELECTED";
      throw err;
    }

    // Validate the store actually exists
    const client = await Client.findById(supplied).select("_id companyName shopName isActive");
    if (!client) {
      const err = new Error("You do not have access to this store.");
      err.status = 403;
      err.code = "STORE_ACCESS_DENIED";
      throw err;
    }

    // NOTE: The store is assumed accessible if it exists. To restrict users
    // to only their assigned stores, add a membership/assignment lookup here.
    // e.g.: const membership = await StoreUserMembership.findOne({ userId: req.user._id, storeId: supplied });
    // if (!membership) throw access-denied error.

    return String(client._id);
  }

  // ── 4. Unrecognised role — deny ─────────────────────────────────────────────
  const err = new Error("You do not have permission to create voice orders.");
  err.status = 403;
  err.code = "FORBIDDEN";
  throw err;
}

module.exports = { resolveAccessibleStore, isValidObjectId };
