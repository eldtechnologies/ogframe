/**
 * OGFrame v2.0
 * Self-hosted OG image generator
 *
 * Simple: Screenshot URL → Serve as OG image
 * Secure: Domain-scoped API keys
 * Fast: Aggressive caching
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import type { ApiKey, ImageRequest, HealthResponse, ErrorResponse } from './types.js';
import { OGFrameError } from './types.js';
import { initAuth, requireAuth, requireAdminAuth } from './services/auth.js';
import { initCache, getFromCache, saveToCache, getCacheEntry, deleteCacheEntry, purgeCache, getCacheStats, getCacheHitRate } from './services/cache.js';
import { checkRateLimit } from './services/rateLimit.js';
import { generateScreenshot } from './services/screenshot.js';
import { normalizeUrl, validateUrl } from './utils/url.js';
import { logger } from './utils/logger.js';
import config from './config.js';

const app = new Hono();

// Track start time for uptime
const startTime = Date.now();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  logger.info('Request completed', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration
  });
});

// Error handler
app.onError((err, c) => {
  if (err instanceof OGFrameError) {
    logger.warn('Request error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details
    });

    return c.json<ErrorResponse>({
      error: err.message,
      code: err.code,
      details: err.details
    }, err.statusCode as any);
  }

  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack
  });

  return c.json<ErrorResponse>({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  }, 500);
});

// ============================================
// Main Endpoint: Generate OG Image
// ============================================

app.get('/api/image', async (c: Context) => {
  const startTime = Date.now();

  // 1. Extract and validate parameters
  const key = c.req.query('key');
  const url = c.req.query('url');

  if (!key || !url) {
    throw new OGFrameError(
      'INVALID_PARAMS',
      'Missing required parameters: key and url',
      400
    );
  }

  // 2. Authenticate
  const apiKey: ApiKey = requireAuth(key);

  // 3. Validate and normalize URL
  validateUrl(url, apiKey.allowedDomains, config.requireHttps);
  const normalizedUrl = normalizeUrl(url);

  // 4. Check cache first
  const cached = await getFromCache(normalizedUrl);
  const isCacheHit = cached !== null;

  // 5. Rate limiting
  const referer = c.req.header('referer') || null;
  const ip = c.req.header('x-real-ip') ||
             c.req.header('x-forwarded-for')?.split(',')[0] ||
             'unknown';

  await checkRateLimit(apiKey, referer, ip, isCacheHit);

  // 6. Return cached or generate new
  let imageBuffer: Buffer;
  let cacheEntry = getCacheEntry(normalizedUrl);

  if (cached) {
    // Cache HIT
    imageBuffer = cached;
    logger.debug('Serving from cache', { url: normalizedUrl });
  } else {
    // Cache MISS - generate screenshot
    logger.info('Cache miss - generating screenshot', { url });
    const generationStart = Date.now();

    imageBuffer = await generateScreenshot(url);
    const generationTime = Date.now() - generationStart;

    // Save to cache
    cacheEntry = await saveToCache(url, normalizedUrl, imageBuffer, generationTime);
  }

  const totalTime = Date.now() - startTime;

  // 7. Set response headers
  c.header('Content-Type', 'image/png');
  c.header('Content-Length', imageBuffer.length.toString());
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  c.header('X-Cache-Status', isCacheHit ? 'HIT' : 'MISS');
  c.header('X-Generation-Time', `${cacheEntry?.generationTime || totalTime}ms`);

  if (cacheEntry) {
    c.header('ETag', `"${cacheEntry.cacheKey}"`);
  }

  logger.info('Image served', {
    url: normalizedUrl,
    cacheStatus: isCacheHit ? 'HIT' : 'MISS',
    size: imageBuffer.length,
    totalTime
  });

  return new Response(imageBuffer, {
    status: 200,
    headers: c.res.headers
  });
});

// ============================================
// Health Check
// ============================================

app.get('/health', (c: Context) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const stats = getCacheStats();

  const response: HealthResponse = {
    status: 'healthy',
    version: '2.0.0',
    uptime,
    timestamp: new Date().toISOString(),
    cache: {
      enabled: true,
      entries: stats.totalEntries,
      size: stats.totalSize,
      hitRate: getCacheHitRate()
    }
  };

  return c.json(response);
});

// ============================================
// Admin Endpoints
// ============================================

// Get cache stats
app.get('/admin/cache/stats', (c: Context) => {
  const authHeader = c.req.header('authorization') ?? c.req.query('key') ?? null;
  requireAdminAuth(authHeader);

  const stats = getCacheStats();
  return c.json(stats);
});

// Delete specific cache entry
app.delete('/admin/cache/:key', (c: Context) => {
  const authHeader = c.req.header('authorization') ?? c.req.query('key') ?? null;
  requireAdminAuth(authHeader);

  const cacheKey = c.req.param('key');
  const deleted = deleteCacheEntry(cacheKey);

  if (!deleted) {
    throw new OGFrameError('NOT_FOUND', 'Cache entry not found', 404);
  }

  return c.json({ success: true, cacheKey });
});

// Purge entire cache
app.delete('/admin/cache', (c: Context) => {
  const authHeader = c.req.header('authorization') ?? c.req.query('key') ?? null;
  requireAdminAuth(authHeader);

  const all = c.req.query('all');
  if (all !== 'true') {
    throw new OGFrameError(
      'INVALID_PARAMS',
      'Must provide ?all=true to purge entire cache',
      400
    );
  }

  const count = purgeCache();
  logger.info('Cache purged by admin', { count });

  return c.json({ success: true, purgedEntries: count });
});

// ============================================
// Initialize & Start Server
// ============================================

async function main() {
  try {
    logger.info('Starting OGFrame v2.0...');

    // Initialize services
    logger.info('Initializing services...');
    initAuth();
    initCache();

    // Start server
    const port = config.port;
    logger.info(`Starting HTTP server on port ${port}...`);

    serve({
      fetch: app.fetch,
      port
    });

    logger.info('OGFrame server started successfully', {
      port,
      environment: config.nodeEnv,
      cacheDir: config.cacheDir
    });

    console.log(`
┌─────────────────────────────────────────────┐
│                                             │
│   🖼️  OGFrame v2.0                          │
│   Self-Hosted OG Image Generator            │
│                                             │
│   Status: Running                           │
│   Port: ${port}                                │
│   Environment: ${config.nodeEnv}                   │
│                                             │
│   Health: http://localhost:${port}/health      │
│   Docs: https://github.com/eldtech/ogframe │
│                                             │
└─────────────────────────────────────────────┘
    `);

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
main();
