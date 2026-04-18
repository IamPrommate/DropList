'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Shuffle,
  Image,
  Keyboard,
  BarChart3,
  Infinity,
  SlidersHorizontal,
  Library,
} from 'lucide-react';
import { snoozeUpgradeEntryModalForToday } from '../lib/upgradeEntrySnooze';

export type UpgradeModalReason = 'daily-limit' | 'track-select' | 'feature' | 'entry';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: UpgradeModalReason;
  remainingPlays?: number;
  /** Entry promo: allow “don’t show again today” (snoozes until next local calendar day). */
  allowDismissUntilTomorrow?: boolean;
}

/** Shared with marketing landing page */
export const PRO_FEATURES = [
  { icon: Infinity, label: 'Unlimited plays' },
  { icon: Library, label: 'Save 5–8 playlists' },
  { icon: SlidersHorizontal, label: 'Seek inside tracks' },
  { icon: Shuffle, label: 'Pick any track directly' },
  { icon: Shuffle, label: 'Shuffle & Repeat' },
  { icon: Image, label: 'Edit album covers' },
  { icon: Keyboard, label: 'Keyboard shortcuts' },
  { icon: BarChart3, label: 'Play statistics' },
];

const REASON_MESSAGES: Record<UpgradeModalReason, string> = {
  'daily-limit': "You've reached your daily limit of 10 plays.",
  'track-select': 'Track selection is a Pro feature. Free users listen in shuffle mode.',
  'feature': 'This feature is available with DropList Pro.',
  'entry':
    'You’re on the Free plan. Upgrade to unlock the full player—unlimited plays, pick any track, seek, and more.',
};

export default function UpgradeModal({
  open,
  onClose,
  reason,
  remainingPlays,
  allowDismissUntilTomorrow = false,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [dismissToday, setDismissToday] = useState(false);

  useEffect(() => {
    if (open) setDismissToday(false);
  }, [open]);

  if (!open) return null;

  const closeAndMaybeSnooze = () => {
    if (allowDismissUntilTomorrow && dismissToday) {
      snoozeUpgradeEntryModalForToday();
    }
    onClose();
  };

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
    <div className="upgrade-modal-overlay" onClick={closeAndMaybeSnooze}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-modal-close" onClick={closeAndMaybeSnooze} aria-label="Close">
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

        {allowDismissUntilTomorrow && (
          <label className="upgrade-modal-dismiss-row">
            <input
              type="checkbox"
              checked={dismissToday}
              onChange={(e) => setDismissToday(e.target.checked)}
            />
            <span>Don&apos;t show this again today</span>
          </label>
        )}

        <p className="upgrade-modal-note">Cancel anytime. No commitment.</p>
      </div>
    </div>
  );
}
