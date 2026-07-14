const crypto = require("crypto");

const PROVIDER = (process.env.AI_ORDER_EXTRACTION_PROVIDER || "openai").toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_ORDER_MODEL || "gpt-4o";
const GEMINI_MODEL = process.env.GEMINI_ORDER_MODEL || "gemini-2.5-flash";
const MAX_TRANSCRIPT_LENGTH = parseInt(process.env.MAX_TRANSCRIPT_LENGTH || "20000", 10) || 20000;

function generateErrorRef() {
  return `EXT-ERR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function getExtractionDiagnostics() {
  if (PROVIDER === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      return {
        configured: false,
        message:
          "AI extraction unavailable: OPENAI_API_KEY is not set in Backend/.env. " +
          "Add your OpenAI API key or switch AI_ORDER_EXTRACTION_PROVIDER to gemini.",
      };
    }
    return { configured: true, message: "OpenAI extraction ready." };
  }
  if (PROVIDER === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      return {
        configured: false,
        message:
          "AI extraction unavailable: GEMINI_API_KEY is not set in Backend/.env. " +
          "Get a free key from https://aistudio.google.com/apikey",
      };
    }
    return { configured: true, message: `Gemini (${GEMINI_MODEL}) ready.` };
  }
  return {
    configured: false,
    message: `Unknown extraction provider: "${PROVIDER}". Supported: openai, gemini.`,
  };
}

class ExtractionError extends Error {
  constructor(message, code, status, details = {}) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.errorRef = details.errorRef || generateErrorRef();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  required: ["language", "customer", "fulfilment", "items", "overallConfidence", "warnings"],
  properties: {
    language: { type: "string" },
    customer: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
      },
    },
    fulfilment: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["delivery", "pickup", "unknown"] },
        address: { type: ["string", "null"] },
        requestedDateTime: { type: ["string", "null"] },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["spokenName", "requestedQuantity"],
        properties: {
          spokenName: { type: "string" },
          requestedQuantity: { type: "number" },
          requestedUnit: { type: ["string", "null"] },
          matchedProductId: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          alternativeProductIds: { type: "array", items: { type: "string" } },
          notes: { type: ["string", "null"] },
        },
      },
    },
    orderNotes: { type: ["string", "null"] },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function buildSystemPrompt(storeProducts) {
  const productList = storeProducts
    .map((p) => `- ID: ${p.id} | Name: "${p.name}" | SKU: ${p.sku}`)
    .join("\n");

  return `You are an AI order assistant for a retail store. 
Your ONLY job is to extract structured order information from the provided voice transcription.

PRODUCT CATALOGUE (these are the ONLY valid products for this store — do NOT invent product IDs):
${productList || "(No products loaded)"}

RULES:
1. ONLY use product IDs from the catalogue above. Never invent or guess product IDs.
2. Set matchedProductId to null if you cannot find a close match.
3. Do NOT include prices, taxes, discounts, or totals — the server calculates these.
4. Do NOT include storeId, clientId, userId, or any system IDs.
5. Parse spoken quantities correctly: "two" → 2, "a pair" → 2, "half a dozen" → 6, "one box" → 1.
6. If quantity is ambiguous, use 1 and add a warning.
7. Set confidence from 0 to 1 based on how certain you are about each item match.
8. Add warnings for: unclear product names, ambiguous quantities, missing delivery info.
9. Detect language from the transcription and set the language field.
10. Return ONLY valid JSON matching the required schema. No prose, no markdown code blocks.`;
}

function validateExtractionOutput(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { valid: false, message: "AI returned invalid JSON." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, message: "AI response is not a JSON object." };
  }
  if (!Array.isArray(parsed.items)) {
    return { valid: false, message: "AI response missing required 'items' array." };
  }
  if (typeof parsed.overallConfidence !== "number") {
    parsed.overallConfidence = 0;
  }
  if (!Array.isArray(parsed.warnings)) {
    parsed.warnings = [];
  }
  if (!parsed.customer) {
    parsed.customer = { name: null, phone: null, email: null };
  }
  if (!parsed.fulfilment) {
    parsed.fulfilment = { type: "unknown", address: null, requestedDateTime: null };
  }

  const FORBIDDEN_FIELDS = ["storeId", "clientId", "userId", "price", "tax", "discount", "total", "stock"];
  for (const item of parsed.items || []) {
    for (const f of FORBIDDEN_FIELDS) {
      delete item[f];
    }
  }
  delete parsed.storeId;
  delete parsed.clientId;
  delete parsed.userId;
  delete parsed.total;
  delete parsed.tax;
  delete parsed.discount;

  return { valid: true, data: parsed };
}

async function extractOrder(transcription, storeProducts, context = {}) {
  const diag = getExtractionDiagnostics();
  if (!diag.configured) {
    throw new ExtractionError(diag.message, "PROVIDER_NOT_CONFIGURED", 503);
  }

  if (PROVIDER === "openai") {
    return extractWithOpenAI(transcription, storeProducts, context);
  }
  if (PROVIDER === "gemini") {
    return extractWithGemini(transcription, storeProducts, context);
  }

  throw new ExtractionError(`Unsupported extraction provider: ${PROVIDER}`, "UNSUPPORTED_PROVIDER", 500);
}

// ── OpenAI GPT extraction ─────────────────────────────────────────────────────

async function extractWithOpenAI(transcription, storeProducts, context) {
  let OpenAI;
  try {
    ({ default: OpenAI } = await import("openai"));
  } catch {
    throw new ExtractionError(
      "OpenAI SDK not installed. Run: npm install openai in the Backend directory.",
      "SDK_MISSING",
      500
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = buildSystemPrompt(storeProducts);
  const voiceOrderId = context.voiceOrderId || "unknown";

  const truncated = transcription.slice(0, MAX_TRANSCRIPT_LENGTH);

  const userMessage = `Extract order information from this voice transcription:

"${truncated}"

${context.currency ? `Store currency: ${context.currency}` : ""}

Return ONLY a JSON object matching the schema — no prose, no code blocks.`;

  console.log(
    `[ExtractionProvider] voiceOrderId=${voiceOrderId} stage=extract provider=openai model=${OPENAI_MODEL} ` +
    `products=${storeProducts.length} chars=${truncated.length}`
  );

  let lastError = null;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices?.[0]?.message?.content || "";
      console.log(
        `[ExtractionProvider] voiceOrderId=${voiceOrderId} stage=extracted provider=openai model=${OPENAI_MODEL} ` +
        `rawLength=${rawContent.length}`
      );

      const { valid, data, message } = validateExtractionOutput(rawContent);
      if (!valid) {
        throw new ExtractionError(message || "AI returned invalid extraction output.", "INVALID_AI_OUTPUT", 422, {
          rawContent: rawContent.slice(0, 500),
        });
      }

      return data;
    } catch (err) {
      if (err instanceof ExtractionError && err.code !== "INVALID_AI_OUTPUT") throw err;
      if (err instanceof ExtractionError && err.code === "INVALID_AI_OUTPUT") throw err;

      lastError = err;
      const status = err.status || 500;
      const code = err.code || "UNKNOWN";
      const errType = err.type || "";
      const errMessage = err.message || "";
      const errorRef = generateErrorRef();

      const isQuotaExceeded =
        status === 429 &&
        (errMessage.toLowerCase().includes("insufficient_quota") ||
         errMessage.toLowerCase().includes("exceeded your current quota") ||
         code === "insufficient_quota");

      const isRateLimited = status === 429 && !isQuotaExceeded;

      console.error(
        `[ExtractionProvider] voiceOrderId=${voiceOrderId} stage=extract provider=openai model=${OPENAI_MODEL} ` +
        `httpStatus=${status} errorCode=${code} errorType=${errType} attempt=${attempt + 1}/${MAX_RETRIES + 1} ` +
        `errorRef=${errorRef}`
      );

      if (isQuotaExceeded) {
        throw new ExtractionError(
          "OpenAI API quota is unavailable. Add API billing/credits and check the project usage limit.",
          "QUOTA_EXCEEDED",
          429,
          { errorRef, originalMessage: errMessage }
        );
      }

      if (isRateLimited && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(
          `[ExtractionProvider] voiceOrderId=${voiceOrderId} rate-limited, retrying in ${Math.round(backoffMs)}ms ` +
          `(attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
        continue;
      }

      if (status === 401) {
        throw new ExtractionError(
          "OpenAI API key is missing or invalid. Check the server environment variables.",
          "AUTH_ERROR",
          401,
          { errorRef }
        );
      }

      if (status === 429) {
        throw new ExtractionError(
          "OpenAI API quota is unavailable. Add API billing/credits and check the project usage limit.",
          "QUOTA_EXCEEDED",
          429,
          { errorRef, originalMessage: errMessage }
        );
      }

      throw new ExtractionError(
        "Order extraction service encountered an error. Please try again later.",
        "SERVER_ERROR",
        status >= 500 ? 502 : status,
        { errorRef, originalMessage: errMessage }
      );
    }
  }

  throw new ExtractionError(
    "Order extraction failed after retries. Please try again later.",
    "MAX_RETRIES_EXCEEDED",
    429,
    { errorRef: generateErrorRef() }
  );
}

