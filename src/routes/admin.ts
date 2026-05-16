import express, { Request, Response, NextFunction } from 'express';

import { config } from '../shared/config';
import { requireAdmin } from '../middlewares/auth';
import { AppDataSource } from '../app-data-source';
import { InviteRequest } from '../entities/invite-request.entity';

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
  _request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const all = await AppDataSource.getRepository(InviteRequest).find({
      order: { createdAt: 'DESC' },
    });

    // Pending requests float to the top; each group stays newest-first.
    const ordered = [
      ...all.filter((request) => request.status === 'pending'),
      ...all.filter((request) => request.status !== 'pending'),
    ];

    const requests = ordered.map((request) => ({
      fullName: request.fullName,
      email: request.email,
      ip: request.ip ?? '—',
      userAgent: request.userAgent ?? '—',
      referer: request.referer ?? '—',
      requestedAt: request.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      statusLabel: request.status.charAt(0).toUpperCase() + request.status.slice(1),
      statusClass: STATUS_CLASS[request.status] ?? 'secondary',
    }));

    response.render('admin-invites', {
      ...config,
      layout: 'admin',
      title: `Invite Requests · ${config.name}`,
      year: new Date().getFullYear(),
      navInvites: true,
      requests,
      pendingCount: all.filter((request) => request.status === 'pending').length,
      totalCount: all.length,
    });
  } catch (error) {
    next(error);
  }
});
