/**
 * Rate Limiting Service
 * Two-tier rate limiting: total requests + generations
 */

import type { ApiKey } from '../types.js';
import { RateLimitError } from '../types.js';
import { logger } from '../utils/logger.js';
import { getBaseDomain } from '../utils/url.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;  // Unix timestamp
}

// In-memory rate limit store
// TODO: Use Redis for production multi-instance deployments
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Check and enforce rate limit
 */
async function enforceLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No entry or expired - create new
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + (windowSeconds * 1000)
    });
    return;
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    logger.warn('Rate limit exceeded', {
      key,
      limit,
      count: entry.count,
      retryAfter
    });

    throw new RateLimitError(
      `Rate limit exceeded for ${key}`,
      limit,
      windowSeconds,
      retryAfter
    );
  }
}

/**
 * Get domain from Referer header
 */
function getDomainFromReferer(referer: string | null): string | null {
  if (!referer) return null;

  try {
    const url = new URL(referer);
    return getBaseDomain(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Check rate limits for a request
 */
export async function checkRateLimit(
  apiKey: ApiKey,
  referer: string | null,
  ip: string,
  isCacheHit: boolean
): Promise<void> {
  const windowSeconds = 60; // 1 minute window

  // 1. Global request limit (all requests, regardless of cache)
  const requestLimit = apiKey.rateLimit.requests;
  const requestKey = `req:${apiKey.keyId}`;
  await enforceLimit(requestKey, requestLimit, windowSeconds);

  // 2. If cache miss, check generation limit (stricter)
  if (!isCacheHit) {
    const generationLimit = apiKey.rateLimit.generations;
    const generationKey = `gen:${apiKey.keyId}`;
    await enforceLimit(generationKey, generationLimit, windowSeconds);

    // 3. Per-domain generation limit (for public keys)
    if (apiKey.type === 'public') {
      const domain = getDomainFromReferer(referer);
      if (domain) {
        const domainKey = `gen:${apiKey.keyId}:${domain}`;
        await enforceLimit(domainKey, generationLimit, windowSeconds);
      }
    }
  }

  // 4. IP-based rate limiting (prevent single IP from abusing multiple keys)
  if (ip !== 'unknown') {
    const ipLimit = isCacheHit ? 2000 : 50; // Much stricter for generations
    const ipKey = `ip:${ip}:${isCacheHit ? 'req' : 'gen'}`;
    await enforceLimit(ipKey, ipLimit, windowSeconds);
  }
}

/**
 * Get current rate limit status for debugging
 */
export function getRateLimitStatus(key: string): RateLimitEntry | null {
  return rateLimitStore.get(key) || null;
}

/**
 * Reset rate limit for a key (admin only)
 */
export function resetRateLimit(keyPattern: string): number {
  let count = 0;
  for (const [key] of rateLimitStore.entries()) {
    if (key.includes(keyPattern)) {
      rateLimitStore.delete(key);
      count++;
    }
  }
  logger.info('Rate limits reset', { pattern: keyPattern, count });
  return count;
}
