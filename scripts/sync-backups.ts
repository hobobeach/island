/**
 * Pull S3 backup files that aren't present locally — a one-off, local script.
 *
 * Run with:  npm run sync-backups
 *
 * Lists the `*.sqlite` objects in S3_BUCKET_BACKUPS and downloads any whose
 * filename is missing from the local backup directory (BACKUP_LOCAL_DIR,
 * default ~/Dropbox/Backups/island). One-way pull: files that exist only
 * locally are left untouched. Region/credentials come from the standard AWS
 * provider chain (S3_REGION_BACKUPS || AWS_REGION).
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

async function main(): Promise<void> {
  const bucket = (process.env.S3_BUCKET_BACKUPS ?? '').trim();
  if (!bucket) {
    console.error('✗  Set S3_BUCKET_BACKUPS to the source bucket name.');
    process.exit(1);
  }

  const localDir = process.env.BACKUP_LOCAL_DIR
    || path.join(os.homedir(), 'Dropbox', 'Backups', 'island');
  fs.mkdirSync(localDir, { recursive: true });
  const local = new Set(fs.readdirSync(localDir));

  const region = process.env.S3_REGION_BACKUPS || process.env.AWS_REGION;
  const s3 = new S3Client({ region });

  // List every backup object, paginating since backups accumulate over time.
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    for (const obj of page.Contents ?? []) {
      if (obj.Key && obj.Key.endsWith('.sqlite')) keys.push(obj.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  // Compare on filename, so a flat S3 key maps to one local file.
  const missing = keys.filter((key) => !local.has(path.basename(key)));
  console.log(
    `${keys.length} backup(s) in s3://${bucket}, ${local.size} local — ${missing.length} to download.`,
  );

  let downloaded = 0;
  for (const key of missing) {
    const dest = path.join(localDir, path.basename(key));
    const tmp = `${dest}.part`;
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) throw new Error('empty response body');
      // Stream to a temp file, then rename — so an interrupted download never
      // leaves a partial file that looks "already synced" next run.
      await pipeline(res.Body as Readable, fs.createWriteStream(tmp));
      fs.renameSync(tmp, dest);
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      throw error;
    }
    downloaded += 1;
    console.log(`  ↓ ${key}`);
  }

  console.log(`✓  Synced ${downloaded} new backup(s) → ${localDir}.`);
}

main().catch((error: unknown) => {
  console.error('✗ ', error instanceof Error ? error.message : error);
  process.exit(1);
});
