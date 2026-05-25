const CustomDomain = require("../models/CustomDomain");
const mongoose = require("mongoose");
const { normalizeRole, isClientScopedRole } = require("./clientScopedRoles");

/**
 * Validates if a string is a valid MongoDB ObjectId.
 * @param {string} id 
 * @returns {boolean}
 */
const isValidObjectId = (id) => {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!s || s === "null" || s === "undefined" || s === "all" || s === "super_admin" || s === "admin") return false;
  return mongoose.Types.ObjectId.isValid(s);
};

/**
 * Normalizes a domain name by removing protocol, www., and trailing slashes.
 * @param {string} domain
 * @returns {string}
 */
function normalizeDomain(domain) {
  if (!domain) return "";
  let normalized = domain.toLowerCase().trim();
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, "");
  normalized = normalized.replace(/^www\./, "");
  // Remove port if present
  normalized = normalized.split(":")[0];
  return normalized;
}

/**
 * Resolves the clientId from various request sources with strict priority.
 * 
 * Priority:
 *  1. req.user.clientId
 *  2. req.user.assignedClient
 *  3. req.body.clientId / req.query.clientId (If Super Admin/Admin explicitly selects)
 *  4. req.headers["x-client-id"]
 *  5. Domain/custom-domain mapping
 *  6. fallback to null
 *
 * @param {import("express").Request} req
 * @returns {Promise<string|null>}
 */
async function resolveClientId(req) {
  const route = req.originalUrl || req.url;
  
  // ── Decode JWT to get user info if req.user is not yet populated ──
  let user = req.user;
  if (!user) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const jwt = require("jsonwebtoken");
        user = jwt.decode(token);
      } catch (e) {
        // Decode failed
      }
    }
  }

  const userRole = normalizeRole(user?.role);
  const isPrivileged = userRole === "super_admin" || userRole === "admin";

  // Priority 1 & 2: User-specific client assignment — skip for privileged roles
  // Admins/Super Admins are global and must not be scoped by user.clientId
  if (!isPrivileged) {
    const uClientId = user?.clientId || user?.assignedClient;
    if (isValidObjectId(uClientId)) {
      return String(uClientId);
    }

    // Fallback for Store Managers/Employees: check Employee model
    if (user?.id || user?._id) {
      try {
        const Employee = require("../models/Employee");
        const emp = await Employee.findOne({ userId: user.id || user._id }).select("clientId");
        if (emp && isValidObjectId(emp.clientId)) {
          return String(emp.clientId);
        }
      } catch (err) {
        console.error(`[TenantResolver] Employee lookup error: ${err.message}`);
      }
    }
  }

  // Priority 3: Body or Query (Super Admin/Admin selection)
  const queryId = req.query?.clientId || req.body?.clientId;
  if (isValidObjectId(queryId)) {
    return String(queryId);
  }

  // Priority 4: Explicit header
  const headerId = req.headers["x-client-id"];
  if (isValidObjectId(headerId)) {
    return String(headerId);
  }

  // Priority 5: Domain-based lookup
  // SKIP domain lookup for privileged roles if they haven't been assigned a specific client yet.
  // This ensures Global Admins see the same data (everything) on custom domains as they do on Vercel/Localhost.
  if (isPrivileged) {
    console.log(`[TenantResolver] Skipping domain resolution for privileged role: ${userRole}`);
    return null;
  }

  const xClientOrigin = req.headers["x-client-origin"] || "";
  const xClientDomain = req.headers["x-client-domain"] || "";
  const originHeader  = req.headers.origin || req.headers.referer || "";
  const hostHeader    = req.headers["x-forwarded-host"] || req.headers.host || "";

  const rawCandidates = [];
  if (xClientOrigin) {
    try { rawCandidates.push(new URL(xClientOrigin).hostname); } catch { rawCandidates.push(xClientOrigin); }
  }
  if (xClientDomain) rawCandidates.push(xClientDomain);
  if (originHeader) {
    try { rawCandidates.push(new URL(originHeader).hostname); } catch { rawCandidates.push(originHeader); }
  }
  if (hostHeader) rawCandidates.push(hostHeader.split(":")[0]);

  const isSystemDomain = (d) =>
    !d || d === "localhost" || d.endsWith(".vercel.app") || d.endsWith(".onrender.com") || d.endsWith(".render.com");

  const seen = new Set();
  const candidates = [];
  for (const raw of rawCandidates) {
    const normalized = normalizeDomain(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  }

  for (const normalized of candidates) {
    if (isSystemDomain(normalized)) continue;

    try {
      const domainDoc = await CustomDomain.findOne({
        $or: [
          { domainName: normalized },
          { domainName: `www.${normalized}` },
          { domain: normalized },
          { domain: `www.${normalized}` },
        ],
      }).select("clientId");

      if (domainDoc && domainDoc.clientId && isValidObjectId(domainDoc.clientId)) {
        return String(domainDoc.clientId);
      }
    } catch (err) {
      console.error(`[TenantResolver] Domain error: ${err.message}`);
    }
  }

  return null;
}

