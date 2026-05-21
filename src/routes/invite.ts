import express, { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import { randomUUID } from 'crypto';

import { AppDataSource } from '../app-data-source';
import { InviteRequest } from '../entities/invite-request.entity';
import { getClientIp } from '../shared/ip';

export const inviteRouter = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

inviteRouter.post('/', async (
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawFullName = typeof request.body?.fullName === 'string' ? request.body.fullName : '';
    const rawEmail = typeof request.body?.email === 'string' ? request.body.email : '';

    const fullName = rawFullName.trim();
    const email = rawEmail.trim().toLowerCase();

    if (!fullName || !email) {
      return next(createError(400, 'Full name and email are required.'));
    }

    if (fullName.length > 200 || email.length > 320) {
      return next(createError(400, 'Full name or email is too long.'));
    }

    if (!EMAIL_PATTERN.test(email)) {
      return next(createError(400, 'Invalid email address.'));
    }

    const repo = AppDataSource.getRepository(InviteRequest);

    const existing = await repo.findOne({ where: { email }, select: ['id'] });
    if (existing) {
      return next(createError(409, 'This email has already requested an invite.'));
    }

    const row = repo.create({
      uuid: randomUUID(),
      fullName,
      email,
      ip: getClientIp(request),
      userAgent: request.get('user-agent') ?? null,
      referer: request.get('referer') ?? null,
    });

    try {
      await repo.save(row);
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'SQLITE_CONSTRAINT') {
        return next(createError(409, 'This email has already requested an invite.'));
      }
      throw error;
    }

    response.status(201).json({ status: 'ok', uuid: row.uuid });
  } catch (error) {
    next(error);
  }
});
