import { rateLimit } from 'express-rate-limit';
import { config } from '../shared/config';

/**
 * Coarse per-IP request cap. Mounted app-wide after the traffic logger so 429s
 * still get observed in request_logs; static assets are served before this and
 * don't count toward the limit. The default keyGenerator uses `req.ip`, which
 * — with `trust proxy: 1` set on the app — is the real client IP from
 * X-Forwarded-For (not the Render edge).
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

/**
 * Login POST limiter — discourages credential stuffing without locking out
 * users who mistype once. `skipSuccessfulRequests` means only failed attempts
 * (status >= 400) count, so a real user is never penalised by their own
 * successful login. On 429 we re-render the login form with an error.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_request, response) => {
    response.status(429).render('login', {
      ...config,
      title: `Sign In · ${config.name}`,
      error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    });
  },
});

/**
 * Forgot-password POST limiter — tight per-IP cap so the endpoint can't be
 * used to spray reset emails or probe for accounts. Every request counts; on
 * 429 we re-render the forgot-password form with an error.
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).render('forgot-password', {
      ...config,
      title: `Reset your password · ${config.name}`,
      error: 'Too many reset requests. Please wait a while and try again.',
    });
  },
});

/**
 * Public invite endpoint limiter — tight per-IP cap so the invite_requests
 * table can't be sprayed with fresh emails from one source. Every request
 * counts (a real human submits this once); the response is JSON.
 */
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      status: 'rate_limited',
      message: 'Too many invite requests, please try again later.',
    });
  },
});
