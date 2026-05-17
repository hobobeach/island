import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import createError from 'http-errors';
import { randomUUID } from 'crypto';

import { config } from '../shared/config';
import { AppDataSource } from '../app-data-source';
import { InviteRequest } from '../entities/invite-request.entity';
import { User } from '../entities/user.entity';
import { issueSession } from '../shared/session';

export const signupRouter = express.Router();

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// How long an emailed signup link stays valid.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Loads the invite for a signup token, or throws an http-error if the link
 * is unusable (unknown, already used, or expired).
 */
async function loadInvitableRequest(token: string): Promise<InviteRequest> {
  const invite = await AppDataSource.getRepository(InviteRequest).findOne({
    where: { uuid: token },
  });
  if (!invite || invite.status !== 'invited') {
    throw createError(404, 'This invite link is invalid or has already been used.');
  }
  if (invite.invitedAt && Date.now() - invite.invitedAt.getTime() > INVITE_TTL_MS) {
    throw createError(410, 'This invite link has expired. Please request a new invite.');
  }
  return invite;
}

function renderSignup(
  response: Response,
  invite: InviteRequest,
  token: string,
  extra: Record<string, unknown> = {},
): void {
  response.render('signup', {
    ...config,
    title: `Set up your account · ${config.name}`,
    token,
    fullName: invite.fullName,
    email: invite.email,
    ...extra,
  });
}

signupRouter.get('/:token', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const invite = await loadInvitableRequest(request.params.token);
    renderSignup(response, invite, request.params.token);
  } catch (error) {
    next(error);
  }
});

signupRouter.post('/:token', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = request.params.token;
    const invite = await loadInvitableRequest(token);
    const userRepo = AppDataSource.getRepository(User);

    const username = (typeof request.body?.username === 'string' ? request.body.username : '').trim();
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const confirmPassword = typeof request.body?.confirmPassword === 'string'
      ? request.body.confirmPassword
      : '';

    const fail = (message: string): void => {
      response.status(400);
      renderSignup(response, invite, token, { error: message, username });
    };

    if (!username || !password) {
      return fail('Choose a username and password.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirmPassword) {
      return fail('Passwords do not match.');
    }
    if (await userRepo.findOne({ where: { username } })) {
      return fail(`The username "${username}" is already taken.`);
    }
    if (await userRepo.findOne({ where: { email: invite.email } })) {
      return fail('An account already exists for your email address.');
    }

    const user = userRepo.create({
      uuid: randomUUID(),
      fullName: invite.fullName,
      username,
      email: invite.email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      ip: invite.ip,
      isAdmin: invite.grantAdmin,
    });

    // Create the account and close out the invite atomically.
    await AppDataSource.transaction(async (manager) => {
      await manager.save(user);
      invite.status = 'approved';
      await manager.save(invite);
    });

    // Log the new user in and send them to pay the one-time membership fee.
    issueSession(response, user);
    response.redirect('/pay');
  } catch (error) {
    next(error);
  }
});
