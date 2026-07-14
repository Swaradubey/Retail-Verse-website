const crypto = require("crypto");

const PROVIDER = (process.env.AI_TRANSCRIPTION_PROVIDER || "openai").toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || "";

function normalizeMimeType(mimeType) {
  if (!mimeType) return mimeType;
  return mimeType.split(";")[0].trim();
}

function generateErrorRef() {
  return `TXN-ERR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function getTranscriptionDiagnostics() {
  if (PROVIDER === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      return {
        configured: false,
        message:
          "Transcription unavailable: OPENAI_API_KEY is not set in Backend/.env. " +
          "Add your OpenAI API key or switch AI_TRANSCRIPTION_PROVIDER to gemini.",
      };
    }
    return { configured: true, message: "OpenAI Whisper ready." };
  }
  if (PROVIDER === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      return {
        configured: false,
        message:
          "Transcription unavailable: GEMINI_API_KEY is not set in Backend/.env. " +
          "Get a free key from https://aistudio.google.com/apikey",
      };
    }
    const modelLabel = GEMINI_MODEL || "auto (model discovery)";
    return { configured: true, message: `Gemini (${modelLabel}) ready.` };
  }
  return {
    configured: false,
    message: `Unknown transcription provider: "${PROVIDER}". Supported: openai, gemini.`,
  };
}

class TranscriptionError extends Error {
  constructor(message, code, status, details = {}) {
    super(message);
    this.name = "TranscriptionError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.errorRef = details.errorRef || generateErrorRef();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeAudio(audioBuffer, mimeType, originalName, options = {}) {
  const diag = getTranscriptionDiagnostics();
  if (!diag.configured) {
    throw new TranscriptionError(diag.message, "PROVIDER_NOT_CONFIGURED", 503);
  }

  if (PROVIDER === "openai") {
    return transcribeWithOpenAI(audioBuffer, mimeType, originalName, options);
  }
  if (PROVIDER === "gemini") {
    return transcribeWithGemini(audioBuffer, mimeType, originalName, options);
  }

  throw new TranscriptionError(`Unsupported transcription provider: ${PROVIDER}`, "UNSUPPORTED_PROVIDER", 500);
}

// ── OpenAI Whisper ────────────────────────────────────────────────────────────

async function transcribeWithOpenAI(audioBuffer, mimeType, originalName, options) {
  let OpenAI;
  try {
    ({ default: OpenAI } = await import("openai"));
  } catch {
    throw new TranscriptionError(
      "OpenAI SDK not installed. Run: npm install openai in the Backend directory.",
      "SDK_MISSING",
      500
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const voiceOrderId = options.voiceOrderId || "unknown";

  const ext = (originalName || "audio.webm").split(".").pop() || "webm";
  const safeName = `audio.${ext}`;
  const file = new File([audioBuffer], safeName, { type: mimeType });

  const params = {
    model: OPENAI_MODEL,
    file,
    response_format: "verbose_json",
  };

  if (options.language) {
    params.language = options.language;
  }

  const audioSizeKB = Math.round(audioBuffer.length / 1024);
  console.log(
    `[TranscriptionProvider] voiceOrderId=${voiceOrderId} stage=transcribe provider=openai model=${OPENAI_MODEL} ` +
    `mimeType=${mimeType} audioSizeKB=${audioSizeKB}`
  );

  let lastError = null;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.audio.transcriptions.create(params);

      const text = response.text || "";
      const language = response.language || "en";
      const durationSeconds = typeof response.duration === "number" ? response.duration : null;

      console.log(
        `[TranscriptionProvider] voiceOrderId=${voiceOrderId} stage=transcribed provider=openai model=${OPENAI_MODEL} ` +
        `chars=${text.length} lang=${language} dur=${durationSeconds}s`
      );

      return { text, language, durationSeconds };
    } catch (err) {
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
        `[TranscriptionProvider] voiceOrderId=${voiceOrderId} stage=transcribe provider=openai model=${OPENAI_MODEL} ` +
        `httpStatus=${status} errorCode=${code} errorType=${errType} attempt=${attempt + 1}/${MAX_RETRIES + 1} ` +
        `errorRef=${errorRef}`
      );

      if (isQuotaExceeded) {
        throw new TranscriptionError(
          "OpenAI API quota is unavailable. Add API billing/credits and check the project usage limit.",
          "QUOTA_EXCEEDED",
          429,
          { errorRef, originalMessage: errMessage }
        );
      }

      if (isRateLimited && attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(
          `[TranscriptionProvider] voiceOrderId=${voiceOrderId} rate-limited, retrying in ${Math.round(backoffMs)}ms ` +
          `(attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
        continue;
      }

      if (status === 401) {
        throw new TranscriptionError(
          "OpenAI API key is missing or invalid. Check the server environment variables.",
          "AUTH_ERROR",
          401,
          { errorRef }
        );
      }

      if (status === 400 && (code === "unsupported" || errMessage.toLowerCase().includes("unsupported"))) {
        throw new TranscriptionError(
          "The audio format is unsupported or the recording is invalid.",
          "UNSUPPORTED_AUDIO",
          400,
          { errorRef }
        );
      }

      if (status === 413) {
        const maxMB = process.env.MAX_AUDIO_FILE_SIZE_MB || "25";
        throw new TranscriptionError(
          `Audio file exceeds the maximum allowed size of ${maxMB} MB.`,
          "FILE_TOO_LARGE",
          413,
          { errorRef }
        );
      }

      if (status === 429) {
        throw new TranscriptionError(
          "OpenAI API quota is unavailable. Add API billing/credits and check the project usage limit.",
          "QUOTA_EXCEEDED",
          429,
          { errorRef, originalMessage: errMessage }
        );
      }

      throw new TranscriptionError(
        "Transcription service encountered an error. Please try again later.",
        "SERVER_ERROR",
        status >= 500 ? 502 : status,
        { errorRef, originalMessage: errMessage }
      );
    }
  }

  throw new TranscriptionError(
    "Transcription failed after retries. Please try again later.",
    "MAX_RETRIES_EXCEEDED",
    429,
    { errorRef: generateErrorRef() }
  );
}

