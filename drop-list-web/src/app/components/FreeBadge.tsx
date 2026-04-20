'use client';

import clsx from 'clsx';

export type FreeBadgeSize = 'xs' | 'md' | 'lg' | 'xl' | '2xl';

export interface FreeBadgeProps {
  size?: FreeBadgeSize;
  className?: string;
}

/**
 * Single “FREE” pill treatment app-wide (muted glass), matching {@link ProBadge} sizing.
 * Styles: `layout.scss` (`.free-badge`, `.free-badge--{size}`).
 */
export default function FreeBadge({ size = 'md', className }: FreeBadgeProps) {
  return (
    <span className={clsx('free-badge', `free-badge--${size}`, className)}>
      Free
    </span>
  );
}
