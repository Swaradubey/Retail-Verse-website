/**
 * Gemini Transcription Diagnostic Script
 * =========================================
 * Usage:   node scripts/testGeminiTranscription.js
 * Purpose: Diagnose Gemini API configuration/availability for voice transcription.
 *          Loads the same .env file as the server, tests model discovery,
 *          and attempts a simple text-prompt call to verify API key + model work.
 *
 * Safety:  This script NEVER prints the full API key.
 *          Only the first 6 chars + last 4 chars are shown for verification.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

function maskKey(key) {
  if (!key) return "(not set)";
  if (key.length < 12) return key.slice(0, 3) + "****";
  return key.slice(0, 6) + "****" + key.slice(-4);
}

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Gemini Transcription Diagnostic");
  console.log("═══════════════════════════════════════════════\n");

  // ── 1. Env variable check ────────────────────────────────
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const configuredModel = process.env.GEMINI_TRANSCRIPTION_MODEL || "(not set)";
  const provider = (process.env.AI_TRANSCRIPTION_PROVIDER || "openai").toLowerCase();

  console.log("  AI_TRANSCRIPTION_PROVIDER:", provider);
  console.log("  GEMINI_API_KEY:          ", maskKey(apiKey) + (apiKey ? "" : " ⚠ MISSING"));
  console.log("  GEMINI_TRANSCRIPTION_MODEL:", configuredModel);
  console.log("");

  if (provider !== "gemini") {
    console.log("  ⚠ Provider is not set to 'gemini'. Set AI_TRANSCRIPTION_PROVIDER=gemini in .env\n");
  }

  if (!apiKey) {
    console.log("  ❌ GEMINI_API_KEY is not set. Add it to Backend/.env and retry.\n");
    process.exit(1);
  }

  // ── 2. Models API test ────────────────────────────────────
  console.log("  ── Step 1: Discover available models ──");
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

  let listResp;
  try {
    listResp = await fetch(listUrl);
  } catch (fetchErr) {
    console.log("  ❌ NETWORK ERROR: Could not reach Gemini API —", fetchErr.message, "\n");
    process.exit(1);
  }

  console.log("  HTTP status:", listResp.status);

  let listBody;
  try {
    listBody = await listResp.json();
  } catch {
    console.log("  ❌ Failed to parse Models API response.\n");
    process.exit(1);
  }

  if (!listResp.ok) {
    const geminiCode = listBody?.error?.status || "";
    const message = listBody?.error?.message || listResp.statusText;
    console.log("  ❌ Models API returned an error:");
    console.log("     code:", geminiCode);
    console.log("     message:", message.slice(0, 300));
    if (listResp.status === 403 || geminiCode === "PERMISSION_DENIED") {
      console.log("\n  └──> The API key may not have access. Enable the Generative Language API at");
      console.log("       https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com");
    }
    if (listResp.status === 429 || geminiCode === "RESOURCE_EXHAUSTED") {
      console.log("\n  └──> Quota exhausted or rate-limited when listing models.");
    }
    console.log("");
    process.exit(1);
  }

  const models = listBody.models || [];
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

  const totalCount = models.length;
  const candidateCount = candidates.length;

  console.log("  Total models listed:", totalCount);
  console.log("  Eligible for transcription:", candidateCount);

  if (candidateCount > 0) {
    console.log("\n  Eligible models (generateContent, no thinking/tts/live):");
    candidates.forEach((m) => console.log("    -", m));
  } else {
    console.log("  ⚠ No eligible models found for transcription.");
  }
  console.log("");

  // ── 3. Text-prompt test ───────────────────────────────────
  console.log("  ── Step 2: Text-prompt API test ──");
  const testModels = [];

  // Try the configured model first, but only if it's in the eligible list
  if (configuredModel && configuredModel !== "(not set)" && candidates.includes(configuredModel)) {
    testModels.push(configuredModel);
  }
  // Add first eligible candidate
  if (candidates.length > 0) {
    for (const c of candidates) {
      if (!testModels.includes(c)) {
        testModels.push(c);
        break;
      }
    }
  }
  // Fallback to just using whatever was configured
  if (testModels.length === 0 && configuredModel && configuredModel !== "(not set)") {
    testModels.push(configuredModel);
  }

  if (testModels.length === 0) {
    console.log("  ❌ No model available to test.\n");
    process.exit(1);
  }

  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = require("@google/genai"));
  } catch {
    console.log("  ❌ @google/genai SDK not installed. Run: npm install @google/genai\n");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  for (const model of testModels) {
    console.log("  Testing model:", model);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        config: { temperature: 0.0, maxOutputTokens: 10 },
      });
      const reply = typeof response.text === "string" ? response.text.trim() : "";
      console.log("  ✅ SUCCESS — reply:", reply.slice(0, 200));
      console.log("\n  ──────────────────────────────────────────────");
      console.log("  ✅ Gemini API is working with model:", model);
      console.log("  ──────────────────────────────────────────────\n");
      process.exit(0);
    } catch (err) {
      const rawName = err?.constructor?.name || typeof err;
      const rawMessage = err?.message || String(err);
      let status = 500;
      let geminiCode = "";
      let detail = rawMessage;

      if (err?.constructor?.name === "ApiError") {
        status = err.status || 500;
        try {
          const parsed = JSON.parse(rawMessage);
          geminiCode = parsed?.error?.status || "";
          detail = parsed?.error?.message || detail;
        } catch {}
      }

      console.log("  ❌ FAILED — status:", status, "code:", geminiCode);
      console.log("     message:", detail.slice(0, 300));
      console.log("     constructor:", rawName);

      const msgLower = detail.toLowerCase();

      if (status === 429 || geminiCode === "RESOURCE_EXHAUSTED" || msgLower.includes("quota")) {
        if (msgLower.includes("quota limit:") || msgLower.includes("quota limit is 0") || msgLower.includes("billing has not been enabled") || msgLower.includes("does not have billing enabled")) {
          console.log("\n  └──> ❌ BILLING REQUIRED — Gemini API quota limit is 0.");
          console.log("       Enable billing at https://console.cloud.google.com/billing");
        } else if (msgLower.includes("quota") || msgLower.includes("resource exhausted")) {
          console.log("\n  └──> ❌ QUOTA EXCEEDED — Daily quota exhausted.");
          console.log("       Check usage at https://aistudio.google.com/apikey");
        } else if (msgLower.includes("rate limit") || msgLower.includes("rate_limit") || msgLower.includes("requests per minute")) {
          console.log("\n  └──> ⚠ RATE LIMITED — Too many requests. Try again later.");
        } else {
          console.log("\n  └──> ❌ UNKNOWN 429 error.");
        }
      } else if (status === 401 || geminiCode === "UNAUTHENTICATED") {
        console.log("\n  └──> ❌ INVALID API KEY. Get a valid key from https://aistudio.google.com/apikey");
      } else if (status === 403 || geminiCode === "PERMISSION_DENIED") {
        console.log("\n  └──> ❌ PERMISSION DENIED. Enable the Generative Language API in Google Cloud Console.");
      } else if (status === 404 || geminiCode === "NOT_FOUND") {
        console.log("\n  └──> ❌ MODEL NOT FOUND — This model may be retired or unavailable.");
      }

      // If this was the configured model and we have a candidate fallback, try next
      if (model === configuredModel && testModels.length > 1) {
        console.log("\n  Trying next model...\n");
      } else {
        console.log("");
      }
    }
  }

  console.log("  ❌ All test models failed. Review the errors above.\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("  ❌ Unhandled error:", err.message);
  process.exit(1);
});