/**
 * Builds a shared product visibility filter based on user role and resolved client ID.
 * 
 * Logic:
 * - super_admin → {}
 * - admin → {}
 * - client → { clientId: resolvedClientId || user.clientId || user._id }
 * - user/customer → { clientId: resolvedClientId }
 * - public/custom domain → { clientId: mappedClientId }
 * 
 * @param {import("express").Request} req
 * @returns {Promise<Object>}
 */
async function buildProductVisibilityFilter(req) {
  const user = req.user;
  const resolvedClientId = await resolveClientId(req);
  const userRole = normalizeRole(user?.role || req?.user?.role);

  // Debug logs
  console.log("-----------------------------------------");
  console.log("Product API Scope Check:", req.originalUrl);
  console.log("User Role (Normalized):", userRole);
  console.log("Resolved clientId:", resolvedClientId);

  // 1. Super Admin: Truly global by default
  if (userRole === "super_admin") {
    // Only scope if Admin explicitly selected a client via query param
    const explicitClientId = req.query?.clientId || req.body?.clientId;
    const filter = isValidObjectId(explicitClientId)
      ? { clientId: new mongoose.Types.ObjectId(String(explicitClientId)) }
      : {};
    console.log("Product filter (Super Admin):", JSON.stringify(filter));
    return filter;
  }

  // 2. Admin: Global privileged role — sees ALL products exactly like Super Admin.
  // Admin must NOT be scoped by their user.clientId or any resolved tenant clientId.
  // Only an explicit ?clientId= query param (admin intentionally filtering) scopes results.
  if (userRole === "admin") {
    const explicitClientId = req.query?.clientId || req.body?.clientId;
    const filter = isValidObjectId(explicitClientId)
      ? { clientId: new mongoose.Types.ObjectId(String(explicitClientId)) }
      : {};
    console.log("Product filter (Admin — global, same as Super Admin):", JSON.stringify(filter));
    return filter;
  }

  // 3. Client-scoped roles (SEO Manager, Store Manager, Employee, etc.)
  if (isClientScopedRole(userRole)) {
    const target = resolvedClientId || user?.clientId;
    const orConditions = [];

    if (isValidObjectId(target)) {
      orConditions.push({ clientId: new mongoose.Types.ObjectId(String(target)) });
    }

    // Client-scoped roles also see global products in this system
    orConditions.push({ clientId: null });
    orConditions.push({ clientId: { $exists: false } });

    // Include products created by them
    if (user?._id) {
      orConditions.push({ createdBy: new mongoose.Types.ObjectId(String(user._id)) });
    }

    const filter = orConditions.length > 0 ? { $or: orConditions } : { _id: null };
    console.log(`Product filter (${userRole}):`, JSON.stringify(filter));
    return filter;
  }

  // 4. For public storefront or users/customers
  const filter = isValidObjectId(resolvedClientId) ? { clientId: new mongoose.Types.ObjectId(String(resolvedClientId)) } : {};
  console.log("Product filter (Public/Customer):", JSON.stringify(filter));
  return filter;
}

/**
 * Builds a scoping query for multi-tenant isolation.
 * @param {Object} user 
 * @param {string} resolvedClientId 
 * @param {boolean} strict If true, excludes global data (clientId: null). Defaults to false.
 */
