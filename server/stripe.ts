
import Stripe from 'stripe';
import { Router } from 'express';
import { validateUser } from './middleware/auth';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY must be set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

const SUBSCRIPTION_PRICE_ID = process.env.STRIPE_PRICE_ID;

const router = Router();

router.post('/create-subscription', validateUser, async (req, res) => {
  try {
    if (!SUBSCRIPTION_PRICE_ID) {
      throw new Error('STRIPE_PRICE_ID must be set');
    }

    if (!req.user?.stripeCustomerId) {
      throw new Error('User has no Stripe customer ID');
    }

    const session = await stripe.checkout.sessions.create({
      customer: req.user.stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: SUBSCRIPTION_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/payment-cancelled`,
    });

    res.json({ 
      success: true,
      sessionId: session.id,
      url: session.url 
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create subscription'
    });
  }
});

router.get('/subscription-status', validateUser, async (req, res) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: req.user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    res.json({
      success: true,
      hasActiveSubscription: subscriptions.data.length > 0
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check subscription status'
    });
  }
});

router.post('/create-payment-intent', validateUser, async (req, res) => {
  try {
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent'
    });
  }
});

export { router as stripeRouter };
