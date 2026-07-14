require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

function maskKey(key) {
  if (!key) return "(not set)";
  if (key.length < 12) return key.slice(0, 3) + "****";
  return key.slice(0, 6) + "****" + key.slice(-4);
}

async function main() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const model = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.1-flash-lite";

  console.log("=== GEMINI AUDIO TRANSCRIPTION TEST ===");
  console.log("Model:", model);
  console.log("API Key configured:", !!apiKey);
  if (apiKey) {
    console.log("API Key (masked):", maskKey(apiKey));
  }

  if (!apiKey) {
    console.log("ERROR: No GEMINI_API_KEY in .env");
    process.exit(1);
  }

  const audioPath = require("path").join(__dirname, "..", "tmp", "test_audio.wav");
  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString("base64");

  console.log("Audio file size:", audioBuffer.length, "bytes");
  console.log("Audio MIME: audio/wav");
  console.log("");
  console.log("--- Sending generateContent request ---");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: base64Audio,
              },
            },
            {
              text: "Transcribe this customer voice order exactly. Preserve product names, quantities and units. Return transcript text only.",
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    console.log("SUCCESS");
    console.log("Response text:", JSON.stringify(response.text));
  } catch (err) {
    const rawName = err?.constructor?.name || typeof err;
    const rawMessage = err?.message || String(err);
    let status = 500;
    let geminiCode = "";
    let detail = rawMessage;
    let parsedBody = null;

    if (err?.constructor?.name === "ApiError") {
      status = err.status || 500;
      try {
        parsedBody = JSON.parse(rawMessage);
        geminiCode = parsedBody?.error?.status || "";
        detail = parsedBody?.error?.message || detail;
      } catch {}
    }

    console.log("");
    console.log("=== RAW GEMINI ERROR ===");
    console.log("constructor:", rawName);
    console.log("httpStatus:", status);
    console.log("geminiCode:", geminiCode);
    console.log("message:", detail);
    if (parsedBody) {
      console.log("fullBody:", JSON.stringify(parsedBody, null, 2));
    }
    console.log("originalMessage (first 500):", rawMessage.slice(0, 500));
    console.log("");

    const msgLower = detail.toLowerCase();
    console.log("--- Error Classification ---");
    const isQuotaLimitZero =
      (status === 429 || geminiCode === "RESOURCE_EXHAUSTED") &&
      (msgLower.includes("quota limit:") || msgLower.includes("quota limit is 0"));
    const isBillingRequired =
      (status === 429 || geminiCode === "RESOURCE_EXHAUSTED") &&
      !isQuotaLimitZero &&
      (msgLower.includes("billing has not been enabled") ||
       msgLower.includes("billing not enabled") ||
       msgLower.includes("does not have billing enabled") ||
       msgLower.includes("free tier is not available") ||
       msgLower.includes("free tier is unavailable"));
    const isQuotaExhausted =
      (status === 429 || geminiCode === "RESOURCE_EXHAUSTED") &&
      !isQuotaLimitZero && !isBillingRequired &&
      (msgLower.includes("quota") || msgLower.includes("resource exhausted"));
    const isRateLimited =
      status === 429 &&
      !isQuotaLimitZero && !isBillingRequired && !isQuotaExhausted &&
      (msgLower.includes("rate limit") || msgLower.includes("rate_limit") ||
       msgLower.includes("requests per minute") || geminiCode === "RATE_LIMITED");

    console.log("isQuotaLimitZero:", isQuotaLimitZero);
    console.log("isBillingRequired:", isBillingRequired);
    console.log("isQuotaExhausted:", isQuotaExhausted);
    console.log("isRateLimited:", isRateLimited);

    if (isQuotaLimitZero) {
      console.log("--> Would return: Free API quota is unavailable for the selected model.");
    } else if (isBillingRequired) {
      console.log("--> Would return: Add billing/credits to use Gemini API.");
    } else if (isQuotaExhausted) {
      console.log("--> Would return: Gemini API quota is exhausted for today.");
    } else if (isRateLimited) {
      console.log("--> Would return: Gemini rate limit reached. Please retry later.");
    } else if (msgLower.includes("api key") || msgLower.includes("unauthenticated") || geminiCode === "UNAUTHENTICATED") {
      console.log("--> Would return: API key is missing or invalid.");
    } else if (status === 403 || geminiCode === "PERMISSION_DENIED") {
      console.log("--> Would return: API access is not permitted.");
    } else if (status === 404 || geminiCode === "NOT_FOUND") {
      console.log("--> Would return: Model not found.");
    } else {
      console.log("--> Would return: Generic server error.");
    }
  }
}

main().catch((e) => {
  console.error("Unhandled:", e.message);
  process.exit(1);
});