function buildScopeQuery(user, resolvedClientId, strict = false) {
  // 1. Public visitor / Guest checkout: Scope to domain clientId if present
  if (!user) {
    if (isValidObjectId(resolvedClientId)) {
      return { clientId: new mongoose.Types.ObjectId(String(resolvedClientId)) };
    }
    return strict ? { _id: null } : {};
  }
  
  const role = normalizeRole(user.role);
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isStaff = isAdmin || isClientScopedRole(role);

  // 2. Super Admin: Truly global. Analytics requirement: see everything.
  if (isSuperAdmin) {
    return {};
  }

  // 3. Admin: Global privileged role — same as Super Admin, sees everything.
  // Only scope if clientId is explicitly provided (admin choosing to filter).
  if (isAdmin) {
    if (isValidObjectId(resolvedClientId)) {
      return { clientId: new mongoose.Types.ObjectId(String(resolvedClientId)) };
    }
    return {};
  }

  // 4. Handle Customer / User (Non-staff)
  if (!isStaff || role === "user" || role === "customer") {
    // REQUIRE user-specific scoping for customers
    const uId = user._id || user.id;
    if (isValidObjectId(uId)) {
      return { user: new mongoose.Types.ObjectId(String(uId)) };
    }
    // Fallback if no user id (should not happen with protect)
    const targetClientId = resolvedClientId || user.clientId || user.linkedClientId;
    if (isValidObjectId(targetClientId)) {
      const cId = new mongoose.Types.ObjectId(String(targetClientId));
      if (strict) {
        return { clientId: cId };
      }
      return { $or: [{ clientId: cId }, { clientId: null }, { clientId: { $exists: false } }] };
    }
    return { _id: null }; // Return nothing if we can't identify the user
  }

  // 5. Client / Staff / Vendor
  const orConditions = [];
  const uId = user._id || user.id;
  const sIdStr = isValidObjectId(uId) ? String(uId) : null;

  if (isValidObjectId(resolvedClientId)) {
    orConditions.push({ clientId: new mongoose.Types.ObjectId(String(resolvedClientId)) });
  }
  if (isValidObjectId(user.clientId)) {
    orConditions.push({ clientId: new mongoose.Types.ObjectId(String(user.clientId)) });
  }
  if (isValidObjectId(user.linkedClientId)) {
    orConditions.push({ clientId: new mongoose.Types.ObjectId(String(user.linkedClientId)) });
  }

  if (sIdStr) {
    const sId = new mongoose.Types.ObjectId(sIdStr);
    // For staff, we also want to see their own created items
    orConditions.push({ createdBy: sId });
  }

  if (!strict) {
    orConditions.push({ clientId: null });
    orConditions.push({ clientId: { $exists: false } });
  }

  const uniqueOr = Array.from(new Set(orConditions.map(c => JSON.stringify(c)))).map(s => JSON.parse(s));
  // Convert back to ObjectIds after JSON parsing (JSON.stringify loses ObjectId type)
  const finalOr = uniqueOr.map(cond => {
    if (cond.clientId && typeof cond.clientId === 'string' && isValidObjectId(cond.clientId)) {
      cond.clientId = new mongoose.Types.ObjectId(cond.clientId);
    }
    if (cond.createdBy && typeof cond.createdBy === 'string' && isValidObjectId(cond.createdBy)) {
      cond.createdBy = new mongoose.Types.ObjectId(cond.createdBy);
    }
    return cond;
  });

  return finalOr.length > 0 ? { $or: finalOr } : { _id: null };
}

/**
 * Applies the scopeQuery to an existing MongoDB match object.
 */
function applyScope(match, scopeQuery) {
  if (!scopeQuery || Object.keys(scopeQuery).length === 0) return match;
  if (match.$or && scopeQuery.$or) {
    match.$and = [{ $or: match.$or }, scopeQuery];
    delete match.$or;
  } else {
    Object.assign(match, scopeQuery);
  }
  return match;
}

module.exports = {
  resolveClientId,
  normalizeDomain,
  buildScopeQuery,
  applyScope,
  buildProductVisibilityFilter,
  isValidObjectId,
};

