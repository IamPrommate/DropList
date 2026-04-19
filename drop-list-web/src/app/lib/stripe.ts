import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const priceId = process.env.STRIPE_PRICE_ID?.trim();

/** True when secret + price are set (e.g. sandbox or live). Omit on Vercel to ship without billing. */
export const isStripeConfigured = Boolean(secretKey && priceId);

export const STRIPE_PRICE_ID = priceId ?? '';

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey);
  }
  return stripeSingleton;
}
