const mongoose = require("mongoose");
const crypto = require("crypto");
const VoiceOrder = require("../models/VoiceOrder");
const Order = require("../models/Order");
const Product = require("../models/Product");
const audioStorageService = require("../services/audioStorageService");
const transcriptionProvider = require("../services/transcriptionProvider");
const orderExtractionProvider = require("../services/orderExtractionProvider");
const productMatchingService = require("../services/productMatchingService");
const { normalizeRole, isClientScopedRole } = require("../utils/clientScopedRoles");
const { buildProductVisibilityFilter } = require("../utils/tenantResolver");
const { resolveAction, determineStage, acquireProcessingLock } = require("../utils/voiceOrderStateMachine");
const isValidObjectId = (id) => {
  if (!id) return false;
  const s = String(id).trim();
  return s && s !== "null" && s !== "undefined" && mongoose.Types.ObjectId.isValid(s);
};

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

async function ownershipCheck(voiceOrder, req) {
  const role = normalizeRole(req.user?.role);
  if (role === "super_admin") return true;

  return String(voiceOrder.createdByUserId) === String(req.user._id);
}

async function readAudioFromStorage(vo) {
  const chunks = [];
  const stream = audioStorageService.createReadStream(vo.audioStorageKey);
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks);
}

function buildTranscriptionFailureMessage(errCode, txName) {
  const m = {
    QUOTA_LIMIT_ZERO: "Free API quota is unavailable for the selected model.",
    BILLING_REQUIRED: `Add billing/credits to use ${txName} API.`,
    QUOTA_EXCEEDED: `${txName} API quota is exhausted for today. Try again later.`,
    RATE_LIMITED: "Gemini rate limit reached. Please retry later.",
    AUTH_ERROR: `${txName} API key is missing or invalid. Check the server environment variables.`,
    PERMISSION_DENIED: `${txName} API access is not permitted for this project.`,
    MODEL_NOT_FOUND: `The configured ${txName} model is unavailable.`,
    UNSUPPORTED_AUDIO: "The audio format is unsupported or the recording is invalid.",
    FILE_TOO_LARGE: "Audio file exceeds the maximum allowed size.",
    SAFETY_BLOCKED: "The recording was blocked by content safety filters.",
    EMPTY_RESPONSE: "No speech was detected in this recording.",
    PROVIDER_NOT_CONFIGURED: "Transcription service is not configured.",
    SDK_MISSING: "Transcription SDK is not installed.",
  };
  return m[errCode] || `Transcription failed: ${errCode}`;
}

function buildExtractionFailureMessage(errCode, extName) {
  const m = {
    QUOTA_EXCEEDED: "AI extraction quota is unavailable. Add API billing/credits.",
    AUTH_ERROR: `${extName} API key is missing or invalid.`,
    PERMISSION_DENIED: `${extName} API access is not permitted for this project.`,
    MODEL_NOT_FOUND: `The configured ${extName} model is unavailable.`,
    PROVIDER_NOT_CONFIGURED: "AI extraction is not configured.",
    SDK_MISSING: "AI extraction SDK is not installed.",
  };
  return m[errCode] || `AI extraction failed: ${errCode}`;
}

function logState(meta) {
  const parts = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== null && v !== "") {
      parts.push(k + "=" + v);
    }
  }
  console.log("[VoiceOrderState] " + parts.join(" "));
}

// ── List voice orders ──────────────────────────────────────────────────────────

const listVoiceOrders = async (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    const isSuperAdmin = role === "super_admin";

    const {
      page = 1,
      limit = 20,
      status,
      search,
    } = req.query;

    const filter = {};

    if (status) filter.status = status;

    if (!isSuperAdmin) {
      filter.createdByUserId = req.user._id;
    }

    if (search) {
      const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { transcription: regex },
        { originalFileName: regex },
        { "extractedData.customer.name": regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, orders] = await Promise.all([
      VoiceOrder.countDocuments(filter),
      VoiceOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("createdByUserId", "name email role")
        .lean(),
    ]);

    return res.json({
      success: true,
      data: orders,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("[VoiceOrder] listVoiceOrders error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load voice orders." });
  }
};

// ── Get single voice order ─────────────────────────────────────────────────────

const getVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id)
      .populate("createdByUserId", "name email role")
      .populate("createdOrderId", "orderId orderStatus totalPrice");

    if (!vo) {
      return res.status(404).json({ success: false, message: "Voice order not found." });
    }
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    return res.json({ success: true, data: vo });
  } catch (err) {
    console.error("[VoiceOrder] getVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load voice order." });
  }
};

// ── Create voice order (upload audio) ─────────────────────────────────────────

