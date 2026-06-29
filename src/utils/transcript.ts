import type { AnalyzeResponse, HiveIntent, TranscriptRange } from "../../shared/hiveSchemas";

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
}

export interface RollingTranscriptWindow {
  text: string;
  range: TranscriptRange;
  hasFinalSegment: boolean;
}

export interface CommitState {
  committedIntentKeys: Set<string>;
  committedRangeKeys: Set<string>;
  hasBoundary: boolean;
}

export interface IntentCommitDecision {
  shouldCommit: boolean;
  reason: string;
}

const MIN_READY_CONFIDENCE = 0.65;
const HIGH_CONFIDENCE_WITHOUT_BOUNDARY = 0.82;

export function getRollingTranscriptWindow(
  segments: TranscriptSegment[],
  interimSegment: TranscriptSegment | null,
  windowMs = 5000
): RollingTranscriptWindow {
  const allSegments = [...segments, ...(interimSegment ? [interimSegment] : [])].filter((segment) => segment.text.trim());
  const latestEndMs = allSegments.reduce((latest, segment) => Math.max(latest, segment.endMs), 0);
  const windowStartMs = Math.max(0, latestEndMs - windowMs);
  const windowSegments = allSegments.filter((segment) => segment.endMs >= windowStartMs);
  const text = windowSegments.map((segment) => segment.text.trim()).join(" ").replace(/\s+/g, " ").trim();
  const startMs = windowSegments.length > 0 ? Math.min(...windowSegments.map((segment) => segment.startMs)) : latestEndMs;
  const endMs = windowSegments.length > 0 ? Math.max(...windowSegments.map((segment) => segment.endMs)) : latestEndMs;

  return {
    text,
    range: { startMs, endMs },
    hasFinalSegment: windowSegments.some((segment) => segment.isFinal)
  };
}

export function hasClauseBoundary(text: string): boolean {
  const trimmed = text.trim();

  if (!trimmed) {
    return false;
  }

  return /[.!?;:]$/.test(trimmed) || /\b(and|then|so|with|where|that|which|because)\s*$/i.test(trimmed);
}

export function shouldCommitIntent(response: AnalyzeResponse, state: CommitState): response is AnalyzeResponse & { intent: HiveIntent } {
  return getIntentCommitDecision(response, state).shouldCommit;
}

export function getIntentCommitDecision(response: AnalyzeResponse, state: CommitState): IntentCommitDecision {
  if (response.status !== "ready" || !response.intent) {
    return { shouldCommit: false, reason: "not_ready" };
  }

  if (response.intent.confidence < MIN_READY_CONFIDENCE) {
    return {
      shouldCommit: false,
      reason: `confidence_below_${MIN_READY_CONFIDENCE}`
    };
  }

  const intentKey = normalizeIntentKey(response.intent.canonicalText);
  const rangeKey = createRangeKey(response.intent.transcriptRange);

  if (state.committedIntentKeys.has(intentKey) || state.committedRangeKeys.has(rangeKey)) {
    return { shouldCommit: false, reason: "duplicate_intent_or_range" };
  }

  if (response.intent.commitMode === "instant") {
    return { shouldCommit: true, reason: "instant" };
  }

  if (state.hasBoundary) {
    return { shouldCommit: true, reason: "boundary" };
  }

  if (response.intent.confidence >= HIGH_CONFIDENCE_WITHOUT_BOUNDARY) {
    return {
      shouldCommit: true,
      reason: `high_confidence_without_boundary_${HIGH_CONFIDENCE_WITHOUT_BOUNDARY}`
    };
  }

  return { shouldCommit: false, reason: "waiting_for_boundary" };
}

export function normalizeIntentKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function createRangeKey(range: TranscriptRange): string {
  return `${Math.round(range.startMs / 250) * 250}:${Math.round(range.endMs / 250) * 250}`;
}
