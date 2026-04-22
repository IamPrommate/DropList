'use client';

import { useCallback, useEffect, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from 'next-auth';
import Spinner from './Spinner';
import ProBadge from './ProBadge';
import FreeBadge from './FreeBadge';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  X,
  User,
  CreditCard,
  Zap,
  Copy,
  Check,
  Trophy,
  Mail,
  FolderOpen,
  ExternalLink,
  Share2,
  Link2,
  Eye,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Trash2,
  FolderInput,
  UserMinus,
} from 'lucide-react';
import { isProLevelRank, PRO_LEVEL_DISPLAY, PRO_LEVEL_RANKS, type ProLevelRank } from '../lib/proLevels';
import { DISPLAY_NAME_MAX_LENGTH } from '../lib/displayNameLimits';
import { UserPlan, parseUserPlan } from '../lib/userPlan';
import type { SettingsProfileMeta, SettingsSubscriptionPayload } from '../lib/settingsTypes';
import { buildSupportMailto } from '../lib/supportMailto';
import {
  DRIVE_PERMISSION_BREAKS,
  DRIVE_SHARE_STEPS,
  GOOGLE_DRIVE_WEB_URL,
} from '../lib/driveSharingHelp';
import '../layout.scss';
import '../settings/settings.scss';

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

function formatListenTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}

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

export type SectionId = 'profile' | 'ranks' | 'subscription' | 'drive-help' | 'customer-support';

export type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  session: Session;
  profileMeta: SettingsProfileMeta | null;
  profileMetaLoading: boolean;
  subData: SettingsSubscriptionPayload | null;
  subLoading: boolean;
  onNameSaved: (name: string) => void | Promise<void>;
  onRefreshProfile: () => void | Promise<void>;
};

