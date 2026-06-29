interface ConfirmResetDialogProps {
  open: boolean;
  onCancel: () => void;
  onStartFresh: () => void;
  onDownloadAndStart: () => void;
}

export function ConfirmResetDialog({ open, onCancel, onStartFresh, onDownloadAndStart }: ConfirmResetDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Start new dictation?</h2>
        <p>The current diagram, suggestions, and dictation will be cleared.</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="secondary-button" onClick={onStartFresh}>
            Start fresh
          </button>
          <button type="button" className="primary-button" onClick={onDownloadAndStart}>
            Download .mmd first
          </button>
        </div>
      </div>
    </div>
  );
}
