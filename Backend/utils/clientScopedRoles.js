/** Roles that operate within a single Client org (same scoping rules as `client`). */
const CLIENT_SCOPED_ROLES = new Set([
  "client",
  "client_admin",
  // NOTE: "admin" is intentionally NOT here — Admin is a global privileged role
  // (same as super_admin) and must NOT be scoped to a single client/tenant.
  "store_manager",
  "employee",
  "staff",
  "seo_manager",
  "inventory_manager",
  "counter_manager",
  "vendor",
]);

function normalizeRole(role) {
  if (!role) return "";
  const canonicalWords = String(role)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\brole\b/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!canonicalWords) return "";
  
  // Explicitly map "superadmin" to "super_admin" for consistency
  if (canonicalWords === "superadmin" || canonicalWords === "super admin") {
    return "super_admin";
  }

  return canonicalWords.replace(/\s+/g, "_");
}

function isClientScopedRole(role) {
  const normalized = normalizeRole(role);
  return !!normalized && CLIENT_SCOPED_ROLES.has(normalized);
}

module.exports = { CLIENT_SCOPED_ROLES, isClientScopedRole, normalizeRole };
