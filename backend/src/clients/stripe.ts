import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripeClient() {
  if (stripeInstance) {
    return stripeInstance;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  stripeInstance = new Stripe(stripeSecretKey, {
    maxNetworkRetries: 2,
  });

  return stripeInstance;
}