function SettingsPanel({
  open,
  onClose,
  session,
  profileMeta,
  profileMetaLoading,
  subData,
  subLoading,
  onNameSaved,
  onRefreshProfile,
}: SettingsPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('profile');
  const [profileEditing, setProfileEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [accountIdCopied, setAccountIdCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profileEditing) {
      setName(session?.user?.name?.trim() || '');
    }
  }, [session?.user?.name, profileEditing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
    if (
      raw === 'profile' ||
      raw === 'ranks' ||
      raw === 'subscription' ||
      raw === 'drive-help' ||
      raw === 'customer-support'
    ) {
      setActiveSection(raw);
      requestAnimationFrame(() => {
        document.getElementById(raw)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    } else {
      setActiveSection('profile');
    }
  }, [open]);

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
      const savedName = data.name as string;
      await Promise.resolve(onNameSaved(savedName));
      setProfileEditing(false);
      void onRefreshProfile();
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2500);
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

  if (!open || !mounted || typeof document === 'undefined') {
    return null;
  }

  const sessionPlan = parseUserPlan(session?.user?.plan);
  const effectivePlan = parseUserPlan(subData?.plan ?? sessionPlan);
  const isPro = effectivePlan === UserPlan.Pro;

  const effectiveProfilePlan: UserPlan = profileMeta?.plan ?? sessionPlan;
  const registeredSinceDisplay = profileMetaLoading
    ? '…'
    : formatRegisteredSince(profileMeta?.createdAt ?? null);
  const sub = subData?.subscription;
  const daysLeft = sub?.currentPeriodEnd != null ? wholeDaysLeft(sub.currentPeriodEnd) : null;

  const drawer = (
    <div className="settings-modal-root is-open" role="presentation">
      <button
        type="button"
        className="settings-modal-overlay"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-header">
          <h1 id="settings-modal-title" className="settings-title settings-modal-title">
            Settings
          </h1>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            <X size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="settings-page-inner settings-page-inner--modal">
          <aside className="settings-sidebar" aria-label="Settings sections">
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
                aria-selected={activeSection === 'ranks'}
                className={`settings-nav-item${activeSection === 'ranks' ? ' is-active' : ''}`}
                onClick={() => scrollToSection('ranks')}
              >
                <Trophy size={17} strokeWidth={1.75} aria-hidden />
                Ranks
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
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'drive-help'}
                className={`settings-nav-item${activeSection === 'drive-help' ? ' is-active' : ''}`}
                onClick={() => scrollToSection('drive-help')}
              >
                <FolderOpen size={17} strokeWidth={1.75} aria-hidden />
                Drive folder requirements
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === 'customer-support'}
                className={`settings-nav-item${activeSection === 'customer-support' ? ' is-active' : ''}`}
                onClick={() => scrollToSection('customer-support')}
              >
                <Mail size={17} strokeWidth={1.75} aria-hidden />
                Customer support
              </button>
            </nav>
          </aside>

          <main className="settings-main settings-main--modal">
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
                  onKeyDown={(e) => {
                    if (!profileEditing || e.key !== 'Enter') return;
                    e.preventDefault();
                    void handleSaveProfile();
                  }}
                  readOnly={!profileEditing}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  autoComplete="name"
                  spellCheck={false}
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
                <span className="settings-label" id="settings-tier-label">
                  Tier
                </span>
                <div className="settings-tier-row" role="status" aria-labelledby="settings-tier-label">
                  {profileMetaLoading ? (
                    <span className="settings-muted">…</span>
                  ) : effectiveProfilePlan === UserPlan.Pro ? (
                    <ProBadge size="md" className="settings-tier-badge" />
                  ) : (
                    <FreeBadge size="md" className="settings-tier-badge" />
                  )}
                </div>
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
                    {accountIdCopied ? (
                      <Check size={18} strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Copy size={18} strokeWidth={2.5} aria-hidden />
                    )}
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
                          saving || !name.trim() || name.trim().length > DISPLAY_NAME_MAX_LENGTH
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

            <section id="ranks" className="settings-section ranks-section" aria-labelledby="settings-ranks-heading">
              <h2 id="settings-ranks-heading" className="settings-section-title">
                Listening Rank
              </h2>
              {profileMetaLoading ? (
                <p className="settings-muted">Loading…</p>
              ) : (
                <>
                  <div className="ranks-roadmap" role="list" aria-label="Listening rank tiers">
                    <div className="ranks-roadmap-track" aria-hidden />
                    {PRO_LEVEL_RANKS.map((rank) => {
                      const tier = PRO_LEVEL_DISPLAY[rank];
                      const cr = profileMeta?.proLevel;
                      const hasRank = cr != null && isProLevelRank(cr);
                      const isCurrent = hasRank && cr === rank;
                      const isPassed = hasRank && cr != null && rank < cr;
                      const isFuture = hasRank && cr != null && rank > cr;
                      const playlists = rank >= 7 ? 8 : rank >= 4 ? 6 : 5;
                      const isMilestone = rank === 4 || rank === 7;
                      const nodeClass = [
                        'ranks-roadmap-node',
                        isMilestone ? 'is-milestone' : '',
                        isCurrent ? 'is-current' : '',
                        isPassed ? 'is-passed' : '',
                        isFuture ? 'is-future' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <div
                          key={rank}
                          role="listitem"
                          className={nodeClass}
                          title={`${tier.name} — ${tier.hours}h listening`}
                        >
                          <div
                            className="ranks-roadmap-dot"
                            style={{
                              background: tier.colorVar,
                              boxShadow: `0 0 12px ${tier.colorVar}55`,
                            }}
                          />
                          <div className="ranks-roadmap-label">
                            <span className="ranks-roadmap-name" style={{ color: tier.colorVar }}>
                              {tier.name}
                            </span>
                            <span className="ranks-roadmap-hours">{tier.hours}h</span>
                          </div>
                          {isMilestone && (
                            <div className="ranks-roadmap-perks">
                              <div className="ranks-roadmap-perk">{playlists} playlists</div>
                              {rank === 7 && (
                                <div className="ranks-roadmap-perk ranks-roadmap-perk--emerald">
                                  Feature request
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="ranks-your-card">
                    <div className="ranks-your-card-header">
                      <span className="ranks-your-card-label">Your Rank</span>
                      {profileMeta?.proLevel != null && isProLevelRank(profileMeta.proLevel) ? (
                        <span
                          className={`ranks-your-card-badge ranks-catalog-card--${PRO_LEVEL_DISPLAY[profileMeta.proLevel as ProLevelRank].name.toLowerCase()}`}
                        >
                          {PRO_LEVEL_DISPLAY[profileMeta.proLevel as ProLevelRank].name}
                        </span>
                      ) : (
                        <span className="ranks-your-card-badge ranks-your-card-badge--none">—</span>
                      )}
                    </div>

                    <div className="ranks-progress-block">
                      {(() => {
                        const hours = (profileMeta?.totalListenSeconds ?? 0) / 3600;
                        const pct =
                          profileMeta?.listenProgressPct != null
                            ? Math.min(100, Math.max(0, profileMeta.listenProgressPct))
                            : 0;
                        const nextName = profileMeta?.nextProLevelName;
                        const hi = profileMeta?.nextProLevelListenHours;
                        const hasStoredRank =
                          profileMeta?.proLevel != null && isProLevelRank(profileMeta.proLevel);
                        const progressPaused =
                          effectiveProfilePlan === UserPlan.Free && hasStoredRank;
                        const progressTitle =
                          nextName != null
                            ? `Progress toward ${nextName}`
                            : hasStoredRank
                              ? 'Max rank reached'
                              : 'All milestones reached';
                        const fractionLabel =
                          hi != null ? `${hours.toFixed(1)}h / ${hi}h` : `${hours.toFixed(1)}h`;
                        const barLabel = progressPaused
                          ? nextName != null
                            ? `Listening progress toward ${nextName} — paused (not on Pro)`
                            : 'Listening progress — paused while not on Pro'
                          : nextName != null
                            ? `Listening progress toward ${nextName}`
                            : 'Listening progress complete';
                        return (
                          <>
                            <div className="ranks-progress-head">
                              <span className="ranks-progress-title">{progressTitle}</span>
                              <span className="ranks-progress-fraction">{fractionLabel}</span>
                            </div>
                            <div
                              className="ranks-progress-bar"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(pct)}
                              aria-label={barLabel}
                            >
                              <div
                                className={`ranks-progress-fill${progressPaused ? ' ranks-progress-fill--inactive' : ''}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="ranks-footer-stats">
                      <div className="ranks-footer-stat">
                        <span className="ranks-footer-value">
                          {formatListenTime(profileMeta?.totalListenSeconds ?? 0)}
                        </span>
                        <span className="ranks-footer-label">Total listening</span>
                      </div>
                      <div className="ranks-footer-stat">
                        <span className="ranks-footer-value">
                          {(profileMeta?.totalPlays ?? 0).toLocaleString()}
                        </span>
                        <span className="ranks-footer-label">Tracks played</span>
                      </div>
                      <div className="ranks-footer-stat">
                        <span className="ranks-footer-value ranks-footer-value--rank">
                          {profileMeta?.proLevel != null && isProLevelRank(profileMeta.proLevel)
                            ? PRO_LEVEL_DISPLAY[profileMeta.proLevel as ProLevelRank].name
                            : '—'}
                        </span>
                        <span className="ranks-footer-label">Current rank</span>
                      </div>
                    </div>
                  </div>

                  {profileMeta?.proLevel == null && (
                    <p className="settings-muted ranks-section-hint">
                      Subscribe to Pro to start earning ranks through listening time.
                    </p>
                  )}
                  {profileMeta?.proLevel != null && effectiveProfilePlan === UserPlan.Free && (
                    <p className="settings-muted ranks-section-hint">
                      Your rank progress is now paused. Subscribe again to continue progressing.
                    </p>
                  )}
                </>
              )}
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
                    <ProBadge size="md" />
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

            <section
              id="drive-help"
              className="settings-section"
              aria-labelledby="settings-drive-help-heading"
            >
              <h2 id="settings-drive-help-heading" className="settings-section-title">
                Drive folder requirements
              </h2>

              <div className="drive-help-hero">
                <div className="drive-help-hero-icon" aria-hidden>
                  <FolderOpen size={26} strokeWidth={1.75} />
                </div>
                <div className="drive-help-hero-text">
                  <p className="drive-help-hero-title">Public link, private files.</p>
                  <p className="drive-help-hero-sub">
                    DropList streams audio straight from your Google Drive — your files never leave Drive.
                    We only need read access through your share link.
                  </p>
                </div>
                <span className="drive-help-hero-pill" aria-hidden>
                  <ShieldCheck size={13} strokeWidth={2.25} />
                  Read-only
                </span>
              </div>

              <div className="drive-help-block drive-help-block--steps">
                <div className="drive-help-block-head">
                  <span className="drive-help-block-eyebrow">
                    <Share2 size={13} strokeWidth={2.25} aria-hidden />
                    Setup
                  </span>
                  <h3 className="drive-help-block-title">Share your folder in 4 steps</h3>
                </div>
                <ol className="drive-help-steps">
                  {DRIVE_SHARE_STEPS.map((step, i) => (
                    <li key={step} className="drive-help-step">
                      <span className="drive-help-step-num" aria-hidden>{i + 1}</span>
                      <span className="drive-help-step-text">{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="drive-help-share-mock" aria-hidden>
                  <div className="drive-help-share-mock-caption">What it should look like</div>
                  <div className="drive-help-share-mock-row">
                    <span className="drive-help-share-mock-label">General access</span>
                    <span className="drive-help-share-mock-pill drive-help-share-mock-pill--accent">
                      <Link2 size={12} strokeWidth={2.5} />
                      Anyone with the link
                    </span>
                  </div>
                  <div className="drive-help-share-mock-row">
                    <span className="drive-help-share-mock-label">Role</span>
                    <span className="drive-help-share-mock-pill">
                      <Eye size={12} strokeWidth={2.5} />
                      Viewer
                    </span>
                  </div>
                </div>
              </div>

              <div className="drive-help-block drive-help-block--breaks">
                <div className="drive-help-block-head">
                  <span className="drive-help-block-eyebrow drive-help-block-eyebrow--warn">
                    <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
                    Watch out
                  </span>
                  <h3 className="drive-help-block-title">What breaks playback</h3>
                </div>
                <ul className="drive-help-breaks">
                  {DRIVE_PERMISSION_BREAKS.map((line, i) => {
                    const Icon = [Lock, Trash2, FolderInput, UserMinus][i] ?? AlertTriangle;
                    return (
                      <li key={line} className="drive-help-break">
                        <span className="drive-help-break-icon" aria-hidden>
                          <Icon size={15} strokeWidth={2} />
                        </span>
                        <span className="drive-help-break-text">{line}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="drive-help-break-note">
                  <span className="drive-help-break-note-tag">Tip</span>
                  If a saved playlist stops loading, fix sharing in Drive (or restore the folder), then
                  open the playlist again. If the link itself changed, remove the playlist and add it again.
                </p>
              </div>

              <a
                href={GOOGLE_DRIVE_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="drive-help-cta"
              >
                <ExternalLink size={16} strokeWidth={2.25} aria-hidden />
                Open Google Drive
              </a>
            </section>

            <section
              id="customer-support"
              className="settings-section"
              aria-labelledby="settings-support-heading"
            >
              <h2 id="settings-support-heading" className="settings-section-title">
                Customer support
              </h2>
              <p className="settings-muted">
                Questions, billing help, or feedback? Email us and we will get back to you. Your account details are
                included automatically so we can help faster.
              </p>
              <a
                href={buildSupportMailto({
                  id: session?.user?.id,
                  email: session?.user?.email,
                })}
                className="settings-support-link settings-support-link--primary"
              >
                <Mail size={16} strokeWidth={1.75} aria-hidden />
                Email support
              </a>
            </section>
          </main>
        </div>
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

export default memo(SettingsPanel);
