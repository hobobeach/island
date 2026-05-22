import { AppDataSource } from '../app-data-source';
import { BannedIp } from '../entities/banned-ip.entity';

// In-memory set of banned IPs, loaded at boot and mutated by the ban/unban
// admin endpoints. Each request only needs an O(1) `has()` check on this set,
// so the block middleware doesn't hit the DB on the hot path.
const banned = new Set<string>();

/** Populate the cache from the DB. Call once at server start. */
export async function init(): Promise<void> {
  const rows = await AppDataSource.getRepository(BannedIp).find({ select: { ip: true } });
  banned.clear();
  for (const row of rows) banned.add(row.ip);
}

export function isBanned(ip: string | null | undefined): boolean {
  return !!ip && banned.has(ip);
}

export function rememberBan(ip: string): void {
  banned.add(ip);
}

export function forgetBan(ip: string): void {
  banned.delete(ip);
}

export function size(): number {
  return banned.size;
}
