import chalk from 'chalk';

import { config } from './config';

const prefix = `[${config.emoji} ${config.name}]:`;

export function log(message: string): void {
  console.log(chalk.bold(`${prefix} ${message}`));
}

export function logError(
  error: unknown,
  context?: { method?: string; url?: string }
): void {
  logSpacer();
  const message = error instanceof Error ? error.message : String(error);
  const where = context?.method && context?.url ? ` (${context.method} ${context.url})` : '';
  console.error(chalk.bgRed(`${prefix} An error has occurred${where}: ${message}`));
  if (error instanceof Error && error.stack) {
    console.error(chalk.gray(error.stack));
  }
}

export function logWarning(message: string): void {
  console.warn(chalk.bgYellow(`${prefix} Warning: ${message}`));
}

export function logSpacer(): void {
  console.log(``);
}