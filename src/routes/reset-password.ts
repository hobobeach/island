import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import createError from 'http-errors';
import { randomUUID } from 'crypto';
import { IsNull } from 'typeorm';

import { config } from '../shared/config';
import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { sendPasswordResetEmail } from '../shared/mailer';
import { forgotPasswordLimiter } from '../middlewares/rate-limit';

export const resetPasswordRouter = express.Router();

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// How long an emailed password-reset link stays valid.
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Base URL for links in emails (mirrors the invite flow's APP_URL handling).
function appUrl(): string {
  return (process.env.APP_URL || config.url).replace(/\/+$/, '');
}

function renderForgot(response: Response, extra: Record<string, unknown> = {}): void {
  response.render('forgot-password', {
    ...config,
    title: `Reset your password · ${config.name}`,
    ...extra,
  });
}

// --- Step 1: request a reset link ----------------------------------------

resetPasswordRouter.get('/forgot-password', (_request: Request, response: Response): void => {
  renderForgot(response);
});

resetPasswordRouter.post('/forgot-password', forgotPasswordLimiter, async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const email = (typeof request.body?.email === 'string' ? request.body.email : '').trim();

    if (!email) {
      response.status(400);
      return renderForgot(response, { error: 'Enter your email address.', email });
    }

    // Always end with the same confirmation, whether or not the address has an
    // account, so the form can't be used to discover which emails are members.
    const confirm = (): void => {
      renderForgot(response, {
        notice: 'If an account exists for that email, a reset link is on its way.',
      });
    };

    // Case-insensitive match so a differently-cased email still finds its user.
    const user = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
    if (!user) {
      return confirm();
    }

    const tokenRepo = AppDataSource.getRepository(PasswordResetToken);
    // Retire any outstanding tokens before issuing a fresh one.
    await tokenRepo.update({ userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });

    const token = tokenRepo.create({ uuid: randomUUID(), userId: user.id });
    await tokenRepo.save(token);

    const resetUrl = `${appUrl()}/reset-password/${token.uuid}`;
    await sendPasswordResetEmail(user.email, user.fullName, resetUrl);

    return confirm();
  } catch (error) {
    next(error);
  }
});

// --- Step 2: redeem the link and set a new password ----------------------

interface LoadedReset {
  token: PasswordResetToken;
  user: User;
}

/**
 * Loads the reset token and its user, or throws an http-error if the link is
 * unusable (unknown, already used, expired, or the account no longer exists).
 */
async function loadResettableToken(token: string): Promise<LoadedReset> {
  const row = await AppDataSource.getRepository(PasswordResetToken).findOne({
    where: { uuid: token },
  });
  if (!row || row.usedAt) {
    throw createError(404, 'This reset link is invalid or has already been used.');
  }
  if (Date.now() - row.createdAt.getTime() > RESET_TTL_MS) {
    throw createError(410, 'This reset link has expired. Please request a new one.');
  }
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: row.userId } });
  if (!user) {
    throw createError(404, 'This reset link is invalid or has already been used.');
  }
  return { token: row, user };
}

function renderReset(response: Response, token: string, extra: Record<string, unknown> = {}): void {
  response.render('reset-password', {
    ...config,
    title: `Choose a new password · ${config.name}`,
    token,
    ...extra,
  });
}

resetPasswordRouter.get('/reset-password/:token', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await loadResettableToken(request.params.token);
    renderReset(response, request.params.token);
  } catch (error) {
    next(error);
  }
});

resetPasswordRouter.post('/reset-password/:token', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tokenStr = request.params.token;
    const { token, user } = await loadResettableToken(tokenStr);

    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const confirmPassword = typeof request.body?.confirmPassword === 'string'
      ? request.body.confirmPassword
      : '';

    const fail = (message: string): void => {
      response.status(400);
      renderReset(response, tokenStr, { error: message });
    };

    if (!password) {
      return fail('Choose a new password.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirmPassword) {
      return fail('Passwords do not match.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Set the new password and burn the token (plus any siblings) atomically.
    await AppDataSource.transaction(async (manager) => {
      user.passwordHash = passwordHash;
      await manager.save(user);
      token.usedAt = new Date();
      await manager.save(token);
      await manager.getRepository(PasswordResetToken).update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
    });

    // Send them to sign in with the new password rather than auto-logging in.
    response.redirect('/login?reset=1');
  } catch (error) {
    next(error);
  }
});
