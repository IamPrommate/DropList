'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './settings.scss';

/** Settings UI lives in `/app` as a slide-over so playback is not interrupted. */
export default function SettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash || '#profile' : '#profile';
    router.replace(`/app?settings=1${hash}`);
  }, [router]);

  return (
    <div className="settings-page">
      <div className="settings-loading">Redirecting…</div>
    </div>
  );
}
