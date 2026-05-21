import { Request } from 'express';
import requestIp from 'request-ip';

/**
 * Strip the IPv4-mapped-IPv6 prefix from an address. Node's dual-stack socket
 * reports IPv4 peers as "::ffff:127.0.0.1"; we store the plain "127.0.0.1".
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

/**
 * Best-effort client IP: consults proxy headers (X-Forwarded-For, X-Real-IP,
 * etc.) before the socket peer, then normalizes the IPv4-mapped form.
 */
export function getClientIp(request: Request): string | null {
  return normalizeIp(requestIp.getClientIp(request));
}
