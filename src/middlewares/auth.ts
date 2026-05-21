import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';

/**
 * Route guard that admits only authenticated admin users. Authenticates the
 * JWT (Authorization header or session cookie) with the 'jwt' strategy, then:
 *
 * - no/invalid token  → redirect to `/login`
 * - valid but not admin → redirect to `/`
 * - admin → attaches the payload as `request.user` and continues
 */
export function requireAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (error: unknown, user: Express.User | false | null): void => {
      if (error || !user) {
        response.redirect('/login');
        return;
      }
      if ((user as { isAdmin?: boolean }).isAdmin !== true) {
        response.redirect('/');
        return;
      }
      request.user = user;
      next();
    },
  )(request, response, next);
}

/**
 * Route guard that admits any authenticated user. Authenticates the JWT
 * (Authorization header or session cookie); an unauthenticated visitor is
 * redirected to `/login`, otherwise the payload is attached as `request.user`.
 */
export function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (error: unknown, user: Express.User | false | null): void => {
      if (error || !user) {
        response.redirect('/login');
        return;
      }
      request.user = user;
      next();
    },
  )(request, response, next);
}

/**
 * Soft-auth middleware: attaches `request.user` if a valid JWT is present
 * (Authorization header or session cookie), otherwise continues anonymously
 * without redirecting. Use on routes that render different content for
 * logged-in vs. logged-out visitors (e.g. the home page).
 */
export function optionalAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (_error: unknown, user: Express.User | false | null): void => {
      if (user) {
        request.user = user;
      }
      next();
    },
  )(request, response, next);
}

/**
 * Route guard for the paid member surface (e.g. /discussion). Authenticates
 * the JWT, loads the User row fresh from the DB (so `hasPaid` reflects state
 * since the token was issued), then:
 *
 *   - no/invalid token / deleted user → redirect to `/login`
 *   - non-admin who hasn't paid → redirect to `/pay`
 *   - admin or paid member → attach the full `User` row as `request.user`
 *
 * Handlers can read `request.user` as a `User` for fullName/email/etc. without
 * an additional DB hit.
 */
export function requireMember(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  passport.authenticate(
    'jwt',
    { session: false },
    async (error: unknown, payload: Express.User | false | null): Promise<void> => {
      if (error || !payload) {
        response.redirect('/login');
        return;
      }
      const id = (payload as { id?: number }).id;
      if (!id) {
        response.redirect('/login');
        return;
      }
      try {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id } });
        if (!user) {
          response.redirect('/login');
          return;
        }
        if (!user.isAdmin && !user.hasPaid) {
          response.redirect('/pay');
          return;
        }
        request.user = user;
        next();
      } catch (err) {
        next(err);
      }
    },
  )(request, response, next);
}
