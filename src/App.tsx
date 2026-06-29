import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramDocument, DiagramSuggestion, HiveIntent, RailEvent } from "../shared/hiveSchemas";
import { analyzeHive, applyHiveSuggestion, HiveApiError, proposeHiveDiagram } from "./api/hiveClient";
import { ConfirmResetDialog } from "./components/ConfirmResetDialog";
import { DiagramPreview } from "./components/DiagramPreview";
import { RecordDock } from "./components/RecordDock";
import { type PendingSuggestion, SuggestionsRail, type RailItem } from "./components/SuggestionsRail";
import { useLatestRef } from "./hooks/useLatestRef";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { downloadMermaid, downloadSvg } from "./utils/download";
import { createId } from "./utils/ids";
import { createInitialDiagramDocument } from "./utils/initialDiagram";
import { validateMermaidSource } from "./utils/mermaidRenderer";
import {
  createRangeKey,
  getIntentCommitDecision,
  getRollingTranscriptWindow,
  hasClauseBoundary,
  normalizeIntentKey
} from "./utils/transcript";

interface AppProps {
  analyzeIntervalMs?: number;
}

export default function App({ analyzeIntervalMs = 1000 }: AppProps) {
  const speech = useSpeechRecognition();
  const [sessionId, setSessionId] = useState(() => createId("session"));
  const [document, setDocument] = useState<DiagramDocument>(() => createInitialDiagramDocument());
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [railEvents, setRailEvents] = useState<RailItem[]>([]);
  const [formingIntent, setFormingIntent] = useState<HiveIntent | null>(null);
  const [proposalStatus, setProposalStatus] = useState("Ready");
  const [analysisStatus, setAnalysisStatus] = useState("Ready");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [latestSvg, setLatestSvg] = useState("");

  const sessionIdRef = useLatestRef(sessionId);
  const documentRef = useLatestRef(document);
  const segmentsRef = useLatestRef(speech.segments);
  const interimRef = useLatestRef(speech.interimSegment);
  const queueRef = useRef<HiveIntent[]>([]);
  const proposingRef = useRef(false);
  const analyzingRef = useRef(false);
  const analyzeSeqRef = useRef(0);
  const proposeSeqRef = useRef(0);
  const applySeqRef = useRef(0);
  const lastAnalyzedTextRef = useRef("");
  const committedIntentKeysRef = useRef(new Set<string>());
  const committedRangeKeysRef = useRef(new Set<string>());
  const suggestedIntentsRef = useRef<HiveIntent[]>([]);
  const railOrderRef = useRef(100000);

  const addRailEvents = useCallback((events: Array<Pick<RailItem, "kind" | "text">>) => {
    setRailEvents((current) => [
      ...current,
      ...events.map((event) => ({
        ...event,
        id: createId(event.kind),
        createdAt: (railOrderRef.current += 1)
      }))
    ]);
  }, []);

  const validateSuggestion = useCallback(async (suggestion: DiagramSuggestion) => {
    const result = await validateMermaidSource(suggestion.nextSource);
    setPendingSuggestions((current) =>
      current.map((item) => {
        if (item.suggestion.id !== suggestion.id || item.validationStatus !== "checking") {
          return item;
        }

        return {
          ...item,
          validationStatus: result.valid ? "valid" : "invalid",
          validationMessage: result.message
        };
      })
    );
  }, []);

  const markSuggestionsStaleAgainst = useCallback((nextDocument: DiagramDocument) => {
    setPendingSuggestions((current) =>
      current.map((item) =>
        item.suggestion.baseRevision === nextDocument.revision
          ? item
          : {
              ...item,
              validationStatus: "stale",
              validationMessage: "This suggestion targets an older diagram revision."
            }
      )
    );
  }, []);

  const processProposalQueue = useCallback(async () => {
    if (proposingRef.current) {
      return;
    }

    proposingRef.current = true;

    while (queueRef.current.length > 0) {
      const intent = queueRef.current.shift();

      if (!intent) {
        continue;
      }

      const activeSessionId = sessionIdRef.current;
      const baseDocument = documentRef.current;
      setProposalStatus("Proposing");
      logClient("propose.request", {
        seq: proposeSeqRef.current + 1,
        baseRevision: baseDocument.revision,
        intentId: intent.id,
        canonicalText: intent.canonicalText
      });

      try {
        const response = await proposeHiveDiagram({
          sessionId: activeSessionId,
          seq: ++proposeSeqRef.current,
          baseRevision: baseDocument.revision,
          intent
        });

        if (activeSessionId !== sessionIdRef.current) {
          continue;
        }

        logClient("propose.response", {
          seq: response.seq,
          suggestionId: response.suggestion.id,
          diagramType: response.suggestion.diagramType,
          changes: response.suggestion.changeList
        });

        setPendingSuggestions((current) => [
          {
            suggestion: response.suggestion,
            validationStatus: "checking",
            validationMessage: "Checking Mermaid syntax...",
            createdAt: Date.now()
          },
          ...current
        ]);
        setProposalStatus("Suggestion ready");
        void validateSuggestion(response.suggestion);
      } catch (error) {
        if (error instanceof HiveApiError && error.status === 409 && typeof error.payload === "object" && error.payload) {
          const payload = error.payload as { document?: DiagramDocument };
          if (payload.document) {
            documentRef.current = payload.document;
            setDocument(payload.document);
            markSuggestionsStaleAgainst(payload.document);
          }
          addRailEvents([{ kind: "system", text: "Diagram revision caught up." }]);
        } else {
          logClient("propose.error", {
            message: error instanceof Error ? error.message : "Unknown proposal error"
          });
          addRailEvents([{ kind: "system", text: "Hive could not create a diagram suggestion." }]);
        }
        setProposalStatus("Proposal paused");
      }
    }

    proposingRef.current = false;
    setProposalStatus((current) => (current === "Proposing" ? "Ready" : current));
  }, [addRailEvents, documentRef, markSuggestionsStaleAgainst, sessionIdRef, validateSuggestion]);

  const enqueueProposal = useCallback(
    (intent: HiveIntent) => {
      queueRef.current.push(intent);
      logClient("propose.enqueue", {
        queueLength: queueRef.current.length,
        intentId: intent.id,
        canonicalText: intent.canonicalText
      });
      void processProposalQueue();
    },
    [processProposalQueue]
  );

  const analyzeLatestWindow = useCallback(async () => {
    if (analyzingRef.current) {
      return;
    }

    const rolling = getRollingTranscriptWindow(segmentsRef.current, interimRef.current, 5000);

    if (!rolling.text || rolling.text === lastAnalyzedTextRef.current) {
      setAnalysisStatus(!rolling.text ? "Listening" : "Waiting");
      return;
    }

    logClient("analyze.window", {
      seq: analyzeSeqRef.current + 1,
      text: rolling.text,
      range: rolling.range,
      hasFinalSegment: rolling.hasFinalSegment
    });
    lastAnalyzedTextRef.current = rolling.text;
    analyzingRef.current = true;
    setAnalysisStatus("Analyzing");

    try {
      const response = await analyzeHive({
        sessionId: sessionIdRef.current,
        seq: ++analyzeSeqRef.current,
        transcriptWindow: rolling.text,
        transcriptRange: rolling.range,
        diagramSummary: documentRef.current.summary,
        recentCommittedIntents: suggestedIntentsRef.current.slice(-12).map((intent) => ({
          id: intent.id,
          canonicalText: intent.canonicalText
        }))
      });

      logClient("analyze.response", {
        seq: response.seq,
        status: response.status,
        intentId: response.intent?.id,
        confidence: response.intent?.confidence,
        commitMode: response.intent?.commitMode,
        canonicalText: response.intent?.canonicalText,
        deferReason: response.deferReason
      });

      if (response.status === "forming") {
        setFormingIntent(response.intent ?? null);
        setAnalysisStatus("Intent forming");
        return;
      }

      if (response.status !== "ready" || !response.intent) {
        setFormingIntent(null);
        setAnalysisStatus(response.deferReason ?? "Listening");
        return;
      }

      const hasBoundary = rolling.hasFinalSegment || hasClauseBoundary(rolling.text);
      const commitDecision = getIntentCommitDecision(response, {
        committedIntentKeys: committedIntentKeysRef.current,
        committedRangeKeys: committedRangeKeysRef.current,
        hasBoundary
      });

      logClient("commit.decision", {
        intentId: response.intent.id,
        shouldCommit: commitDecision.shouldCommit,
        reason: commitDecision.reason,
        hasBoundary,
        confidence: response.intent.confidence,
        commitMode: response.intent.commitMode
      });

      if (commitDecision.shouldCommit) {
        const intentKey = normalizeIntentKey(response.intent.canonicalText);
        const rangeKey = createRangeKey(response.intent.transcriptRange);
        committedIntentKeysRef.current.add(intentKey);
        committedRangeKeysRef.current.add(rangeKey);
        suggestedIntentsRef.current = [...suggestedIntentsRef.current, response.intent];
        setFormingIntent(null);
        setAnalysisStatus("Suggestion queued");
        enqueueProposal(response.intent);
      } else {
        setFormingIntent(response.intent);
        setAnalysisStatus(commitDecision.reason === "waiting_for_boundary" ? "Waiting for boundary" : "Intent forming");
      }
    } catch (error) {
      logClient("analyze.error", {
        message: error instanceof Error ? error.message : "Unknown analyzer error"
      });
      setAnalysisStatus("Analyzer unavailable");
    } finally {
      analyzingRef.current = false;
    }
  }, [documentRef, enqueueProposal, interimRef, segmentsRef, sessionIdRef]);

  useInterval(
    () => {
      if (speech.isRecording) {
        void analyzeLatestWindow();
      }
    },
    speech.isRecording ? analyzeIntervalMs : null
  );

  const resetRuntimeState = useCallback(() => {
    queueRef.current = [];
    proposingRef.current = false;
    analyzingRef.current = false;
    lastAnalyzedTextRef.current = "";
    committedIntentKeysRef.current = new Set<string>();
    committedRangeKeysRef.current = new Set<string>();
    suggestedIntentsRef.current = [];
    railOrderRef.current = 100000;
    setSessionId(createId("session"));
    setDocument(createInitialDiagramDocument());
    setPendingSuggestions([]);
    setRailEvents([]);
    setFormingIntent(null);
    setLatestSvg("");
    setProposalStatus("Ready");
    setAnalysisStatus("Ready");
    speech.resetTranscript();
  }, [speech]);

  const startFreshDictation = useCallback(() => {
    setResetDialogOpen(false);
    resetRuntimeState();
    window.setTimeout(() => speech.start(), 0);
  }, [resetRuntimeState, speech]);

  const hasCurrentWork =
    document.revision > 0 || speech.segments.length > 0 || railEvents.length > 0 || pendingSuggestions.length > 0;

  const handleToggleRecording = useCallback(() => {
    if (speech.isRecording) {
      speech.stop();
      setAnalysisStatus("Stopped");
      return;
    }

    if (hasCurrentWork) {
      setResetDialogOpen(true);
      return;
    }

    startFreshDictation();
  }, [hasCurrentWork, speech, startFreshDictation]);

  const handleDownloadMermaid = useCallback(() => {
    downloadMermaid(document.source);
    setAnalysisStatus("Downloaded Mermaid");
  }, [document.source]);

  const handleDownloadSvg = useCallback(() => {
    if (!latestSvg) {
      setAnalysisStatus("SVG not ready");
      return;
    }

    downloadSvg(latestSvg);
    setAnalysisStatus("Downloaded SVG");
  }, [latestSvg]);

  const handleDownloadAndStart = useCallback(() => {
    downloadMermaid(document.source);
    setAnalysisStatus("Downloaded Mermaid");
    startFreshDictation();
  }, [document.source, startFreshDictation]);

  const handleAcceptSuggestion = useCallback(
    async (suggestionId: string) => {
      setPendingSuggestions((current) =>
        current.map((item) =>
          item.suggestion.id === suggestionId
            ? { ...item, validationStatus: "applying", validationMessage: "Applying suggestion..." }
            : item
        )
      );
      setProposalStatus("Applying");

      try {
        const response = await applyHiveSuggestion({
          sessionId: sessionIdRef.current,
          seq: ++applySeqRef.current,
          suggestionId
        });

        documentRef.current = response.document;
        setDocument(response.document);
        setPendingSuggestions((current) =>
          current
            .filter((item) => item.suggestion.id !== response.appliedSuggestionId)
            .map((item) =>
              item.suggestion.baseRevision === response.document.revision
                ? item
                : {
                    ...item,
                    validationStatus: "stale",
                    validationMessage: "This suggestion targets an older diagram revision."
                  }
            )
        );
        addRailEvents(response.railEvents.map((event: RailEvent) => ({ kind: event.kind, text: event.text })));
        setProposalStatus("Applied");
      } catch (error) {
        if (error instanceof HiveApiError && (error.status === 409 || error.status === 404) && typeof error.payload === "object" && error.payload) {
          const payload = error.payload as { document?: DiagramDocument };
          if (payload.document) {
            documentRef.current = payload.document;
            setDocument(payload.document);
            markSuggestionsStaleAgainst(payload.document);
          }
          setProposalStatus("Suggestion stale");
        } else {
          logClient("apply.error", {
            message: error instanceof Error ? error.message : "Unknown apply error"
          });
          setPendingSuggestions((current) =>
            current.map((item) =>
              item.suggestion.id === suggestionId
                ? { ...item, validationStatus: "valid", validationMessage: "Valid Mermaid" }
                : item
            )
          );
          setProposalStatus("Apply failed");
        }
      }
    },
    [addRailEvents, documentRef, markSuggestionsStaleAgainst, sessionIdRef]
  );

  const handleRejectSuggestion = useCallback((suggestionId: string) => {
    setPendingSuggestions((current) => current.filter((item) => item.suggestion.id !== suggestionId));
    setProposalStatus("Suggestion rejected");
  }, []);

  const status = speech.error ?? (!speech.isSupported ? "Speech unavailable" : speech.isRecording ? "Recording" : "Ready");

  return (
    <div className="hive-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>Hive Mind</h1>
            <p>{analysisStatus}</p>
          </div>
        </div>
        <div className="topbar-meta">
          <span>{document.diagramType}</span>
          <span>Mermaid</span>
        </div>
      </header>

      <main className="workspace-layout">
        <DiagramPreview document={document} status={proposalStatus} onRenderedSvgChange={setLatestSvg} />
        <SuggestionsRail
          railEvents={railEvents}
          segments={speech.segments}
          interimSegment={speech.interimSegment}
          formingIntent={formingIntent}
          suggestions={pendingSuggestions}
          onAccept={handleAcceptSuggestion}
          onReject={handleRejectSuggestion}
        />
      </main>

      <RecordDock
        isRecording={speech.isRecording}
        isSupported={speech.isSupported}
        status={status}
        onToggleRecording={handleToggleRecording}
        onDownloadMermaid={handleDownloadMermaid}
        onDownloadSvg={handleDownloadSvg}
        canDownloadSvg={Boolean(latestSvg)}
      />

      <ConfirmResetDialog
        open={resetDialogOpen}
        onCancel={() => setResetDialogOpen(false)}
        onStartFresh={startFreshDictation}
        onDownloadAndStart={handleDownloadAndStart}
      />
    </div>
  );
}

function useInterval(callback: () => void, delay: number | null): void {
  const callbackRef = useLatestRef(callback);

  useEffect(() => {
    if (delay === null) {
      return undefined;
    }

    const interval = window.setInterval(() => callbackRef.current(), delay);
    return () => window.clearInterval(interval);
  }, [callbackRef, delay]);
}

function logClient(event: string, details: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info(`[hive:client] ${event}`, details);
  }
}
