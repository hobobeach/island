import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

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
