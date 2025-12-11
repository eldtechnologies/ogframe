/**
 * Authentication Service
 * API key validation and domain scoping
 */

import type { ApiKey, AdminKey, KeyConfig } from '../types.js';
import { OGFrameError } from '../types.js';
import { timingSafeCompare, hashKey } from '../utils/crypto.js';
import { loadKeys } from '../config.js';
import { logger } from '../utils/logger.js';

let keyConfig: KeyConfig;

/**
 * Initialize auth service by loading keys
 */
export function initAuth(): void {
  keyConfig = loadKeys();
  logger.info('Auth service initialized', {
    publicKeys: keyConfig.keys.filter(k => k.type === 'public').length,
    adminKeys: keyConfig.keys.filter(k => k.type === 'admin').length
  });
}

/**
 * Validate API key and return key config
 */
export function validateApiKey(providedKey: string): ApiKey | null {
  if (!keyConfig) {
    throw new Error('Auth service not initialized');
  }

  // Check public keys (stored in plain text - they're meant to be public)
  for (const key of keyConfig.keys) {
    if (key.type === 'public') {
      const publicKey = key as ApiKey;
      if (timingSafeCompare(publicKey.keyId, providedKey)) {
        // Check expiration
        if (publicKey.expiresAt) {
          const expiryDate = new Date(publicKey.expiresAt);
          if (expiryDate < new Date()) {
            logger.warn('Expired key used', { keyId: publicKey.keyId });
            return null;
          }
        }

        logger.debug('Valid public key', { keyId: publicKey.keyId });
        return publicKey;
      }
    }
  }

  // Check admin keys (stored as hashes)
  const providedHash = hashKey(providedKey);
  for (const key of keyConfig.keys) {
    if (key.type === 'admin') {
      const adminKey = key as AdminKey;
      if (timingSafeCompare(adminKey.keyHash, providedHash)) {
        logger.debug('Valid admin key', { name: adminKey.name });
        // Convert AdminKey to ApiKey format for consistency
        return {
          keyId: providedKey, // Original key (for admin operations)
          type: 'admin',
          name: adminKey.name,
          allowedDomains: ['*'], // Admin can access all
          rateLimit: {
            requests: 10000,
            generations: 1000
          },
          createdAt: adminKey.createdAt
        };
      }
    }
  }

  logger.warn('Invalid API key attempted', {
    keyPrefix: providedKey.slice(0, 7) + '...'
  });
  return null;
}

/**
 * Check if key is admin
 */
export function isAdminKey(key: ApiKey): boolean {
  return key.type === 'admin';
}

/**
 * Validate request has required authentication
 */
export function requireAuth(authHeader: string | null): ApiKey {
  if (!authHeader) {
    throw new OGFrameError('INVALID_KEY', 'Missing API key', 401);
  }

  // Support both query param and Bearer token
  let providedKey: string;
  if (authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7);
  } else {
    providedKey = authHeader;
  }

  const key = validateApiKey(providedKey);
  if (!key) {
    throw new OGFrameError('INVALID_KEY', 'Invalid API key', 401);
  }

  return key;
}

/**
 * Require admin key for sensitive operations
 */
export function requireAdminAuth(authHeader: string | null): ApiKey {
  const key = requireAuth(authHeader);

  if (!isAdminKey(key)) {
    throw new OGFrameError('FORBIDDEN', 'Admin key required', 403);
  }

  return key;
}
