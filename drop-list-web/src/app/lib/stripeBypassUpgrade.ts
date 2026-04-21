import { supabaseAdmin } from '@/app/lib/supabase';
import { UserPlan } from '@/app/lib/userPlan';
import { isProLevelRank } from '@/app/lib/proLevels';

/** Fake subscription id stored when BYPASS_STRIPE upgrades a user (no real Stripe sub). */
export const BYPASS_STRIPE_SUB_ID = 'bypass_test_sub';

export function isBypassStripeEnabled(): boolean {
  return process.env.BYPASS_STRIPE === 'true';
}

export async function applyBypassProUpgrade(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('pro_level')
    .eq('id', userId)
    .single();

  const hasRank = row?.pro_level != null && isProLevelRank(Number(row.pro_level));

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      plan: UserPlan.Pro,
      stripe_subscription_id: BYPASS_STRIPE_SUB_ID,
      ...(!hasRank ? { pro_level: 1 } : {}),
    })
    .eq('id', userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function applyBypassProUndo(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      plan: UserPlan.Free,
      stripe_subscription_id: null,
    })
    .eq('id', userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
