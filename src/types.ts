/**
 * OGFrame Types
 * Clean, simple type definitions for the screenshot-only approach
 */

export interface ApiKey {
  keyId: string;
  type: 'public' | 'admin';
  name: string;
  allowedDomains: string[];
  rateLimit: {
    requests: number;     // Total requests per minute
    generations: number;  // New screenshots per minute
  };
  createdAt: string;
  expiresAt?: string | null;
}

export interface AdminKey {
  keyHash: string;  // SHA-256 hash of actual admin key
  type: 'admin';
  name: string;
  createdAt: string;
}

export interface KeyConfig {
  keys: (ApiKey | AdminKey)[];
}

export interface ImageRequest {
  key: string;  // API key
  url: string;  // URL to screenshot
}

export interface CacheEntry {
  url: string;
  normalizedUrl: string;
  cacheKey: string;
  filePath: string;
  size: number;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  generationTime: number;  // milliseconds
}

export interface CacheMetadata {
  [cacheKey: string]: CacheEntry;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  cache: {
    enabled: boolean;
    entries: number;
    size: string;
    hitRate: number;
  };
}

export interface CacheStatsResponse {
  totalEntries: number;
  totalSize: string;
  oldestEntry: string | null;
  newestEntry: string | null;
  hitRate: {
    last1h: number;
    last24h: number;
    last7d: number;
  };
  topUrls: Array<{
    url: string;
    hits: number;
    size: string;
  }>;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
}

export class OGFrameError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'OGFrameError';
  }
}

export class RateLimitError extends OGFrameError {
  constructor(
    message: string,
    public limit: number,
    public windowSeconds: number,
    public retryAfter: number
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, {
      limit,
      window: `${windowSeconds} seconds`,
      retryAfter
    });
  }
}
