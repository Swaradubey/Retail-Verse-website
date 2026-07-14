/**
 * Voice Order State Repair Script
 * ==================================
 * Usage:
 *   node scripts/repairVoiceOrders.js              (apply fixes)
 *   node scripts/repairVoiceOrders.js --dry-run     (show what would change)
 *
 * Rules:
 *   - extracting_order + transcript exists → extraction_failed
 *   - extracting_order + no transcript     → transcription_failed
 *   - stale transcribing + no transcript   → transcription_failed
 *   - stale transcribing + has transcript   → ready_for_review
 *   - stale extracting_order (old lock)     → extraction_failed (with transcript)
 *   - stale extracting_order (old lock)     → transcription_failed (no transcript)
 *   - Do NOT modify confirmed, order_created, or cancelled records.
 *   - Do NOT delete audio.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const VoiceOrder = require("../models/VoiceOrder");

const DRY_RUN = process.argv.includes("--dry-run");
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function isStale(date) {
  if (!date) return true;
  return Date.now() - new Date(date).getTime() > LOCK_TIMEOUT_MS;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  if (DRY_RUN) console.log("=== DRY RUN — no changes will be applied ===\n");

  const PROTECTED_STATUSES = ["confirmed", "order_created", "cancelled"];

  // ── extracting_order with transcript → extraction_failed ────────────
  const stuckExtractingWithTranscript = await VoiceOrder.find({
    status: "extracting_order",
    transcription: { $exists: true, $ne: "", $type: "string" },
    // Only if stale or has been running too long
  });

  // ── extracting_order without transcript → transcription_failed ──────
  const stuckExtractingNoTranscript = await VoiceOrder.find({
    status: "extracting_order",
    $or: [
      { transcription: { $exists: false } },
      { transcription: "" },
      { transcription: null },
    ],
  });

  // ── stale transcribing → transcription_failed ───────────────────────
  const staleTranscribing = await VoiceOrder.find({
    status: "transcribing",
  });

  const changes = [];

  for (const vo of stuckExtractingWithTranscript) {
    if (PROTECTED_STATUSES.includes(vo.status)) continue;
    changes.push({
      id: String(vo._id),
      from: vo.status,
      to: "extraction_failed",
      reason: "extracting_order with transcript exists",
      transcript: (vo.transcription || "").slice(0, 80),
      createdAt: vo.createdAt,
    });
  }

  for (const vo of stuckExtractingNoTranscript) {
    if (PROTECTED_STATUSES.includes(vo.status)) continue;
    changes.push({
      id: String(vo._id),
      from: vo.status,
      to: "transcription_failed",
      reason: "extracting_order without transcript",
      transcript: "",
      createdAt: vo.createdAt,
    });
  }

  for (const vo of staleTranscribing) {
    if (PROTECTED_STATUSES.includes(vo.status)) continue;
    const hasTranscript = vo.transcription && vo.transcription.trim().length > 0;
    const stale = isStale(vo.processingStartedAt);
    const target = hasTranscript ? "ready_for_review" : "transcription_failed";
    changes.push({
      id: String(vo._id),
      from: vo.status,
      to: target,
      reason: (stale ? "stale " : "") + "transcribing" + (hasTranscript ? " with transcript" : " without transcript"),
      transcript: (vo.transcription || "").slice(0, 80),
      createdAt: vo.createdAt,
    });
  }

  if (changes.length === 0) {
    console.log("No stuck records found.\n");
  } else {
    console.log(`Found ${changes.length} stuck records:\n`);
    for (const c of changes) {
      const line = `  [${String(c.id).slice(-8)}] ${c.from.padEnd(20)} → ${c.to.padEnd(22)}  ${c.reason}`;
      console.log(line);
      if (!DRY_RUN) {
        await VoiceOrder.updateOne(
          { _id: c.id },
          {
            $set: {
              status: c.to,
              failureReason:
                c.to === "transcription_failed"
                  ? "Recovered by repair script — no transcript found."
                  : c.to === "extraction_failed"
                  ? "Recovered by repair script — extraction incomplete."
                  : null,
              processingStartedAt: null,
            },
          }
        );
      }
    }

    if (DRY_RUN) {
      console.log("\nRun without --dry-run to apply these fixes.");
    } else {
      console.log(`\n✅ ${changes.length} records updated.`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Repair script failed:", err.message);
  process.exit(1);
});