// ── Gemini model discovery ─────────────────────────────────────────────────────

async function discoverGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  let response;
  try {
    response = await fetch(url);
  } catch (fetchErr) {
    throw new TranscriptionError(
      "Failed to reach Gemini API to list models: " + fetchErr.message,
      "MODEL_LIST_FAILED",
      502,
      { errorRef: generateErrorRef() }
    );
  }
  if (!response.ok) {
    throw new TranscriptionError(
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
    throw new TranscriptionError(
      "Failed to parse Gemini models response",
      "MODEL_LIST_FAILED",
      502,
      { errorRef: generateErrorRef() }
    );
  }
  const models = body.models || [];
  const candidates = models
    .filter((m) => {
      const name = m.name || "";
      const methods = m.supportedGenerationMethods || [];
      return (
        name.includes("gemini") &&
        methods.includes("generateContent") &&
        !name.includes("thinking") &&
        !name.includes("tts") &&
        !name.includes("live")
      );
    })
    .map((m) => m.name.replace("models/", ""));

  if (candidates.length === 0) {
    throw new TranscriptionError(
      "No available Gemini model supports generateContent",
      "NO_AVAILABLE_MODEL",
      503,
      { errorRef: generateErrorRef() }
    );
  }

  // Sort: Flash models first, then others. Among Flash, prefer versioned (e.g. -001) over aliases.
  const flash = candidates.filter((n) => n.includes("flash"));
  const other = candidates.filter((n) => !n.includes("flash"));
  const sortKey = (n) => {
    const hasVersion = /-\d{3,}$/.test(n) ? 0 : 1;
    return hasVersion;
  };
  flash.sort((a, b) => sortKey(a) - sortKey(b));
  other.sort((a, b) => sortKey(a) - sortKey(b));
  return [...flash, ...other];
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function transcribeWithGemini(audioBuffer, mimeType, originalName, options) {
  const voiceOrderId = options.voiceOrderId || "unknown";
  const modelName = GEMINI_MODEL;
  const normalizedMime = normalizeMimeType(mimeType);

  const audioSizeKB = Math.round(audioBuffer.length / 1024);
  const base64Audio = audioBuffer.toString("base64");
  console.log(
    `[TranscriptionProvider] voiceOrderId=${voiceOrderId} stage=transcribe provider=gemini model=${modelName} ` +
    `mimeType=${mimeType} normalizedMime=${normalizedMime} audioSizeKB=${audioSizeKB}`
  );

  // ── Validate audio buffer ──────────────────────────────────────────────
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new TranscriptionError(
      "The audio buffer is empty. Record or upload a valid audio file.",
      "EMPTY_AUDIO",
      400,
      { errorRef: generateErrorRef() }
    );
  }
  if (audioBuffer.length < 64) {
    throw new TranscriptionError(
      "The audio file is too small or corrupt. Record a longer audio sample.",
      "CORRUPT_AUDIO",
      400,
      { errorRef: generateErrorRef() }
    );
  }
  const SUPPORTED_MIMES = ["audio/webm","audio/mpeg","audio/wav","audio/mp4","audio/ogg","video/webm"];
  if (normalizedMime && !SUPPORTED_MIMES.includes(normalizedMime)) {
    throw new TranscriptionError(
      "Unsupported audio format: " + normalizedMime + ". Supported: " + SUPPORTED_MIMES.join(", "),
      "UNSUPPORTED_AUDIO",
      400,
      { errorRef: generateErrorRef() }
    );
  }

  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = require("@google/genai"));
  } catch {
    throw new TranscriptionError(
      "@google/genai SDK not installed. Run: npm install @google/genai in the Backend directory.",
      "SDK_MISSING",
      500
    );
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const ai = new GoogleGenAI({ apiKey });

  // ── Discover live models — build ordered attempt list ─────────────────
  const candidates = await discoverGeminiModels(apiKey);
  const configuredAvailable = candidates.includes(modelName);

  if (!configuredAvailable) {
    console.warn(
      "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
      " configuredModel=" + modelName +
      " NOT in discoveredModels=[" + candidates.join(",") + "]" +
      " — skipping it immediately."
    );
  }

  const attemptModels = [];
  if (configuredAvailable) attemptModels.push(modelName);
  for (const m of candidates) {
    if (!attemptModels.includes(m)) attemptModels.push(m);
  }

  console.log(
    "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
    " stage=modelDiscovery" +
    " configuredModel=" + modelName +
    " discoveredModels=[" + candidates.join(",") + "]" +
    " selectedModel=" + attemptModels[0]
  );

  let lastError = null;
  const MAX_RETRIES = 2;
  const attempted = [];

  for (const model of attemptModels) {
    attempted.push(model);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe this audio recording to text exactly as spoken. Return ONLY the transcribed text — no explanations, no preamble, no commentary.",
                },
                {
                  inlineData: {
                    mimeType: normalizedMime,
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        });

        const text = (response.text || "").trim();

        if (!text) {
          throw new TranscriptionError(
            "Gemini returned an empty transcription.",
            "EMPTY_RESPONSE",
            502,
            { errorRef: generateErrorRef() }
          );
        }

        const language = options.language || "en";
        const durationSeconds = null;

        console.log(
          "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
          " stage=transcribed provider=gemini" +
          " model=" + model +
          " attemptedModels=[" + attempted.join(",") + "]" +
          " chars=" + text.length
        );

        return { text, language, durationSeconds };
      } catch (err) {
        if (err instanceof TranscriptionError && err.code !== "EMPTY_RESPONSE") throw err;

        lastError = err;
        const errorRef = generateErrorRef();

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

        // ── Log the complete error (no secrets) ──────────────────────────
        console.error(
          "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
          " stage=transcribe provider=gemini" +
          " model=" + model +
          " attemptedModels=[" + attempted.join(",") + "]" +
          " httpStatus=" + status +
          " geminiCode=" + geminiCode +
          " errorRef=" + errorRef +
          " attempt=" + (attempt + 1) + "/" + (MAX_RETRIES + 1) +
          " message=" + errorMessage.slice(0, 500)
        );

        const msgLower = errorMessage.toLowerCase();
        const isQuotaLimitZero =
          (status === 429 || geminiCode === "RESOURCE_EXHAUSTED") &&
          (msgLower.includes("quota limit:") ||
           msgLower.includes("quota limit is 0") ||
           msgLower.includes("billing has not been enabled") ||
           msgLower.includes("billing not enabled") ||
           msgLower.includes("does not have billing enabled"));
        const isQuotaExhausted =
          (status === 429 || geminiCode === "RESOURCE_EXHAUSTED") &&
          !isQuotaLimitZero &&
          (msgLower.includes("quota") ||
           msgLower.includes("resource exhausted"));
        const isRateLimited =
          status === 429 &&
          !isQuotaLimitZero &&
          !isQuotaExhausted &&
          (msgLower.includes("rate limit") ||
           msgLower.includes("rate_limit") ||
           msgLower.includes("requests per minute") ||
           geminiCode === "RATE_LIMITED");

        const isAuthKey =
          msgLower.includes("api key") ||
          msgLower.includes("api key not valid") ||
          msgLower.includes("unauthenticated") ||
          geminiCode === "UNAUTHENTICATED" ||
          geminiCode === "INVALID_ARGUMENT";

        // ── Quota limit is 0 (billing required) — permanent, no retry ──
        if (isQuotaLimitZero) {
          throw new TranscriptionError(
            "Gemini API billing is required. Enable billing at https://console.cloud.google.com/billing and check quota at https://aistudio.google.com/apikey",
            "QUOTA_LIMIT_ZERO",
            429,
            { errorRef, originalMessage: errorMessage }
          );
        }

        // ── Quota exhausted (daily limit) — permanent for this request ──
        if (isQuotaExhausted) {
          throw new TranscriptionError(
            "Gemini API quota is exhausted for today. Add billing or check usage limits at https://aistudio.google.com/apikey",
            "QUOTA_EXCEEDED",
            429,
            { errorRef, originalMessage: errorMessage }
          );
        }

        // ── Rate-limited (temporary) → retry with backoff ─────────
        if (isRateLimited && attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          const retryDelay = err?.retryDelay || err?.headers?.["retry-after"];
          const delayNote = retryDelay ? " (retry-after=" + retryDelay + ")" : "";
          console.log(
            "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
            " rate-limited model=" + model +
            " retrying in " + Math.round(backoffMs) + "ms" + delayNote +
            " (attempt " + (attempt + 1) + "/" + MAX_RETRIES + ")"
          );
          await sleep(backoffMs);
          continue;
        }

        if (isAuthKey || status === 401 || geminiCode === "UNAUTHENTICATED") {
          throw new TranscriptionError(
            "Gemini API key is missing or invalid. Get a free key from https://aistudio.google.com/apikey",
            "AUTH_ERROR",
            401,
            { errorRef }
          );
        }

        if (status === 403 || geminiCode === "PERMISSION_DENIED") {
          throw new TranscriptionError(
            "Gemini API access is not permitted for this project.",
            "PERMISSION_DENIED",
            403,
            { errorRef }
          );
        }

        // ── Model not found → skip to next candidate (never retry same model) ──
        if (status === 404 || geminiCode === "NOT_FOUND") {
          console.warn(
            "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
            " model=" + model + " unavailable (404). Tried=[" + attempted.join(",") + "]" +
            " — skipping to next candidate."
          );
          break;
        }

        if (status === 400 && (msgLower.includes("unsupported") || geminiCode === "UNSUPPORTED")) {
          throw new TranscriptionError(
            "The audio format is unsupported or the recording is invalid.",
            "UNSUPPORTED_AUDIO",
            400,
            { errorRef }
          );
        }

        if (status === 413 || msgLower.includes("too large")) {
          const maxMB = process.env.MAX_AUDIO_FILE_SIZE_MB || "25";
          throw new TranscriptionError(
            "Audio file exceeds the maximum allowed size of " + maxMB + " MB.",
            "FILE_TOO_LARGE",
            413,
            { errorRef }
          );
        }

        if (status === 400 && geminiCode === "SAFETY") {
          throw new TranscriptionError(
            "The recording was blocked by content safety filters. Please try a different recording.",
            "SAFETY_BLOCKED",
            400,
            { errorRef }
          );
        }

        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.log(
            "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
            " retrying model=" + model +
            " in " + Math.round(backoffMs) + "ms" +
            " (attempt " + (attempt + 1) + "/" + (MAX_RETRIES + 1) + ")"
          );
          await sleep(backoffMs);
          continue;
        }

        // Exhausted retries on this model; if more models remain, skip it
        if (attemptModels.indexOf(model) < attemptModels.length - 1) {
          console.warn(
            "[TranscriptionProvider] voiceOrderId=" + voiceOrderId +
            " model=" + model + " exhausted retries. Trying next candidate."
          );
          break;
        }

        throw new TranscriptionError(
          "Transcription service encountered an error. Please try again later.",
          "SERVER_ERROR",
          status >= 500 ? 502 : status,
          { errorRef, originalMessage: errorMessage }
        );
      }
    }
  }

  throw new TranscriptionError(
    "All available Gemini models failed: [" + attempted.join(",") + "].",
    "ALL_MODELS_FAILED",
    502,
    { errorRef: generateErrorRef() }
  );
}

module.exports = {
  transcribeAudio,
  getTranscriptionDiagnostics,
  TranscriptionError,
};
