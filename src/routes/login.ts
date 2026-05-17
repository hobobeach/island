import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

import { config } from '../shared/config';
import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';
import { AUTH_COOKIE } from '../shared/jwt';
import { issueSession, authCookieOptions } from '../shared/session';

export const loginRouter = express.Router();
export const logoutRouter = express.Router();

// A valid bcrypt hash to compare against when the username doesn't exist, so
// the response takes the same time whether or not the account is real.
const DUMMY_HASH = bcrypt.hashSync('login-timing-equalizer', 10);

function renderLogin(response: Response, extra: Record<string, unknown> = {}): void {
  response.render('login', {
    ...config,
    title: `Sign In · ${config.name}`,
    ...extra,
  });
}

loginRouter.get('/', (request: Request, response: Response): void => {
  // Shown after completing signup from an emailed invite link.
  const extra = request.query.registered
    ? { notice: 'Your account is ready — please sign in.' }
    : {};
  renderLogin(response, extra);
});

loginRouter.post('/', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const username = typeof request.body?.username === 'string'
      ? request.body.username.trim()
      : '';
    const password = typeof request.body?.password === 'string'
      ? request.body.password
      : '';
    const remember = request.body?.remember !== undefined;

    if (!username || !password) {
      response.status(400);
      renderLogin(response, { error: 'Enter your username and password.', username });
      return;
    }

    const user = await AppDataSource.getRepository(User).findOne({ where: { username } });

    // Always run a bcrypt comparison — even for a missing user — so timing
    // doesn't reveal whether the username exists.
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      response.status(401);
      renderLogin(response, { error: 'Invalid username or password.', username });
      return;
    }

    issueSession(response, user, remember);

    // Admins → dashboard; everyone else must clear the one-time fee first.
    const destination = user.isAdmin ? '/admin' : user.hasPaid ? '/' : '/pay';
    response.redirect(destination);
  } catch (error) {
    next(error);
  }
});

logoutRouter.get('/', (_request: Request, response: Response): void => {
  response.clearCookie(AUTH_COOKIE, authCookieOptions);
  response.redirect('/login');
});
