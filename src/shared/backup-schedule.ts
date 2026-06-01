import cron from 'node-cron';

import { backupDatabaseToS3 } from './backup';
import { log, logWarning, logError } from './log';

// Default cadence: every 6 hours, on the hour (UTC). Override via env.
const DEFAULT_SCHEDULE = '0 */6 * * *';

/**
 * Registers a recurring SQLite→S3 backup, but only in production.
 *
 * No-ops outside production, and skips (with a warning) if `S3_BUCKET_BACKUPS`
 * is unset or `BACKUP_CRON_SCHEDULE` is invalid — so it never throws at boot.
 * Each run is wrapped so a failed backup logs but never crashes the server;
 * `noOverlap` lets node-cron skip a tick if the previous run is still going.
 */
export function startBackupSchedule(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const bucket = (process.env.S3_BUCKET_BACKUPS ?? '').trim();
  if (!bucket) {
    logWarning('S3_BUCKET_BACKUPS is not set — automatic database backups are disabled.');
    return;
  }

  const schedule = (process.env.BACKUP_CRON_SCHEDULE || DEFAULT_SCHEDULE).trim();
  if (!cron.validate(schedule)) {
    logWarning(`BACKUP_CRON_SCHEDULE "${schedule}" is not a valid cron expression — backups not scheduled.`);
    return;
  }

  cron.schedule(schedule, async () => {
    try {
      const { key, bytes } = await backupDatabaseToS3();
      log(`Backed up database → s3://${bucket}/${key} (${bytes} bytes).`);
    } catch (error) {
      logError(error, { method: 'cron', url: 'backupDatabaseToS3' });
    }
  }, { timezone: 'Etc/UTC', noOverlap: true, name: 'db-backup' });

  log(`Scheduled database backups (${schedule} UTC) → s3://${bucket}.`);
}