const createVoiceOrder = async (req, res) => {
  try {
    let audioBuffer = null;
    let mimeType = null;
    let originalFileName = "recording.webm";

    if (req.file) {
      audioBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
      originalFileName = req.file.originalname || originalFileName;
    } else if (req.body?.audioBase64) {
      const base64 = req.body.audioBase64.replace(/^data:[^;]+;base64,/, "");
      audioBuffer = Buffer.from(base64, "base64");
      mimeType = req.body.mimeType || "audio/webm";
      originalFileName = req.body.originalFileName || originalFileName;
    } else {
      return res.status(400).json({
        success: false,
        message: "No audio file provided. Send a multipart 'audio' field or a base64 'audioBase64' body field.",
      });
    }

    const mimeCheck = audioStorageService.validateMime(mimeType);
    if (!mimeCheck.valid) {
      return res.status(400).json({ success: false, message: mimeCheck.message });
    }

    if (audioBuffer.length > audioStorageService.MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: `Audio file is too large. Maximum allowed: ${process.env.MAX_AUDIO_FILE_SIZE_MB || 25} MB.`,
      });
    }

    if (audioBuffer.length === 0) {
      return res.status(400).json({ success: false, message: "Audio file is empty." });
    }

    const { storageKey, fileSize } = await audioStorageService.saveAudio(audioBuffer, mimeType);

    const vo = await VoiceOrder.create({
      createdByUserId: req.user._id,
      audioStorageKey: storageKey,
      originalFileName: originalFileName.slice(0, 255),
      mimeType,
      fileSize,
      durationSeconds: req.body?.durationSeconds ? Number(req.body.durationSeconds) : null,
      status: "uploaded",
    });

    return res.status(201).json({ success: true, data: vo });
  } catch (err) {
    console.error("[VoiceOrder] createVoiceOrder error:", err.message);
    if (err.code === "INVALID_MIME") {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === "FILE_TOO_LARGE") {
      return res.status(413).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: "Failed to create voice order." });
  }
};

// ── Stream audio ───────────────────────────────────────────────────────────────

const streamAudio = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id).select("audioStorageKey mimeType originalFileName");
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!vo.audioStorageKey) {
      return res.status(404).json({ success: false, message: "Audio file not available." });
    }

    const mimeType = vo.mimeType || "audio/webm";
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(vo.originalFileName || "audio")}"`
    );

    const stream = audioStorageService.createReadStream(vo.audioStorageKey);
    stream.on("error", (err) => {
      console.error("[VoiceOrder] Audio stream error:", err.message);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) {
    console.error("[VoiceOrder] streamAudio error:", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: "Failed to stream audio." });
    }
  }
};

// ── core processing pipeline ───────────────────────────────────────────────

async function runTranscriptionPipeline(vo, audioBuffer, options) {
  const voiceOrderId = String(vo._id);
  const model = process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || "gemini-3.1-flash-lite";

  logState({
    voiceOrderId,
    databaseStatus: vo.status,
    frontendRequestedAction: "transcribe",
    transcriptExists: false,
    processingStartedAt: vo.processingStartedAt,
    selectedModel: model,
  });

  vo.status = "transcribing";
  vo.failureReason = null;
  vo.processingStartedAt = new Date();
  await vo.save();

  let audioBuf = audioBuffer;
  if (!audioBuf) {
    audioBuf = await readAudioFromStorage(vo);
  }

  const result = await transcriptionProvider.transcribeAudio(
    audioBuf,
    vo.mimeType,
    vo.originalFileName,
    { language: options?.language || undefined, voiceOrderId }
  );

  const text = (result.text || "").trim();
  if (!text) {
    vo.status = "transcription_failed";
    vo.transcriptionStatus = "failed";
    vo.failureReason = "Gemini returned empty transcription.";
    vo.processingStartedAt = null;
    await vo.save();
    logState({ voiceOrderId, finalStatus: "transcription_failed", errorCode: "EMPTY_RESPONSE" });
    return { status: "transcription_failed", failureReason: vo.failureReason };
  }

  vo.transcription = text;
  vo.transcriptionLanguage = result.language || "en";
  vo.transcriptionStatus = "completed";
  if (result.durationSeconds != null) vo.durationSeconds = result.durationSeconds;
  vo.status = "transcribed";
  await vo.save();

  logState({ voiceOrderId, databaseStatus: "transcribed", transcriptExists: true, resumedStage: "transcribed" });
  return { status: "transcribed", text };
}

async function getDashboardProductsForUser(req) {
  // Reuse the exact same product visibility filter used by the Dashboard Products page.
  const filter = await buildProductVisibilityFilter(req);

  // Apply the same isActive logic as productController.getProducts:
  // non-staff users (user/customer) only see isActive products.
  const role = normalizeRole(req.user?.role);
  const isStaff = req.user && (role === "admin" || role === "super_admin" || isClientScopedRole(req.user.role));
  if (!isStaff) {
    filter.isActive = true;
  }

  return Product.find(filter)
    .select("_id name sku barcode price stock isActive category image")
    .lean();
}

function buildItemResponse(matchedItem) {
  const matched = !!matchedItem.matchedProductId;
  return {
    spokenText: matchedItem.spokenName || matchedItem.spokenText || "",
    quantity: matchedItem.requestedQuantity || 1,
    matched,
    productId: matched ? String(matchedItem.matchedProductId) : null,
    productName: matched ? matchedItem.matchedProductName : null,
    categoryName: matched ? (matchedItem.matchedProductCategory || "") : "",
    price: matched ? (matchedItem.matchedProductPrice || 0) : 0,
    stockQuantity: matched ? (matchedItem.matchedProductStock ?? 0) : 0,
    confidence: matchedItem.confidence || 0,
    matchType: matchedItem.matchType || "",
    requiresConfirmation: matchedItem.requiresReview || !matched,
  };
}

