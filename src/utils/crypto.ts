/**
 * Cryptographic Utilities
 * Hashing, cache key generation, and timing-safe comparisons
 */

import { createHash, timingSafeEqual } from 'crypto';

/**
 * Generate cache key from normalized URL
 */
export function generateCacheKey(normalizedUrl: string): string {
  return createHash('sha256')
    .update(normalizedUrl)
    .digest('hex');
}

/**
 * Hash API key for storage (admin keys only)
 */
export function hashKey(key: string): string {
  return createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks on key validation
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    // Ensure same length to prevent timing leak
    if (bufA.length !== bufB.length) {
      // Still do comparison to maintain constant time
      const dummyA = createHash('sha256').update(bufA).digest();
      const dummyB = createHash('sha256').update(bufB).digest();
      timingSafeEqual(dummyA, dummyB);
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generate random API key
 */
export function generateApiKey(type: 'public' | 'admin'): string {
  const prefix = type === 'public' ? 'pk' : 'ak';
  const randomBytes = createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('base64url')
    .slice(0, 32);

  return `${prefix}_live_${randomBytes}`;
}
