import Spinner from '@/app/components/Spinner';

export default function Loading() {
  return (
    <div className="app-route-loading" role="status" aria-live="polite" aria-busy="true">
      <Spinner size={36} />
      <span className="app-route-loading-text">Loading…</span>
    </div>
  );
}
