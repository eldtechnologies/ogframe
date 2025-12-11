/**
 * URL Utilities
 * Normalization, validation, and domain matching
 */

import { OGFrameError } from '../types.js';

/**
 * Normalize URL to prevent cache spam
 *
 * Examples:
 * - https://example.com/page?ref=twitter → https://example.com/page
 * - https://example.com/page/ → https://example.com/page
 * - HTTPS://EXAMPLE.COM/Page → https://example.com/page
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Normalize: protocol + hostname + pathname (lowercase, no trailing slash, no query)
    const normalized = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`
      .toLowerCase()
      .replace(/\/$/, ''); // Remove trailing slash

    return normalized;
  } catch (error) {
    throw new OGFrameError('INVALID_URL', `Invalid URL: ${url}`, 400);
  }
}

/**
 * Validate URL against security rules
 */
export function validateUrl(url: string, allowedDomains: string[], requireHttps: boolean = false): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch (error) {
    throw new OGFrameError('INVALID_URL', `Malformed URL: ${url}`, 400);
  }

  // Check protocol
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new OGFrameError('INVALID_URL', 'Only HTTPS URLs allowed in production', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OGFrameError('INVALID_URL', 'Only HTTP/HTTPS protocols allowed', 400);
  }

  // Check domain is allowed
  const domainAllowed = allowedDomains.some(allowed =>
    matchDomain(parsed.hostname, allowed)
  );

  if (!domainAllowed) {
    throw new OGFrameError(
      'DOMAIN_NOT_ALLOWED',
      `Domain ${parsed.hostname} not allowed for this key`,
      403,
      {
        domain: parsed.hostname,
        allowedDomains
      }
    );
  }

  // Block dangerous ports
  const dangerousPorts = ['22', '23', '25', '3306', '5432', '6379', '27017', '9200', '11211'];
  if (parsed.port && dangerousPorts.includes(parsed.port)) {
    throw new OGFrameError('INVALID_URL', `Port ${parsed.port} not allowed`, 400);
  }

  // Check URL length
  if (url.length > 2048) {
    throw new OGFrameError('INVALID_URL', 'URL too long (max 2048 characters)', 400);
  }
}

/**
 * Match domain against pattern (supports wildcards)
 *
 * Examples:
 * - matchDomain('example.com', 'example.com') → true
 * - matchDomain('sub.example.com', '*.example.com') → true
 * - matchDomain('example.com', '*.example.com') → true
 * - matchDomain('localhost:8080', 'localhost:*') → true
 */
export function matchDomain(actual: string, pattern: string): boolean {
  // Exact match
  if (actual === pattern) return true;

  // Wildcard subdomain: *.example.com
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return actual === base || actual.endsWith('.' + base);
  }

  // Port wildcard: localhost:*
  if (pattern.includes(':*')) {
    const base = pattern.split(':')[0];
    return actual.startsWith(base + ':') || actual === base;
  }

  return false;
}

/**
 * Extract base domain to prevent subdomain abuse
 *
 * Examples:
 * - a.b.example.com → example.com
 * - example.com → example.com
 * - sub.example.co.uk → example.co.uk
 */
export function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  // Handle special TLDs (co.uk, com.au, etc.)
  const specialTLDs = ['co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz'];
  const lastTwo = parts.slice(-2).join('.');

  if (specialTLDs.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}
