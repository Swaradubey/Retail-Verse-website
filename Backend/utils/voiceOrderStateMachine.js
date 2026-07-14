const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function isStale(processingStartedAt) {
  if (!processingStartedAt) return true;
  return Date.now() - new Date(processingStartedAt).getTime() > LOCK_TIMEOUT_MS;
}

function acquireProcessingLock(vo) {
  if (
    vo.processingStartedAt &&
    !isStale(vo.processingStartedAt)
  ) {
    return false;
  }
  return true;
}

function resolveAction(vo) {
  const hasTranscript = vo.transcription && vo.transcription.trim().length > 0;

  const logMeta = {
    voiceOrderId: String(vo._id),
    databaseStatus: vo.status,
    transcriptExists: hasTranscript,
    processingStartedAt: vo.processingStartedAt,
  };

  switch (vo.status) {
    case "uploaded":
      return { action: "transcribe", reason: "new audio ready", logMeta };

    case "transcribing": {
      if (isStale(vo.processingStartedAt)) {
        return { action: "transcribe", reason: "stale transcribing lock", logMeta };
      }
      return { action: "in_progress", reason: "transcription already running", logMeta };
    }

    case "transcription_failed":
      return { action: "transcribe", reason: "retry failed transcription", logMeta };

    case "transcribed":
      return { action: "extract", reason: "transcript ready for extraction", logMeta };

    case "extracting_order": {
      if (isStale(vo.processingStartedAt)) {
        if (hasTranscript) {
          return { action: "extract", reason: "stale extracting_order with transcript", logMeta };
        }
        return { action: "transcribe", reason: "stale extracting_order without transcript", logMeta };
      }
      if (hasTranscript) {
        return { action: "in_progress", reason: "extraction already running with transcript", logMeta };
      }
      return { action: "in_progress", reason: "extraction already running", logMeta };
    }

    case "extraction_failed":
    case "order_extraction_failed":
      if (hasTranscript) {
        return { action: "extract", reason: "retry failed extraction with transcript", logMeta };
      }
      return { action: "transcribe", reason: "retry failed extraction without transcript", logMeta };

    case "ready_for_review":
    case "needs_review":
    case "draft":
      return { action: "already_complete", reason: "already processed and ready for review", logMeta };

    case "confirmed":
    case "order_created":
      return { action: "rejected", reason: "order already confirmed or created", logMeta };

    case "cancelled":
      return { action: "rejected", reason: "order cancelled", logMeta };

    case "failed":
      return { action: "transcribe", reason: "retry generic failure", logMeta };

    default:
      return { action: "transcribe", reason: "attempt recovery from unknown status", logMeta };
  }
}

function determineStage(resolvedAction) {
  switch (resolvedAction.action) {
    case "transcribe":
      return { stage: "transcribe", statusBefore: "transcribing" };
    case "extract":
      return { stage: "extract", statusBefore: "extracting_order" };
    case "in_progress":
      return { stage: "in_progress", statusBefore: null };
    case "already_complete":
      return { stage: "complete", statusBefore: null };
    case "rejected":
      return { stage: "rejected", statusBefore: null };
    default:
      return { stage: "transcribe", statusBefore: "transcribing" };
  }
}

module.exports = {
  LOCK_TIMEOUT_MS,
  isStale,
  acquireProcessingLock,
  resolveAction,
  determineStage,
};
