import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { databaseFile } from '../app-data-source';

export interface BackupResult {
  bucket: string;
  key: string;
  bytes: number;
}

/**
 * Snapshots the app's SQLite database and uploads it to S3.
 *
 * The destination bucket is `S3_BUCKET_BACKUPS`; the region is
 * `S3_REGION_BACKUPS` (falling back to `AWS_REGION`), with credentials from the
 * standard AWS provider chain — same as the mailer. The object key embeds a
 * filename-safe UTC timestamp, e.g. `database-2026-06-01T12-34-56-789Z.sqlite`.
 *
 * Returns details of the upload; throws on any failure (the caller logs). No
 * `console.*` / `process.exit` here so it's safe to call in-process.
 */
export async function backupDatabaseToS3(): Promise<BackupResult> {
  const bucket = (process.env.S3_BUCKET_BACKUPS ?? '').trim();
  if (!bucket) {
    throw new Error('S3_BUCKET_BACKUPS is not set.');
  }
  if (!fs.existsSync(databaseFile)) {
    throw new Error(`Database file not found: ${databaseFile}`);
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
    return { bucket, key, bytes: body.length };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}
