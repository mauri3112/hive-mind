import { useCallback, useMemo, useRef, useState } from "react";
import { createId } from "../utils/ids";
import type { TranscriptSegment } from "../utils/transcript";

export type DictationSource = "browser" | "external";

export interface SpeechRecognitionState {
  source: DictationSource;
  setSource: (source: DictationSource) => void;
  isSupported: boolean;
  browserIsSupported: boolean;
  isRecording: boolean;
  segments: TranscriptSegment[];
  interimSegment: TranscriptSegment | null;
  externalTranscriptText: string;
  setExternalTranscriptText: (text: string) => void;
  error: string | null;
  start: () => void;
  stop: () => void;
  resetTranscript: () => void;
}

const EXTERNAL_COMMIT_DELAY_MS = 650;

export function useSpeechRecognition(): SpeechRecognitionState {
  const RecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }, []);

  const browserIsSupported = Boolean(RecognitionCtor);
  const [source, setSourceState] = useState<DictationSource>(() => (browserIsSupported ? "browser" : "external"));
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastSegmentEndRef = useRef(0);
  const externalTextRef = useRef("");
  const externalPendingTextRef = useRef("");
  const externalPendingStartRef = useRef(0);
  const externalCommitTimerRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimSegment, setInterimSegment] = useState<TranscriptSegment | null>(null);
  const [externalTranscriptText, setExternalTranscriptTextState] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSupported = source === "external" || browserIsSupported;

  const clearExternalCommitTimer = useCallback(() => {
    if (externalCommitTimerRef.current === null) {
      return;
    }

    window.clearTimeout(externalCommitTimerRef.current);
    externalCommitTimerRef.current = null;
  }, []);

  const appendFinalSegment = useCallback((text: string, idPrefix = "speech") => {
    const normalizedText = text.replace(/\s+/g, " ").trim();

    if (!normalizedText) {
      return;
    }

    const now = Math.max(0, performance.now() - startedAtRef.current);
    const segment: TranscriptSegment = {
      id: createId(idPrefix),
      text: normalizedText,
      isFinal: true,
      startMs: lastSegmentEndRef.current,
      endMs: Math.max(now, lastSegmentEndRef.current + 1)
    };

    lastSegmentEndRef.current = segment.endMs;
    setSegments((current) => [...current, segment]);
    setInterimSegment(null);
  }, []);

  const commitExternalPendingText = useCallback(() => {
    const text = externalPendingTextRef.current.replace(/\s+/g, " ").trim();

    clearExternalCommitTimer();
    externalPendingTextRef.current = "";
    externalPendingStartRef.current = lastSegmentEndRef.current;

    if (text) {
      appendFinalSegment(text, "external");
    } else {
      setInterimSegment(null);
    }
  }, [appendFinalSegment, clearExternalCommitTimer]);

  const createRecognition = useCallback(() => {
    if (!RecognitionCtor) {
      return null;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      const now = Math.max(0, performance.now() - startedAtRef.current);

      appendFinalSegment(finalText);

      if (interimText) {
        setInterimSegment({
          id: "interim",
          text: interimText,
          isFinal: false,
          startMs: Math.max(lastSegmentEndRef.current, now - 1600),
          endMs: now
        });
      }
    };

    recognition.onerror = (event) => {
      setError(event.message || event.error || "Speech recognition error");
    };

    recognition.onend = () => {
      if (!recordingRef.current) {
        return;
      }

      window.setTimeout(() => {
        if (!recordingRef.current || !recognitionRef.current) {
          return;
        }

        try {
          recognitionRef.current.start();
        } catch {
          setError("Speech recognition could not restart.");
        }
      }, 180);
    };

    return recognition;
  }, [RecognitionCtor, appendFinalSegment]);

  const setSource = useCallback(
    (nextSource: DictationSource) => {
      if (nextSource === "browser" && !browserIsSupported) {
        setError("Speech recognition is not available in this browser.");
        return;
      }

      if (recordingRef.current) {
        recordingRef.current = false;
        setIsRecording(false);
        setInterimSegment(null);

        try {
          recognitionRef.current?.stop();
        } catch {
          recognitionRef.current?.abort();
        }
      }

      recognitionRef.current = null;
      externalPendingTextRef.current = "";
      externalPendingStartRef.current = lastSegmentEndRef.current;
      clearExternalCommitTimer();
      setError(null);
      setSourceState(nextSource);
    },
    [browserIsSupported, clearExternalCommitTimer]
  );

  const setExternalTranscriptText = useCallback(
    (nextText: string) => {
      const previousText = externalTextRef.current;
      externalTextRef.current = nextText;
      setExternalTranscriptTextState(nextText);

      if (!recordingRef.current || source !== "external") {
        return;
      }

      if (!nextText.startsWith(previousText)) {
        externalPendingTextRef.current = "";
        externalPendingStartRef.current = lastSegmentEndRef.current;
        clearExternalCommitTimer();
        setInterimSegment(null);
        return;
      }

      const addedText = nextText.slice(previousText.length);

      if (!addedText) {
        return;
      }

      if (!externalPendingTextRef.current.trim()) {
        externalPendingStartRef.current = lastSegmentEndRef.current;
      }

      externalPendingTextRef.current = `${externalPendingTextRef.current}${addedText}`;
      const pendingText = externalPendingTextRef.current.replace(/\s+/g, " ").trim();

      if (!pendingText) {
        return;
      }

      const now = Math.max(0, performance.now() - startedAtRef.current);
      setInterimSegment({
        id: "interim",
        text: pendingText,
        isFinal: false,
        startMs: externalPendingStartRef.current,
        endMs: now
      });

      clearExternalCommitTimer();

      const shouldCommitSoon = /[\n.!?;:]$/.test(nextText.trim());
      externalCommitTimerRef.current = window.setTimeout(
        commitExternalPendingText,
        shouldCommitSoon ? 80 : EXTERNAL_COMMIT_DELAY_MS
      );
    },
    [clearExternalCommitTimer, commitExternalPendingText, source]
  );

  const start = useCallback(() => {
    if (source === "browser" && !RecognitionCtor) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    if (recordingRef.current) {
      return;
    }

    recordingRef.current = true;
    startedAtRef.current = performance.now();
    lastSegmentEndRef.current = 0;
    setError(null);
    setIsRecording(true);

    if (source === "external") {
      return;
    }

    const recognition = createRecognition();

    if (!recognition) {
      recordingRef.current = false;
      setIsRecording(false);
      setError("Speech recognition is not available in this browser.");
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recordingRef.current = false;
      setIsRecording(false);
      setError("Speech recognition could not start.");
    }
  }, [RecognitionCtor, createRecognition, source]);

  const stop = useCallback(() => {
    if (recordingRef.current && source === "external") {
      commitExternalPendingText();
    }

    recordingRef.current = false;
    setIsRecording(false);
    setInterimSegment(null);

    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
    }
  }, [commitExternalPendingText, source]);

  const resetTranscript = useCallback(() => {
    clearExternalCommitTimer();
    externalTextRef.current = "";
    externalPendingTextRef.current = "";
    externalPendingStartRef.current = 0;
    setSegments([]);
    setInterimSegment(null);
    setExternalTranscriptTextState("");
    lastSegmentEndRef.current = 0;
  }, [clearExternalCommitTimer]);

  return {
    source,
    setSource,
    isSupported,
    browserIsSupported,
    isRecording,
    segments,
    interimSegment,
    externalTranscriptText,
    setExternalTranscriptText,
    error,
    start,
    stop,
    resetTranscript
  };
}
