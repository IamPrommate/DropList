'use client';

import { X } from 'lucide-react';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}

export default function AlertModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'OK',
}: AlertModalProps) {
  if (!open) return null;

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="upgrade-modal-title">{title}</h2>
        <p className="upgrade-modal-reason">{message}</p>

        <div className="confirm-modal-actions confirm-modal-actions-single">
          <button type="button" className="confirm-modal-btn confirm-modal-primary" onClick={onClose}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
