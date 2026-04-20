'use client';

import clsx from 'clsx';

export type ProBadgeSize = 'xs' | 'md' | 'lg' | 'xl' | '2xl';

export interface ProBadgeProps {
  size?: ProBadgeSize;
  className?: string;
}

/**
 * Single “PRO” pill treatment app-wide: capsule, horizontal brand gradient, no icon.
 * Styles: `layout.scss` (`.pro-badge`, `.pro-badge--{size}`).
 */
export default function ProBadge({ size = 'md', className }: ProBadgeProps) {
  return (
    <span className={clsx('pro-badge', `pro-badge--${size}`, className)}>
      Pro
    </span>
  );
}
