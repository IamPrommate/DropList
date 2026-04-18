'use client';

import { useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import { 
  Link2,
  Play,
  Headphones,
  Zap,
  ChevronDown,
  SlidersHorizontal,
  Shuffle,
  ListMusic,
  Keyboard,
  BarChart3,
  Library,
  Image,
  Pencil,
  Music,
  TrendingUp,
  CirclePlay,
  Repeat,
} from 'lucide-react';
import './layout.scss';
import './landing.scss';
import { PRO_LEVEL_DISPLAY, PRO_LEVEL_RANKS } from './lib/proLevels';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('.landing-reveal');
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('is-visible');
        });
      },
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  const startFree = () => {
    if (isAuthed) window.location.href = '/app';
    else void signIn('google', { callbackUrl: '/app' });
  };

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGetPro = async () => {
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      console.error('Checkout failed');
    }
  };

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden />

      {/* ── Nav ── */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-logo">DropList</Link>
          <nav className="landing-nav-links" aria-label="Marketing">
            <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollToId('how-it-works'); }}>
              How it works
            </a>
            <a href="#features" onClick={(e) => { e.preventDefault(); scrollToId('features'); }}>
              Features
            </a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToId('pricing'); }}>
              Pricing
            </a>
            {isAuthed ? (
              <Link href="/app" className="landing-nav-cta">Open app</Link>
            ) : (
              <button type="button" className="landing-nav-cta" onClick={() => void startFree()}>
                Get started
              </button>
            )}
          </nav>
        </div>
      </header>

      <main ref={mainRef} className="landing-main">

        {/* ── Hero ── */}
        <section className="landing-hero">
          <h1>
            Play your Drive folders<br />
            <span className="landing-gradient-text">like a real music app.</span>
          </h1>
          <div className="landing-eyebrow">
            <span>A music player for Google Drive</span>
          </div>
          <p className="landing-hero-lead">
            Paste a Google Drive folder link. DropList streams every track through a
            clean, focused player — no downloads, no re-uploading. Free to start, Pro
            when you&apos;re ready.
          </p>
          <div className="landing-hero-ctas">
            {isAuthed ? (
              <Link href="/app" className="landing-btn-primary">
                <Play size={18} aria-hidden />
                Open DropList
              </Link>
            ) : (
              <button type="button" className="landing-btn-primary" onClick={() => void startFree()}>
                <Play size={18} aria-hidden />
                Get started free
              </button>
            )}
            <button type="button" className="landing-btn-secondary" onClick={() => scrollToId('features')}>
              See features
              <ChevronDown size={16} aria-hidden />
            </button>
          </div>
          <p className="landing-hero-note">
            Free tier — no credit card needed. Sign in with Google.
          </p>
        </section>

        {/* ── Divider ── */}
        <div className="landing-divider" aria-hidden />

        {/* ── How it works ── */}
        <section id="how-it-works" className="landing-section landing-reveal">
          <h2 className="landing-section-title">How it works</h2>
          <p className="landing-section-sub">
            Three steps. No library imports, no file uploads, no waiting.
          </p>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-icon">
                <Link2 size={22} aria-hidden />
              </div>
              <h3>1. Paste a folder link</h3>
              <p>Share your Google Drive folder publicly and drop the link into DropList.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">
                <Headphones size={22} aria-hidden />
              </div>
              <h3>2. Hit play</h3>
              <p>We load your tracks instantly on the server. No downloads to your device.</p>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">
                <TrendingUp size={22} aria-hidden />
              </div>
              <h3>3. Listen and rank up</h3>
              <p>Enjoy shuffle on Free or full control on Pro. The more you listen, the higher your rank climbs.</p>
                      </div>
                  </div>
        </section>

        {/* ── Divider ── */}
        <div className="landing-divider" aria-hidden />

        {/* ── Features ── */}
        <section id="features" className="landing-section landing-reveal">
          <h2 className="landing-section-title">
            Everything you need.{' '}
            <span className="landing-gradient-text">Nothing you don&apos;t.</span>
          </h2>
          <p className="landing-section-sub">
            Start free with the essentials. Upgrade to Pro for the full experience.
          </p>
          <div className="landing-features-grid">
            {/* Free column */}
            <div className="landing-feature-card">
              <div className="landing-feature-card-badge">Free</div>
              <ul className="landing-feature-list">
                <li>Stream audio from Google Drive</li>
                <li>10 plays per day</li>
                <li>Shuffle playback</li>
                <li>Save 1 playlist</li>
                <li><Pencil size={15} aria-hidden /> Rename your playlist</li>
              </ul>
              <button type="button" className="landing-feature-card-btn" onClick={() => void startFree()}>
                {isAuthed ? 'Open app' : 'Try free'}
                    </button>
                  </div>

            {/* Pro column */}
            <div className="landing-feature-card landing-feature-card--pro">
              <div className="landing-feature-card-badge landing-feature-card-badge--pro">
                <Zap size={13} aria-hidden /> Pro
                </div>
              <ul className="landing-feature-list">
                <li><CirclePlay size={15} aria-hidden /> Unlimited plays</li>
                <li><SlidersHorizontal size={15} aria-hidden /> Seek anywhere in a track</li>
                <li><ListMusic size={15} aria-hidden /> Pick any track directly</li>
                <li><Repeat size={15} aria-hidden /> Shuffle &amp; repeat controls</li>
                <li><Keyboard size={15} aria-hidden /> Keyboard shortcuts</li>
                <li><BarChart3 size={15} aria-hidden /> Play statistics</li>
                <li><Image size={15} aria-hidden /> Edit album covers</li>
                <li><Library size={15} aria-hidden /> Save 5–8 playlists (by rank)</li>
              </ul>
              {isAuthed ? (
                <button type="button" className="landing-feature-card-btn landing-feature-card-btn--pro" onClick={() => void handleGetPro()}>
                  Upgrade — $2.99/mo
                </button>
              ) : (
                <button type="button" className="landing-feature-card-btn landing-feature-card-btn--pro" onClick={() => void startFree()}>
                  Start free, upgrade anytime
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Divider ── */}
        <div className="landing-divider" aria-hidden />

        {/* ── Ranks ── */}
        <section id="ranks" className="landing-section landing-reveal">
          <h2 className="landing-section-title">Your listening journey</h2>
          <p className="landing-section-sub">
            The more you listen, the higher you climb. Pro subscribers unlock ranks from
            Bronze to Emerald — each tier earns you more saved playlist slots.
          </p>

          <div className="landing-roadmap">
            <div className="landing-roadmap-track" aria-hidden />
            {PRO_LEVEL_RANKS.map((rank) => {
              const tier = PRO_LEVEL_DISPLAY[rank];
              const playlists = rank >= 7 ? 8 : rank >= 4 ? 6 : 5;
              const isMilestone = rank === 4 || rank === 7;
              return (
                <div
                  key={rank}
                  className={`landing-roadmap-node${isMilestone ? ' is-milestone' : ''}`}
                >
                  <div
                    className="landing-roadmap-dot"
                    style={{ background: tier.colorVar, boxShadow: `0 0 12px ${tier.colorVar}55` }}
                  />
                  <div className="landing-roadmap-label">
                    <span className="landing-roadmap-name" style={{ color: tier.colorVar }}>
                      {tier.name}
                    </span>
                    <span className="landing-roadmap-hours">{tier.hours}h</span>
                  </div>
                  {isMilestone && (
                    <div className="landing-roadmap-perks">
                      <div className="landing-roadmap-perk">{playlists} playlists</div>
                      {rank === 7 && (
                        <div className="landing-roadmap-perk landing-roadmap-perk--emerald">
                          Feature request
                        </div>
                      )}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>

          <p className="landing-ranks-note">
            Your rank stays even if you pause your subscription.
          </p>
        </section>

        {/* ── Divider ── */}
        <div className="landing-divider" aria-hidden />

        {/* ── Pricing ── */}
        <section id="pricing" className="landing-section landing-reveal">
          <h2 className="landing-section-title">Simple pricing</h2>
          <p className="landing-section-sub">
            One plan. One price. Cancel anytime.
          </p>
          <div className="landing-pricing">
            <div className="landing-pricing-badge">
              <Zap size={16} aria-hidden /> Pro
            </div>
            <p className="landing-pricing-price">
              $2.99<span className="landing-pricing-period">/month</span>
            </p>
            <div className="landing-pricing-features">
              <div className="landing-pricing-row"><CirclePlay size={15} aria-hidden /><span>Unlimited plays</span></div>
              <div className="landing-pricing-row"><SlidersHorizontal size={15} aria-hidden /><span>Seek inside tracks</span></div>
              <div className="landing-pricing-row"><ListMusic size={15} aria-hidden /><span>Pick any track directly</span></div>
              <div className="landing-pricing-row"><Repeat size={15} aria-hidden /><span>Shuffle &amp; repeat</span></div>
              <div className="landing-pricing-row"><Keyboard size={15} aria-hidden /><span>Keyboard shortcuts</span></div>
              <div className="landing-pricing-row"><BarChart3 size={15} aria-hidden /><span>Play statistics</span></div>
              <div className="landing-pricing-row"><Image size={15} aria-hidden /><span>Edit album covers</span></div>
              <div className="landing-pricing-row"><Library size={15} aria-hidden /><span>5–8 playlists (by rank)</span></div>
              </div>
            {isAuthed ? (
              <button type="button" className="landing-pricing-cta" onClick={() => void handleGetPro()}>
                Get Pro — $2.99/month
              </button>
            ) : (
              <button type="button" className="landing-pricing-cta" onClick={() => void startFree()}>
                Start free, upgrade anytime
              </button>
            )}
            <p className="landing-pricing-foot">Cancel anytime. No commitment.</p>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="landing-section landing-final landing-reveal">
          <h2>
            Ready to <span className="landing-gradient-text">play</span>?
          </h2>
          <p className="landing-final-sub">
            Your Google Drive folders are already waiting.
          </p>
          {isAuthed ? (
            <Link href="/app" className="landing-btn-primary">
              <Play size={18} aria-hidden />
              Open DropList
            </Link>
          ) : (
            <button type="button" className="landing-btn-primary" onClick={() => void startFree()}>
              <Play size={18} aria-hidden />
              Sign in with Google
      </button>
          )}
        </section>
    </main>

      <footer className="landing-footer">
        <span>DropList</span>
        {isAuthed ? (
          <>
            <Link href="/app">Player</Link>
            <Link href="/app?settings=1">Account</Link>
          </>
        ) : (
          <button type="button" className="landing-footer-link-btn" onClick={() => void startFree()}>
            Sign in with Google
          </button>
        )}
      </footer>
    </div>
  );
}
