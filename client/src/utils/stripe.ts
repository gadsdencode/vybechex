
import { loadStripe } from '@stripe/stripe-js';

let stripePromise: Promise<any>;

export const getStripe = () => {
  if (!stripePromise) {
    if (!process.env.STRIPE_PUBLIC_KEY) {
      throw new Error('STRIPE_PUBLIC_KEY must be set');
    }
    stripePromise = loadStripe(process.env.STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
};

export const createSubscription = async () => {
  try {
    const response = await fetch('/api/create-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Subscription request failed');
    }

    const { url } = await response.json();
    window.location.href = url;
  } catch (error) {
    console.error('Subscription error:', error);
    throw error;
  }
};

export const checkSubscriptionStatus = async () => {
  try {
    const response = await fetch('/api/subscription-status');
    if (!response.ok) {
      throw new Error('Failed to check subscription status');
    }
    return response.json();
  } catch (error) {
    console.error('Subscription status check error:', error);
    throw error;
  }
};

export const createPayment = async (amount: number) => {
  try {
    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      throw new Error('Payment request failed');
    }

    const { clientSecret } = await response.json();
    const stripe = await getStripe();
    
    const result = await stripe.confirmPayment({
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success`,
      },
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result;
  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
};
