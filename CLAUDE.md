# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OGFrame is a self-hosted OG image generator that screenshots web pages and serves them as Open Graph images. Built with Hono (web framework), Playwright (screenshots), and TypeScript.

## Commands

```bash
npm run dev              # Development server with hot reload
npm run build            # Compile TypeScript to dist/
npm run start            # Production server
npm run test             # Run tests (Vitest)
npm run lint             # ESLint
npm run format           # Prettier
npm run generate-key     # CLI for API key management
```

**Generate API keys:**
```bash
npm run generate-key public "Name" domain1.com,domain2.com
npm run generate-key admin "Name"
```

## Architecture

```
src/
├── index.ts           # Hono server, routes, middleware
├── types.ts           # TypeScript interfaces, error classes
├── config.ts          # Environment-based configuration
├── cli.ts             # API key generation CLI
├── services/
│   ├── auth.ts        # API key validation, domain scoping
│   ├── cache.ts       # File-based caching with SHA-256 keys
│   ├── rateLimit.ts   # Two-tier rate limiting (requests + generations)
│   └── screenshot.ts  # Playwright browser automation
└── utils/
    ├── crypto.ts      # Hashing, timing-safe comparisons
    ├── url.ts         # URL normalization, validation
    └── logger.ts      # Structured JSON logging
```

**Request Flow:**
1. `/api/image?key={apiKey}&url={targetUrl}` receives request
2. Auth service validates key and domain scope
3. URL normalized (strips query params, fragments, trailing slash)
4. Cache checked using SHA-256 hash of normalized URL
5. Rate limits enforced (per-key, per-domain, per-IP)
6. Screenshot taken with Playwright if cache miss (semaphore limits to 3 concurrent)
7. PNG returned with cache headers

## Key Patterns

**Security:**
- Public keys: plaintext, domain-scoped (supports wildcards like `*.example.com`)
- Admin keys: SHA-256 hashed, unrestricted
- All comparisons use `crypto.timingSafeEqual`

**Caching:**
- Cache keys: SHA-256 of normalized URL
- Storage: `cache/images/{xx}/{hash}.png` (2-char directory sharding)
- Metadata: JSON file tracks access count, generation time, etc.

**Rate Limiting:**
- Two-tier: requests/min (1000 default) and generations/min (10 default)
- In-memory store with TTL cleanup every 60 seconds

**Screenshot Settings:**
- Viewport: 1200x630 (OG standard)
- Wait: `networkidle` + 1500ms delay
- Chromium launched per-request with security flags

## API Endpoints

- `GET /api/image?key=&url=` - Main screenshot endpoint
- `GET /health` - Health check
- `GET /admin/cache/stats` - Cache statistics (admin)
- `DELETE /admin/cache/:key` - Delete cache entry (admin)
- `DELETE /admin/cache?all=true` - Purge cache (admin)

## Configuration

Key environment variables (see `config.ts` for all):
- `PORT` (3000)
- `LOG_LEVEL` (debug|info|warn|error)
- `SCREENSHOT_TIMEOUT` (30000ms)
- `MAX_CONCURRENT_SCREENSHOTS` (3)
- `REQUIRE_HTTPS` (false in dev, true in prod)
- `CACHE_DIR` (./cache)
- `API_KEYS_FILE` (./config/keys.json)

## Docker

```bash
docker-compose build
docker-compose up -d
```

Multi-stage Dockerfile with Alpine, non-root user, pre-installed Chromium.

## Git Commit Guidelines

**Format:**
```
<type>: <short summary>

<optional body with details>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

**Rules:**
- Use imperative mood ("Add feature" not "Added feature")
- Keep subject line under 72 characters
- No period at end of subject line
- Separate subject from body with blank line
- Do NOT include Claude Code attribution or co-author tags