async function runExtractionPipeline(vo, req) {
  const voiceOrderId = String(vo._id);
  const transcript = (vo.transcription || "").trim();

  logState({
    voiceOrderId,
    databaseStatus: vo.status,
    frontendRequestedAction: "extract",
    transcriptExists: !!transcript,
    processingStartedAt: vo.processingStartedAt,
  });

  if (!transcript) {
    return { status: "no_transcript" };
  }

  console.log(`[VoiceOrder] runExtractionPipeline userId=${req.user._id} transcript="${transcript.slice(0, 100)}"`);

  const dashboardProducts = await getDashboardProductsForUser(req);
  console.log(`[VoiceOrder] runExtractionPipeline dashboardProductsFound=${dashboardProducts.length}`);

  if (dashboardProducts.length === 0) {
    vo.status = "extraction_failed";
    vo.matchingStatus = "failed";
    vo.failureReason = "No products were found in your Dashboard Products.";
    vo.processingStartedAt = null;
    await vo.save();
    logState({ voiceOrderId, finalStatus: "extraction_failed", errorCode: "NO_PRODUCTS" });
    return { status: "extraction_failed", failureReason: vo.failureReason };
  }

  vo.status = "extracting_order";
  vo.failureReason = null;
  vo.processingStartedAt = new Date();
  await vo.save();

  let extractedItems = [];
  let extractionSource = "fallback";
  let extractedData = null;

  // ── Try AI extraction (safe — never throws on parse errors) ────────────
  const diagExt = orderExtractionProvider.getExtractionDiagnostics();
  if (diagExt.configured) {
    const productContext = dashboardProducts.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
    }));

    const aiResult = await orderExtractionProvider.safeExtractOrder(
      transcript,
      productContext,
      { currency: "INR", voiceOrderId }
    );

    console.log(`[VoiceOrder] aiExtractionResult success=${aiResult.success} source=${aiResult.source}`);

    if (aiResult.success && aiResult.data) {
      extractedData = aiResult.data;
      const rawItems = Array.isArray(aiResult.data?.items) ? aiResult.data.items : [];
      console.log(`[VoiceOrder] aiExtraction items=${rawItems.length}`);

      if (rawItems.length > 0) {
        const matched = productMatchingService.matchItems(rawItems, dashboardProducts);
        extractedItems = matched.map(buildItemResponse);
        extractionSource = "ai";
      }
    }
  }

  // ── Fallback: direct transcription-to-product matching ─────────────────
  if (extractedItems.length === 0) {
    console.log(`[VoiceOrder] Using fallback extraction for transcript="${transcript.slice(0, 100)}"`);

    const fallbackItems = productMatchingService.fallbackExtractItemsFromTranscription(transcript, dashboardProducts);

    if (fallbackItems.length > 0) {
      extractedItems = fallbackItems.map((fb) => ({
        spokenText: fb.spokenText,
        quantity: fb.quantity,
        matched: fb.matched,
        productId: fb.productId,
        productName: fb.productName,
        categoryName: fb.categoryName || "",
        price: fb.price,
        stockQuantity: fb.stockQuantity,
        confidence: fb.confidence,
        matchType: fb.matchType || "",
        requiresConfirmation: fb.requiresConfirmation,
      }));
      extractionSource = "fallback";
    }
  }

  console.log(`[VoiceOrder] final extractionSource=${extractionSource} items=${extractedItems.length}`);

  const resolvedItems = extractedItems.map((item) => ({
    spokenName: item.spokenText,
    requestedQuantity: item.quantity,
    matchedProductId: item.productId,
    matchedProductName: item.productName,
    matchedProductCategory: item.categoryName || "",
    matchedProductPrice: item.price,
    matchedProductStock: item.stockQuantity,
    matchedProductIsActive: item.matched ? true : null,
    confidence: item.confidence,
    requiresReview: item.requiresConfirmation,
    reviewWarning: item.matched
      ? (item.requiresConfirmation
          ? `Low confidence match for "${item.spokenText}".`
          : null)
      : `Could not find a product matching "${item.spokenText}" in your product catalogue.`,
    confirmationError: null,
    manuallyOverridden: false,
    quantityAmbiguous: false,
    alternativeProductIds: [],
    notes: null,
  }));

  vo.extractedData = extractedData || { items: [], customer: {}, fulfilment: { type: "unknown" }, warnings: [], overallConfidence: 0 };
  vo.resolvedItems = resolvedItems;
  vo.overallConfidence = extractedItems.reduce((max, i) => Math.max(max, i.confidence || 0), 0);
  vo.matchingStatus = "completed";
  vo.status = "ready_for_review";
  vo.processingStartedAt = null;
  await vo.save();

  logState({ voiceOrderId, finalStatus: "ready_for_review", extractionSource });

  const responseItems = resolvedItems.map((item) => buildItemResponse(item));

  return {
    status: "ready_for_review",
    extractionSource,
    items: responseItems,
    extracted: vo.extractedData,
    resolvedItems: vo.resolvedItems,
  };
}

// ── Transcribe ─────────────────────────────────────────────────────────────────

const transcribeVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }

    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!vo.audioStorageKey) {
      return res.status(400).json({ success: false, message: "No audio file found for this voice order." });
    }

    const resolved = resolveAction(vo);
    const { stage } = determineStage(resolved);

    logState({
      ...resolved.logMeta,
      frontendRequestedAction: "transcribe",
      resolvedAction: resolved.action,
      resolvedReason: resolved.reason,
      resumedStage: stage,
    });

    if (stage === "rejected") {
      return res.status(400).json({
        success: false,
        message: `Cannot process a voice order with status "${vo.status}".`,
        status: vo.status,
      });
    }

    if (stage === "complete") {
      return res.json({ success: true, data: vo, message: "Already complete." });
    }

    if (stage === "in_progress") {
      return res.status(409).json({
        success: false,
        message: `Processing is already in progress (status: ${vo.status}). Please wait or retry after 5 minutes.`,
        status: vo.status,
      });
    }

    // ── Acquire processing lock ──────────────────────────────────────────
    if (!acquireProcessingLock(vo)) {
      return res.status(409).json({
        success: false,
        message: "Processing is already in progress. Please wait.",
        status: vo.status,
      });
    }

    // ── Phase: Transcription ─────────────────────────────────────────────
    if (stage === "transcribe") {
      let audioBuffer;
      try {
        audioBuffer = await readAudioFromStorage(vo);
      } catch (readErr) {
        vo.status = "transcription_failed";
        vo.failureReason = "Could not read audio file from storage.";
        vo.processingStartedAt = null;
        await vo.save();
        return res.status(500).json({ success: false, message: vo.failureReason });
      }

      try {
        const txnResult = await runTranscriptionPipeline(vo, audioBuffer, req.body);

        if (txnResult.status === "transcription_failed") {
          return res.status(502).json({
            success: false,
            message: txnResult.failureReason,
            code: "EMPTY_RESPONSE",
          });
        }

        // Transcription succeeded; fall through to extraction
      } catch (transcribeErr) {
        vo.status = "transcription_failed";
        vo.failureReason = buildTranscriptionFailureMessage(
          transcribeErr.code || "UNKNOWN",
          "Gemini"
        );
        vo.processingStartedAt = null;
        await vo.save();

        logState({
          voiceOrderId: String(vo._id),
          finalStatus: "transcription_failed",
          errorCode: transcribeErr.code || "UNKNOWN",
        });

        const statusCode = transcribeErr.status || 502;
        return res.status(statusCode).json({
          success: false,
          message: vo.failureReason,
          errorRef: transcribeErr.errorRef || null,
          code: transcribeErr.code || "UNKNOWN",
        });
      }
    }

    // ── Phase: Extraction ────────────────────────────────────────────────
    // Extract items using AI (with fallback to direct matching).
    try {
      const extResult = await runExtractionPipeline(vo, req);

      if (extResult.status === "no_transcript") {
        vo.status = "transcription_failed";
        vo.failureReason = "No transcript available for extraction.";
        vo.processingStartedAt = null;
        await vo.save();
        return res.status(502).json({ success: false, message: vo.failureReason });
      }

      if (extResult.status === "extraction_failed") {
        return res.status(207).json({
          success: true,
          data: vo,
          message: extResult.failureReason || "No products could be matched.",
          extractionError: true,
          items: [],
        });
      }

      const hasItems = extResult.items && extResult.items.length > 0;

      return res.json({
        success: true,
        data: vo,
        message: hasItems
          ? "Product matching complete! Review the items below."
          : "Transcription complete but no products were matched.",
        extractionSource: extResult.extractionSource || "fallback",
        items: extResult.items || [],
        extractionError: false,
      });
    } catch (extractErr) {
      vo.status = "extraction_failed";
      vo.failureReason = buildExtractionFailureMessage(
        extractErr.code || "UNKNOWN",
        "Gemini"
      );
      vo.processingStartedAt = null;
      await vo.save();

      logState({
        voiceOrderId: String(vo._id),
        finalStatus: "extraction_failed",
        errorCode: extractErr.code || "UNKNOWN",
      });

      return res.status(207).json({
        success: true,
        data: vo,
        message: "Product matching encountered an issue.",
        errorRef: extractErr.errorRef || null,
        extractionError: true,
        items: [],
      });
    }
  } catch (err) {
    console.error("[VoiceOrder] transcribeVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Internal error during transcription." });
  }
};

// ── Retry voice order ─────────────────────────────────────────────────────────

const retryVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }

    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (!vo.audioStorageKey) {
      return res.status(400).json({ success: false, message: "No audio file found for this voice order." });
    }

    const resolved = resolveAction(vo);
    const { stage } = determineStage(resolved);

    logState({
      ...resolved.logMeta,
      frontendRequestedAction: "retry",
      resolvedAction: resolved.action,
      resolvedReason: resolved.reason,
      resumedStage: stage,
    });

    if (stage === "rejected") {
      return res.status(400).json({
        success: false,
        message: `Cannot retry a voice order with status "${vo.status}".`,
        status: vo.status,
      });
    }

    if (stage === "complete") {
      return res.json({ success: true, data: vo, message: "Already complete." });
    }

    if (stage === "in_progress") {
      if (resolved.action === "transcribe" || resolved.reason.includes("stale")) {
        // Stale lock — reset and continue
        vo.processingStartedAt = null;
        await vo.save();
      } else {
        return res.status(409).json({
          success: false,
          message: "Processing is already in progress. Please wait.",
          status: vo.status,
        });
      }
    }

    // ── Phase: Transcription ─────────────────────────────────────────────
    if (stage === "transcribe") {
      let audioBuffer;
      try {
        audioBuffer = await readAudioFromStorage(vo);
      } catch (readErr) {
        vo.status = "transcription_failed";
        vo.failureReason = "Could not read audio file from storage.";
        vo.processingStartedAt = null;
        await vo.save();
        return res.status(500).json({ success: false, message: vo.failureReason });
      }

      try {
        const txnResult = await runTranscriptionPipeline(vo, audioBuffer, req.body);
        if (txnResult.status === "transcription_failed") {
          return res.status(502).json({
            success: false,
            message: txnResult.failureReason,
            code: "EMPTY_RESPONSE",
          });
        }
      } catch (transcribeErr) {
        vo.status = "transcription_failed";
        vo.failureReason = buildTranscriptionFailureMessage(
          transcribeErr.code || "UNKNOWN",
          "Gemini"
        );
        vo.processingStartedAt = null;
        await vo.save();
        logState({ voiceOrderId: String(vo._id), finalStatus: "transcription_failed", errorCode: transcribeErr.code || "UNKNOWN" });
        return res.status(transcribeErr.status || 502).json({
          success: false,
          message: vo.failureReason,
          errorRef: transcribeErr.errorRef || null,
          code: transcribeErr.code || "UNKNOWN",
        });
      }
    }

    // ── Phase: Extraction ────────────────────────────────────────────────
    try {
      const extResult = await runExtractionPipeline(vo, req);
      if (extResult.status === "no_transcript") {
        vo.status = "transcription_failed";
        vo.failureReason = "No transcript available for extraction.";
        vo.processingStartedAt = null;
        await vo.save();
        return res.status(502).json({ success: false, message: vo.failureReason });
      }
      if (extResult.status === "extraction_failed") {
        return res.status(207).json({
          success: true,
          data: vo,
          message: extResult.failureReason || "No products could be matched.",
          extractionError: true,
          items: [],
        });
      }
      const hasItems = extResult.items && extResult.items.length > 0;
      return res.json({
        success: true,
        data: vo,
        message: hasItems
          ? "Product matching complete! Review the items below."
          : "Transcription complete but no products were matched.",
        extractionSource: extResult.extractionSource || "fallback",
        items: extResult.items || [],
        extractionError: !hasItems,
      });
    } catch (extractErr) {
      vo.status = "extraction_failed";
      vo.failureReason = buildExtractionFailureMessage(extractErr.code || "UNKNOWN", "Gemini");
      vo.processingStartedAt = null;
      await vo.save();
      logState({ voiceOrderId: String(vo._id), finalStatus: "extraction_failed", errorCode: extractErr.code || "UNKNOWN" });
      return res.status(207).json({
        success: true,
        data: vo,
        message: "Product matching encountered an issue.",
        errorRef: extractErr.errorRef || null,
        extractionError: true,
        items: [],
      });
    }
  } catch (err) {
    console.error("[VoiceOrder] retryVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Internal error during retry." });
  }
};

// ── Extract order (manual re-extraction) ───────────────────────────────────────

const extractVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }

    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const transcript = (vo.transcription || "").trim();
    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: "No transcription available. Transcribe the audio first.",
      });
    }

    const extractableStates = [
      "transcribed", "extracting_order", "extraction_failed",
      "order_extraction_failed", "needs_review", "ready_for_review", "draft", "failed",
    ];
    if (!extractableStates.includes(vo.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot extract from a voice order with status "${vo.status}".`,
      });
    }

    try {
      const extResult = await runExtractionPipeline(vo, req);
      if (extResult.status === "extraction_failed") {
        return res.status(207).json({
          success: true,
          data: vo,
          message: extResult.failureReason || "No products could be matched.",
          extractionError: true,
          items: [],
          errorRef: null,
        });
      }
      const hasItems = extResult.items && extResult.items.length > 0;
      return res.json({
        success: true,
        data: vo,
        extractionSource: extResult.extractionSource || "fallback",
        items: extResult.items || [],
        extractionError: false,
      });
    } catch (extractErr) {
      vo.status = "extraction_failed";
      vo.failureReason = buildExtractionFailureMessage(extractErr.code || "UNKNOWN", "Gemini");
      vo.processingStartedAt = null;
      await vo.save();
      logState({ voiceOrderId: String(vo._id), finalStatus: "extraction_failed", errorCode: extractErr.code || "UNKNOWN" });
      return res.status(extractErr.status || 502).json({
        success: false,
        message: vo.failureReason,
        errorRef: extractErr.errorRef || null,
        code: extractErr.code || "UNKNOWN",
      });
    }
  } catch (err) {
    console.error("[VoiceOrder] extractVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Internal error during extraction." });
  }
};

// ── Update draft ───────────────────────────────────────────────────────────────

const updateDraft = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const editableStates = [
      "needs_review", "ready_for_review", "draft",
      "transcription_failed", "extraction_failed", "order_extraction_failed", "failed",
    ];
    if (!editableStates.includes(vo.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot edit a voice order with status "${vo.status}".`,
      });
    }

    const {
      transcription,
      draftData,
      resolvedItems: rawItems,
    } = req.body;

    if (transcription !== undefined) {
      vo.transcription = String(transcription).slice(0, 10000);
    }

    if (draftData !== undefined && typeof draftData === "object") {
      vo.draftData = draftData;
    }

    if (Array.isArray(rawItems)) {
      const dashboardProductsForDraft = await getDashboardProductsForUser(req);
      const productMap = new Map(dashboardProductsForDraft.map((p) => [String(p._id), p]));

      vo.resolvedItems = rawItems.map((item) => {
        const spokenName = String(item.spokenName || item.name || item.spokenText || item.productName || "").trim();

        if (!item.matchedProductId) {
          return { ...item, spokenName, manuallyOverridden: true };
        }
        const product = productMap.get(String(item.matchedProductId));
        if (!product) {
          return { ...item, spokenName, confirmationError: "Product not found in your product catalogue." };
        }
        return {
          ...item,
          spokenName,
          matchedProductName: product.name,
          matchedProductPrice: product.price,
          matchedProductStock: product.stock,
          matchedProductIsActive: product.isActive,
          manuallyOverridden: true,
          confirmationError: null,
        };
      });
    }

    vo.status = "draft";
    await vo.save();

    return res.json({ success: true, data: vo });
  } catch (err) {
    console.error("[VoiceOrder] updateDraft error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to update draft." });
  }
};

