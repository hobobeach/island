import { RequestHandler } from 'express';
import { AppDataSource } from '../app-data-source';
import { RequestLog } from '../entities/request-log.entity';
import { getClientIp } from '../shared/ip';

const enabled = (process.env.TRAFFIC_LOG_ENABLED ?? 'true').toLowerCase() !== 'false';
const retentionDays = Math.max(0, Number(process.env.TRAFFIC_LOG_RETENTION_DAYS ?? '30'));
const skipPaths = (process.env.TRAFFIC_LOG_SKIP_PATHS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function shouldSkip(path: string): boolean {
  return skipPaths.some(prefix => path.startsWith(prefix));
}

function maybePruneOld(): void {
  if (retentionDays <= 0) return;
  if (Math.random() > 0.01) return;

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  AppDataSource.getRepository(RequestLog)
    .createQueryBuilder()
    .delete()
    .where('createdAt < :cutoff', { cutoff })
    .execute()
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[traffic] retention prune failed: ${message}`);
    });
}

export const trafficLogger: RequestHandler = (request, response, next) => {
  if (!enabled) return next();

  const path = request.originalUrl.split('?')[0];
  if (shouldSkip(path)) return next();

  const start = Date.now();

  response.on('finish', () => {
    const repo = AppDataSource.getRepository(RequestLog);
    const queryString = request.originalUrl.includes('?')
      ? request.originalUrl.slice(request.originalUrl.indexOf('?') + 1)
      : null;
    const contentLengthHeader = response.get('content-length');

    const row = repo.create({
      method: request.method,
      path,
      query: queryString,
      status: response.statusCode,
      durationMs: Date.now() - start,
      ip: getClientIp(request),
      userAgent: request.get('user-agent') ?? null,
      referer: request.get('referer') ?? null,
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
    });

    repo.save(row).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[traffic] write failed: ${message}`);
    });

    maybePruneOld();
  });

  next();
};
