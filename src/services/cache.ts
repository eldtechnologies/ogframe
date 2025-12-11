/**
 * Cache Service
 * File-based caching with metadata tracking
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import type { CacheEntry, CacheMetadata, CacheStatsResponse } from '../types.js';
import { generateCacheKey } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import config from '../config.js';

const CACHE_DIR = config.cacheDir;
const IMAGES_DIR = join(CACHE_DIR, 'images');
const METADATA_FILE = join(CACHE_DIR, 'metadata.json');

// In-memory cache for fast access
let metadata: CacheMetadata = {};
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Initialize cache directories and load metadata
 */
export function initCache(): void {
  // Create directories
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    logger.info('Created cache directory', { path: CACHE_DIR });
  }

  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
    logger.info('Created images directory', { path: IMAGES_DIR });
  }

  // Load or create metadata
  if (existsSync(METADATA_FILE)) {
    try {
      const data = readFileSync(METADATA_FILE, 'utf-8');
      metadata = JSON.parse(data);
      logger.info('Loaded cache metadata', {
        entries: Object.keys(metadata).length
      });
    } catch (error) {
      logger.error('Failed to load cache metadata', { error });
      metadata = {};
    }
  } else {
    metadata = {};
    saveMetadata();
    logger.info('Initialized new cache metadata');
  }
}

/**
 * Save metadata to disk
 */
function saveMetadata(): void {
  try {
    writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save cache metadata', { error });
  }
}

/**
 * Get cache file path for a cache key
 */
function getCacheFilePath(cacheKey: string): string {
  // Use first 2 characters as subdirectory to avoid too many files in one dir
  const subdir = cacheKey.slice(0, 2);
  const subdirPath = join(IMAGES_DIR, subdir);

  if (!existsSync(subdirPath)) {
    mkdirSync(subdirPath, { recursive: true });
  }

  return join(subdirPath, `${cacheKey}.png`);
}

/**
 * Get cached image if exists
 */
export async function getFromCache(normalizedUrl: string): Promise<Buffer | null> {
  const cacheKey = generateCacheKey(normalizedUrl);
  const entry = metadata[cacheKey];

  if (!entry) {
    cacheMisses++;
    return null;
  }

  // Check if file exists
  if (!existsSync(entry.filePath)) {
    logger.warn('Cache metadata exists but file missing', {
      url: normalizedUrl,
      cacheKey
    });
    delete metadata[cacheKey];
    saveMetadata();
    cacheMisses++;
    return null;
  }

  // Update access stats
  entry.lastAccessed = new Date().toISOString();
  entry.accessCount++;
  saveMetadata();

  // Read and return image
  try {
    const imageBuffer = readFileSync(entry.filePath);
    cacheHits++;
    logger.debug('Cache hit', {
      url: normalizedUrl,
      cacheKey,
      accessCount: entry.accessCount
    });
    return imageBuffer;
  } catch (error) {
    logger.error('Failed to read cached image', {
      url: normalizedUrl,
      cacheKey,
      error
    });
    cacheMisses++;
    return null;
  }
}

/**
 * Save image to cache
 */
export async function saveToCache(
  url: string,
  normalizedUrl: string,
  imageBuffer: Buffer,
  generationTime: number
): Promise<CacheEntry> {
  const cacheKey = generateCacheKey(normalizedUrl);
  const filePath = getCacheFilePath(cacheKey);

  // Write image file
  try {
    writeFileSync(filePath, imageBuffer);
  } catch (error) {
    logger.error('Failed to write cache file', {
      url,
      cacheKey,
      error
    });
    throw error;
  }

  // Create metadata entry
  const entry: CacheEntry = {
    url,
    normalizedUrl,
    cacheKey,
    filePath,
    size: imageBuffer.length,
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    accessCount: 1,
    generationTime
  };

  metadata[cacheKey] = entry;
  saveMetadata();

  logger.info('Saved to cache', {
    url,
    cacheKey,
    size: imageBuffer.length,
    generationTime
  });

  return entry;
}

/**
 * Get cache entry metadata
 */
export function getCacheEntry(normalizedUrl: string): CacheEntry | null {
  const cacheKey = generateCacheKey(normalizedUrl);
  return metadata[cacheKey] || null;
}

/**
 * Delete cache entry
 */
export function deleteCacheEntry(cacheKey: string): boolean {
  const entry = metadata[cacheKey];
  if (!entry) return false;

  // Delete file
  try {
    if (existsSync(entry.filePath)) {
      unlinkSync(entry.filePath);
    }
  } catch (error) {
    logger.error('Failed to delete cache file', { cacheKey, error });
  }

  // Delete metadata
  delete metadata[cacheKey];
  saveMetadata();

  logger.info('Deleted cache entry', { cacheKey, url: entry.url });
  return true;
}

/**
 * Purge entire cache
 */
export function purgeCache(): number {
  const keys = Object.keys(metadata);

  for (const key of keys) {
    deleteCacheEntry(key);
  }

  logger.info('Purged entire cache', { count: keys.length });
  return keys.length;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStatsResponse {
  const entries = Object.values(metadata);

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      totalSize: '0 B',
      oldestEntry: null,
      newestEntry: null,
      hitRate: {
        last1h: 0,
        last24h: 0,
        last7d: 0
      },
      topUrls: []
    };
  }

  // Calculate total size
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  const totalSize = formatBytes(totalBytes);

  // Find oldest and newest
  const sorted = [...entries].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const oldestEntry = sorted[0].createdAt;
  const newestEntry = sorted[sorted.length - 1].createdAt;

  // Calculate hit rate
  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;

  // Top URLs by access count
  const topUrls = [...entries]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 10)
    .map(e => ({
      url: e.url,
      hits: e.accessCount,
      size: formatBytes(e.size)
    }));

  return {
    totalEntries: entries.length,
    totalSize,
    oldestEntry,
    newestEntry,
    hitRate: {
      last1h: hitRate,
      last24h: hitRate,
      last7d: hitRate
    },
    topUrls
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Get cache hit rate
 */
export function getCacheHitRate(): number {
  const total = cacheHits + cacheMisses;
  return total > 0 ? cacheHits / total : 0;
}
