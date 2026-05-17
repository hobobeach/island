import express, { Request, Response, NextFunction } from 'express';

import { config } from '../shared/config';
import { requireAuth } from '../middlewares/auth';
import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';
import { getStripe, MEMBERSHIP_FEE_CENTS } from '../shared/stripe';

export const payRouter = express.Router();

// Every payment route requires a logged-in user.
payRouter.use(requireAuth);

const FEE_LABEL = `$${(MEMBERSHIP_FEE_CENTS / 100).toFixed(2)}`;

/** The authenticated user's row, or null if the account has since vanished. */
function loadUser(request: Request): Promise<User | null> {
  const id = (request.user as { id?: number }).id;
  return AppDataSource.getRepository(User).findOne({ where: { id } });
}

// The membership-fee page — a custom card form backed by a Stripe PaymentIntent.
payRouter.get('/', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await loadUser(request);
    if (!user) {
      response.redirect('/login');
      return;
    }
    if (user.isAdmin) {
      response.redirect('/admin');
      return;
    }
    if (user.hasPaid) {
      response.redirect('/');
      return;
    }

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error('STRIPE_PUBLISHABLE_KEY is not configured.');
    }

    // Card-only PaymentIntent; the browser confirms it with Stripe Elements.
    const intent = await getStripe().paymentIntents.create({
      amount: MEMBERSHIP_FEE_CENTS,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `${config.name} membership`,
      metadata: { userId: String(user.id) },
    });

    response.render('pay', {
      ...config,
      title: `Complete your registration · ${config.name}`,
      fee: FEE_LABEL,
      fullName: user.fullName,
      publishableKey,
      clientSecret: intent.client_secret,
    });
  } catch (error) {
    next(error);
  }
});

// Return target after the card form confirms payment — verifies the
// PaymentIntent server-side, then marks the account as paid.
payRouter.get('/success', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await loadUser(request);
    if (!user) {
      response.redirect('/login');
      return;
    }

    const renderDone = (): void => {
      response.render('pay-success', {
        ...config,
        title: `Welcome to ${config.name}`,
        fullName: user.fullName,
      });
    };

    if (user.hasPaid) {
      renderDone();
      return;
    }

    const intentId = typeof request.query.payment_intent === 'string'
      ? request.query.payment_intent
      : '';
    if (!intentId) {
      response.redirect('/pay');
      return;
    }

    const intent = await getStripe().paymentIntents.retrieve(intentId);
    const paid = intent.status === 'succeeded'
      && intent.metadata.userId === String(user.id);
    if (!paid) {
      response.redirect('/pay');
      return;
    }

    user.hasPaid = true;
    user.paidAt = new Date();
    user.stripePaymentIntentId = intent.id;
    await AppDataSource.getRepository(User).save(user);

    renderDone();
  } catch (error) {
    next(error);
  }
});
