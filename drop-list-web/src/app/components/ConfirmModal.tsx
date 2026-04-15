'use client';

import { X } from 'lucide-react';
import Spinner from './Spinner';

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  /** When true, confirm is in flight — do not dismiss until parent clears it */
  confirmPending?: boolean;
  confirmPendingLabel?: string;
}

export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmPending = false,
  confirmPendingLabel = 'Working…',
}: ConfirmModalProps) {
  if (!open) return null;

  const busy = confirmPending;

  return (
    <div className="upgrade-modal-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="upgrade-modal-close"
          onClick={() => { if (!busy) onCancel(); }}
          disabled={busy}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="upgrade-modal-title">{title}</h2>
        <p className="upgrade-modal-reason">{message}</p>

        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn confirm-modal-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-modal-btn confirm-modal-primary"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? (
              <span className="confirm-modal-btn-busy">
                <Spinner size={16} />
                {confirmPendingLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
