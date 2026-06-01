/**
 * Back up the SQLite database to S3 — a one-off, non-interactive script.
 *
 * Run with:  npm run backup
 *
 * Thin CLI wrapper around `backupDatabaseToS3()` (src/shared/backup.ts), which
 * holds the actual snapshot/upload logic (also used by the production cron
 * scheduler). Uploads to the bucket named by S3_BUCKET_BACKUPS under a key that
 * includes the UTC date/time. Region/credentials come from the standard AWS
 * provider chain (S3_REGION_BACKUPS || AWS_REGION).
 */
import path from 'path';
import dotenv from 'dotenv';

// Load env before importing the backup module — it pulls in app-data-source.ts,
// which reads DATABASE_PATH / DATABASE_NAME at module-evaluation time.
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

async function main(): Promise<void> {
  const { backupDatabaseToS3 } = await import('../src/shared/backup');
  const { bucket, key, bytes } = await backupDatabaseToS3();
  console.log(`✓  Backed up → s3://${bucket}/${key} (${bytes} bytes).`);
}

main().catch((error: unknown) => {
  console.error('✗ ', error instanceof Error ? error.message : error);
  process.exit(1);
});