// ── Confirm and create order ───────────────────────────────────────────────────

/**
 * Core confirmation logic — called with or without a Mongoose session.
 * Extracted so we can retry without a transaction if the server does not
 * support multi-document transactions (Atlas M0 / standalone).
 */
async function _runConfirmLogic(req, res, voiceOrderId, session) {
  const useSession = !!session;

  console.log(`[VoiceOrder Confirm] voiceOrderId=${voiceOrderId} useSession=${useSession}`);

  const vo = await VoiceOrder.findById(voiceOrderId).session(session || null);
  if (!vo) {
    return res.status(404).json({ success: false, message: "Voice order not found." });
  }
  if (!(await ownershipCheck(vo, req))) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────
  if (vo.status === "order_created" && vo.createdOrderId) {
    const existingOrder = await Order.findById(vo.createdOrderId).select("orderId orderStatus totalPrice");
    return res.json({
      success: true,
      message: "Order was already created.",
      data: { voiceOrder: vo, order: existingOrder },
    });
  }

  const confirmableStates = [
    "needs_review", "ready_for_review", "draft", "confirmed",
  ];
  if (!confirmableStates.includes(vo.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot confirm a voice order with status "${vo.status}". Expected one of: ${confirmableStates.join(", ")}.`,
    });
  }

  const draftData = vo.draftData || {};
  const extractedData = vo.extractedData || {};
  const customer = draftData.customer || extractedData.customer || {};
  const rawFulfilment = draftData.fulfilment || extractedData.fulfilment || {};

  // ── Normalise fulfilment type — never allow "unknown" to reach the DB ──────
  // Map every non-pickup value to "delivery" so shipping address is populated.
  const fulfilmentType =
    rawFulfilment.type === "pickup" ? "pickup" : "delivery";
  const fulfilment = { ...rawFulfilment, type: fulfilmentType };

  console.log(`[VoiceOrder Confirm] status=${vo.status} fulfilmentType=${fulfilmentType} draftData.keys=${Object.keys(draftData).join(",")}`);

  const liveProducts = await getDashboardProductsForUser(req);

  console.log(`[VoiceOrder Confirm] dashboardProducts count=${liveProducts.length}`);

  // ── Convert Mongoose subdocuments → plain objects ─────────────────────────────
  // vo.resolvedItems is a Mongoose DocumentArray (subdocuments).  When these are
  // spread inside revalidateItemsForConfirmation via { ...item, ... } the Mongoose
  // schema path getters are NOT own-enumerable properties, so matchedProductId is
  // silently dropped from the spread result even though item.matchedProductId works
  // as a getter.  Calling .toObject() on each subdocument (or using the plain-
  // object version from draftData.items) guarantees a real plain JS object.
  const rawItemsToConfirm = draftData.items || vo.resolvedItems || [];
  const itemsToConfirm = rawItemsToConfirm.map((item) =>
    typeof item.toObject === "function" ? item.toObject() : { ...item }
  );

  // Pre-submit diagnostic — helps trace the exact item shape reaching confirmation
  console.log(`[VoiceOrder Confirm] itemsToConfirm.length=${itemsToConfirm.length} liveProducts.length=${liveProducts.length}`);
  itemsToConfirm.forEach((item, idx) => {
    console.log(`[VoiceOrder Confirm] item[${idx}]`, {
      spokenName: item.spokenName,
      matchedProductId: item.matchedProductId,
      requestedQuantity: item.requestedQuantity,
      hasMatchedProductId: Boolean(item.matchedProductId),
    });
  });

  if (!itemsToConfirm.length) {
    return res.status(400).json({ success: false, message: "No items to confirm in this order." });
  }

  // Build the live-product map once — shared by revalidation AND order-item build
  const productMap = new Map(liveProducts.map((p) => [String(p._id), p]));

  const { valid, items: revalidatedItems, errors } =
    productMatchingService.revalidateItemsForConfirmation(itemsToConfirm, liveProducts);

  console.log(`[VoiceOrder Confirm] revalidation valid=${valid} errors=${JSON.stringify(errors)}`);

  if (!valid) {
    return res.status(422).json({
      success: false,
      message: "Order cannot be confirmed due to product issues: " + errors.join("; "),
      errors,
    });
  }

  const orderItems = revalidatedItems.map((item) => {
    const resolvedId = item.matchedProductId ? String(item.matchedProductId) : null;
    const p = resolvedId ? productMap.get(resolvedId) : null;
    if (!p) {
      // Guard against any edge-case where revalidation passed but the product
      // cannot be found.  This should never happen; if it does, the log below
      // provides the exact item shape for diagnosis.
      console.error("[VoiceOrder Confirm] product disappeared after revalidation", {
        index: revalidatedItems.indexOf(item),
        spokenName: item.spokenName,
        matchedProductId: item.matchedProductId,
        resolvedId,
        keys: Object.keys(item),
      });
      throw Object.assign(
        new Error(
          `The matched product for "${item.spokenName || "an item"}" could not be found. Please refresh the page and try again.`
        ),
        { statusCode: 422 }
      );
    }
    return {
      productId: String(item.matchedProductId),
      name: p.name,
      price: p.price,
      quantity: item.requestedQuantity,
      image: p.image || "",
      category: p.category || "Uncategorised",
    };
  });

  const totalPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const shippingAddress =
    fulfilment.type === "pickup"
      ? {
          fullName: customer.name || "Walk-in Customer",
          address: "In-store pickup",
          city: "N/A",
          state: "N/A",
          zipCode: "000000",
          country: "N/A",
          phone: customer.phone || undefined,
        }
      : {
          fullName: customer.name || "Voice Order Customer",
          address: fulfilment.address || "Address not provided",
          city: draftData.city || "N/A",
          state: draftData.state || "N/A",
          zipCode: draftData.zipCode || "000000",
          country: draftData.country || "India",
          phone: customer.phone || undefined,
        };

  const orderId = `ORD-VOICE-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;

  const createOptions = useSession ? { session } : {};

  const [newOrder] = await Order.create(
    [
      {
        orderId,
        clientId: req.user?.clientId || req.user._id,
        user: req.user._id,
        customerName: customer.name || undefined,
        customerEmail: customer.email || undefined,
        items: orderItems,
        shippingAddress,
        paymentMethod: draftData.paymentMethod || "voice_order_pending",
        totalPrice,
        orderSource: "ai_voice",
        voiceOrderId: String(vo._id),
        status: "placed",
        orderStatus: "placed",
        trackingStatus: "Order Placed",
        currentStage: 1,
        trackingHistory: [
          {
            stage: 1,
            label: "Order Placed",
            message: "Order captured via AI Voice Order.",
            at: new Date(),
          },
        ],
        estimatedDelivery: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          return d;
        })(),
        trackingId: `TRK-VOICE-${Date.now().toString(36).toUpperCase()}`,
      },
    ],
    createOptions
  );

  vo.status = "order_created";
  vo.createdOrderId = newOrder._id;
  vo.confirmedAt = new Date();

  if (useSession) {
    await vo.save({ session });
  } else {
    await vo.save();
  }

  console.log(`[VoiceOrder] Order created: orderId=${orderId} voiceOrderId=${vo._id} fulfilmentType=${fulfilmentType}`);

  return res.status(201).json({
    success: true,
    message: "Order created successfully.",
    data: { voiceOrder: vo, order: newOrder },
  });
}

