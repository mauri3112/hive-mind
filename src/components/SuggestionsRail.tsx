import { AlertTriangle, Brain, Check, CircleDashed, Lightbulb, MessageCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { DiagramSuggestion, HiveIntent } from "../../shared/hiveSchemas";
import type { TranscriptSegment } from "../utils/transcript";

export type SuggestionValidationStatus = "checking" | "valid" | "invalid" | "stale" | "applying";

export interface PendingSuggestion {
  suggestion: DiagramSuggestion;
  validationStatus: SuggestionValidationStatus;
  validationMessage: string;
  createdAt: number;
}

export type RailItemKind = "dictation" | "interim" | "forming" | "intent" | "complement" | "system";

export interface RailItem {
  id: string;
  kind: RailItemKind;
  text: string;
  createdAt: number;
}

interface SuggestionsRailProps {
  railEvents: RailItem[];
  segments: TranscriptSegment[];
  interimSegment: TranscriptSegment | null;
  formingIntent: HiveIntent | null;
  suggestions: PendingSuggestion[];
  onAccept: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
}

export function SuggestionsRail({
  railEvents,
  segments,
  interimSegment,
  formingIntent,
  suggestions,
  onAccept,
  onReject
}: SuggestionsRailProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const items = useMemo<RailItem[]>(() => {
    const dictationItems: RailItem[] = segments.map((segment) => ({
      id: segment.id,
      kind: "dictation",
      text: segment.text,
      createdAt: segment.endMs
    }));
    const interimItems: RailItem[] = interimSegment
      ? [
          {
            id: "interim",
            kind: "interim",
            text: interimSegment.text,
            createdAt: interimSegment.endMs
          }
        ]
      : [];
    const formingItems: RailItem[] = formingIntent
      ? [
          {
            id: `forming-${formingIntent.id}`,
            kind: "forming",
            text: formingIntent.displayText,
            createdAt: Date.now()
          }
        ]
      : [];

    return [...dictationItems, ...railEvents, ...formingItems, ...interimItems].sort((a, b) => a.createdAt - b.createdAt);
  }, [formingIntent, interimSegment, railEvents, segments]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [items.length]);

  return (
    <aside className="suggestions-rail" aria-label="Suggestions and transcript">
      <div className="rail-header">
        <div>
          <span className="rail-title">Suggestions</span>
          <span className="rail-subtitle">{suggestions.length} pending</span>
        </div>
      </div>

      <div className="suggestion-list">
        {suggestions.length === 0 ? (
          <div className="suggestion-empty">
            <Sparkles size={16} />
            <span>Accepted voice intents will appear here first.</span>
          </div>
        ) : (
          suggestions.map((item, index) => (
            <SuggestionCard
              item={item}
              key={item.suggestion.id}
              selected={index === 0}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))
        )}
      </div>

      <div className="transcript-section">
        <div className="transcript-heading">Transcript</div>
        <div ref={scrollerRef} className="rail-scroll">
          <div className="rail-stack">
            {items.length === 0 ? (
              <div className="rail-empty">Recording will appear here.</div>
            ) : (
              items.map((item) => <RailBubble key={`${item.id}-${item.kind}`} item={item} />)
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SuggestionCard({
  item,
  selected,
  onAccept,
  onReject
}: {
  item: PendingSuggestion;
  selected: boolean;
  onAccept: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
}) {
  const { suggestion, validationStatus, validationMessage } = item;
  const canAccept = validationStatus === "valid";
  const statusIcon =
    validationStatus === "checking" || validationStatus === "applying" ? (
      <CircleDashed size={14} className="spin" />
    ) : validationStatus === "valid" ? (
      <Check size={14} />
    ) : (
      <AlertTriangle size={14} />
    );

  return (
    <article className={selected ? "suggestion-card selected" : "suggestion-card"}>
      <div className="suggestion-card-header">
        <span>Transcript</span>
        <span className={`suggestion-status ${validationStatus}`}>
          {statusIcon}
          {validationStatus}
        </span>
      </div>

      <p className="suggestion-transcript">{suggestion.intent.canonicalText}</p>

      <div className="suggestion-field">
        <span>Intent</span>
        <p>{suggestion.intent.displayText}</p>
      </div>

      <div className="suggestion-field">
        <span>Proposed change</span>
        <ul>
          {suggestion.changeList.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>

      {validationStatus !== "valid" ? <p className="validation-message">{validationMessage}</p> : null}

      <div className="suggestion-actions">
        <button className="accept-button" type="button" disabled={!canAccept} onClick={() => onAccept(suggestion.id)}>
          <Check size={15} />
          Accept
        </button>
        <button className="reject-button" type="button" onClick={() => onReject(suggestion.id)}>
          <X size={15} />
          Reject
        </button>
      </div>
    </article>
  );
}

function RailBubble({ item }: { item: RailItem }) {
  const icon = {
    dictation: <MessageCircle size={14} />,
    interim: <MessageCircle size={14} />,
    forming: <Sparkles size={14} />,
    intent: <Brain size={14} />,
    complement: <Lightbulb size={14} />,
    system: <Sparkles size={14} />
  }[item.kind];

  return (
    <article className={`rail-bubble ${item.kind}`}>
      <div className="rail-bubble-icon">{icon}</div>
      <p>{item.text}</p>
    </article>
  );
}
