/**
 * Create the first admin user — a one-off, non-interactive bootstrap script.
 *
 * Run with:  npm run create-admin
 *
 * Reads the new admin's details from environment variables:
 *   ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD
 *
 * Writes to the same SQLite database the app uses (DATABASE_PATH / DATABASE_NAME).
 * Safe to re-run: if the target email is already an admin it exits without changes.
 */
import 'reflect-metadata';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Load env before importing the data source — app-data-source.ts reads
// DATABASE_PATH / DATABASE_NAME at module-evaluation time, so the data source
// is pulled in dynamically inside main() once dotenv has populated process.env.
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

/** No-op logger so TypeORM's SQL chatter doesn't clutter the output. */
const silentLogger: import('typeorm').Logger = {
  logQuery() {},
  logQueryError() {},
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration() {},
  log() {},
};

async function main(): Promise<void> {
  const fullName = (process.env.ADMIN_NAME ?? '').trim();
  const username = (process.env.ADMIN_USERNAME ?? '').trim();
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';

  if (!fullName || !username || !email || !password) {
    console.error('✗  Set ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD.');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`✗  ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const { AppDataSource } = await import('../src/app-data-source');
  const { User } = await import('../src/entities/user.entity');

  AppDataSource.logger = silentLogger;
  await AppDataSource.initialize();

  try {
    const userRepo = AppDataSource.getRepository(User);

    // Match an existing account by either unique field.
    const existing = await userRepo.findOne({ where: [{ email }, { username }] });
    if (existing?.email === email && existing.isAdmin) {
      console.log(`✓  ${email} is already an admin — nothing to do.`);
      return;
    }
    if (existing?.email === email) {
      throw new Error(`A non-admin account already exists for ${email}; not modifying it.`);
    }
    if (existing) {
      throw new Error(`The username "${username}" is already taken by another account.`);
    }

    const user = userRepo.create({
      uuid: randomUUID(),
      fullName,
      username,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      ip: null,
      isAdmin: true,
      hasPaid: true, // admins are exempt from the membership fee
    });
    await userRepo.save(user);

    console.log(`✓  Created admin ${email} (username "${username}").`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('✗ ', error instanceof Error ? error.message : error);
  process.exit(1);
});
