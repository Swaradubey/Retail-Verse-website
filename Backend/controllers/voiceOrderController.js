const mongoose = require("mongoose");
const crypto = require("crypto");
const VoiceOrder = require("../models/VoiceOrder");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Client = require("../models/Client");
const audioStorageService = require("../services/audioStorageService");
const transcriptionProvider = require("../services/transcriptionProvider");
const orderExtractionProvider = require("../services/orderExtractionProvider");
const productMatchingService = require("../services/productMatchingService");
const { resolveClientId } = require("../utils/tenantResolver");
const { normalizeRole } = require("../utils/clientScopedRoles");

const isValidObjectId = (id) => {
  if (!id) return false;
  const s = String(id).trim();
  return s && s !== "null" && s !== "undefined" && mongoose.Types.ObjectId.isValid(s);
};

async function resolveStoreId(req) {
  const role = normalizeRole(req.user?.role);
  const isSuperAdmin = role === "super_admin";

  if (!isSuperAdmin) {
    const cId = req.user?.clientId || (await resolveClientId(req));
    if (!isValidObjectId(cId)) {
      throw Object.assign(
        new Error("Your account is not linked to a store. Please contact the Super Admin."),
        { code: "NO_STORE" }
      );
    }
    return String(cId);
  }

  const supplied = req.body?.storeId || req.query?.storeId;
  if (!isValidObjectId(supplied)) {
    throw Object.assign(
      new Error("Super Admin must select a store before performing this action."),
      { code: "STORE_REQUIRED" }
    );
  }
  const client = await Client.findById(supplied).select("_id companyName shopName");
  if (!client) {
    throw Object.assign(
      new Error(`Selected store (${supplied}) does not exist.`),
      { code: "STORE_NOT_FOUND" }
    );
  }
  return String(client._id);
}

