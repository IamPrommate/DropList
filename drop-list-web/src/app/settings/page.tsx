'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoadingLink } from '../components/NavigationLoading';
import Spinner from '../components/Spinner';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { ArrowLeft, User, CreditCard, Zap, Copy, Check } from 'lucide-react';
import { DISPLAY_NAME_MAX_LENGTH } from '../lib/displayNameLimits';
import '../layout.scss';
import './settings.scss';

dayjs.extend(utc);

function wholeDaysLeft(unixEnd: number): number {
  const end = dayjs.unix(unixEnd).utc();
  const now = dayjs().utc();
  return Math.max(0, Math.ceil(end.diff(now, 'day', true)));
}

function formatRegisteredSince(iso: string | null): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('MMMM D, YYYY') : '—';
}

function tierLabel(plan: 'free' | 'pro'): string {
  return plan === 'pro' ? 'Pro' : 'Free';
}

/** Multicolor Google “G” for sign-in row */
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

type ProfileMeta = {
  createdAt: string | null;
  plan: 'free' | 'pro';
};

type SectionId = 'profile' | 'subscription';

type SubscriptionPayload = {
  plan: 'free' | 'pro';
  subscription: {
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
  billingError?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [activeSection, setActiveSection] = useState<SectionId>('profile');
  const [profileEditing, setProfileEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [subData, setSubData] = useState<SubscriptionPayload | null>(null);
  const [profileMetaLoading, setProfileMetaLoading] = useState(false);
  const [profileMeta, setProfileMeta] = useState<ProfileMeta | null>(null);
  const [accountIdCopied, setAccountIdCopied] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (!profileEditing) {
      setName(session?.user?.name?.trim() || '');
    }
  }, [session?.user?.name, profileEditing]);

  const loadSubscription = useCallback(async () => {
    if (status !== 'authenticated') return;
    setSubLoading(true);
    setSubData(null);
    try {
      const res = await fetch('/api/user/subscription');
      const data = (await res.json()) as SubscriptionPayload & { error?: string };
      if (!res.ok) {
        setSubData({
          plan: session?.user?.plan === 'pro' ? 'pro' : 'free',
          subscription: null,
          billingError: data.error || 'Could not load billing details',
        });
        return;
      }
      setSubData(data);
    } catch {
      setSubData({
        plan: session?.user?.plan === 'pro' ? 'pro' : 'free',
        subscription: null,
        billingError: 'Could not load billing details',
      });
    } finally {
      setSubLoading(false);
    }
  }, [status, session?.user?.plan]);

  const loadProfileMeta = useCallback(async () => {
    if (status !== 'authenticated') return;
    setProfileMetaLoading(true);
    try {
      const res = await fetch('/api/user/profile');
      const data = (await res.json()) as {
        createdAt?: string | null;
        plan?: string;
        error?: string;
      };
      if (res.ok) {
        const plan = data.plan === 'pro' ? 'pro' : 'free';
        setProfileMeta({
          createdAt: data.createdAt ?? null,
          plan,
        });
      } else {
        setProfileMeta(null);
      }
    } catch {
      setProfileMeta(null);
    } finally {
      setProfileMetaLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated') {
      void loadSubscription();
      void loadProfileMeta();
    }
  }, [status, loadSubscription, loadProfileMeta]);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash.replace(/^#/, '');
    if (raw === 'profile' || raw === 'subscription') {
      setActiveSection(raw);
      requestAnimationFrame(() => {
        document.getElementById(raw)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  }, [status]);

  const handleSaveProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError('Display name cannot be empty');
      return;
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      setSaveError(`Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`);
      return;
    }
    const MIN_PROFILE_SYNC_MS = 420;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(typeof data.error === 'string' ? data.error : 'Save failed');
        return;
      }
      const syncStart = Date.now();
      await update({ name: data.name as string });
      setProfileEditing(false);
      await loadProfileMeta();
      const elapsed = Date.now() - syncStart;
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_PROFILE_SYNC_MS - elapsed)));
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch {
      setSaveError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelProfileEdit = () => {
    setName(session?.user?.name?.trim() || '');
    setSaveError(null);
    setProfileEditing(false);
  };

  const copyAccountId = async () => {
    const id = session?.user?.id;
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(id);
      setAccountIdCopied(true);
      window.setTimeout(() => setAccountIdCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url as string;
    } catch {
      console.error('Failed to open billing portal');
    }
  };

  const handleUpgrade = async () => {
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url as string;
    } catch {
      console.error('Failed to create checkout session');
    }
  };

  if (status === 'loading') {
    return (
      <div className="settings-page">
        <div className="settings-loading">Loading…</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const sessionPlan = session?.user?.plan === 'pro' ? 'pro' : 'free';
  const effectivePlan = subData?.plan ?? sessionPlan;
  const isPro = effectivePlan === 'pro';

  const effectiveProfilePlan: 'free' | 'pro' = profileMeta?.plan ?? sessionPlan;
  const registeredSinceDisplay = profileMetaLoading
    ? '…'
    : formatRegisteredSince(profileMeta?.createdAt ?? null);
  const sub = subData?.subscription;
  const daysLeft =
    sub?.currentPeriodEnd != null ? wholeDaysLeft(sub.currentPeriodEnd) : null;

  return (
    <div className="settings-page">
      <div className="settings-page-inner">
        <aside className="settings-sidebar" aria-label="Settings sections">
          <LoadingLink href="/" className="settings-back">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Back to DropList
          </LoadingLink>
          <h1 className="settings-title">Settings</h1>
          <nav className="settings-nav" role="tablist" aria-orientation="vertical">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'profile'}
              className={`settings-nav-item${activeSection === 'profile' ? ' is-active' : ''}`}
              onClick={() => scrollToSection('profile')}
            >
              <User size={17} strokeWidth={1.75} aria-hidden />
              Profile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'subscription'}
              className={`settings-nav-item${activeSection === 'subscription' ? ' is-active' : ''}`}
              onClick={() => scrollToSection('subscription')}
            >
              <CreditCard size={17} strokeWidth={1.75} aria-hidden />
              Subscription
            </button>
          </nav>
        </aside>

        <main className="settings-main">
          <section id="profile" className="settings-section" aria-labelledby="settings-profile-heading">
            {saving ? (
              <div className="settings-section-busy-overlay" aria-live="polite" aria-busy="true">
                <Spinner size={30} />
              </div>
            ) : null}
            <h2 id="settings-profile-heading" className="settings-section-title">
              Profile & Personal information
            </h2>
            <>
              <label className="settings-label" htmlFor="settings-display-name">
                Display name
              </label>
              <input
                id="settings-display-name"
                className="settings-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={!profileEditing}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                autoComplete="name"
                aria-describedby={profileEditing ? 'settings-display-name-hint' : undefined}
              />
              {profileEditing ? (
                <p
                  id="settings-display-name-hint"
                  className={`settings-char-count${name.length >= DISPLAY_NAME_MAX_LENGTH ? ' settings-char-count--limit' : ''}`}
                >
                  {name.length} / {DISPLAY_NAME_MAX_LENGTH} — maximum length for display names.
                </p>
              ) : null}
              <label className="settings-label" htmlFor="settings-email">
                Email
              </label>
              <input
                id="settings-email"
                className="settings-input"
                value={session?.user?.email ?? ''}
                readOnly
                tabIndex={-1}
                autoComplete="email"
              />
              <span className="settings-label" id="settings-tier-label">
                Tier
              </span>
              <div className="settings-tier-row" role="status" aria-labelledby="settings-tier-label">
                {profileMetaLoading ? (
                  <span className="settings-muted">…</span>
                ) : (
                  <span
                    className={`header-auth-plan-badge settings-tier-badge ${
                      effectiveProfilePlan === 'pro' ? 'header-auth-plan-badge--pro' : 'header-auth-plan-badge--free'
                    }`}
                  >
                    {tierLabel(effectiveProfilePlan)}
                  </span>
                )}
              </div>
              <span className="settings-label" id="settings-sign-in-label">
                Sign-in method
              </span>
              <div
                className="settings-sign-in-row"
                role="group"
                aria-labelledby="settings-sign-in-label"
              >
                <GoogleIcon size={22} />
                <span className="settings-sign-in-text">Google</span>
              </div>
              <label className="settings-label" htmlFor="settings-account-id">
                Account ID
              </label>
              <div className="settings-account-id-row">
                <input
                  id="settings-account-id"
                  className="settings-input settings-input--mono settings-account-id-input"
                  value={session?.user?.id ?? ''}
                  readOnly
                  tabIndex={-1}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="settings-copy-id-btn"
                  onClick={() => void copyAccountId()}
                  aria-label={accountIdCopied ? 'Copied' : 'Copy account ID'}
                  title={accountIdCopied ? 'Copied' : 'Copy'}
                >
                  {accountIdCopied ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Copy size={18} aria-hidden />}
                </button>
              </div>
              <span className="settings-copy-sr" aria-live="polite">
                {accountIdCopied ? 'Copied to clipboard' : ''}
              </span>
              <label className="settings-label" htmlFor="settings-registered-since">
                Registered since
              </label>
              <input
                id="settings-registered-since"
                className="settings-input"
                value={registeredSinceDisplay}
                readOnly
                tabIndex={-1}
              />
              {profileEditing && saveError && <p className="settings-error">{saveError}</p>}
              {!profileEditing && saveOk && (
                <p className="settings-muted" style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Saved.
                </p>
              )}
              <div className="settings-actions">
                {profileEditing ? (
                  <>
                    <button type="button" className="settings-btn-ghost" onClick={cancelProfileEdit} disabled={saving}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="settings-btn-primary"
                      onClick={() => void handleSaveProfile()}
                      disabled={
                        saving ||
                        !name.trim() ||
                        name.trim().length > DISPLAY_NAME_MAX_LENGTH
                      }
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="settings-btn-primary"
                    onClick={() => {
                      setSaveError(null);
                      setProfileEditing(true);
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </>
          </section>

          <section id="subscription" className="settings-section" aria-labelledby="settings-sub-heading">
            <h2 id="settings-sub-heading" className="settings-section-title">
              Subscription
            </h2>
            {subLoading && <p className="settings-muted">Loading…</p>}
            {!subLoading && subData?.billingError && (
              <p className="settings-warning">{subData.billingError}</p>
            )}
            {!subLoading && !isPro && (
              <>
                <p className="settings-muted">You are on the Free plan.</p>
                <button type="button" className="settings-btn-accent" onClick={() => void handleUpgrade()}>
                  <Zap size={16} strokeWidth={2} aria-hidden />
                  Upgrade to Pro
                </button>
              </>
            )}
            {!subLoading && isPro && (
              <>
                <div className="settings-row">
                  <span className="settings-badge-pro">Pro</span>
                  {sub && daysLeft !== null && (
                    <span className="settings-days">
                      {sub.cancelAtPeriodEnd
                        ? `Access ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
                        : `Renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {isPro && !sub && !subData?.billingError && (
                    <span className="settings-muted" style={{ margin: 0 }}>
                      Active subscription
                    </span>
                  )}
                </div>
                <button type="button" className="settings-btn-secondary" onClick={() => void handleManageBilling()}>
                  <CreditCard size={16} strokeWidth={1.75} aria-hidden />
                  Manage subscription
                </button>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
