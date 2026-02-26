'use client';

import { useEffect, useRef, useState } from 'react';
import { AlarmClock, MoonStar } from 'lucide-react';
import { formatCountdownMMSS } from '../../utils/time';

type SleepTimerOption = {
  id: 'off' | '30m' | '1h' | '2h';
  label: string;
  minutes: number | null;
};

const OPTIONS: SleepTimerOption[] = [
  { id: 'off', label: 'Off', minutes: null },
  { id: '30m', label: '30 min', minutes: 30 },
  { id: '1h', label: '1 hr', minutes: 60 },
  { id: '2h', label: '2 hr', minutes: 120 },
];

type Props = {
  isActive: boolean;
  isExpiredWaiting: boolean;
  remainingMs: number;
  disabled?: boolean;
  onSelectMinutes: (minutes: number | null) => void;
};

export default function SleepTimerControl({
  isActive,
  isExpiredWaiting,
  remainingMs,
  disabled = false,
  onSelectMinutes,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<SleepTimerOption['id']>('off');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocPointerDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, []);

  useEffect(() => {
    if (!isActive) {
      setSelectedPreset('off');
    }
  }, [isActive]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const stateClass = isExpiredWaiting ? 'is-expired' : isActive ? 'is-active' : 'is-off';
  const countdown = formatCountdownMMSS(remainingMs);
  const statusText = isExpiredWaiting ? 'after this track' : isActive ? countdown : 'off';

  return (
    <div className={`sleep-timer ${open ? 'is-open' : ''}`} ref={rootRef}>
      <div className="sleep-timer-alt-grid">
        <div className="sleep-alt-item">
          <button
            type="button"
            className={`sleep-alt sleep-alt-1 ${stateClass} ${disabled ? 'is-disabled' : ''}`}
            onClick={() => {
              if (disabled) return;
              setOpen((v) => !v);
            }}
            disabled={disabled}
            aria-label="Sleep timer"
            title={disabled ? 'Select and play a track first' : 'Sleep timer'}
          >
            <MoonStar size={15} strokeWidth={2.2} />
            {/* <AlarmClock size={15} strokeWidth={2.2} /> */}
            <span className="sleep-alt-sub">{statusText}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="sleep-timer-menu" role="menu" aria-label="Sleep timer options">
          <div className="sleep-timer-menu-caption">Quick presets</div>
          <div className="sleep-timer-preset-row">
            {OPTIONS.map((option) => (
              <button
                key={`preset-${option.id}`}
                type="button"
                className={`sleep-timer-preset ${selectedPreset === option.id ? 'is-selected' : ''}`}
                onClick={() => {
                  setSelectedPreset(option.id);
                  onSelectMinutes(option.minutes);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

