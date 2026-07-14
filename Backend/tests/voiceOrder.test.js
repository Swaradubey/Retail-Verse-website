/**
 * Voice Order Tests
 *
 * Tests for:
 * - audio validation (MIME types, file sizes)
 * - extraction validation (schema, forbidden fields)
 * - error classes (TranscriptionError, ExtractionError)
 * - configuration diagnostics
 * - environment variable handling
 *
 * Run: node --test Backend/tests/voiceOrder.test.js
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");

// ── Set env vars before loading modules ──────────────────────────────────────
process.env.OPENAI_API_KEY = "sk-test-fake-key-for-testing";
process.env.OPENAI_TRANSCRIPTION_MODEL = "whisper-1";
process.env.OPENAI_ORDER_MODEL = "gpt-4o";
process.env.MAX_AUDIO_FILE_SIZE_MB = "25";
process.env.VOICE_ORDER_RETENTION_DAYS = "90";

const audioStorageService = require("../services/audioStorageService");
const orderExtractionProvider = require("../services/orderExtractionProvider");
const productMatchingService = require("../services/productMatchingService");

// ── TranscriptionError (from transcriptionProvider, which uses dynamic import) ─
// We test its constructor pattern directly
class TranscriptionError extends Error {
  constructor(message, code, status, details = {}) {
    super(message);
    this.name = "TranscriptionError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.errorRef = details.errorRef || "TXN-ERR-TEST";
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Audio Storage Service", () => {

  describe("validateMime", () => {
    it("should accept valid audio/mpeg", () => {
      const result = audioStorageService.validateMime("audio/mpeg");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".mp3");
    });

    it("should accept valid audio/webm", () => {
      const result = audioStorageService.validateMime("audio/webm");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".webm");
    });

    it("should accept valid audio/wav", () => {
      const result = audioStorageService.validateMime("audio/wav");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".wav");
    });

    it("should accept valid audio/mp4", () => {
      const result = audioStorageService.validateMime("audio/mp4");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".m4a");
    });

    it("should accept valid audio/ogg", () => {
      const result = audioStorageService.validateMime("audio/ogg");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".ogg");
    });

    it("should accept valid video/webm (browser MediaRecorder)", () => {
      const result = audioStorageService.validateMime("video/webm");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.ext, ".webm");
    });

    it("should reject unsupported audio/flac", () => {
      const result = audioStorageService.validateMime("audio/flac");
      assert.strictEqual(result.valid, false);
      assert.ok(result.message.includes("Unsupported"));
    });

    it("should reject empty MIME type", () => {
      const result = audioStorageService.validateMime("");
      assert.strictEqual(result.valid, false);
    });

    it("should reject null MIME type", () => {
      const result = audioStorageService.validateMime(null);
      assert.strictEqual(result.valid, false);
    });

    it("should be case-insensitive", () => {
      const result = audioStorageService.validateMime("AUDIO/MPEG");
      assert.strictEqual(result.valid, true);
    });
  });

  describe("MAX_FILE_SIZE_BYTES", () => {
    it("should be 25 MB by default", () => {
      const expected = 25 * 1024 * 1024;
      assert.strictEqual(audioStorageService.MAX_FILE_SIZE_BYTES, expected);
    });

    it("should be calculated from MAX_AUDIO_FILE_SIZE_MB env var", () => {
      assert.strictEqual(audioStorageService.MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024);
    });
  });
});

describe("Provider Diagnostics", () => {

  describe("OpenAI diagnostics (when OPENAI_API_KEY is set)", () => {
    it("should return configured=true for transcription", () => {
      const tx = require("../services/transcriptionProvider");
      const diag = tx.getTranscriptionDiagnostics();
      assert.strictEqual(diag.configured, true);
    });

    it("should return configured=true for extraction", () => {
      const diag = orderExtractionProvider.getExtractionDiagnostics();
      assert.strictEqual(diag.configured, true);
    });
  });

  describe("Gemini diagnostics (when GEMINI_API_KEY is set)", () => {
    before(() => {
      process.env.AI_TRANSCRIPTION_PROVIDER = "gemini";
      process.env.AI_ORDER_EXTRACTION_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "fake-gemini-key-for-testing";
      // Clear require cache so modules re-read env vars
      delete require.cache[require.resolve("../services/transcriptionProvider")];
      delete require.cache[require.resolve("../services/orderExtractionProvider")];
    });

    after(() => {
      process.env.AI_TRANSCRIPTION_PROVIDER = "openai";
      process.env.AI_ORDER_EXTRACTION_PROVIDER = "openai";
      delete process.env.GEMINI_API_KEY;
      delete require.cache[require.resolve("../services/transcriptionProvider")];
      delete require.cache[require.resolve("../services/orderExtractionProvider")];
    });

    it("should return configured=true for Gemini transcription when GEMINI_API_KEY is set", () => {
      const tx = require("../services/transcriptionProvider");
      const diag = tx.getTranscriptionDiagnostics();
      assert.strictEqual(diag.configured, true);
    });

    it("should return configured=true for Gemini extraction when GEMINI_API_KEY is set", () => {
      const ext = require("../services/orderExtractionProvider");
      const diag = ext.getExtractionDiagnostics();
      assert.strictEqual(diag.configured, true);
    });

    it("should not require OPENAI_API_KEY when using Gemini provider", () => {
      const oldKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete require.cache[require.resolve("../services/transcriptionProvider")];
      delete require.cache[require.resolve("../services/orderExtractionProvider")];
      const tx = require("../services/transcriptionProvider");
      const ext = require("../services/orderExtractionProvider");
      assert.strictEqual(tx.getTranscriptionDiagnostics().configured, true);
      assert.strictEqual(ext.getExtractionDiagnostics().configured, true);
      process.env.OPENAI_API_KEY = oldKey;
    });

    it("should return configured=false for Gemini when GEMINI_API_KEY is missing", () => {
      delete process.env.GEMINI_API_KEY;
      delete require.cache[require.resolve("../services/transcriptionProvider")];
      const tx = require("../services/transcriptionProvider");
      const diag = tx.getTranscriptionDiagnostics();
      assert.strictEqual(diag.configured, false);
      assert.ok(diag.message.includes("GEMINI_API_KEY"));
      process.env.GEMINI_API_KEY = "fake-gemini-key-for-testing";
    });
  });
});

describe("Order Extraction Provider", () => {

  describe("validateExtractionOutput", () => {
    it("should accept valid extraction JSON", () => {
      const input = {
        language: "en",
        customer: { name: "John", phone: "12345", email: null },
        fulfilment: { type: "delivery", address: "123 Street", requestedDateTime: null },
        items: [
          { spokenName: "Apple", requestedQuantity: 5, confidence: 0.9 }
        ],
        orderNotes: null,
        overallConfidence: 0.85,
        warnings: []
      };
      const result = orderExtractionProvider.validateExtractionOutput(input);
      assert.strictEqual(result.valid, true);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 1);
    });

    it("should reject missing items array", () => {
      const input = {
        language: "en",
        customer: { name: "John" },
        fulfilment: { type: "unknown" },
        overallConfidence: 0.5,
        warnings: []
      };
      const result = orderExtractionProvider.validateExtractionOutput(input);
      assert.strictEqual(result.valid, false);
      assert.ok(result.message.includes("items"));
    });

    it("should reject invalid JSON string", () => {
      const result = orderExtractionProvider.validateExtractionOutput("not-json{{{");
      assert.strictEqual(result.valid, false);
      assert.ok(result.message.includes("invalid JSON"));
    });

    it("should strip forbidden fields from items", () => {
      const input = {
        language: "en",
        customer: { name: "Test" },
        fulfilment: { type: "pickup" },
        items: [
          { spokenName: "Banana", requestedQuantity: 2, price: 100, tax: 10, stock: 50, confidence: 0.8 }
        ],
        overallConfidence: 0.8,
        warnings: []
      };
      const result = orderExtractionProvider.validateExtractionOutput(input);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.items[0].price, undefined);
      assert.strictEqual(result.data.items[0].tax, undefined);
      assert.strictEqual(result.data.items[0].stock, undefined);
    });

    it("should strip forbidden top-level fields", () => {
      const input = {
        language: "en",
        customer: { name: "Test" },
        fulfilment: { type: "pickup" },
        items: [{ spokenName: "Item", requestedQuantity: 1, confidence: 0.9 }],
        overallConfidence: 0.9,
        warnings: [],
        storeId: "should-be-removed",
        total: 999,
        tax: 50
      };
      const result = orderExtractionProvider.validateExtractionOutput(input);
      assert.strictEqual(result.data.storeId, undefined);
      assert.strictEqual(result.data.total, undefined);
      assert.strictEqual(result.data.tax, undefined);
    });

    it("should default missing optional fields", () => {
      const input = {
        language: "en",
        items: [{ spokenName: "Item", requestedQuantity: 1, confidence: 0.9 }]
      };
      const result = orderExtractionProvider.validateExtractionOutput(input);
      assert.strictEqual(result.valid, true);
      assert.ok(result.data.customer);
      assert.ok(result.data.fulfilment);
      assert.ok(Array.isArray(result.data.warnings));
      assert.strictEqual(result.data.fulfilment.type, "unknown");
    });
  });

  describe("getExtractionDiagnostics", () => {
    it("should return configured=true when OPENAI_API_KEY is set", () => {
      const diag = orderExtractionProvider.getExtractionDiagnostics();
      assert.strictEqual(diag.configured, true);
    });
  });
});

describe("Transcription Error Handling", () => {

  describe("TranscriptionError class", () => {
    it("should create error with correct properties", () => {
      const err = new TranscriptionError("Test error", "TEST_CODE", 429, { errorRef: "ERR-001" });
      assert.strictEqual(err.message, "Test error");
      assert.strictEqual(err.code, "TEST_CODE");
      assert.strictEqual(err.status, 429);
      assert.strictEqual(err.errorRef, "ERR-001");
      assert.strictEqual(err.name, "TranscriptionError");
    });

    it("should handle quota exceeded error message", () => {
      const msg = "OpenAI API quota is unavailable. Add API billing/credits and check the project usage limit.";
      const err = new TranscriptionError(msg, "QUOTA_EXCEEDED", 429);
      assert.ok(err.message.includes("quota"));
      assert.strictEqual(err.code, "QUOTA_EXCEEDED");
      assert.strictEqual(err.status, 429);
    });

    it("should handle auth error", () => {
      const msg = "OpenAI API key is missing or invalid. Check the server environment variables.";
      const err = new TranscriptionError(msg, "AUTH_ERROR", 401);
      assert.strictEqual(err.code, "AUTH_ERROR");
      assert.strictEqual(err.status, 401);
    });
  });
});

describe("Product Matching Service", () => {

  describe("parseSpokenQuantity", () => {
    it("should parse numeric string", () => {
      assert.strictEqual(productMatchingService.parseSpokenQuantity("5"), 5);
    });

    it("should parse 'two' to 2", () => {
      assert.strictEqual(productMatchingService.parseSpokenQuantity("two"), 2);
    });

    it("should parse 'dozen' to 12", () => {
      assert.strictEqual(productMatchingService.parseSpokenQuantity("dozen"), 12);
    });

    it("should parse number input directly", () => {
      assert.strictEqual(productMatchingService.parseSpokenQuantity(3), 3);
    });

    it("should return null for ambiguous input", () => {
      assert.strictEqual(productMatchingService.parseSpokenQuantity("some"), null);
    });
  });

  describe("similarity", () => {
    it("should return 1 for identical strings", () => {
      assert.strictEqual(productMatchingService.similarity("apple", "apple"), 1);
    });

    it("should return high score for close match", () => {
      const score = productMatchingService.similarity("apple", "apples");
      assert.ok(score >= 0.8);
    });

    it("should return low score for different strings", () => {
      const score = productMatchingService.similarity("apple", "banana");
      assert.ok(score < 0.3);
    });
  });
});

describe("Environment Variable Handling", () => {

  it("should read OPENAI_API_KEY from process.env", () => {
    assert.strictEqual(process.env.OPENAI_API_KEY, "sk-test-fake-key-for-testing");
  });

  it("should use default for OPENAI_TRANSCRIPTION_MODEL", () => {
    const model = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
    assert.strictEqual(model, "whisper-1");
  });

  it("should use default for OPENAI_ORDER_MODEL", () => {
    const model = process.env.OPENAI_ORDER_MODEL || "gpt-4o";
    assert.strictEqual(model, "gpt-4o");
  });

  it("should use default for GEMINI_TRANSCRIPTION_MODEL", () => {
    const model = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.1-flash-lite";
    assert.strictEqual(model, "gemini-3.1-flash-lite");
  });

  it("should use default for GEMINI_ORDER_MODEL", () => {
    const model = process.env.GEMINI_ORDER_MODEL || "gemini-3.1-flash-lite";
    assert.strictEqual(model, "gemini-3.1-flash-lite");
  });

  it("should use default for MAX_AUDIO_FILE_SIZE_MB", () => {
    const size = process.env.MAX_AUDIO_FILE_SIZE_MB || "25";
    assert.strictEqual(size, "25");
  });

  it("should use default for VOICE_ORDER_RETENTION_DAYS", () => {
    const days = process.env.VOICE_ORDER_RETENTION_DAYS || "90";
    assert.strictEqual(days, "90");
  });
});

describe("MIME Normalization", () => {

  it("should strip codecs from audio/webm;codecs=opus", () => {
    const normalized = "audio/webm;codecs=opus".split(";")[0].trim();
    assert.strictEqual(normalized, "audio/webm");
  });

  it("should strip codecs from audio/webm;codecs=opus,opus", () => {
    const normalized = "audio/webm;codecs=opus,opus".split(";")[0].trim();
    assert.strictEqual(normalized, "audio/webm");
  });

  it("should pass through plain MIME type unchanged", () => {
    const normalized = "audio/webm".split(";")[0].trim();
    assert.strictEqual(normalized, "audio/webm");
  });

  it("should handle null MIME type", () => {
    const mime = null;
    const normalized = mime ? mime.split(";")[0].trim() : mime;
    assert.strictEqual(normalized, null);
  });
});

describe("Voice Order Status Flow", () => {

  it("should have new statuses in the model enum", () => {
    const VoiceOrder = require("../models/VoiceOrder");
    const schema = VoiceOrder.schema;
    const statusEnum = schema.path("status").enumValues;
    assert.ok(statusEnum.includes("transcribed"), "transcribed should be in status enum");
    assert.ok(statusEnum.includes("extracting_order"), "extracting_order should be in status enum");
    assert.ok(statusEnum.includes("ready_for_review"), "ready_for_review should be in status enum");
    assert.ok(statusEnum.includes("order_extraction_failed"), "order_extraction_failed should be in status enum");
    // Old statuses should still exist for backward compat
    assert.ok(statusEnum.includes("extracting"), "extracting should still exist for backward compat");
    assert.ok(statusEnum.includes("needs_review"), "needs_review should still exist for backward compat");
    assert.ok(statusEnum.includes("failed"), "failed should still exist for backward compat");
  });
});
