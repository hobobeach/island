import express, { Request, Response, NextFunction, CookieOptions } from 'express';
import bcrypt from 'bcryptjs';

import { config } from '../shared/config';
import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';
import { generateToken, AUTH_COOKIE } from '../shared/jwt';

export const loginRouter = express.Router();
export const logoutRouter = express.Router();

// A valid bcrypt hash to compare against when the username doesn't exist, so
// the response takes the same time whether or not the account is real.
const DUMMY_HASH = bcrypt.hashSync('login-timing-equalizer', 10);

const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Shared attributes for the auth cookie. clearCookie must use the same set
// (minus maxAge) for the browser to recognise and drop the cookie.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

function renderLogin(response: Response, extra: Record<string, unknown> = {}): void {
  response.render('login', {
    ...config,
    title: `Sign In · ${config.name}`,
    ...extra,
  });
}

loginRouter.get('/', (request: Request, response: Response): void => {
  renderLogin(response);
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

    const token = generateToken(
      { id: user.id, uuid: user.uuid, username: user.username, isAdmin: user.isAdmin },
      remember ? '30d' : '1d',
    );

    const cookieOptions: CookieOptions = { ...baseCookieOptions };
    if (remember) {
      cookieOptions.maxAge = REMEMBER_MAX_AGE_MS;
    }
    response.cookie(AUTH_COOKIE, token, cookieOptions);

    response.redirect(user.isAdmin ? '/admin' : '/');
  } catch (error) {
    next(error);
  }
});

logoutRouter.get('/', (request: Request, response: Response): void => {
  response.clearCookie(AUTH_COOKIE, baseCookieOptions);
  response.redirect('/login');
});
