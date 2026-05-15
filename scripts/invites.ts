/**
 * Invite Request Manager — an interactive CLI for reviewing pending invite
 * requests and turning approved ones into user accounts.
 *
 * Run with:  npm run invites
 *
 * Note: this writes to the same SQLite database the app uses
 * (DATABASE_NAME, default ./database.sqlite).
 */
import 'reflect-metadata';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import * as readline from 'readline/promises';
import { Writable } from 'stream';
import { stdin as input, stdout as output } from 'process';
import { randomUUID } from 'crypto';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/**
 * A stdout proxy that can be muted. readline has no built-in input masking,
 * so we point readline at this stream and mute it while a password is typed —
 * readline still captures the line, the terminal just shows nothing.
 */
class MutableStdout extends Writable {
  muted = false;

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      output.write(chunk, encoding);
    }
    callback();
  }

  get isTTY(): boolean | undefined {
    return output.isTTY;
  }

  get columns(): number | undefined {
    return output.columns;
  }

  get rows(): number | undefined {
    return output.rows;
  }
}

// Load env before importing the data source — app-data-source.ts reads
// DATABASE_NAME at module-evaluation time, so the entities/data source are
// pulled in dynamically inside main() once dotenv has populated process.env.
const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

/** No-op logger so TypeORM's SQL chatter doesn't drown out the prompts. */
const silentLogger: import('typeorm').Logger = {
  logQuery() {},
  logQueryError() {},
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration() {},
  log() {},
};

async function main(): Promise<void> {
  const { AppDataSource } = await import('../src/app-data-source');
  const { InviteRequest } = await import('../src/entities/invite-request.entity');
  const { User } = await import('../src/entities/user.entity');

  // Keep the prompts readable — replace the console logger with a silent one.
  // (setOptions({ logging: false }) won't rebuild the logger, so swap it directly.)
  AppDataSource.logger = silentLogger;
  await AppDataSource.initialize();

  const inviteRepo = AppDataSource.getRepository(InviteRequest);
  const userRepo = AppDataSource.getRepository(User);

  const mutableOut = new MutableStdout();
  const rl = readline.createInterface({ input, output: mutableOut });
  const ask = (question: string): Promise<string> => rl.question(question);

  // Like ask(), but mutes the terminal while the answer is typed so the
  // password isn't echoed (the label is printed first, then output is muted).
  const askPassword = async (label: string): Promise<string> => {
    output.write(label);
    mutableOut.muted = true;
    try {
      return await rl.question('');
    } finally {
      mutableOut.muted = false;
      output.write('\n');
    }
  };

  try {
    while (true) {
      const pending = await inviteRepo.find({
        where: { status: 'pending' },
        order: { createdAt: 'ASC' },
      });

      console.log('\n=== Invite Request Manager ===\n');

      if (pending.length === 0) {
        console.log('No pending invite requests. 🎉\n');
        break;
      }

      console.log(`${pending.length} pending invite request(s):\n`);
      pending.forEach((req, i) => {
        const when = req.createdAt.toISOString().slice(0, 10);
        console.log(`  [${i + 1}] ${req.fullName} <${req.email}>`);
        console.log(`      requested ${when} · IP ${req.ip ?? 'unknown'}`);
      });
      console.log('');

      const choice = (await ask('Select a request to review (number), or [q]uit: ')).trim();
      if (choice === '' || choice.toLowerCase() === 'q') {
        break;
      }

      const index = Number(choice) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= pending.length) {
        console.log('⚠  Invalid selection.');
        continue;
      }

      const request = pending[index];
      console.log(`\nRequest #${request.id}`);
      console.log(`  Full name: ${request.fullName}`);
      console.log(`  Email:     ${request.email}`);
      console.log(`  IP:        ${request.ip ?? 'unknown'}`);
      console.log(`  Requested: ${request.createdAt.toISOString()}\n`);

      const action = (await ask('Action — [a]pprove, [r]eject, [s]kip: ')).trim().toLowerCase();

      if (action === 'r' || action === 'reject') {
        request.status = 'rejected';
        await inviteRepo.save(request);
        console.log(`✗  Rejected invite request from ${request.email}.`);
        continue;
      }

      if (action !== 'a' && action !== 'approve') {
        console.log('Skipped.');
        continue;
      }

      // Approving — make sure the email isn't already an account.
      const existingByEmail = await userRepo.findOne({ where: { email: request.email } });
      if (existingByEmail) {
        console.log(
          `⚠  An account already exists for ${request.email} ` +
            `(username: ${existingByEmail.username}).`,
        );
        const markAnyway = (await ask('Mark this request approved anyway? [y/N]: '))
          .trim()
          .toLowerCase();
        if (markAnyway === 'y' || markAnyway === 'yes') {
          request.status = 'approved';
          await inviteRepo.save(request);
          console.log('Request marked approved.');
        }
        continue;
      }

      // Pick a username — default to the email's local part.
      const suggested = request.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '');
      let username = '';
      while (true) {
        const answer = (await ask(`Username for the new account [${suggested}]: `)).trim();
        username = answer === '' ? suggested : answer;
        if (!username) {
          console.log('⚠  Username cannot be empty.');
          continue;
        }
        const taken = await userRepo.findOne({ where: { username } });
        if (taken) {
          console.log(`⚠  Username "${username}" is already taken.`);
          continue;
        }
        break;
      }

      // Set an initial password — masked, entered twice to catch typos.
      let passwordHash = '';
      while (true) {
        const password = await askPassword('Password for the new account: ');
        if (password.length < MIN_PASSWORD_LENGTH) {
          console.log(`⚠  Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
          continue;
        }
        const confirm = await askPassword('Confirm password: ');
        if (password !== confirm) {
          console.log('⚠  Passwords do not match.');
          continue;
        }
        passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        break;
      }

      const adminAnswer = (await ask('Grant admin privileges? [y/N]: ')).trim().toLowerCase();
      const isAdmin = adminAnswer === 'y' || adminAnswer === 'yes';

      const user = userRepo.create({
        uuid: randomUUID(),
        fullName: request.fullName,
        username,
        email: request.email,
        passwordHash,
        ip: request.ip,
        isAdmin,
      });

      // Create the account and mark the request approved atomically.
      await AppDataSource.transaction(async (manager) => {
        await manager.save(user);
        request.status = 'approved';
        await manager.save(request);
      });

      console.log(`\n✓  Account created for ${user.fullName}`);
      console.log(`   username: ${user.username}${isAdmin ? '  (admin)' : ''}`);
      console.log(`   uuid:     ${user.uuid}`);
    }
  } finally {
    rl.close();
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  // stdin reached EOF (Ctrl-D, or piped/non-interactive input) — exit quietly.
  if ((error as { code?: string } | null)?.code === 'ERR_USE_AFTER_CLOSE') {
    console.log('\nAborted.');
    process.exit(0);
  }
  console.error('Invite manager failed:', error);
  process.exit(1);
});
