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
  const isPrivileged = userRole === "super_admin" || userRole === "admin" || userRole === "user" || userRole === "customer";

  // Priority 1 & 2: User-specific client assignment — skip for privileged roles
  // Admins/Super Admins/Users/Customers are global and must not be scoped by user.clientId
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
  console.log("Impersonation active:", !!req.tokenPayload?.impersonatedBy);

  // Roles that see all global products (Super Admin, Admin, User, Customer)
  const isGlobalViewRole =
    userRole === "super_admin" || userRole === "admin" || userRole === "user" || userRole === "customer";

  // During impersonation, scope depends on the impersonated role.
  // Global-view roles (user/customer) see all products; scoped roles see only their own.
  if (req.tokenPayload?.impersonatedBy) {
    if (isGlobalViewRole) {
      console.log("Product filter (Impersonation of global-view role): {}");
      return {};
    }
    // For impersonated client-scoped roles, fall through to normal scoping below
    console.log("Product filter (Impersonation — falling through to role scoping)");
  }

  // 1. Global-view roles: Super Admin, Admin, User, Customer
  // These roles see ALL products. Only explicit ?clientId= query param scopes results.
  if (isGlobalViewRole) {
    const explicitClientId = req.query?.clientId || req.body?.clientId;
    const filter = isValidObjectId(explicitClientId)
      ? { clientId: new mongoose.Types.ObjectId(String(explicitClientId)) }
      : {};
    console.log(`Product filter (${userRole} — global view):`, JSON.stringify(filter));
    return filter;
  }

  // 2. Client-scoped roles (SEO Manager, Store Manager, Employee, etc.)
  // These roles MUST only see products assigned to their own tenant/client.
  // No global fallback — other roles must not access unauthorized products.
  if (isClientScopedRole(userRole)) {
    const target = resolvedClientId || user?.clientId;
    if (isValidObjectId(target)) {
      const filter = { clientId: new mongoose.Types.ObjectId(String(target)) };
      console.log(`Product filter (${userRole} — scoped to client):`, JSON.stringify(filter));
      return filter;
    }
    // If no clientId is resolved, return products created by this user
    if (user?._id) {
      const filter = { createdBy: new mongoose.Types.ObjectId(String(user._id)) };
      console.log(`Product filter (${userRole} — created by user):`, JSON.stringify(filter));
      return filter;
    }
    console.log(`Product filter (${userRole} — no scope found):`, { _id: null });
    return { _id: null };
  }

  // 3. Public / guest (no authenticated user, or unrecognized role)
  // Scope to the resolved clientId (from custom domain or header), no global fallback
  const filter = isValidObjectId(resolvedClientId)
    ? { clientId: new mongoose.Types.ObjectId(String(resolvedClientId)) }
    : {};
  console.log("Product filter (Public/Guest):", JSON.stringify(filter));
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
  const isUserOrCustomer = role === "user" || role === "customer";
  const isGlobalViewRole = isSuperAdmin || isAdmin || isUserOrCustomer;

  // 2. Global-view roles: Super Admin, Admin, User, Customer — see everything.
  if (isGlobalViewRole) {
    return {};
  }

  // 3. Client-scoped roles (SEO Manager, Store Manager, Employee, etc.)
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
    // Include products created by this user
    orConditions.push({ createdBy: sId });
  }

  // Client-scoped roles do NOT get the global fallback (clientId: null) in strict mode
  if (!strict) {
    orConditions.push({ clientId: null });
    orConditions.push({ clientId: { $exists: false } });
  }

  if (orConditions.length === 0) return { _id: null };

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

