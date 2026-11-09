const ThemeLayout = require("../models/ThemeLayout");
const Client = require("../models/Client");

// ── Defaults ─────────────────────────────────────────────────────────────────

const VALID_FONTS = new Set(["Inter", "Roboto", "Poppins", "Plus Jakarta Sans", "Open Sans"]);
const VALID_HEADER_VARIANTS = new Set(["standard", "minimal", "centered", "floating"]);
const VALID_FOOTER_VARIANTS = new Set(["classic", "minimal", "multi-column"]);
const VALID_FONT_SIZES = new Set(["14px", "16px"]);
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const DEFAULT_TYPOGRAPHY = {
  fontFamily: "Inter",
  headingFont: "Inter",
  baseFontSize: "16px",
};

const DEFAULT_HEADER = {
  variant: "standard",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  sticky: true,
  showSearchBar: true,
  showCategories: true,
  customLinks: [],
};

const DEFAULT_FOOTER = {
  variant: "classic",
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
  showNewsletter: true,
  showSocialLinks: true,
  copyrightText: `© ${new Date().getFullYear()} YourBrand. All rights reserved.`,
  columns: [],
};

// ── Sanitizers ────────────────────────────────────────────────────────────────

function sanitizeHex(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  const v = value.trim();
  return HEX_RE.test(v) ? v : fallback;
}

function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}

function sanitizeTypography(src) {
  const s = src && typeof src === "object" ? src : {};
  const ff = VALID_FONTS.has(s.fontFamily) ? s.fontFamily : DEFAULT_TYPOGRAPHY.fontFamily;
  const hf = s.headingFont && VALID_FONTS.has(s.headingFont)
    ? s.headingFont
    : (ff || DEFAULT_TYPOGRAPHY.headingFont);
  const fs = VALID_FONT_SIZES.has(s.baseFontSize) ? s.baseFontSize : DEFAULT_TYPOGRAPHY.baseFontSize;
  return { fontFamily: ff, headingFont: hf, baseFontSize: fs };
}

function sanitizeCustomLinks(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((l) => l && typeof l === "object")
    .slice(0, 20) // cap at 20
    .map((l) => ({
      label: String(l.label || "").trim().slice(0, 80),
      url: String(l.url || "/").trim().slice(0, 300),
      visible: bool(l.visible, true),
    }));
}

function sanitizeFooterColumns(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && typeof c === "object")
    .slice(0, 10)
    .map((c) => ({
      title: String(c.title || "").trim().slice(0, 80),
      links: Array.isArray(c.links)
        ? c.links.slice(0, 20).map((l) => ({
            label: String(l.label || "").trim().slice(0, 80),
            url: String(l.url || "/").trim().slice(0, 300),
          }))
        : [],
    }));
}

function sanitizeHeaderConfig(src) {
  const s = src && typeof src === "object" ? src : {};
  return {
    variant: VALID_HEADER_VARIANTS.has(s.variant) ? s.variant : DEFAULT_HEADER.variant,
    backgroundColor: sanitizeHex(s.backgroundColor, DEFAULT_HEADER.backgroundColor),
    textColor: sanitizeHex(s.textColor, DEFAULT_HEADER.textColor),
    sticky: bool(s.sticky, DEFAULT_HEADER.sticky),
    showSearchBar: bool(s.showSearchBar, DEFAULT_HEADER.showSearchBar),
    showCategories: bool(s.showCategories, DEFAULT_HEADER.showCategories),
    customLinks: sanitizeCustomLinks(s.customLinks),
  };
}

function sanitizeFooterConfig(src) {
  const s = src && typeof src === "object" ? src : {};
  return {
    variant: VALID_FOOTER_VARIANTS.has(s.variant) ? s.variant : DEFAULT_FOOTER.variant,
    backgroundColor: sanitizeHex(s.backgroundColor, DEFAULT_FOOTER.backgroundColor),
    textColor: sanitizeHex(s.textColor, DEFAULT_FOOTER.textColor),
    showNewsletter: bool(s.showNewsletter, DEFAULT_FOOTER.showNewsletter),
    showSocialLinks: bool(s.showSocialLinks, DEFAULT_FOOTER.showSocialLinks),
    copyrightText: String(s.copyrightText ?? DEFAULT_FOOTER.copyrightText).trim().slice(0, 300),
    columns: sanitizeFooterColumns(s.columns),
  };
}

