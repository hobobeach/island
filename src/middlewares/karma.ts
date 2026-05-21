import { Request, Response, NextFunction } from 'express';
import { computeKarma } from '../shared/karma';

/**
 * Looks up the authenticated user's karma and stows it on `res.locals.karma`
 * so the member layout's sidebar/nav can render it without each route handler
 * needing to pass it explicitly. No-ops when no user is attached.
 */
export async function attachKarma(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const user = request.user as { id?: number } | undefined;
  if (!user?.id) {
    next();
    return;
  }
  try {
    response.locals.karma = await computeKarma(user.id);
    next();
  } catch (error) {
    next(error);
  }
}
