import Stripe from 'stripe';

/** The one-time membership fee, in cents (USD). */
export const MEMBERSHIP_FEE_CENTS = 1000;

let client: InstanceType<typeof Stripe> | null = null;

/**
 * Returns the lazily-created Stripe client.
 * Throws if `STRIPE_SECRET_KEY` is not configured.
 */
export function getStripe(): InstanceType<typeof Stripe> {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured.');
    }
    client = new Stripe(key);
  }
  return client;
}
