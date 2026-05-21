/**
 * Truncate every table managed by AppDataSource — a destructive one-off.
 *
 * Run with:  npm run truncate-tables
 *
 * Prints the DB path + current row counts, then prompts on stdin. The prompt
 * requires the literal word "yes" — Enter, "y", or anything else aborts.
 *
 * Writes to the same SQLite database the app uses (DATABASE_PATH / DATABASE_NAME).
 */
import 'reflect-metadata';
import path from 'path';
import readline from 'readline';
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

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const { AppDataSource } = await import('../src/app-data-source');

  AppDataSource.logger = silentLogger;
  await AppDataSource.initialize();

  try {
    const dbPath = (AppDataSource.options as { database?: string }).database ?? '(unknown)';
    const tables = AppDataSource.entityMetadatas.map((m) => m.tableName);

    console.log(`Database: ${dbPath}`);
    console.log('');
    console.log('Current row counts:');
    let grandTotal = 0;
    for (const table of tables) {
      const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM "${table}"`);
      const count = Number(n);
      grandTotal += count;
      console.log(`  ${table.padEnd(20)} ${count}`);
    }
    console.log('');

    if (grandTotal === 0) {
      console.log('All tables are already empty — nothing to do.');
      return;
    }

    console.log(`This will DELETE ALL ROWS from ${tables.length} table(s) (${grandTotal} total).`);
    console.log('This action cannot be undone.');
    console.log('');
    const answer = (await prompt('Type "yes" to confirm: ')).trim();
    if (answer !== 'yes') {
      console.log('Aborted — no changes made.');
      return;
    }

    // PRAGMA foreign_keys cannot be toggled inside a transaction, so set it
    // on the connection first, then run the deletes in one transaction.
    const queryRunner = AppDataSource.createQueryRunner();
    try {
      await queryRunner.query('PRAGMA foreign_keys = OFF');
      await queryRunner.startTransaction();
      try {
        for (const table of tables) {
          await queryRunner.query(`DELETE FROM "${table}"`);
        }
        // sqlite_sequence only exists if any column was declared AUTOINCREMENT;
        // ignore the "no such table" error otherwise.
        try {
          await queryRunner.query('DELETE FROM sqlite_sequence');
        } catch (_error) {
          // expected when no AUTOINCREMENT columns are present
        }
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.query('PRAGMA foreign_keys = ON');
      }
    } finally {
      await queryRunner.release();
    }

    console.log('');
    console.log('Done. Row counts now:');
    for (const table of tables) {
      const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM "${table}"`);
      console.log(`  ${table.padEnd(20)} ${Number(n)}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
