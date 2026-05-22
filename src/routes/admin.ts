import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { config } from '../shared/config';
import { requireAdmin } from '../middlewares/auth';
import { AppDataSource } from '../app-data-source';
import { InviteRequest } from '../entities/invite-request.entity';
import { User } from '../entities/user.entity';
import { RequestLog } from '../entities/request-log.entity';
import { sendInviteEmail } from '../shared/mailer';

export const adminRouter = express.Router();

// Every admin route requires an authenticated admin.
adminRouter.use(requireAdmin);

// Expose the current admin's username to every admin view (the layout uses it
// for the header dropdown), so individual route handlers don't have to pass it.
adminRouter.use((request: Request, response: Response, next: NextFunction): void => {
  const user = request.user as { username?: string } | undefined;
  response.locals.adminUsername = user?.username ?? '';
  next();
});

const STATUS_CLASS: Record<string, string> = {
  pending: 'warning',
  invited: 'info',
  approved: 'success',
  rejected: 'danger',
};

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Base URL used to build the emailed signup link.
const APP_URL = (process.env.APP_URL || config.url).replace(/\/+$/, '');

/** Post/Redirect/Get back to the list with a one-off flash message. */
function flash(response: Response, key: 'ok' | 'error', message: string): void {
  response.redirect(`/admin/invites?${key}=${encodeURIComponent(message)}`);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const JOINED_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const JOINED_RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Friendly Joined-column format, e.g. "May 17, 2026 at 2:30pm (5 days ago)".
 * Times are in the server's local timezone (UTC in production on Render).
 */
function formatJoined(date: Date): string {
  const datePart = JOINED_DATE_FMT.format(date);

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const meridiem = hours >= 12 ? 'pm' : 'am';
  const timePart = `${hour12}:${minutes}${meridiem}`;

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const round = (value: number): number => Math.round(value);
  let rel: string;
  if (abs < 60_000) {
    rel = JOINED_RTF.format(round(diffMs / 1000), 'second');
  } else if (abs < 3_600_000) {
    rel = JOINED_RTF.format(round(diffMs / 60_000), 'minute');
  } else if (abs < 86_400_000) {
    rel = JOINED_RTF.format(round(diffMs / 3_600_000), 'hour');
  } else if (abs < 86_400_000 * 30) {
    rel = JOINED_RTF.format(round(diffMs / 86_400_000), 'day');
  } else if (abs < 86_400_000 * 365) {
    rel = JOINED_RTF.format(round(diffMs / (86_400_000 * 30)), 'month');
  } else {
    rel = JOINED_RTF.format(round(diffMs / (86_400_000 * 365)), 'year');
  }

  return `${datePart} at ${timePart} (${rel})`;
}

adminRouter.get('/', (_request: Request, response: Response): void => {
  response.render('admin', {
    ...config,
    layout: 'admin',
    title: `Dashboard · ${config.name}`,
    year: new Date().getFullYear(),
    navDashboard: true,
  });
});

adminRouter.get('/invites', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const all = await AppDataSource.getRepository(InviteRequest).find({
      order: { createdAt: 'DESC' },
    });

    // Pending requests float to the top; each group stays newest-first.
    const ordered = [
      ...all.filter((invite) => invite.status === 'pending'),
      ...all.filter((invite) => invite.status !== 'pending'),
    ];

    const requests = ordered.map((invite) => ({
      id: invite.id,
      fullName: invite.fullName,
      email: invite.email,
      ip: invite.ip ?? '—',
      userAgent: invite.userAgent ?? '—',
      referer: invite.referer ?? '—',
      requestedAt: invite.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      statusLabel: invite.status.charAt(0).toUpperCase() + invite.status.slice(1),
      statusClass: STATUS_CLASS[invite.status] ?? 'secondary',
      isPending: invite.status === 'pending',
      isInvited: invite.status === 'invited',
      // Suggested account username — the email's local part, cleaned up.
      suggestedUsername: invite.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, ''),
    }));

    response.render('admin-invites', {
      ...config,
      layout: 'admin',
      title: `Invite Requests · ${config.name}`,
      year: new Date().getFullYear(),
      navInvites: true,
      requests,
      pendingCount: all.filter((invite) => invite.status === 'pending').length,
      totalCount: all.length,
      notice: asString(request.query.ok) || undefined,
      error: asString(request.query.error) || undefined,
    });
  } catch (error) {
    next(error);
  }
});