// ── Gemini model fallback (shared) ─────────────────────────────────────────────

async function findAvailableGeminiModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  let response;
  try {
    response = await fetch(url);
  } catch (fetchErr) {
    throw new ExtractionError(
      "Failed to reach Gemini API to list models: " + fetchErr.message,
      "MODEL_LIST_FAILED",
      502,
      { errorRef: generateErrorRef() }
    );
  }
  if (!response.ok) {
    throw new ExtractionError(
      "Gemini models API returned status " + response.status,
      "MODEL_LIST_FAILED",
      response.status,
      { errorRef: generateErrorRef() }
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ExtractionError(
      "Failed to parse Gemini models response",
      "MODEL_LIST_FAILED",
      502,
      { errorRef: generateErrorRef() }
    );
  }
  const models = body.models || [];
  const available = models
    .filter((m) => {
      const name = m.name || "";
      const methods = m.supportedGenerationMethods || [];
      return (
        name.includes("gemini") &&
        methods.includes("generateContent") &&
        !name.includes("thinking")
      );
    })
    .map((m) => m.name.replace("models/", ""));

  if (available.length === 0) {
    throw new ExtractionError(
      "No available Gemini model supports generateContent",
      "NO_AVAILABLE_MODEL",
      503,
      { errorRef: generateErrorRef() }
    );
  }
  return available[0];
}

