/**
 * Back up the SQLite database to S3 — a one-off, non-interactive script.
 *
 * Run with:  npm run backup
 *
 * Uploads a consistent snapshot of the app's SQLite database (resolved from
 * DATABASE_PATH / DATABASE_NAME, same as the running app) to the bucket named
 * by S3_BUCKET_BACKUPS, under a key that includes the UTC date/time — e.g.
 * `database-2026-06-01T12-34-56-789Z.sqlite`.
 *
 * The bucket region comes from S3_REGION_BACKUPS (falling back to AWS_REGION);
 * credentials come from the standard provider chain (AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY, or an IAM role) — same as the mailer.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Load env before importing the data source — app-data-source.ts reads
// DATABASE_PATH / DATABASE_NAME at module-evaluation time.
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

async function main(): Promise<void> {
  const bucket = (process.env.S3_BUCKET_BACKUPS ?? '').trim();
  if (!bucket) {
    console.error('✗  Set S3_BUCKET_BACKUPS to the destination bucket name.');
    process.exit(1);
  }

  // Reuse the app's resolved SQLite path so the backup always tracks the live DB.
  const { databaseFile } = await import('../src/app-data-source');
  if (!fs.existsSync(databaseFile)) {
    console.error(`✗  Database file not found: ${databaseFile}`);
    process.exit(1);
  }

  // UTC timestamp, filename-safe (no ':' or '.').
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(databaseFile, path.extname(databaseFile));
  const key = `${baseName}-${timestamp}.sqlite`;

  // Snapshot to a temp file first, so we upload a consistent copy even if the
  // server is writing concurrently (SQLite's online backup, via better-sqlite3).
  const tmpFile = path.join(os.tmpdir(), `island-backup-${timestamp}.sqlite`);
  const db = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(tmpFile);
  } finally {
    db.close();
  }

  try {
    const body = fs.readFileSync(tmpFile);
    const region = process.env.S3_REGION_BACKUPS || process.env.AWS_REGION;
    const s3 = new S3Client({ region });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/x-sqlite3',
    }));
    console.log(`✓  Backed up ${databaseFile} → s3://${bucket}/${key} (${body.length} bytes).`);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

main().catch((error: unknown) => {
  console.error('✗ ', error instanceof Error ? error.message : error);
  process.exit(1);
});
