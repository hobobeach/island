import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { getClientIp } from '../shared/ip';
import { isBanned } from '../shared/banned-ip-cache';
import { AUTH_COOKIE } from '../shared/jwt';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

/**
 * Reject requests originating from a banned IP. The cache is in-process and
 * O(1), so unbanned traffic pays only a Set lookup. Admins are exempt — an
 * accidental self-ban would otherwise lock them out — verified by decoding
 * the session JWT inline; non-admin / anonymous / invalid-token visitors are
 * blocked. Cookie-parser must run earlier in the pipeline.
 */
export function blockBannedIps(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const ip = getClientIp(request);
  if (!isBanned(ip)) {
    next();
    return;
  }

  const token = request.cookies?.[AUTH_COOKIE];
  if (token && JWT_SECRET) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { isAdmin?: boolean };
      if (payload.isAdmin === true) {
        next();
        return;
      }
    } catch {
      // Invalid or expired token — fall through to block.
    }
  }

  response.status(403).type('text/plain').send('Access denied.');
}
