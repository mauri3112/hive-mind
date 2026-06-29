import { FileCode2, ImageDown, Keyboard, Mic, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DictationSource } from "../hooks/useSpeechRecognition";
import { Waveform } from "./Waveform";

interface RecordDockProps {
  source: DictationSource;
  browserIsSupported: boolean;
  isRecording: boolean;
  isSupported: boolean;
  status: string;
  externalTranscriptText: string;
  onExternalTranscriptChange: (text: string) => void;
  onSourceChange: (source: DictationSource) => void;
  onToggleRecording: () => void;
  onDownloadMermaid: () => void;
  onDownloadSvg: () => void;
  canDownloadSvg: boolean;
}

export function RecordDock({
  source,
  browserIsSupported,
  isRecording,
  isSupported,
  status,
  externalTranscriptText,
  onExternalTranscriptChange,
  onSourceChange,
  onToggleRecording,
  onDownloadMermaid,
  onDownloadSvg,
  canDownloadSvg
}: RecordDockProps) {
  const externalInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (source !== "external" || !isRecording) {
      return;
    }

    window.setTimeout(() => externalInputRef.current?.focus(), 0);
  }, [isRecording, source]);

  return (
    <footer className="record-dock" aria-label="Recording controls">
      <div className="dock-export-group">
        <button
          className="dock-icon-button"
          type="button"
          onClick={onDownloadMermaid}
          title="Download Mermaid"
          aria-label="Download Mermaid"
        >
          <FileCode2 size={18} />
        </button>
        <button
          className="dock-icon-button"
          type="button"
          onClick={onDownloadSvg}
          disabled={!canDownloadSvg}
          title="Download SVG"
          aria-label="Download SVG"
        >
          <ImageDown size={18} />
        </button>
      </div>
      <div className="record-core">
        <Waveform active={isRecording} />
        <button
          className={isRecording ? "record-button recording" : "record-button"}
          type="button"
          onClick={onToggleRecording}
          disabled={!isSupported}
          title={isRecording ? "Stop recording" : "Start recording"}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? <Square size={24} fill="currentColor" /> : source === "external" ? <Keyboard size={28} /> : <Mic size={28} />}
        </button>
        <span className="record-status">{status}</span>
      </div>
      <div className="dock-source-panel">
        <div className="dictation-source-switch" role="group" aria-label="Dictation source">
          <button
            className={source === "browser" ? "source-toggle-button active" : "source-toggle-button"}
            type="button"
            onClick={() => onSourceChange("browser")}
            disabled={!browserIsSupported}
            title="Browser speech"
            aria-label="Browser speech"
            aria-pressed={source === "browser"}
          >
            <Mic size={17} />
          </button>
          <button
            className={source === "external" ? "source-toggle-button active" : "source-toggle-button"}
            type="button"
            onClick={() => onSourceChange("external")}
            title="External dictation"
            aria-label="External dictation"
            aria-pressed={source === "external"}
          >
            <Keyboard size={17} />
          </button>
        </div>
        {source === "external" ? (
          <textarea
            ref={externalInputRef}
            className="external-dictation-input"
            value={externalTranscriptText}
            onChange={(event) => onExternalTranscriptChange(event.currentTarget.value)}
            placeholder="TypeWhisper transcript"
            aria-label="External dictation input"
            rows={2}
            spellCheck={false}
          />
        ) : null}
      </div>
    </footer>
  );
}
