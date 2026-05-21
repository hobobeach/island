/**
 * Strip the IPv4-mapped-IPv6 prefix ("::ffff:") from existing IP values in
 * every table that stores one. Idempotent — safe to re-run.
 *
 * Run with:  npm run normalize-ips
 *
 * Writes to the same SQLite database the app uses (DATABASE_PATH / DATABASE_NAME).
 */
import 'reflect-metadata';
import path from 'path';
import dotenv from 'dotenv';

const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../.env.${environment}`) });

const silentLogger: import('typeorm').Logger = {
  logQuery() {},
  logQueryError() {},
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration() {},
  log() {},
};

// Tables to scrub, keyed by table name → ip column name.
const TARGETS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'request_logs', column: 'ip' },
  { table: 'invite_requests', column: 'ip' },
  { table: 'users', column: 'ip' },
];

const PREFIX = '::ffff:';

async function main(): Promise<void> {
  const { AppDataSource } = await import('../src/app-data-source');

  AppDataSource.logger = silentLogger;
  await AppDataSource.initialize();

  try {
    const dbPath = (AppDataSource.options as { database?: string }).database ?? '(unknown)';
    console.log(`Database: ${dbPath}`);
    console.log('');

    let grandAffected = 0;
    for (const { table, column } of TARGETS) {
      const [{ n }] = await AppDataSource.query(
        `SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" LIKE ?`,
        [`${PREFIX}%`],
      );
      const affected = Number(n);

      if (affected === 0) {
        console.log(`  ${table.padEnd(20)} 0 rows to update`);
        continue;
      }

      await AppDataSource.query(
        `UPDATE "${table}" SET "${column}" = SUBSTR("${column}", ${PREFIX.length + 1}) WHERE "${column}" LIKE ?`,
        [`${PREFIX}%`],
      );
      console.log(`  ${table.padEnd(20)} ${affected} row(s) updated`);
      grandAffected += affected;
    }

    console.log('');
    console.log(grandAffected === 0
      ? 'Nothing to do — no rows carry the prefix.'
      : `Done. ${grandAffected} row(s) normalized.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