const confirmVoiceOrder = async (req, res) => {
  const { id } = req.params;

  console.log(`[VoiceOrder Confirm] voiceOrderId=${id} body=${JSON.stringify(req.body)}`);

  if (!isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid voice order ID." });
  }

  // ── Attempt with transaction first (requires replica set / Atlas M2+) ────────
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    // _runConfirmLogic sends the response itself; it throws on DB errors
    // and returns without throwing on 4xx validation responses.
    // We commit unconditionally after it completes without throwing,
    // because 4xx responses do not modify any documents.
    await _runConfirmLogic(req, res, id, session);
    try { await session.commitTransaction(); } catch (commitErr) {
      // Commit failed after the response was already sent — log only
      console.error("[VoiceOrder Confirm] commitTransaction failed after response sent:", commitErr.message);
    }
  } catch (err) {
    // Check if this is a transaction-not-supported error
    // (Atlas M0 free tier, standalone, or any other non-replica-set deployment)
    const msg = err.message || "";
    const isTransactionUnsupported =
      /Transaction numbers/i.test(msg) ||
      /replica set/i.test(msg) ||
      /not a replica set/i.test(msg) ||
      /transactions are not supported/i.test(msg) ||
      err.code === 20 || // MongoServerError: Transaction numbers are only allowed on a replica member
      err.code === 263;  // OperationNotSupportedInTransaction

    if (session) {
      try { await session.abortTransaction(); } catch { /* ignore */ }
      try { session.endSession(); } catch { /* ignore */ }
      session = null;
    }

    if (isTransactionUnsupported && !res.headersSent) {
      // ── Retry without transaction ───────────────────────────────────────────
      console.warn(`[VoiceOrder Confirm] Transactions not supported on this MongoDB deployment — retrying without session. (${msg.slice(0, 120)})`);
      try {
        await _runConfirmLogic(req, res, id, null);
        return;
      } catch (retryErr) {
        if (!res.headersSent) {
          console.error("[VoiceOrder Confirm] Retry without transaction failed:", {
            message: retryErr.message,
            stack: process.env.NODE_ENV === "development" ? retryErr.stack : undefined,
          });
          return res.status(retryErr.statusCode || 500).json({
            success: false,
            message:
              process.env.NODE_ENV === "development"
                ? retryErr.message
                : "Unable to confirm the order. Please try again.",
          });
        }
        return;
      }
    }

    if (!res.headersSent) {
      console.error("[VoiceOrder Confirm] confirmVoiceOrder failed:", {
        message: err.message,
        code: err.code,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
      return res.status(err.statusCode || 500).json({
        success: false,
        message:
          process.env.NODE_ENV === "development"
            ? err.message
            : "Failed to confirm order. Please try again.",
      });
    }
  } finally {
    if (session) {
      try { session.endSession(); } catch { /* ignore */ }
    }
  }
};

// ── Delete voice order (permanent) ──────────────────────────────────────────────

const deleteVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (vo.status === "order_created" && vo.createdOrderId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a voice order that has already been converted to an order. Cancel the associated order first.",
      });
    }

    if (vo.audioStorageKey) {
      await audioStorageService.deleteAudio(vo.audioStorageKey);
    }

    await VoiceOrder.findByIdAndDelete(id);

    console.log(`[VoiceOrder] Deleted: id=${id} file=${vo.audioStorageKey}`);

    return res.json({ success: true, message: "Voice order permanently deleted." });
  } catch (err) {
    console.error("[VoiceOrder] deleteVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to delete voice order." });
  }
};

