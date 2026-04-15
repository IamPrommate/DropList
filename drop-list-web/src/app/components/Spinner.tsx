'use client';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <svg
      className={`droplist-spinner ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
