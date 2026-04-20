'use client';

import { useId } from 'react';

const FONT_STACK = "'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Match `layout.scss` :root (and album-driven overrides on `documentElement`). */
const G = {
  start: 'var(--primary-gradient-start)',
  middle: 'var(--primary-gradient-middle)',
  end: 'var(--primary-gradient-end)',
  text: 'var(--text-primary)',
} as const;

/** ViewBox height — room for wordmark + descenders (“p” in Drop). */
const VB_H = 88;

/** Wordmark metrics in viewBox units (icon scale unchanged). */
const TEXT_Y = 60;
const FONT_SIZE = 50;
const LETTER_SPACING = -1.25;
const DROP_X = 104;
const LIST_X = 220;
/** Approximate right edge of “List” glyphs; PRO starts after this + gap. */
const LIST_RIGHT_APPROX = LIST_X + 96;
const PRO_GAP_AFTER_LIST = 8;

export interface DropListLogoProps {
  className?: string;
  height?: number;
  isPro?: boolean;
}

/**
 * “List” is drawn as a gradient-filled rect clipped to text — not fill=url() on &lt;text&gt;,
 * which WebKit often renders as a flat dark color.
 */
export default function DropListLogo({ className, height = 40, isPro = false }: DropListLogoProps) {
  const rawId = useId().replace(/:/g, '');
  const barGradId = `dl-bar-${rawId}`;
  /** Horizontal sweep across the “List” glyphs (user space). */
  const textGradId = `dl-text-${rawId}`;
  /** Full left→right brand sweep on the PRO pill’s own bbox (not a slice of the word gradient). */
  const proGradId = `dl-pro-${rawId}`;
  const proBloomId = `dl-pro-bloom-${rawId}`;
  const clipListId = `dl-clip-list-${rawId}`;

  /** ~width of “List” at FONT_SIZE — keeps 0/50/100% stops aligned like the original wordmark. */
  const listGradX1 = LIST_X - 2;
  const listGradX2 = LIST_X + 88;

  const proBadgeX = LIST_RIGHT_APPROX + PRO_GAP_AFTER_LIST;

  /** PRO pill — taller + glow so it matches CSS `.pro-badge` next to the ~50px wordmark. */
  const proW = 64;
  const proH = 30;
  const proFont = 15;
  /** Vertical position of PRO pill (viewBox coords); nudged down vs cap-center so it doesn’t sit too high. */
  const proTranslateY = TEXT_Y - FONT_SIZE * 0.32 - proH / 2;

  /** Wide enough for gradient clip rect + PRO pill + glow. */
  const viewW = isPro ? proBadgeX + proW + 20 : 396;
  const w = (height / VB_H) * viewW;

  const textProps = {
    y: TEXT_Y,
    fontFamily: FONT_STACK,
    fontSize: FONT_SIZE,
    fontWeight: '800' as const,
    letterSpacing: LETTER_SPACING,
  };

  return (
    <span
      className={['droplist-logo', className].filter(Boolean).join(' ')}
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}
    >
      <svg
        className="droplist-logo__svg"
        width={w}
        height={height}
        viewBox={`0 0 ${viewW} ${VB_H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={isPro ? 'DropList Pro' : 'DropList'}
      >
        <defs>
          {/* Same three stops as “List” / PRO — top → bottom = start → middle → end */}
          <linearGradient id={barGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={G.start} />
            <stop offset="50%" stopColor={G.middle} />
            <stop offset="100%" stopColor={G.end} />
          </linearGradient>
          <linearGradient
            id={textGradId}
            gradientUnits="userSpaceOnUse"
            x1={listGradX1}
            y1={40}
            x2={listGradX2}
            y2={40}
          >
            <stop offset="0%" stopColor={G.start} />
            <stop offset="50%" stopColor={G.middle} />
            <stop offset="100%" stopColor={G.end} />
          </linearGradient>
          <linearGradient id={proGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={G.start} />
            <stop offset="50%" stopColor={G.middle} />
            <stop offset="100%" stopColor={G.end} />
          </linearGradient>
          <filter
            id={proBloomId}
            x="-85%"
            y="-85%"
            width="270%"
            height="270%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={G.end} floodOpacity="0.2" result="bloomB" />
            <feDropShadow
              in="SourceGraphic"
              dx="0"
              dy="0"
              stdDeviation="2.2"
              floodColor={G.start}
              floodOpacity="0.28"
              result="bloomP"
            />
            <feMerge>
              <feMergeNode in="bloomB" />
              <feMergeNode in="bloomP" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={clipListId} clipPathUnits="userSpaceOnUse">
            <text {...textProps} x={LIST_X}>
              List
            </text>
          </clipPath>
        </defs>
        <rect x="8" y="34" width="10" height="20" rx="5" fill={`url(#${barGradId})`} opacity="0.45" />
        <rect x="22" y="22" width="10" height="44" rx="5" fill={`url(#${barGradId})`} opacity="0.65" />
        <rect x="36" y="28" width="10" height="32" rx="5" fill={`url(#${barGradId})`} opacity="0.85" />
        <rect x="50" y="14" width="10" height="60" rx="5" fill={`url(#${barGradId})`} />
        <rect x="64" y="26" width="10" height="36" rx="5" fill={`url(#${barGradId})`} opacity="0.7" />
        <rect x="78" y="36" width="10" height="16" rx="5" fill={`url(#${barGradId})`} opacity="0.45" />
        <text {...textProps} x={DROP_X} fill={G.text}>
          Drop
        </text>
        <rect
          x={listGradX1 - 6}
          y={10}
          width={listGradX2 - listGradX1 + 24}
          height={72}
          fill={`url(#${textGradId})`}
          clipPath={`url(#${clipListId})`}
        />
        {isPro ? (
          <g transform={`translate(${proBadgeX}, ${proTranslateY})`} aria-hidden>
            <g filter={`url(#${proBloomId})`}>
              <rect x="0" y="0" width={proW} height={proH} rx={proH / 2} ry={proH / 2} fill={`url(#${proGradId})`} />
            </g>
            <text
              x={proW / 2}
              y={proH * 0.64}
              textAnchor="middle"
              fontFamily={FONT_STACK}
              fontSize={proFont}
              fontWeight="800"
              letterSpacing="0.12em"
              fill={G.text}
            >
              PRO
            </text>
          </g>
        ) : null}
      </svg>
    </span>
  );
}
