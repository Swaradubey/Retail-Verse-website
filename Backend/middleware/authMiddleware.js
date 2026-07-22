const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Employee = require("../models/Employee");
const Client = require("../models/Client");
const { touchLastActiveThrottled } = require("../utils/touchLastActive");
const { ensureRoleProfilesForUser } = require("../utils/ensureRoleProfiles");
const { isClientScopedRole, normalizeRole } = require("../utils/clientScopedRoles");

/** Roles counted as storefront customers for activity tracking (not staff/admin). */
const CUSTOMER_LIKE_ROLES = ["user", "customer"];

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      
      if (!token || token === "null" || token === "undefined") {
        console.warn("[Backend Auth] Invalid token string received:", token);
        return res.status(401).json({
          success: false,
          message: "Not authorized, invalid token format",
        });
      }

      console.log("[Backend Auth] Verifying Token:", token.substring(0, 15) + "...");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.tokenPayload = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        impersonatedBy: decoded.impersonatedBy || null,
      };

      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user || !req.user.isActive) {
        console.warn("[Backend Auth] Auth Failed: User not found or inactive.");
        return res.status(401).json({
          success: false,
          message: "Not authorized, user not active or not found",
        });
      }

      if (isClientScopedRole(req.user.role)) {
        let runEnsure = !req.user.clientId;
        if (!runEnsure && (req.user.role === "employee" || req.user.role === "store_manager")) {
          runEnsure = !(await Employee.exists({ userId: req.user._id }));
        }
        if (runEnsure) {
          try {
            await ensureRoleProfilesForUser(req.user);
            req.user = await User.findById(decoded.id).select("-password");
          } catch (ensureErr) {
            console.error("[Backend Auth] ensureRoleProfilesForUser:", ensureErr.message);
          }
        }

        // Final fallback: if clientId is still missing, check Employee record
        if (!req.user.clientId) {
          const emp = await Employee.findOne({ userId: req.user._id }).select("clientId");
          if (emp && emp.clientId) {
            req.user.clientId = emp.clientId;
          }
        }

        // Trial System Check for Client-scoped roles
        if (req.user.role === "client") {
          if (req.user.clientId) {
            const client = await Client.findById(req.user.clientId);
            if (client) {
              const now = new Date();
              const isExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < now);
              
              if (isExpired) {
                // Auto-update if not already marked
                if (!client.isTrialExpired) {
                  client.isTrialExpired = true;
                  client.trialStatus = "expired";
                  await client.save();
                }
                
                return res.status(403).json({
                  success: false,
                  message: "Your 14 days trial has expired. Please contact Super Admin.",
                  trialExpired: true
                });
              }
            }
          }
        }
      }

      // Trial System Check for Admin role (Admin is global, not client-scoped,
      // but may still have a linked clientId for trial tracking purposes)
      if (req.user.role === "admin" && req.user.clientId) {
        const client = await Client.findById(req.user.clientId);
        if (client) {
          const now = new Date();
          const isExpired = client.isTrialExpired || (client.trialEndDate && client.trialEndDate < now);
          if (isExpired) {
            if (!client.isTrialExpired) {
              client.isTrialExpired = true;
              client.trialStatus = "expired";
              await client.save();
            }
            return res.status(403).json({
              success: false,
              message: "Your 14 days trial has expired. Please contact Super Admin.",
              trialExpired: true
            });
          }
        }
      }

      if (decoded.role && decoded.role !== req.user.role) {
        console.warn(
          "[Backend Auth] JWT role differs from DB (using DB):",
          `token=${decoded.role} db=${req.user.role}`
        );
      }

      req.tokenPayload.role = req.user.role;

      console.log("[Backend Auth] User Authenticated:", req.user.email, `(Role: ${req.user.role})`);

      if (req.user && CUSTOMER_LIKE_ROLES.includes(req.user.role)) {
        setImmediate(() => touchLastActiveThrottled(req.user._id));
      }

      return next();
    } catch (error) {
      console.error("[Backend Auth] JWT Verification Failed:", error.message);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed",
      });
    }
  }

  if (!token) {
    console.warn("[Backend Auth] No Authorization header or Bearer token provided.");
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token",
    });
  }
};

/**
 * If a valid Bearer token is present, attaches req.user (same shape as protect).
 * Invalid, expired, or missing tokens do not fail the request — caller runs as guest.
 * Used for public routes (e.g. POST /api/orders) so logged-in customers can be linked without breaking guest checkout.
 */
const optionalProtect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token || token === "null" || token === "undefined") {
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.tokenPayload = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      impersonatedBy: decoded.impersonatedBy || null,
    };
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user || !req.user.isActive) {
      req.user = undefined;
      req.tokenPayload = undefined;
    } else if (req.user && CUSTOMER_LIKE_ROLES.includes(req.user.role)) {
      setImmediate(() => touchLastActiveThrottled(req.user._id));
    }
  } catch (error) {
    req.user = undefined;
    req.tokenPayload = undefined;
  }
  next();
};

const allowRoles = (...roles) => {
  const allowedRoles = new Set(roles.map((role) => normalizeRole(role)));
  return (req, res, next) => {
    const currentRole = normalizeRole(req.user?.role);
    if (!req.user || !allowedRoles.has(currentRole)) {
      return res.status(403).json({
        success: false,
        message: `Role (${req.user?.role || "unknown"}) is not allowed to access this resource`,
      });
    }
    return next();
  };
};

/** Alias for `allowRoles` (same behavior). */
const authorizeRoles = (...roles) => allowRoles(...roles);

/** Bearer JWT must include `impersonatedBy` (issued by POST .../impersonate/:adminId). */
const requireImpersonationToken = (req, res, next) => {
  if (!req.tokenPayload?.impersonatedBy) {
    return res.status(403).json({
      success: false,
      message: "This action requires an active Super Admin impersonation session",
    });
  }
  return next();
};

module.exports = {
  protect,
  allowRoles,
  authorizeRoles,
  optionalProtect,
  requireImpersonationToken,
};
