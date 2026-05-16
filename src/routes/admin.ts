import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { config } from '../shared/config';
import { requireAdmin } from '../middlewares/auth';
import { AppDataSource } from '../app-data-source';
import { InviteRequest } from '../entities/invite-request.entity';
import { User } from '../entities/user.entity';

export const adminRouter = express.Router();

// Every admin route requires an authenticated admin.
adminRouter.use(requireAdmin);

// Dashboard-only vendor scripts, loaded after the layout's core bundle.
const DASHBOARD_SCRIPTS = [
  '/admin-assets/vendor/moment.min.js',
  '/admin-assets/vendor/daterangepicker.js',
  '/admin-assets/vendor/apexcharts.min.js',
  '/admin-assets/js/dashboard-init.js',
];

const STATUS_CLASS: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/** Post/Redirect/Get back to the list with a one-off flash message. */
function flash(response: Response, key: 'ok' | 'error', message: string): void {
  response.redirect(`/admin/invites?${key}=${encodeURIComponent(message)}`);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

adminRouter.get('/', (_request: Request, response: Response): void => {
  response.render('admin', {
    ...config,
    layout: 'admin',
    title: `Dashboard · ${config.name}`,
    year: new Date().getFullYear(),
    navDashboard: true,
    pageScripts: DASHBOARD_SCRIPTS,
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
