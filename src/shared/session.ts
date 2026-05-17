import { Response, CookieOptions } from 'express';

import { generateToken, AUTH_COOKIE } from './jwt';
import { User } from '../entities/user.entity';

const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Shared attributes for the auth cookie. `clearCookie` (logout) must use the
 * same set, minus `maxAge`, for the browser to recognise and drop the cookie.
 */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

/**
 * Signs a JWT for the user and sets it as the session cookie. `remember`
 * extends the token expiry (30d vs 1d) and makes the cookie persistent.
 */
export function issueSession(response: Response, user: User, remember = false): void {
  const token = generateToken(
    { id: user.id, uuid: user.uuid, username: user.username, isAdmin: user.isAdmin },
    remember ? '30d' : '1d',
  );

  const options: CookieOptions = { ...authCookieOptions };
  if (remember) {
    options.maxAge = REMEMBER_MAX_AGE_MS;
  }
  response.cookie(AUTH_COOKIE, token, options);
}
