/**
 * OGFrame Configuration
 * Environment-based configuration with sensible defaults
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { KeyConfig } from './types.js';

function getEnvInt(key: string, defaultValue: number, min: number, max: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }

  const clamped = Math.min(Math.max(parsed, min), max);
  if (clamped !== parsed) {
    console.warn(`${key} out of range (${min}-${max}), clamped to: ${clamped}`);
  }

  return clamped;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config = {
  // Service
  nodeEnv: getEnvString('NODE_ENV', 'development'),
  port: getEnvInt('PORT', 3000, 1024, 65535),
  logLevel: getEnvString('LOG_LEVEL', 'info'),

  // Cache
  cacheDir: getEnvString('CACHE_DIR', './cache'),
  cacheMaxSize: getEnvString('CACHE_MAX_SIZE', '10GB'),
  cacheMaxEntries: getEnvInt('CACHE_MAX_ENTRIES', 100000, 100, 1000000),

  // Screenshot
  screenshotTimeout: getEnvInt('SCREENSHOT_TIMEOUT', 30000, 5000, 60000),
  screenshotWidth: getEnvInt('SCREENSHOT_WIDTH', 1200, 100, 2400),
  screenshotHeight: getEnvInt('SCREENSHOT_HEIGHT', 630, 100, 1260),
  maxConcurrentScreenshots: getEnvInt('MAX_CONCURRENT_SCREENSHOTS', 3, 1, 10),

  // Security
  apiKeysFile: getEnvString('API_KEYS_FILE', './config/keys.json'),
  requireHttps: getEnvBool('REQUIRE_HTTPS', false), // Allow HTTP in dev

  // Rate Limiting
  rateLimitWindow: getEnvInt('RATE_LIMIT_WINDOW', 60, 10, 3600),

  // Performance
  maxRequestSize: getEnvString('MAX_REQUEST_SIZE', '1mb'),
  maxUrlLength: getEnvInt('MAX_URL_LENGTH', 2048, 100, 4096),

  // Monitoring
  enableMetrics: getEnvBool('ENABLE_METRICS', true),

  get isDevelopment() {
    return this.nodeEnv === 'development';
  },

  get isProduction() {
    return this.nodeEnv === 'production';
  }
};

/**
 * Load API keys from config file
 */
export function loadKeys(): KeyConfig {
  try {
    const keysPath = resolve(config.apiKeysFile);
    const keysData = readFileSync(keysPath, 'utf-8');
    const parsed = JSON.parse(keysData) as KeyConfig;

    if (!parsed.keys || !Array.isArray(parsed.keys)) {
      throw new Error('Invalid keys.json format: missing "keys" array');
    }

    console.log(`Loaded ${parsed.keys.length} API keys from ${keysPath}`);
    return parsed;
  } catch (error) {
    console.error('Failed to load API keys:', error);
    throw new Error(`Could not load API keys from ${config.apiKeysFile}`);
  }
}

export default config;
