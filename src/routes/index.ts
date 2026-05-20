import express, { NextFunction, Request, Response } from 'express';

import { AppDataSource } from '../app-data-source';
import { User } from '../entities/user.entity';
import { config } from '../shared/config';
import { optionalAuth } from '../middlewares/auth';

export const indexRouter = express.Router();

const JOINED_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function renderLanding(response: Response): void {
  response.render('index', {
    ...config,
    isHome: true,
    title: 'Island: An invite-only online community',
  });
}

indexRouter.get('/', optionalAuth, async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  const payload = request.user as { id?: number } | undefined;

  // Anonymous → existing landing page.
  if (!payload?.id) {
    renderLanding(response);
    return;
  }

  try {
    // Fresh DB read so hasPaid reflects state since the JWT was issued.
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: payload.id },
    });

    // Token references a deleted user → treat as anonymous.
    if (!user) {
      renderLanding(response);
      return;
    }

    if (!user.isAdmin && !user.hasPaid) {
      response.redirect('/pay');
      return;
    }

    response.render('member-dashboard', {
      ...config,
      layout: 'member',
      title: `Dashboard · ${config.name}`,
      year: new Date().getFullYear(),
      navDashboard: true,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      hasPaid: user.hasPaid,
      joinedAt: JOINED_DATE_FMT.format(user.createdAt),
      paidAt: user.paidAt ? JOINED_DATE_FMT.format(user.paidAt) : null,
    });
  } catch (error) {
    next(error);
  }
});
