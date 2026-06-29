import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "../../shared/hiveSchemas";
import {
  createRangeKey,
  getRollingTranscriptWindow,
  hasClauseBoundary,
  normalizeIntentKey,
  shouldCommitIntent,
  type TranscriptSegment
} from "../../src/utils/transcript";

const segments: TranscriptSegment[] = [
  { id: "old", text: "old idea", isFinal: true, startMs: 0, endMs: 900 },
  { id: "recent", text: "add a chart", isFinal: true, startMs: 5200, endMs: 6200 }
];

describe("transcript utilities", () => {
  it("returns the rolling five-second transcript window", () => {
    const window = getRollingTranscriptWindow(segments, { id: "interim", text: "for finances", isFinal: false, startMs: 6500, endMs: 7000 }, 5000);

    expect(window.text).toBe("add a chart for finances");
    expect(window.range).toEqual({ startMs: 5200, endMs: 7000 });
    expect(window.hasFinalSegment).toBe(true);
  });

  it("detects clause boundaries", () => {
    expect(hasClauseBoundary("add a source panel.")).toBe(true);
    expect(hasClauseBoundary("add a source panel where")).toBe(true);
    expect(hasClauseBoundary("add a source panel")).toBe(false);
  });

  it("gates ready intents by confidence, duplicate state, and boundary", () => {
    const response: AnalyzeResponse = {
      seq: 1,
      status: "ready",
      intent: {
        id: "chart",
        canonicalText: "Add a finance analytics chart to the app.",
        displayText: "Add a finance analytics chart",
        complementText: null,
        confidence: 0.8,
        commitMode: "boundary",
        transcriptRange: { startMs: 1000, endMs: 2000 }
      }
    };

    expect(
      shouldCommitIntent(response, {
        committedIntentKeys: new Set(),
        committedRangeKeys: new Set(),
        hasBoundary: false
      })
    ).toBe(false);

    expect(
      shouldCommitIntent(
        {
          ...response,
          intent: {
            ...response.intent!,
            confidence: 0.9
          }
        },
        {
          committedIntentKeys: new Set(),
          committedRangeKeys: new Set(),
          hasBoundary: false
        }
      )
    ).toBe(true);

    expect(
      shouldCommitIntent(response, {
        committedIntentKeys: new Set(),
        committedRangeKeys: new Set(),
        hasBoundary: true
      })
    ).toBe(true);

    expect(
      shouldCommitIntent(response, {
        committedIntentKeys: new Set([normalizeIntentKey(response.intent!.canonicalText)]),
        committedRangeKeys: new Set(),
        hasBoundary: true
      })
    ).toBe(false);

    expect(
      shouldCommitIntent(response, {
        committedIntentKeys: new Set(),
        committedRangeKeys: new Set([createRangeKey(response.intent!.transcriptRange)]),
        hasBoundary: true
      })
    ).toBe(false);
  });
});
