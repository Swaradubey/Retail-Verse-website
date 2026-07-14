const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Audio Storage Service — abstraction layer for saving, reading, and deleting
 * voice-order audio files. Currently uses local disk storage.
 *
 * To migrate to S3/GCS later:
 *   1. Replace the three functions below with SDK calls.
 *   2. No other file needs to change — the API surface is identical.
 *
 * Security:
 *   - Files are stored with random UUIDs — never guessable.
 *   - Path traversal is impossible (filename is a UUID + allowed extension).
 *   - Files are served only through an authenticated server endpoint.
 *   - No file is returned without a storeId ownership check.
 */

const UPLOAD_DIR = path.resolve(__dirname, "../uploads/voice-orders");

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",       // .mp3
  "audio/mp3",        // .mp3 (alternate)
  "audio/wav",        // .wav
  "audio/wave",       // .wav
  "audio/x-wav",      // .wav
  "audio/mp4",        // .m4a
  "audio/x-m4a",      // .m4a
  "audio/webm",       // .webm
  "audio/ogg",        // .ogg
  "video/webm",       // .webm (from browser MediaRecorder)
  "video/ogg",        // .ogg
]);

const MIME_TO_EXT = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "video/webm": ".webm",
  "video/ogg": ".ogg",
};

const MAX_FILE_SIZE_BYTES =
  (parseInt(process.env.MAX_AUDIO_FILE_SIZE_MB || "25", 10) || 25) * 1024 * 1024;

/**
 * Ensure upload directory exists.
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log("[AudioStorage] Created upload directory:", UPLOAD_DIR);
  }
}

/**
 * Validate a MIME type from the incoming file.
 * Returns { valid: true, ext } or { valid: false, message }.
 */
function validateMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    return {
      valid: false,
      message: `Unsupported audio format: ${mimeType}. Allowed: mp3, wav, m4a, webm, ogg.`,
    };
  }
  return { valid: true, ext: MIME_TO_EXT[normalized] || ".bin" };
}

/**
 * Save a buffer/stream to disk.
 * @param {Buffer} buffer   Raw file bytes
 * @param {string} mimeType MIME type from upload
 * @returns {{ storageKey: string, fileSize: number }}
 */
async function saveAudio(buffer, mimeType) {
  ensureUploadDir();
  const { valid, ext, message } = validateMime(mimeType);
  if (!valid) {
    throw Object.assign(new Error(message), { code: "INVALID_MIME" });
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw Object.assign(
      new Error(`File exceeds maximum allowed size of ${process.env.MAX_AUDIO_FILE_SIZE_MB || 25} MB.`),
      { code: "FILE_TOO_LARGE" }
    );
  }
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storageKey);
  await fs.promises.writeFile(filePath, buffer);
  return { storageKey, fileSize: buffer.length };
}

/**
 * Get the full absolute path for a storage key.
 * Returns null if the key is missing or path traversal is detected.
 */
function resolveFilePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") return null;
  // Strip any directory separators — the key must be a plain filename
  const safeName = path.basename(storageKey);
  if (!safeName || safeName !== storageKey) return null;
  const full = path.join(UPLOAD_DIR, safeName);
  // Double-check resolved path is still inside UPLOAD_DIR
  if (!full.startsWith(UPLOAD_DIR)) return null;
  return full;
}

/**
 * Check if an audio file exists for a storage key.
 */
function audioExists(storageKey) {
  const fp = resolveFilePath(storageKey);
  if (!fp) return false;
  return fs.existsSync(fp);
}

/**
 * Return a readable stream for the audio file.
 * Throws if the file does not exist or the key is unsafe.
 */
function createReadStream(storageKey) {
  const fp = resolveFilePath(storageKey);
  if (!fp || !fs.existsSync(fp)) {
    throw Object.assign(new Error("Audio file not found."), { code: "NOT_FOUND" });
  }
  return fs.createReadStream(fp);
}

/**
 * Delete an audio file from storage.
 * Silently ignores missing files.
 */
async function deleteAudio(storageKey) {
  const fp = resolveFilePath(storageKey);
  if (!fp || !fs.existsSync(fp)) return;
  await fs.promises.unlink(fp).catch(() => {});
}

/**
 * Return file stat (size, mtime) for a storage key.
 */
async function statAudio(storageKey) {
  const fp = resolveFilePath(storageKey);
  if (!fp || !fs.existsSync(fp)) return null;
  return fs.promises.stat(fp);
}

module.exports = {
  saveAudio,
  audioExists,
  createReadStream,
  deleteAudio,
  statAudio,
  validateMime,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  UPLOAD_DIR,
};
