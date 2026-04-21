-- Optional analytics: written by Stripe webhook only (not read by app logic).
-- subscription_start: set on checkout.session.completed from Stripe sub.start_date; subscription_end cleared.
-- subscription_end: set on customer.subscription.deleted from ended_at / current_period_end.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end   timestamptz;