// ── Cancel voice order ─────────────────────────────────────────────────────────

const cancelVoiceOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    if (vo.status === "order_created") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a voice order that has already been converted to an order.",
      });
    }
    if (vo.status === "cancelled") {
      return res.json({ success: true, data: vo, message: "Already cancelled." });
    }

    vo.status = "cancelled";
    vo.processingStartedAt = null;
    await vo.save();

    return res.json({ success: true, data: vo });
  } catch (err) {
    console.error("[VoiceOrder] cancelVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to cancel voice order." });
  }
};

// ── Update transcription (manual edit) ────────────────────────────────────────

const updateTranscription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }
    const vo = await VoiceOrder.findById(id);
    if (!vo) return res.status(404).json({ success: false, message: "Voice order not found." });
    if (!(await ownershipCheck(vo, req))) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { transcription } = req.body;
    if (typeof transcription !== "string") {
      return res.status(400).json({ success: false, message: "transcription must be a string." });
    }

    vo.transcription = transcription.slice(0, 10000);
    const resetStates = [
      "needs_review", "ready_for_review", "extracting", "extracting_order",
      "failed", "extraction_failed", "order_extraction_failed",
    ];
    if (resetStates.includes(vo.status)) {
      vo.status = "ready_for_review";
    }
    await vo.save();

    return res.json({ success: true, data: vo });
  } catch (err) {
    console.error("[VoiceOrder] updateTranscription error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to update transcription." });
  }
};

// ── Health / Config validation ─────────────────────────────────────────────────

const checkVoiceConfig = async (req, res) => {
  const provider = (process.env.AI_TRANSCRIPTION_PROVIDER || "openai").toLowerCase();
  const extProvider = (process.env.AI_ORDER_EXTRACTION_PROVIDER || "openai").toLowerCase();
  const checks = [];

  if (provider === "openai" || extProvider === "openai") {
    const apiKeyExists = !!process.env.OPENAI_API_KEY;
    checks.push({
      check: "OPENAI_API_KEY",
      status: apiKeyExists ? "ok" : "missing",
      message: apiKeyExists ? "Set" : "Missing — set or switch provider to gemini.",
    });
    checks.push({
      check: "OPENAI_TRANSCRIPTION_MODEL",
      status: "ok",
      value: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
    });
    checks.push({
      check: "OPENAI_ORDER_MODEL",
      status: "ok",
      value: process.env.OPENAI_ORDER_MODEL || "gpt-4o",
    });
  }

  if (provider === "gemini" || extProvider === "gemini") {
    const geminiKeyExists = !!process.env.GEMINI_API_KEY;
    checks.push({
      check: "GEMINI_API_KEY",
      status: geminiKeyExists ? "ok" : "missing",
      message: geminiKeyExists ? "Set" : "Missing — get a free key from https://aistudio.google.com/apikey.",
    });
    checks.push({
      check: "GEMINI_TRANSCRIPTION_MODEL",
      status: "ok",
      value: process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.1-flash-lite",
    });
    checks.push({
      check: "GEMINI_ORDER_MODEL",
      status: "ok",
      value: process.env.GEMINI_ORDER_MODEL || "gemini-3.1-flash-lite",
    });
  }

  checks.push({
    check: "AI_TRANSCRIPTION_PROVIDER",
    status: "ok",
    value: provider,
  });

  checks.push({
    check: "AI_ORDER_EXTRACTION_PROVIDER",
    status: "ok",
    value: extProvider,
  });

  const maxSize = process.env.MAX_AUDIO_FILE_SIZE_MB || "25";
  checks.push({
    check: "MAX_AUDIO_FILE_SIZE_MB",
    status: "ok",
    value: maxSize,
  });

  const retention = process.env.VOICE_ORDER_RETENTION_DAYS || "90";
  checks.push({
    check: "VOICE_ORDER_RETENTION_DAYS",
    status: "ok",
    value: retention,
  });

  const maxLen = process.env.MAX_TRANSCRIPT_LENGTH || "20000";
  checks.push({
    check: "MAX_TRANSCRIPT_LENGTH",
    status: "ok",
    value: maxLen,
  });

  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const needsOpenAi = provider === "openai" || extProvider === "openai";
  const needsGemini = provider === "gemini" || extProvider === "gemini";

  let allOk = true;
  if (needsOpenAi && !hasOpenAiKey) allOk = false;
  if (needsGemini && !hasGeminiKey) allOk = false;

  const statusCode = allOk ? 200 : 503;

  return res.status(statusCode).json({
    success: allOk,
    service: "voice-orders",
    checks,
  });
};

module.exports = {
  listVoiceOrders,
  getVoiceOrder,
  createVoiceOrder,
  streamAudio,
  transcribeVoiceOrder,
  retryVoiceOrder,
  extractVoiceOrder,
  updateDraft,
  confirmVoiceOrder,
  cancelVoiceOrder,
  updateTranscription,
  checkVoiceConfig,
  deleteVoiceOrder,
};
