const Theme = require("../models/Theme");
const Client = require("../models/Client");

const VALID_THEME_KEYS = new Set(["luxe-commerce", "nova-marketplace"]);

function isValidThemeKey(key) {
  return typeof key === "string" && VALID_THEME_KEYS.has(key.trim().toLowerCase());
}

function sanitizeThemeKey(key) {
  if (!key || typeof key !== "string") return null;
  const k = key.trim().toLowerCase();
  return VALID_THEME_KEYS.has(k) ? k : null;
}

// ── Super Admin: Get all themes ────────────────────────────────────────────────
const getAllThemes = async (req, res) => {
  try {
    const themes = await Theme.find({}).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: themes });
  } catch (error) {
    console.error("[ThemeController] getAllThemes error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch themes" });
  }
};

// ── Super Admin: Get theme usage counts ─────────────────────────────────────────
const getThemeUsage = async (req, res) => {
  try {
    const totalClients = await Client.countDocuments({});
    const usage = await Client.aggregate([
      { $group: { _id: "$selectedThemeKey", count: { $sum: 1 } } },
    ]);
    const usageMap = {};
    for (const u of usage) {
      usageMap[u._id || "__default__"] = u.count;
    }
    const themes = await Theme.find({}).lean();
    const result = themes.map((t) => ({
      themeKey: t.key,
      themeName: t.name,
      clientCount: usageMap[t.key] || 0,
    }));
    const unassignedCount = totalClients - result.reduce((s, r) => s + r.clientCount, 0);
    if (unassignedCount > 0) {
      result.push({ themeKey: null, themeName: "Default / Unassigned", clientCount: unassignedCount });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[ThemeController] getThemeUsage error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch theme usage" });
  }
};

// ── Super Admin: Set default theme ──────────────────────────────────────────────
const setDefaultTheme = async (req, res) => {
  try {
    const { themeKey } = req.body;
    const key = sanitizeThemeKey(themeKey);
    if (!key) {
      return res.status(400).json({ success: false, message: "Invalid theme key" });
    }
    const theme = await Theme.findOne({ key });
    if (!theme) {
      return res.status(404).json({ success: false, message: "Theme not found" });
    }
    if (!theme.isEnabled) {
      return res.status(400).json({ success: false, message: "Cannot set a disabled theme as default" });
    }
    await Theme.updateMany({}, { $set: { isDefault: false } });
    theme.isDefault = true;
    await theme.save();
    const updated = await Theme.find({}).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: updated, message: `"${theme.name}" is now the platform default` });
  } catch (error) {
    console.error("[ThemeController] setDefaultTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to set default theme" });
  }
};

// ── Super Admin: Enable / Disable theme ─────────────────────────────────────────
const toggleTheme = async (req, res) => {
  try {
    const { themeKey } = req.params;
    const key = sanitizeThemeKey(themeKey);
    if (!key) {
      return res.status(400).json({ success: false, message: "Invalid theme key" });
    }
    const theme = await Theme.findOne({ key });
    if (!theme) {
      return res.status(404).json({ success: false, message: "Theme not found" });
    }
    theme.isEnabled = !theme.isEnabled;
    if (!theme.isEnabled && theme.isDefault) {
      theme.isDefault = false;
    }
    await theme.save();
    const updated = await Theme.find({}).sort({ createdAt: 1 }).lean();
    res.json({
      success: true,
      data: updated,
      message: `"${theme.name}" is now ${theme.isEnabled ? "enabled" : "disabled"}`,
    });
  } catch (error) {
    console.error("[ThemeController] toggleTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to toggle theme" });
  }
};

// ── Super Admin: Assign theme to a client ───────────────────────────────────────
const assignThemeToClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { themeKey } = req.body;
    const key = sanitizeThemeKey(themeKey);
    if (!key) {
      return res.status(400).json({ success: false, message: "Invalid theme key" });
    }
    const theme = await Theme.findOne({ key });
    if (!theme) {
      return res.status(404).json({ success: false, message: "Theme not found" });
    }
    if (!theme.isEnabled) {
      return res.status(400).json({ success: false, message: "Cannot assign a disabled theme" });
    }
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }
    client.selectedThemeKey = key;
    await client.save();
    res.json({ success: true, message: `Theme "${theme.name}" assigned to ${client.companyName || client.shopName || "client"}` });
  } catch (error) {
    console.error("[ThemeController] assignThemeToClient error:", error.message);
    res.status(500).json({ success: false, message: "Failed to assign theme" });
  }
};