// Approve a pending request: create the user account and mark it approved.
adminRouter.post('/invites/:id/approve', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return flash(response, 'error', 'Invalid invite request.');
    }

    const username = asString(request.body?.username).trim();
    const password = asString(request.body?.password);
    const confirmPassword = asString(request.body?.confirmPassword);
    const isAdmin = request.body?.isAdmin !== undefined;

    const inviteRepo = AppDataSource.getRepository(InviteRequest);
    const userRepo = AppDataSource.getRepository(User);

    const invite = await inviteRepo.findOne({ where: { id } });
    if (!invite) {
      return flash(response, 'error', 'Invite request not found.');
    }
    if (invite.status !== 'pending') {
      return flash(response, 'error', 'That request has already been handled.');
    }

    if (!username || !password) {
      return flash(response, 'error', 'Username and password are required.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return flash(response, 'error', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirmPassword) {
      return flash(response, 'error', 'Passwords do not match.');
    }
    if (await userRepo.findOne({ where: { username } })) {
      return flash(response, 'error', `The username "${username}" is already taken.`);
    }
    if (await userRepo.findOne({ where: { email: invite.email } })) {
      return flash(response, 'error', `An account already exists for ${invite.email}.`);
    }

    const user = userRepo.create({
      uuid: randomUUID(),
      fullName: invite.fullName,
      username,
      email: invite.email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      ip: invite.ip,
      isAdmin,
    });

    // Create the account and mark the request approved atomically.
    await AppDataSource.transaction(async (manager) => {
      await manager.save(user);
      invite.status = 'approved';
      await manager.save(invite);
    });

    return flash(
      response,
      'ok',
      `Account "${username}" created for ${invite.email}${isAdmin ? ' (admin).' : '.'}`,
    );
  } catch (error) {
    next(error);
  }
});

// Approve a pending request by emailing the applicant a signup link; the
// account is created when they complete signup at /signup/:token.
adminRouter.post('/invites/:id/invite', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return flash(response, 'error', 'Invalid invite request.');
    }

    const grantAdmin = request.body?.isAdmin !== undefined;
    const inviteRepo = AppDataSource.getRepository(InviteRequest);
    const userRepo = AppDataSource.getRepository(User);

    const invite = await inviteRepo.findOne({ where: { id } });
    if (!invite) {
      return flash(response, 'error', 'Invite request not found.');
    }
    if (invite.status !== 'pending') {
      return flash(response, 'error', 'That request has already been handled.');
    }
    if (await userRepo.findOne({ where: { email: invite.email } })) {
      return flash(response, 'error', `An account already exists for ${invite.email}.`);
    }

    const signupUrl = `${APP_URL}/signup/${invite.uuid}`;
    try {
      await sendInviteEmail(invite.email, invite.fullName, signupUrl);
    } catch (sendError) {
      // Send failed — leave the request pending so it can be retried.
      return flash(
        response,
        'error',
        sendError instanceof Error ? sendError.message : 'Could not send the invite email.',
      );
    }

    invite.status = 'invited';
    invite.grantAdmin = grantAdmin;
    invite.invitedAt = new Date();
    await inviteRepo.save(invite);

    return flash(response, 'ok', `Invite email sent to ${invite.email}.`);
  } catch (error) {
    next(error);
  }
});

// Resend the signup email for an already-invited request (also resets the
// 14-day link expiry by updating invitedAt).
adminRouter.post('/invites/:id/resend', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return flash(response, 'error', 'Invalid invite request.');
    }

    const inviteRepo = AppDataSource.getRepository(InviteRequest);
    const invite = await inviteRepo.findOne({ where: { id } });
    if (!invite) {
      return flash(response, 'error', 'Invite request not found.');
    }
    if (invite.status !== 'invited') {
      return flash(response, 'error', 'That request has no outstanding invite to resend.');
    }

    const signupUrl = `${APP_URL}/signup/${invite.uuid}`;
    try {
      await sendInviteEmail(invite.email, invite.fullName, signupUrl);
    } catch (sendError) {
      return flash(
        response,
        'error',
        sendError instanceof Error ? sendError.message : 'Could not send the invite email.',
      );
    }

    invite.invitedAt = new Date();
    await inviteRepo.save(invite);

    return flash(response, 'ok', `Invite email resent to ${invite.email}.`);
  } catch (error) {
    next(error);
  }
});

