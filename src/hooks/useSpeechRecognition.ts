import { useCallback, useMemo, useRef, useState } from "react";
import { createId } from "../utils/ids";
import type { TranscriptSegment } from "../utils/transcript";

export interface SpeechRecognitionState {
  isSupported: boolean;
  isRecording: boolean;
  segments: TranscriptSegment[];
  interimSegment: TranscriptSegment | null;
  error: string | null;
  start: () => void;
  stop: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(): SpeechRecognitionState {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastSegmentEndRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimSegment, setInterimSegment] = useState<TranscriptSegment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const RecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return window.SpeechRecognition ?? window.webkitSpeechRecognition;
  }, []);

  const isSupported = Boolean(RecognitionCtor);

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

      if (finalText) {
        const segment: TranscriptSegment = {
          id: createId("speech"),
          text: finalText,
          isFinal: true,
          startMs: lastSegmentEndRef.current,
          endMs: Math.max(now, lastSegmentEndRef.current + 1)
        };
        lastSegmentEndRef.current = segment.endMs;
        setSegments((current) => [...current, segment]);
        setInterimSegment(null);
      }

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
  }, [RecognitionCtor]);

  const start = useCallback(() => {
    if (!RecognitionCtor) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    if (recordingRef.current) {
      return;
    }

    const recognition = createRecognition();

    if (!recognition) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    recognitionRef.current = recognition;
    recordingRef.current = true;
    startedAtRef.current = performance.now();
    lastSegmentEndRef.current = 0;
    setError(null);
    setIsRecording(true);

    try {
      recognition.start();
    } catch {
      recordingRef.current = false;
      setIsRecording(false);
      setError("Speech recognition could not start.");
    }
  }, [RecognitionCtor, createRecognition]);

  const stop = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);
    setInterimSegment(null);

    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setSegments([]);
    setInterimSegment(null);
    lastSegmentEndRef.current = 0;
  }, []);

  return {
    isSupported,
    isRecording,
    segments,
    interimSegment,
    error,
    start,
    stop,
    resetTranscript
  };
}
