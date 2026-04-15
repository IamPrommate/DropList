'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Spinner from './Spinner';

/** Minimum time the overlay stays visible after a tracked navigation starts. */
const MIN_NAV_MS = 520;
/** Failsafe if pathname never changes (e.g. blocked navigation). */
const SAFETY_MS = 9000;

type Ctx = { startNavigation: () => void };

const NavigationLoadingContext = createContext<Ctx | null>(null);

export function useNavigationLoading(): Ctx {
  const v = useContext(NavigationLoadingContext);
  if (!v) {
    throw new Error('useNavigationLoading must be used within NavigationLoadingProvider');
  }
  return v;
}

export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const navStartRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const isFirstPathEffect = useRef(true);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafety = () => {
    if (safetyTimerRef.current != null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const startNavigation = useCallback(() => {
    navStartRef.current = Date.now();
    setVisible(true);
    clearSafety();
    safetyTimerRef.current = setTimeout(() => {
      setVisible(false);
      navStartRef.current = null;
      safetyTimerRef.current = null;
    }, SAFETY_MS);
  }, []);

  useEffect(() => {
    if (isFirstPathEffect.current) {
      isFirstPathEffect.current = false;
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    if (navStartRef.current == null) {
      setVisible(false);
      return;
    }

    const elapsed = Date.now() - navStartRef.current;
    const remaining = Math.max(0, MIN_NAV_MS - elapsed);
    const t = setTimeout(() => {
      setVisible(false);
      navStartRef.current = null;
      clearSafety();
    }, remaining);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <NavigationLoadingContext.Provider value={{ startNavigation }}>
      {children}
      {visible ? (
        <div className="navigation-loading-overlay" role="status" aria-live="polite" aria-busy="true">
          <Spinner size={36} />
          <span className="navigation-loading-text">Loading…</span>
        </div>
      ) : null}
    </NavigationLoadingContext.Provider>
  );
}

type LoadingLinkProps = ComponentProps<typeof Link>;

export function LoadingLink({ onClick, ...props }: LoadingLinkProps) {
  const { startNavigation } = useNavigationLoading();
  return (
    <Link
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          startNavigation();
        }
      }}
    />
  );
}
