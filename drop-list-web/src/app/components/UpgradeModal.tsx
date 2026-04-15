'use client';

import { useState } from 'react';
import { X, Zap, Shuffle, Image, Timer, Keyboard, BarChart3, Infinity, SlidersHorizontal } from 'lucide-react';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: 'daily-limit' | 'track-select' | 'feature';
  remainingPlays?: number;
}

const PRO_FEATURES = [
  { icon: Infinity, label: 'Unlimited plays per day' },
  { icon: SlidersHorizontal, label: 'Seek / skip inside a track' },
  { icon: Shuffle, label: 'Pick any track directly' },
  { icon: Shuffle, label: 'Shuffle & Repeat controls' },
  { icon: Image, label: 'Album covers' },
  { icon: Timer, label: 'Sleep timer' },
  { icon: Keyboard, label: 'Keyboard shortcuts' },
  { icon: BarChart3, label: 'Play statistics' },
];

const REASON_MESSAGES: Record<string, string> = {
  'daily-limit': "You've reached your daily limit of 10 plays.",
  'track-select': 'Track selection is a Pro feature. Free users listen in shuffle mode.',
  'feature': 'This feature is available with DropList Pro.',
};

export default function UpgradeModal({ open, onClose, reason, remainingPlays }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      console.error('Failed to create checkout session');
    } finally {
      setLoading(false);
    }
  };

  const message = reason ? REASON_MESSAGES[reason] : REASON_MESSAGES['feature'];

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className="upgrade-modal-icon">
          <Zap size={32} />
        </div>

        <h2 className="upgrade-modal-title">Upgrade to Pro</h2>

        <p className="upgrade-modal-reason">{message}</p>

        {reason === 'daily-limit' && remainingPlays !== undefined && (
          <p className="upgrade-modal-count">
            {remainingPlays} of 10 plays remaining today
          </p>
        )}

        <div className="upgrade-modal-features">
          {PRO_FEATURES.map((feat) => (
            <div key={feat.label} className="upgrade-modal-feature">
              <feat.icon size={16} />
              <span>{feat.label}</span>
            </div>
          ))}
        </div>

        <button
          className="upgrade-modal-cta"
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? 'Redirecting...' : 'Get Pro — $2.99/month'}
        </button>

        <p className="upgrade-modal-note">Cancel anytime. No commitment.</p>
      </div>
    </div>
  );
}