// Reject a pending request.
adminRouter.post('/invites/:id/reject', async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      return flash(response, 'error', 'Invalid invite request.');
    }

    const inviteRepo = AppDataSource.getRepository(InviteRequest);
    const invite = await inviteRepo.findOne({ where: { id } });
    if (!invite) {
      return flash(response, 'error', 'Invite request not found.');
    }
    if (invite.status !== 'pending') {
      return flash(response, 'error', 'That request has already been handled.');
    }

    invite.status = 'rejected';
    await inviteRepo.save(invite);

    return flash(response, 'ok', `Rejected the invite request from ${invite.email}.`);
  } catch (error) {
    next(error);
  }
});

// Read-only request log — newest first, capped to the most recent N rows.
const REQUEST_LOG_LIMIT = 500;

function statusClass(status: number): string {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  if (status >= 200) return 'success';
  return 'secondary';
}

function methodClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'secondary';
    case 'POST': return 'primary';
    case 'PUT': return 'info';
    case 'PATCH': return 'warning';
    case 'DELETE': return 'danger';
    default: return 'secondary';
  }
}

adminRouter.get('/logs', async (
  _request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(RequestLog);
    const [rows, totalCount] = await repo.findAndCount({
      order: { createdAt: 'DESC' },
      take: REQUEST_LOG_LIMIT,
    });

    const logs = rows.map((row) => ({
      timestamp: row.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      method: row.method,
      methodClass: methodClass(row.method),
      path: row.path,
      query: row.query,
      status: row.status,
      statusClass: statusClass(row.status),
      durationMs: row.durationMs,
      ip: row.ip,
      userAgent: row.userAgent ?? '—',
      referer: row.referer ?? '—',
      contentLength: row.contentLength,
    }));

    response.render('admin-logs', {
      ...config,
      layout: 'admin',
      title: `Request Logs · ${config.name}`,
      year: new Date().getFullYear(),
      navLogs: true,
      logs,
      shownCount: logs.length,
      totalCount,
      limit: REQUEST_LOG_LIMIT,
      isTruncated: totalCount > logs.length,
      pageScripts: ['/admin-assets/js/ip-lookup.js'],
    });
  } catch (error) {
    next(error);
  }
});

// IPv4 (incl. ::ffff:-mapped) or IPv6, anchored — anything funky won't reach ipinfo.
const IP_PATTERN = /^(?:::ffff:)?(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

// Proxy a single IP lookup to ipinfo.io. Already behind requireAdmin via the
// router-wide guard. Returns the raw ipinfo payload on success.
adminRouter.get('/ip-lookup', async (
  request: Request,
  response: Response,
): Promise<void> => {
  const ip = typeof request.query.ip === 'string' ? request.query.ip.trim() : '';
  if (!ip || !IP_PATTERN.test(ip)) {
    response.status(400).json({ error: 'Missing or invalid ip parameter.' });
    return;
  }

  const token = process.env.IPINFO_KEY;
  if (!token) {
    response.status(500).json({ error: 'IP lookup is not configured.' });
    return;
  }

  try {
    const upstream = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`,
    );
    if (!upstream.ok) {
      response.status(upstream.status).json({ error: `ipinfo.io returned ${upstream.status}` });
      return;
    }
    response.json(await upstream.json());
  } catch (_error) {
    response.status(502).json({ error: 'Failed to reach ipinfo.io.' });
  }
});

// Read-only users list.
adminRouter.get('/users', async (
  _request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const all = await AppDataSource.getRepository(User).find({
      order: { createdAt: 'DESC' },
    });

    const users = all.map((user) => ({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      ip: user.ip ?? '—',
      joinedAt: formatJoined(user.createdAt),
      isAdmin: user.isAdmin,
      hasPaid: user.hasPaid,
      paidAt: user.paidAt
        ? user.paidAt.toISOString().slice(0, 16).replace('T', ' ')
        : null,
      stripeRef: user.stripePaymentIntentId,
    }));

    response.render('admin-users', {
      ...config,
      layout: 'admin',
      title: `Users · ${config.name}`,
      year: new Date().getFullYear(),
      navUsers: true,
      users,
      totalCount: all.length,
      adminCount: all.filter((user) => user.isAdmin).length,
      paidCount: all.filter((user) => user.hasPaid && !user.isAdmin).length,
    });
  } catch (error) {
    next(error);
  }
});