// ── Super Admin: Reset client to default theme ──────────────────────────────────
const resetClientTheme = async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }
    client.selectedThemeKey = null;
    await client.save();
    res.json({ success: true, message: "Client theme reset to platform default" });
  } catch (error) {
    console.error("[ThemeController] resetClientTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to reset client theme" });
  }
};

// ── Super Admin: Search / retrieve client theme assignments ─────────────────────
const getClientAssignments = async (req, res) => {
  try {
    const { search, themeKey, page = 1, limit = 20 } = req.query;
    const query = {};
    if (search) {
      const regex = new RegExp(String(search).trim(), "i");
      query.$or = [
        { companyName: regex },
        { shopName: regex },
        { email: regex },
      ];
    }
    if (themeKey) {
      const key = sanitizeThemeKey(themeKey);
      if (key) query.selectedThemeKey = key;
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
    const [clients, total] = await Promise.all([
      Client.find(query)
        .select("companyName shopName email selectedThemeKey createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Client.countDocuments(query),
    ]);
    res.json({
      success: true,
      data: clients,
      pagination: { page: Math.max(1, Number(page)), limit: pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("[ThemeController] getClientAssignments error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch client assignments" });
  }
};

// ── Client: Get available enabled themes ─────────────────────────────────────────
const getAvailableThemes = async (req, res) => {
  try {
    const themes = await Theme.find({ isEnabled: true }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: themes });
  } catch (error) {
    console.error("[ThemeController] getAvailableThemes error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch available themes" });
  }
};

// ── Client: Get current store's selected theme ──────────────────────────────────
const getMyTheme = async (req, res) => {
  try {
    const clientId = req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const client = await Client.findById(clientId).select("selectedThemeKey").lean();
    if (!client) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    const activeKey = client.selectedThemeKey || null;
    const defaultTheme = await Theme.findOne({ isDefault: true, isEnabled: true }).lean();
    const fallbackKey = defaultTheme?.key || "luxe-commerce";
    const resolvedKey = activeKey ? await resolveValidTheme(activeKey) : fallbackKey;
    const theme = await Theme.findOne({ key: resolvedKey }).lean();
    res.json({
      success: true,
      data: {
        selectedThemeKey: activeKey,
        resolvedThemeKey: resolvedKey,
        theme: theme || null,
      },
    });
  } catch (error) {
    console.error("[ThemeController] getMyTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch store theme" });
  }
};

// ── Client: Update own store theme ──────────────────────────────────────────────
const updateMyTheme = async (req, res) => {
  try {
    const clientId = req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const { themeKey } = req.body;
    const key = sanitizeThemeKey(themeKey);
    if (!key) {
      return res.status(400).json({ success: false, message: "Invalid theme key" });
    }
    const theme = await Theme.findOne({ key, isEnabled: true });
    if (!theme) {
      return res.status(400).json({ success: false, message: "Theme not found or is disabled" });
    }
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    client.selectedThemeKey = key;
    await client.save();
    res.json({ success: true, message: `Theme updated to "${theme.name}"`, data: { selectedThemeKey: key } });
  } catch (error) {
    console.error("[ThemeController] updateMyTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update theme" });
  }
};

// ── Client: Reset own store to default ──────────────────────────────────────────
const resetMyTheme = async (req, res) => {
  try {
    const clientId = req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, message: "No linked store found" });
    }
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    client.selectedThemeKey = null;
    await client.save();
    res.json({ success: true, message: "Store theme reset to platform default" });
  } catch (error) {
    console.error("[ThemeController] resetMyTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to reset theme" });
  }
};

