import { FileCode2, ImageDown, Mic, Square } from "lucide-react";
import { Waveform } from "./Waveform";

interface RecordDockProps {
  isRecording: boolean;
  isSupported: boolean;
  status: string;
  onToggleRecording: () => void;
  onDownloadMermaid: () => void;
  onDownloadSvg: () => void;
  canDownloadSvg: boolean;
}

export function RecordDock({
  isRecording,
  isSupported,
  status,
  onToggleRecording,
  onDownloadMermaid,
  onDownloadSvg,
  canDownloadSvg
}: RecordDockProps) {
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
          {isRecording ? <Square size={24} fill="currentColor" /> : <Mic size={28} />}
        </button>
        <span className="record-status">{status}</span>
      </div>
      <div className="dock-spacer" />
    </footer>
  );
}
