'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { NavigationLoadingProvider } from './NavigationLoading';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <NavigationLoadingProvider>{children}</NavigationLoadingProvider>
    </SessionProvider>
  );
}
