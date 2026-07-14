const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect, allowRoles } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

/**
 * Allow the browser's <audio> element to authenticate using ?t= query param.
 * The audio streaming endpoint is the only one that uses this — all other
 * endpoints require a Bearer token in the Authorization header.
 */
function injectTokenFromQuery(req, _res, next) {
  if (req.query?.t && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.t}`;
  }
  next();
}

const {
  listVoiceOrders,
  getVoiceOrder,
  createVoiceOrder,
  streamAudio,
  transcribeVoiceOrder,
  extractVoiceOrder,
  updateDraft,
  confirmVoiceOrder,
  cancelVoiceOrder,
  updateTranscription,
  checkVoiceConfig,
  deleteVoiceOrder,
} = require("../controllers/voiceOrderController");

const audioStorageService = require("../services/audioStorageService");

// ── Multer setup — memory storage, strict size + MIME enforcement ─────────────

const MAX_BYTES = audioStorageService.MAX_FILE_SIZE_BYTES;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const check = audioStorageService.validateMime(file.mimetype);
    if (!check.valid) {
      return cb(Object.assign(new Error(check.message), { code: "LIMIT_UNEXPECTED_FILE" }));
    }
    cb(null, true);
  },
});

// Shared role set for client-side users
const CLIENT_ROLES = [
  "super_admin",
  "admin",
  "client",
  "client_admin",
  "store_manager",
  "employee",
  "staff",
];

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/voice-orders
 * @desc    List voice orders (tenant-scoped)
 * @access  super_admin, client, admin, staff
 */
router.get("/", protect, allowRoles(...CLIENT_ROLES), tenantMiddleware, listVoiceOrders);

/**
 * @route   GET /api/voice-orders/config/check
 * @desc    Validate voice order environment configuration (no secrets returned)
 * @access  super_admin, client, admin, staff
 */
router.get("/config/check", protect, allowRoles(...CLIENT_ROLES), tenantMiddleware, checkVoiceConfig);

/**
 * @route   POST /api/voice-orders/diagnostic/gemini-text
 * @desc    Text-only Gemini diagnostic — verifies API key and model work
 *          without audio. Returns the Gemini response for a simple prompt.
 * @access  super_admin only (sensitive diagnostic)
 *          Remove this route before production or restrict further.
 */
const { GoogleGenAI } = require("@google/genai");
router.post(
  "/diagnostic/gemini-text",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        return res.status(503).json({ success: false, message: "GEMINI_API_KEY is not set on the backend." });
      }
      const model = req.body?.model || process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash";
      const prompt = req.body?.prompt || "Reply with OK only.";
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.0, maxOutputTokens: 10 },
      });
      const reply = typeof response.text === "string" ? response.text.trim() : "";
      console.log("[GeminiDiagnostic] model=" + model + " prompt=" + prompt.slice(0, 100) + " reply=" + reply.slice(0, 200));
      return res.json({ success: true, model, reply, prompt });
    } catch (err) {
      let status = 500;
      let geminiCode = "";
      let detail = err.message || String(err);
      if (err?.constructor?.name === "ApiError") {
        status = err.status || 500;
        try { const p = JSON.parse(detail); geminiCode = p?.error?.status || ""; detail = p?.error?.message || detail; } catch {}
      }
      console.error("[GeminiDiagnostic] FAILED:", "name=" + (err?.constructor?.name || typeof err), "status=" + status, "code=" + geminiCode, "detail=" + detail.slice(0, 300));
      return res.status(status).json({ success: false, error: detail, code: geminiCode, status });
    }
  }
);

/**
 * @route   GET /api/voice-orders/:id
 * @desc    Get a single voice order (ownership-checked in controller)
 * @access  super_admin, client, admin, staff
 */
router.get("/:id", protect, allowRoles(...CLIENT_ROLES), tenantMiddleware, getVoiceOrder);

/**
 * @route   GET /api/voice-orders/:id/audio
 * @desc    Stream audio file (authenticated + ownership-checked)
 * @access  super_admin, client, admin, staff
 */
router.get("/:id/audio", injectTokenFromQuery, protect, allowRoles(...CLIENT_ROLES), tenantMiddleware, streamAudio);

/**
 * @route   POST /api/voice-orders
 * @desc    Create voice order + upload audio (multipart or base64)
 * @access  super_admin, client, admin, staff
 */
router.post(
  "/",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  upload.single("audio"), // "audio" is the multipart field name
  createVoiceOrder
);

/**
 * @route   POST /api/voice-orders/:id/transcribe
 * @desc    Run/retry transcription
 */
router.post(
  "/:id/transcribe",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  transcribeVoiceOrder
);

/**
 * @route   POST /api/voice-orders/:id/extract
 * @desc    Run/retry AI extraction
 */
router.post(
  "/:id/extract",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  extractVoiceOrder
);

/**
 * @route   PATCH /api/voice-orders/:id/transcription
 * @desc    Manually update transcription text
 */
router.patch(
  "/:id/transcription",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  updateTranscription
);

/**
 * @route   PATCH /api/voice-orders/:id/draft
 * @desc    Update draft (items, customer info, notes)
 */
router.patch(
  "/:id/draft",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  updateDraft
);

/**
 * @route   POST /api/voice-orders/:id/confirm
 * @desc    Confirm and create the final order (idempotent)
 */
router.post(
  "/:id/confirm",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  confirmVoiceOrder
);

/**
 * @route   PATCH /api/voice-orders/:id/cancel
 * @desc    Cancel a voice order
 */
router.patch(
  "/:id/cancel",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  cancelVoiceOrder
);

/**
 * @route   DELETE /api/voice-orders/:id
 * @desc    Permanently delete a voice order and its audio file
 * @access  super_admin, client, admin, staff
 */
router.delete(
  "/:id",
  protect,
  allowRoles(...CLIENT_ROLES),
  tenantMiddleware,
  deleteVoiceOrder
);

module.exports = router;