function toResponse(doc) {
  if (!doc) {
    return {
      typography: { ...DEFAULT_TYPOGRAPHY },
      headerConfig: { ...DEFAULT_HEADER },
      footerConfig: { ...DEFAULT_FOOTER },
    };
  }
  return {
    typography: sanitizeTypography(doc.typography),
    headerConfig: sanitizeHeaderConfig(doc.headerConfig),
    footerConfig: sanitizeFooterConfig(doc.footerConfig),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveClientId(req) {
  // For client/client_admin roles: clientId is on the authenticated user
  return req.user && req.user.clientId ? String(req.user.clientId) : null;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/theme-layout
 * Fetch current client's ThemeLayout (falls back to defaults if none exists).
 */
const getThemeLayout = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found for this account" });
    }

    const doc = await ThemeLayout.findOne({ clientId }).lean();
    return res.json({ success: true, data: toResponse(doc) });
  } catch (err) {
    console.error("[ThemeLayoutController] getThemeLayout error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch theme layout settings" });
  }
};

/**
 * PUT /api/theme-layout
 * Upsert all three sections in one shot (atomic).
 */
const updateThemeLayout = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found for this account" });
    }

    const body = req.body || {};
    const setFields = {};

    if (body.typography !== undefined) {
      const t = sanitizeTypography(body.typography);
      setFields.typography = t;
    }
    if (body.headerConfig !== undefined) {
      setFields.headerConfig = sanitizeHeaderConfig(body.headerConfig);
    }
    if (body.footerConfig !== undefined) {
      setFields.footerConfig = sanitizeFooterConfig(body.footerConfig);
    }

    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided to update" });
    }

    const updated = await ThemeLayout.findOneAndUpdate(
      { clientId },
      { $set: setFields },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      message: "Theme layout settings saved successfully",
      data: toResponse(updated),
    });
  } catch (err) {
    console.error("[ThemeLayoutController] updateThemeLayout error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to save theme layout settings" });
  }
};

/**
 * PUT /api/theme-layout/typography
 * Update only typography section.
 */
const updateTypography = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const sanitized = sanitizeTypography(req.body || {});
    const updated = await ThemeLayout.findOneAndUpdate(
      { clientId },
      { $set: { typography: sanitized } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, message: "Typography settings saved", data: toResponse(updated) });
  } catch (err) {
    console.error("[ThemeLayoutController] updateTypography error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to save typography settings" });
  }
};

/**
 * PUT /api/theme-layout/header
 * Update only header config section.
 */
const updateHeaderConfig = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const sanitized = sanitizeHeaderConfig(req.body || {});
    const updated = await ThemeLayout.findOneAndUpdate(
      { clientId },
      { $set: { headerConfig: sanitized } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, message: "Header settings saved", data: toResponse(updated) });
  } catch (err) {
    console.error("[ThemeLayoutController] updateHeaderConfig error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to save header settings" });
  }
};

/**
 * PUT /api/theme-layout/footer
 * Update only footer config section.
 */
const updateFooterConfig = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const sanitized = sanitizeFooterConfig(req.body || {});
    const updated = await ThemeLayout.findOneAndUpdate(
      { clientId },
      { $set: { footerConfig: sanitized } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, message: "Footer settings saved", data: toResponse(updated) });
  } catch (err) {
    console.error("[ThemeLayoutController] updateFooterConfig error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to save footer settings" });
  }
};

/**
 * DELETE /api/theme-layout/reset
 * Reset all theme layout settings to defaults for the current client.
 */
const resetThemeLayout = async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const updated = await ThemeLayout.findOneAndUpdate(
      { clientId },
      {
        $set: {
          typography: { ...DEFAULT_TYPOGRAPHY },
          headerConfig: { ...DEFAULT_HEADER },
          footerConfig: { ...DEFAULT_FOOTER },
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({
      success: true,
      message: "Theme layout reset to defaults",
      data: toResponse(updated),
    });
  } catch (err) {
    console.error("[ThemeLayoutController] resetThemeLayout error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to reset theme layout" });
  }
};

/**
 * GET /api/theme-layout/public/:clientId
 * Public endpoint — no auth required. Used by the storefront to load live config.
 */
const getPublicThemeLayout = async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: "Invalid client ID" });
    }
    const doc = await ThemeLayout.findOne({ clientId }).lean();
    // Always return defaults if nothing is configured — backward compatible
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.json({ success: true, data: toResponse(doc) });
  } catch (err) {
    console.error("[ThemeLayoutController] getPublicThemeLayout error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch theme layout" });
  }
};

module.exports = {
  getThemeLayout,
  updateThemeLayout,
  updateTypography,
  updateHeaderConfig,
  updateFooterConfig,
  resetThemeLayout,
  getPublicThemeLayout,
};