async function ownershipCheck(voiceOrder, req) {
  const role = normalizeRole(req.user?.role);
  if (role === "super_admin") return true;

  const userStoreId = req.user?.clientId || (await resolveClientId(req));
  if (!userStoreId) return false;
  return String(voiceOrder.storeId) === String(userStoreId);
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
      storeId: filterStoreId,
      search,
    } = req.query;

    const filter = {};

    if (isSuperAdmin) {
      if (isValidObjectId(filterStoreId)) {
        filter.storeId = new mongoose.Types.ObjectId(String(filterStoreId));
      }
    } else {
      const cId = req.user?.clientId || (await resolveClientId(req));
      if (!isValidObjectId(cId)) {
        return res.status(403).json({ success: false, message: "Store not resolved." });
      }
      filter.storeId = new mongoose.Types.ObjectId(String(cId));
    }

    if (status) filter.status = status;

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
        .populate("storeId", "companyName shopName")
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
      .populate("storeId", "companyName shopName")
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
    const storeId = await resolveStoreId(req).catch((err) =>
      res.status(err.code === "STORE_REQUIRED" ? 400 : 403).json({ success: false, message: err.message })
    );
    if (res.headersSent) return;

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
      storeId,
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
    const vo = await VoiceOrder.findById(id).select("storeId audioStorageKey mimeType originalFileName");
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

    // Idempotency: prevent duplicate processing
    if (vo.status === "transcribing") {
      return res.status(409).json({
        success: false,
        message: "Transcription is already in progress.",
      });
    }

    const retryableStates = [
      "uploaded", "transcription_failed", "order_extraction_failed",
      "failed", "needs_review", "ready_for_review", "draft", "transcribed",
    ];
    if (!retryableStates.includes(vo.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transcribe a voice order with status "${vo.status}".`,
      });
    }

    if (!vo.audioStorageKey) {
      return res.status(400).json({ success: false, message: "No audio file found for this voice order." });
    }

    const diag = transcriptionProvider.getTranscriptionDiagnostics();
    if (!diag.configured) {
      return res.status(503).json({ success: false, message: diag.message });
    }

    // ── Step 1: Transcribe ──────────────────────────────────────────────
    vo.status = "transcribing";
    vo.failureReason = null;
    await vo.save();

    let audioBuffer;
    try {
      const chunks = [];
      const stream = audioStorageService.createReadStream(vo.audioStorageKey);
      await new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      audioBuffer = Buffer.concat(chunks);
    } catch (readErr) {
      vo.status = "transcription_failed";
      vo.failureReason = "Could not read audio file from storage.";
      await vo.save();
      return res.status(500).json({ success: false, message: vo.failureReason });
    }

    let result;
    try {
      result = await transcriptionProvider.transcribeAudio(
        audioBuffer,
        vo.mimeType,
        vo.originalFileName,
        { language: req.body?.language || undefined, voiceOrderId: String(vo._id) }
      );
    } catch (transcribeErr) {
      console.error("[VoiceOrder] Transcription failed:", transcribeErr.code, transcribeErr.message);
      const txProvider = (process.env.AI_TRANSCRIPTION_PROVIDER || "openai").toLowerCase();
      const txName = txProvider === "gemini" ? "Gemini" : "OpenAI";
      vo.status = "transcription_failed";

      const errCode = transcribeErr.code || "UNKNOWN";
      const failureMessages = {
        QUOTA_LIMIT_ZERO: `${txName} API billing is required. Enable billing in Google Cloud Console.`,
        QUOTA_EXCEEDED: `${txName} API quota is unavailable. Add billing/credits and check the project usage limit.`,
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
      vo.failureReason = failureMessages[errCode] || `Transcription failed: ${transcribeErr.message.slice(0, 200)}`;
      await vo.save();

      const statusCode = transcribeErr.status || 502;
      return res.status(statusCode).json({
        success: false,
        message: vo.failureReason,
        errorRef: transcribeErr.errorRef || null,
        code: transcribeErr.code || "UNKNOWN",
      });
    }

    // Save transcription result
    vo.transcription = result.text || "";
    vo.transcriptionLanguage = result.language || "en";
    if (result.durationSeconds != null) vo.durationSeconds = result.durationSeconds;
    vo.status = "transcribed";
    await vo.save();

    // ── Step 2: Auto-extract order ──────────────────────────────────────
    try {
      const diagExt = orderExtractionProvider.getExtractionDiagnostics();
      if (!diagExt.configured) {
        // Extraction not configured, leave at "transcribed" for manual extraction
        console.warn("[VoiceOrder] Extraction provider not configured, leaving at transcribed status.");
        return res.json({ success: true, data: vo, message: "Transcription complete. AI extraction not available." });
      }

      vo.status = "extracting_order";
      await vo.save();

      const storeProducts = await Product.find({
        clientId: vo.storeId,
        isActive: true,
      })
        .select("_id name sku price stock isActive")
        .lean();

      const productContext = storeProducts.map((p) => ({
        id: String(p._id),
        name: p.name,
        sku: p.sku,
      }));

      const extracted = await orderExtractionProvider.extractOrder(
        vo.transcription,
        productContext,
        { currency: "INR", voiceOrderId: String(vo._id) }
      );

      const resolvedItems = productMatchingService.matchItems(extracted.items || [], storeProducts);

      vo.extractedData = extracted;
      vo.resolvedItems = resolvedItems;
      vo.overallConfidence = extracted.overallConfidence || 0;
      vo.status = "ready_for_review";
      await vo.save();

      return res.json({ success: true, data: vo, message: "Transcription and extraction complete!" });
    } catch (extractErr) {
      console.error("[VoiceOrder] Auto-extraction failed:", extractErr.code, extractErr.message);
      const extProvider = (process.env.AI_ORDER_EXTRACTION_PROVIDER || "openai").toLowerCase();
      const extName = extProvider === "gemini" ? "Gemini" : "OpenAI";
      vo.status = "order_extraction_failed";

      const errCode = extractErr.code || "UNKNOWN";
      const failureMessages = {
        QUOTA_EXCEEDED: "AI extraction quota is unavailable. Add API billing/credits.",
        AUTH_ERROR: `${extName} API key is missing or invalid.`,
        PERMISSION_DENIED: `${extName} API access is not permitted for this project.`,
        MODEL_NOT_FOUND: `The configured ${extName} model is unavailable.`,
        PROVIDER_NOT_CONFIGURED: "AI extraction is not configured.",
        SDK_MISSING: "AI extraction SDK is not installed.",
      };
      vo.failureReason = failureMessages[errCode] || `AI extraction failed: ${extractErr.message.slice(0, 200)}`;
      await vo.save();

      // Return partial success — transcription is saved, extraction failed
      return res.status(207).json({
        success: true,
        data: vo,
        message: "Transcription complete but AI extraction failed. You can retry extraction manually.",
        errorRef: extractErr.errorRef || null,
        extractionError: true,
      });
    }
  } catch (err) {
    console.error("[VoiceOrder] transcribeVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Internal error during transcription." });
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

    // Idempotency check
    if (vo.status === "extracting" || vo.status === "extracting_order") {
      return res.status(409).json({
        success: false,
        message: "Extraction is already in progress.",
      });
    }

    if (!vo.transcription || !vo.transcription.trim()) {
      return res.status(400).json({
        success: false,
        message: "No transcription available. Transcribe the audio first.",
      });
    }

    const extractableStates = [
      "needs_review", "ready_for_review", "draft", "failed",
      "order_extraction_failed", "transcribed",
    ];
    if (!extractableStates.includes(vo.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot extract from a voice order with status "${vo.status}".`,
      });
    }

    const diag = orderExtractionProvider.getExtractionDiagnostics();
    if (!diag.configured) {
      return res.status(503).json({ success: false, message: diag.message });
    }

    const storeProducts = await Product.find({
      clientId: vo.storeId,
      isActive: true,
    })
      .select("_id name sku price stock isActive")
      .lean();

    const productContext = storeProducts.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
    }));

    vo.status = "extracting_order";
    vo.failureReason = null;
    await vo.save();

    let extracted;
    try {
      extracted = await orderExtractionProvider.extractOrder(
        vo.transcription,
        productContext,
        { currency: "INR", voiceOrderId: String(vo._id) }
      );
    } catch (extractErr) {
      console.error("[VoiceOrder] Extraction failed:", extractErr.code, extractErr.message);
      const extProvider = (process.env.AI_ORDER_EXTRACTION_PROVIDER || "openai").toLowerCase();
      const extName = extProvider === "gemini" ? "Gemini" : "OpenAI";
      vo.status = "order_extraction_failed";

      const errCode = extractErr.code || "UNKNOWN";
      const failureMessages = {
        QUOTA_EXCEEDED: "AI extraction quota is unavailable. Add API billing/credits.",
        AUTH_ERROR: `${extName} API key is missing or invalid.`,
        PERMISSION_DENIED: `${extName} API access is not permitted for this project.`,
        MODEL_NOT_FOUND: `The configured ${extName} model is unavailable.`,
        PROVIDER_NOT_CONFIGURED: "AI extraction is not configured.",
        SDK_MISSING: "AI extraction SDK is not installed.",
      };
      vo.failureReason = failureMessages[errCode] || `AI extraction failed: ${extractErr.message.slice(0, 200)}`;
      await vo.save();

      const statusCode = extractErr.status || 502;
      return res.status(statusCode).json({
        success: false,
        message: vo.failureReason,
        errorRef: extractErr.errorRef || null,
        code: extractErr.code || "UNKNOWN",
      });
    }

    const resolvedItems = productMatchingService.matchItems(extracted.items || [], storeProducts);

    vo.extractedData = extracted;
    vo.resolvedItems = resolvedItems;
    vo.overallConfidence = extracted.overallConfidence || 0;
    vo.status = "ready_for_review";
    await vo.save();

    return res.json({ success: true, data: vo });
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
      "transcription_failed", "order_extraction_failed", "failed",
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
      const storeProducts = await Product.find({ clientId: vo.storeId })
        .select("_id name price stock isActive")
        .lean();
      const productMap = new Map(storeProducts.map((p) => [String(p._id), p]));

      vo.resolvedItems = rawItems.map((item) => {
        if (!item.matchedProductId) return { ...item, manuallyOverridden: true };
        const product = productMap.get(String(item.matchedProductId));
        if (!product) {
          return { ...item, confirmationError: "Product not found in your store." };
        }
        return {
          ...item,
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

const confirmVoiceOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid voice order ID." });
    }

    const vo = await VoiceOrder.findById(id).session(session);
    if (!vo) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Voice order not found." });
    }
    if (!(await ownershipCheck(vo, req))) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (vo.status === "order_created" && vo.createdOrderId) {
      await session.abortTransaction();
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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot confirm a voice order with status "${vo.status}".`,
      });
    }

    const draftData = vo.draftData || {};
    const extractedData = vo.extractedData || {};
    const customer = draftData.customer || extractedData.customer || {};
    const fulfilment = draftData.fulfilment || extractedData.fulfilment || {};

    const liveProducts = await Product.find({ clientId: vo.storeId, isActive: true })
      .select("_id name price stock isActive category image")
      .lean();

    const itemsToConfirm = draftData.items || vo.resolvedItems || [];
    if (!itemsToConfirm.length) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "No items to confirm in this order." });
    }

    const { valid, items: revalidatedItems, errors } =
      productMatchingService.revalidateItemsForConfirmation(itemsToConfirm, liveProducts);

    if (!valid) {
      await session.abortTransaction();
      return res.status(422).json({
        success: false,
        message: "Order cannot be confirmed due to product issues.",
        errors,
      });
    }

    const store = await Client.findById(vo.storeId).select("companyName shopName").lean();
    const productMap = new Map(liveProducts.map((p) => [String(p._id), p]));

    const orderItems = revalidatedItems.map((item) => {
      const p = productMap.get(String(item.matchedProductId));
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

    const [newOrder] = await Order.create(
      [
        {
          orderId,
          clientId: vo.storeId,
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
      { session }
    );

    vo.status = "order_created";
    vo.createdOrderId = newOrder._id;
    vo.confirmedAt = new Date();
    await vo.save({ session });

    await session.commitTransaction();

    console.log(`[VoiceOrder] Order created: orderId=${orderId} voiceOrderId=${vo._id} storeId=${vo.storeId}`);

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      data: { voiceOrder: vo, order: newOrder },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("[VoiceOrder] confirmVoiceOrder error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to confirm order. Please try again." });
  } finally {
    session.endSession();
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

    // Prevent deletion if order was already created
    if (vo.status === "order_created" && vo.createdOrderId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a voice order that has already been converted to an order. Cancel the associated order first.",
      });
    }

    // Delete audio file from storage
    if (vo.audioStorageKey) {
      await audioStorageService.deleteAudio(vo.audioStorageKey);
    }

    // Hard delete the database record
    await VoiceOrder.findByIdAndDelete(id);

    console.log(`[VoiceOrder] Deleted: id=${id} storeId=${vo.storeId} file=${vo.audioStorageKey}`);

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
      "failed", "order_extraction_failed",
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
      value: process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash",
    });
    checks.push({
      check: "GEMINI_ORDER_MODEL",
      status: "ok",
      value: process.env.GEMINI_ORDER_MODEL || "gemini-2.5-flash",
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

  // Determine overall status — OK if at least one provider is configured
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
  extractVoiceOrder,
  updateDraft,
  confirmVoiceOrder,
  cancelVoiceOrder,
  updateTranscription,
  checkVoiceConfig,
  deleteVoiceOrder,
};