// ── Gemini extraction ─────────────────────────────────────────────────────────

async function extractWithGemini(transcription, storeProducts, context) {
  const voiceOrderId = context.voiceOrderId || "unknown";
  const modelName = GEMINI_MODEL;

  const systemPrompt = buildSystemPrompt(storeProducts);
  const truncated = transcription.slice(0, MAX_TRANSCRIPT_LENGTH);

  const userMessage = `Extract order information from this voice transcription:

"${truncated}"

${context.currency ? `Store currency: ${context.currency}` : ""}

Return ONLY a JSON object matching the schema — no prose, no code blocks.`;

  const fullPrompt = `${systemPrompt}\n\n${userMessage}`;

  console.log(
    `[ExtractionProvider] voiceOrderId=${voiceOrderId} stage=extract provider=gemini model=${modelName} ` +
    `products=${storeProducts.length} chars=${truncated.length}`
  );

  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = require("@google/genai"));
  } catch {
    throw new ExtractionError(
      "@google/genai SDK not installed. Run: npm install @google/genai in the Backend directory.",
      "SDK_MISSING",
      500
    );
  }

  // ── Validate transcription ────────────────────────────────────────────
  if (!transcription || !transcription.trim()) {
    throw new ExtractionError(
      "Cannot extract order from empty transcription.",
      "EMPTY_TRANSCRIPTION",
      400,
      { errorRef: generateErrorRef() }
    );
  }

  const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY || "").trim() });

  let lastError = null;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: 2000,
          responseMimeType: "application/json",
        },
      });

      const rawContent = (response.text || "").trim();

      console.log(
        `[ExtractionProvider] voiceOrderId=${voiceOrderId} stage=extracted provider=gemini model=${modelName} ` +
        `rawLength=${rawContent.length}`
      );

      const { valid, data, message } = validateExtractionOutput(rawContent);
      if (!valid) {
        throw new ExtractionError(message || "AI returned invalid extraction output.", "INVALID_AI_OUTPUT", 422, {
          rawContent: rawContent.slice(0, 500),
        });
      }

      return data;
    } catch (err) {
      if (err instanceof ExtractionError) throw err;

      lastError = err;
      const errorRef = generateErrorRef();

      // ── Extract error details ──────────────────────────────────────────
      const rawName = err?.constructor?.name || typeof err;
      const rawMessage = err?.message || String(err);
      let status = 500;
      let errorMessage = rawMessage;
      let geminiCode = "";

      if (err?.constructor?.name === "ApiError") {
        status = err.status || 500;
        try {
          const parsed = JSON.parse(errorMessage);
          geminiCode = parsed?.error?.status || "";
          errorMessage = parsed?.error?.message || errorMessage;
        } catch {
          // use raw message
        }
      }

      // ── Log the complete error (no secrets) ────────────────────────────
      console.error(
        "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
        " stage=extract provider=gemini model=" + modelName +
        " errorName=" + rawName +
        " httpStatus=" + status +
        " geminiCode=" + geminiCode +
        " errorRef=" + errorRef +
        " attempt=" + (attempt + 1) + "/" + (MAX_RETRIES + 1) +
        " message=" + errorMessage.slice(0, 500)
      );

      const msgLower = errorMessage.toLowerCase();
      const isQuota =
        status === 429 ||
        msgLower.includes("quota") ||
        msgLower.includes("rate limit") ||
        msgLower.includes("resource exhausted") ||
        geminiCode === "RESOURCE_EXHAUSTED";

      const isAuthKey =
        msgLower.includes("api key") ||
        msgLower.includes("unauthenticated") ||
        geminiCode === "UNAUTHENTICATED" ||
        geminiCode === "INVALID_ARGUMENT";

      if (isQuota && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(
          "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
          " rate-limited, retrying in " + Math.round(backoffMs) + "ms" +
          " (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ")"
        );
        await sleep(backoffMs);
        continue;
      }

      if (isQuota) {
        throw new ExtractionError(
          "Gemini API quota is unavailable. Add billing or check usage limits at https://aistudio.google.com/apikey",
          "QUOTA_EXCEEDED",
          429,
          { errorRef, originalMessage: errorMessage }
        );
      }

      if (isAuthKey || status === 401 || geminiCode === "UNAUTHENTICATED") {
        throw new ExtractionError(
          "Gemini API key is missing or invalid. Get a free key from https://aistudio.google.com/apikey",
          "AUTH_ERROR",
          401,
          { errorRef }
        );
      }

      if (status === 403 || geminiCode === "PERMISSION_DENIED") {
        throw new ExtractionError(
          "Gemini API access is not permitted for this project.",
          "PERMISSION_DENIED",
          403,
          { errorRef }
        );
      }

      if (status === 404 || geminiCode === "NOT_FOUND") {
        console.warn(
          "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
          " model=" + modelName + " unavailable. Attempting model fallback..."
        );
        try {
          const fallbackModel = await findAvailableGeminiModel((process.env.GEMINI_API_KEY || "").trim());
          console.log(
            "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
            " fallbackModel=" + fallbackModel + " (was " + modelName + ")"
          );
          const retryResponse = await ai.models.generateContent({
            model: fallbackModel,
            contents: [
              {
                role: "user",
                parts: [{ text: fullPrompt }],
              },
            ],
            config: {
              temperature: 0.1,
              maxOutputTokens: 2000,
              responseMimeType: "application/json",
            },
          });
          const retryContent = (retryResponse.text || "").trim();
          const { valid, data, message } = validateExtractionOutput(retryContent);
          if (!valid) {
            throw new ExtractionError(
              message || "AI returned invalid extraction output after model fallback.",
              "INVALID_AI_OUTPUT",
              422,
              { rawContent: retryContent.slice(0, 500) }
            );
          }
          console.log(
            "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
            " stage=extracted provider=gemini model=" + fallbackModel +
            " (fallback from " + modelName + ") rawLength=" + retryContent.length
          );
          return data;
        } catch (fallbackErr) {
          if (fallbackErr instanceof ExtractionError) throw fallbackErr;
          throw new ExtractionError(
            "The configured Gemini model (" + modelName + ") is unavailable, and no fallback model succeeded.",
            "MODEL_NOT_FOUND",
            404,
            { errorRef, originalMessage: errorMessage }
          );
        }
      }

      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(
          "[ExtractionProvider] voiceOrderId=" + voiceOrderId +
          " retrying in " + Math.round(backoffMs) + "ms" +
          " (attempt " + (attempt + 1) + "/" + (MAX_RETRIES + 1) + ")"
        );
        await sleep(backoffMs);
        continue;
      }

      throw new ExtractionError(
        "Order extraction service encountered an error. Please try again later.",
        "SERVER_ERROR",
        status >= 500 ? 502 : status,
        { errorRef, originalMessage: errorMessage }
      );
    }
  }

  throw new ExtractionError(
    "Order extraction failed after retries. Please try again later.",
    "MAX_RETRIES_EXCEEDED",
    429,
    { errorRef: generateErrorRef() }
  );
}

module.exports = {
  extractOrder,
  validateExtractionOutput,
  getExtractionDiagnostics,
  ExtractionError,
};
