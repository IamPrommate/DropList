import type { UserPlan } from './userPlan';

/** Profile + rank stats from `GET /api/user/profile` (parsed). */
export type SettingsProfileMeta = {
  createdAt: string | null;
  plan: UserPlan;
  proLevel: number | null;
  totalListenSeconds: number;
  totalPlays: number;
  proLevelName: string | null;
  listenProgressPct: number | null;
  nextProLevelName: string | null;
  nextProLevelListenHours: number | null;
  listenProgressFromHours: number | null;
};

/** Billing summary from `GET /api/user/subscription`. */
export type SettingsSubscriptionPayload = {
  plan: UserPlan;
  subscription: {
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
  billingError?: string;
};