// ── Public / Storefront: Resolve theme for a given client ───────────────────────
const resolveStorefrontTheme = async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({ success: false, message: "Client ID is required" });
    }
    const client = await Client.findById(clientId).select("selectedThemeKey").lean();
    if (!client) {
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    const activeKey = client.selectedThemeKey || null;
    const defaultTheme = await Theme.findOne({ isDefault: true, isEnabled: true }).lean();
    const fallbackKey = defaultTheme?.key || "luxe-commerce";
    const resolvedKey = activeKey ? await resolveValidTheme(activeKey, fallbackKey) : fallbackKey;
    const theme = await Theme.findOne({ key: resolvedKey }).lean();
    res.json({
      success: true,
      data: {
        clientId,
        resolvedThemeKey: resolvedKey,
        theme: theme || null,
      },
    });
  } catch (error) {
    console.error("[ThemeController] resolveStorefrontTheme error:", error.message);
    res.status(500).json({ success: false, message: "Failed to resolve storefront theme" });
  }
};

async function resolveValidTheme(key, fallback) {
  if (!key) return fallback || "luxe-commerce";
  const sanitized = sanitizeThemeKey(key);
  if (!sanitized) return fallback || "luxe-commerce";
  const theme = await Theme.findOne({ key: sanitized }).lean();
  if (!theme || !theme.isEnabled) {
    const defaultTheme = await Theme.findOne({ isDefault: true, isEnabled: true }).lean();
    return defaultTheme?.key || fallback || "luxe-commerce";
  }
  return sanitized;
}

// ── Seed themes into database ───────────────────────────────────────────────────
const seedThemes = async (req, res) => {
  try {
    const existing = await Theme.countDocuments({});
    if (existing > 0) {
      return res.json({ success: true, message: "Themes already seeded", count: existing });
    }
    const themes = [
      {
        key: "luxe-commerce",
        name: "Luxe Commerce",
        description: "Premium, elegant, editorial and luxury-focused theme. Suitable for fashion, beauty, jewellery, lifestyle and premium retail brands.",
        isEnabled: true,
        isDefault: true,
        features: [
          "Large hero banners",
          "Refined typography",
          "Spacious layouts",
          "Sophisticated product cards",
          "Premium collection sections",
          "Soft animations and hover effects",
          "Elegant header and footer",
          "Clean checkout and product-detail presentation",
        ],
        layoutStyle: "Editorial / Spacious",
        typographyStyle: "Serif headings, refined body text",
        colorPalette: {
          primary: "#1a1a2e",
          secondary: "#c9a96e",
          accent: "#e8d5b7",
          background: "#fcfbf8",
        },
      },
      {
        key: "nova-marketplace",
        name: "Nova Marketplace",
        description: "Modern, energetic, conversion-focused marketplace-style theme. Suitable for electronics, general retail, grocery, multi-category and high-volume stores.",
        isEnabled: true,
        isDefault: false,
        features: [
          "Compact information-rich header",
          "Strong search experience",
          "Category navigation",
          "Promotional banners",
          "Product grids with badges, prices and ratings",
          "Flash-sale and featured-product sections",
          "Modern card styling and micro-interactions",
          "Fast and practical shopping experience",
        ],
        layoutStyle: "Marketplace / Conversion-focused",
        typographyStyle: "Sans-serif headings, clean body text",
        colorPalette: {
          primary: "#0f172a",
          secondary: "#3b82f6",
          accent: "#f97316",
          background: "#ffffff",
        },
      },
    ];
    await Theme.insertMany(themes);
    res.json({ success: true, message: "Themes seeded successfully", count: themes.length });
  } catch (error) {
    console.error("[ThemeController] seedThemes error:", error.message);
    res.status(500).json({ success: false, message: "Failed to seed themes" });
  }
};

module.exports = {
  getAllThemes,
  getThemeUsage,
  setDefaultTheme,
  toggleTheme,
  assignThemeToClient,
  resetClientTheme,
  getClientAssignments,
  getAvailableThemes,
  getMyTheme,
  updateMyTheme,
  resetMyTheme,
  resolveStorefrontTheme,
  seedThemes,
};
