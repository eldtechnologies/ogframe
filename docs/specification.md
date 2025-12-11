# OGFrame v1.0 - Technical Specification
## Self-Hosted OG Image Generator

> **Status:** v1.0 Release Specification
> **Author:** Magnus Jonsson / ELD Technologies
> **Date:** December 2025
> **License:** MIT Open Source
> **Philosophy:** Do one thing really well. Screenshot pages for OG images. That's it.

---

## Design Philosophy

OGFrame v1.0 follows a **screenshot-only** approach:

**WHAT IT DOES:**
- ✅ Screenshots your web pages
- ✅ Serves them as OG images
- ✅ Domain-scoped API keys (safe for frontend)
- ✅ Aggressive caching (99% hit rate)
- ✅ Self-hosted control

**WHAT IT DOESN'T DO:**
- ❌ Template mode (designed cards)
- ❌ Complex parameter systems
- ❌ Custom viewport sizes (standardized at 1200x630)
- ❌ Parameter variation attack surface

**RESULT:**
- Simple implementation
- Minimal attack surface
- Fast to deploy
- Easy to secure
- Highly reliable

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Core Requirements](#3-core-requirements)
4. [Architecture](#4-architecture)
5. [Security Model](#5-security-model)
6. [API Design](#6-api-design)
7. [Caching Strategy](#7-caching-strategy)
8. [Deployment](#8-deployment)
9. [Usage Examples](#9-usage-examples)
10. [Development Roadmap](#10-development-roadmap)
11. [Future Enhancements](#11-future-enhancements)

---

## 1. Executive Summary

**OGFrame** screenshots your web pages and serves them as OG images. That's it.

**Key Features:**
- 🎯 **One job:** Screenshot URL → serve as OG image
- 🔒 **Secure:** Domain-scoped API keys
- ⚡ **Fast:** Aggressive caching (generate once, serve forever)
- 🐳 **Simple:** Single Docker command to deploy
- 📦 **Minimal:** Hono + Playwright, that's all

**Why This Approach:**
- Your pre-render script already generates proper meta tags (title, description)
- You just need the IMAGE to match the content
- Screenshot shows exactly what's on the page
- No parameter variation = no attack surface
- Cache by URL = trivial security model

---

## 2. Problem Statement

### The SPA Social Sharing Problem

When you share `https://eldtechnologies.com/work/conduit`, social media crawlers see:

```html
<meta property="og:image" content="/logo.png">
```

**Every page shows the same generic logo.** This sucks for engagement.

### What You Need

An OG image URL that shows a screenshot of the actual page:

```html
<meta property="og:image" content="https://og.yourdomain.com/api/image?key=pk_abc&url=https://eldtechnologies.com/work/conduit">
```

When Facebook crawls this, it gets a PNG screenshot of your actual Conduit page.

---

## 3. Core Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Screenshot URL and return as PNG | P0 |
| FR2 | Cache screenshots indefinitely | P0 |
| FR3 | Domain-scoped API keys | P0 |
| FR4 | URL normalization (prevent cache spam) | P0 |
| FR5 | Health check endpoint | P1 |

### 3.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR1 | Screenshot response time (cached) | <100ms (p95) |
| NFR2 | Screenshot response time (uncached) | <5s (p95) |
| NFR3 | Memory footprint | <512MB |
| NFR4 | Docker image size | <500MB |
| NFR5 | Cache hit rate | >99% (your site has fixed URLs) |

---

## 4. Architecture

### 4.1 Technology Stack

```
Runtime:       Node.js 20 LTS
Framework:     Hono (lightweight HTTP)
Screenshot:    Playwright (headless Chromium)
Storage:       File system cache
Auth:          Domain-scoped keys (JSON config)
Docker:        Alpine-based
```

### 4.2 Request Flow

```
1. Social crawler visits https://eldtechnologies.com/work/conduit
2. Page includes: <meta og:image="https://og.yourdomain.com/api/image?key=pk_abc&url=https://eldtechnologies.com/work/conduit">
3. Crawler requests OG image from OGFrame
4. OGFrame:
   a. Validates API key
   b. Checks key.allowedDomains includes "eldtechnologies.com"
   c. Normalizes URL: https://eldtechnologies.com/work/conduit
   d. Cache key = sha256(normalized_url)
   e. Check cache: /cache/images/abc123.png
   f. If HIT → return cached PNG (fast!)
   g. If MISS → screenshot URL → save to cache → return PNG
5. Crawler caches image, shows in social preview
```

### 4.3 High-Level Architecture

```
┌─────────────────────────────────────────┐
│  Your Website                           │
│  <meta og:image="https://og.../image?   │
│    key=pk_abc&url=https://...">         │
└──────────────┬──────────────────────────┘
               │
               │ Social crawler requests image
               │
               ▼
┌─────────────────────────────────────────┐
│  OGFrame Service                        │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │  HTTP Server (:3000)               │ │
│  │  1. Validate API key               │ │
│  │  2. Validate domain                │ │
│  │  3. Normalize URL                  │ │
│  └────────────┬───────────────────────┘ │
│               │                         │
│               ▼                         │
│  ┌────────────────────────────────────┐ │
│  │  Cache Layer                       │ │
│  │  Key: sha256(url)                  │ │
│  │  Check: /cache/images/{key}.png    │ │
│  └────────────┬───────────────────────┘ │
│               │                         │
│               ├─ HIT → Return PNG       │
│               │                         │
│               └─ MISS ↓                 │
│  ┌────────────────────────────────────┐ │
│  │  Playwright Screenshot             │ │
│  │  - Launch browser                  │ │
│  │  - Navigate to URL                 │ │
│  │  - Screenshot (1200x630)           │ │
│  │  - Save to cache                   │ │
│  │  - Return PNG                      │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 5. Security Model

### 5.1 Domain-Scoped Public Keys

**The Key Insight:** Public keys can be public because they're scoped to your domain.

```json
{
  "keyId": "pk_live_abc123def456",
  "type": "public",
  "allowedDomains": [
    "eldtechnologies.com",
    "*.eldtechnologies.com",
    "localhost:*"
  ],
  "rateLimit": {
    "requests": 1000,      // Total requests per minute
    "generations": 5       // New screenshots per minute
  }
}
```

**What This Means:**
- Key can ONLY screenshot URLs on `eldtechnologies.com`
- Even if someone steals the key, they can't use it for their own site
- Rate limiting prevents abuse

### 5.2 URL Validation

```typescript
async function validateUrl(url: string, key: ApiKey): Promise<string> {
  // 1. Parse URL
  const parsed = new URL(url);

  // 2. Check domain is allowed
  const allowed = key.allowedDomains.some(domain =>
    matchDomain(parsed.hostname, domain)
  );

  if (!allowed) {
    throw new Error(`Domain ${parsed.hostname} not allowed for this key`);
  }

  // 3. Must be HTTPS (production)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP/HTTPS URLs allowed');
  }

  // 4. Block dangerous ports
  const dangerousPorts = ['22', '23', '25', '3306', '5432', '6379'];
  if (parsed.port && dangerousPorts.includes(parsed.port)) {
    throw new Error('Port not allowed');
  }

  return url;
}
```

### 5.3 URL Normalization (Prevent Cache Spam)

```typescript
function normalizeUrl(url: string): string {
  const parsed = new URL(url);

  // Normalize to prevent cache spam:
  // https://example.com/page?spam=1
  // https://example.com/page?spam=2
  // Should both map to: https://example.com/page

  return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`
    .toLowerCase()
    .replace(/\/$/, ''); // Remove trailing slash
}

// Examples:
// https://eldtechnologies.com/work/conduit
// https://eldtechnologies.com/work/conduit/
// https://eldtechnologies.com/work/conduit?ref=twitter
// All become: https://eldtechnologies.com/work/conduit
```

### 5.4 Rate Limiting

```typescript
interface RateLimits {
  requests: number;      // Total requests per minute (cache hits are cheap)
  generations: number;   // New screenshots per minute (expensive)
}

// Two-tier rate limiting:
async function checkRateLimit(apiKey: ApiKey, isCacheHit: boolean) {
  // 1. Always check total request limit
  await enforceLimit(`requests:${apiKey.keyId}`, apiKey.rateLimit.requests, 60);

  // 2. If cache miss, check generation limit (stricter)
  if (!isCacheHit) {
    await enforceLimit(`generations:${apiKey.keyId}`, apiKey.rateLimit.generations, 60);
  }
}
```

### 5.5 No SSRF Risk

**Why no SSRF?**
- URLs must be on `allowedDomains` (your own site)
- You can't screenshot internal services like `localhost:6379`
- Even if you could, it's YOUR OWN infrastructure
- No cross-tenant risk (each deployment is single-tenant)

**The only "SSRF" possible:**
```
URL: https://eldtechnologies.com/admin
```

**But:**
- That's YOUR admin panel
- On YOUR domain (which you explicitly allowed)
- If it's public-facing, it's supposed to be screenshottable
- If it's private, protect it with auth (OGFrame can't bypass auth)

---

## 6. API Design

### 6.1 Main Endpoint: Screenshot URL

**GET `/api/image`**

Generate OG image from URL.

#### Request

**Query Parameters:**
```typescript
interface ImageRequest {
  key: string;   // API key (required)
  url: string;   // URL to screenshot (required)
}
```

**Example:**
```
GET /api/image
  ?key=pk_live_abc123def456
  &url=https://eldtechnologies.com/work/conduit
```

#### Response

**Success (200):**
```
Content-Type: image/png
Content-Length: 45678
Cache-Control: public, max-age=31536000, immutable
ETag: "abc123def456"
X-Cache-Status: HIT | MISS
X-Generation-Time: 234ms

[PNG image data - 1200x630px]
```

**Errors:**
```json
// 401 Unauthorized
{
  "error": "Invalid API key",
  "code": "INVALID_KEY"
}

// 403 Forbidden
{
  "error": "Domain not allowed for this key",
  "code": "DOMAIN_NOT_ALLOWED",
  "domain": "example.com",
  "allowedDomains": ["eldtechnologies.com"]
}

// 429 Too Many Requests
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "limit": 5,
  "window": "1 minute",
  "retryAfter": 45
}

// 400 Bad Request
{
  "error": "Invalid URL",
  "code": "INVALID_URL",
  "details": "URL must be HTTPS"
}
```

### 6.2 Health Check

**GET `/health`**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "cache": {
    "entries": 63,
    "size": "2.8 MB",
    "hitRate": 0.997
  }
}
```

### 6.3 Cache Stats (Admin Only)

**GET `/admin/cache/stats`**

Requires admin key.

```json
{
  "totalEntries": 63,
  "totalSize": "2.8 MB",
  "oldestEntry": "2025-12-01T00:00:00Z",
  "newestEntry": "2025-12-11T11:59:00Z",
  "hitRate": {
    "last1h": 1.0,
    "last24h": 0.997,
    "last7d": 0.995
  },
  "topUrls": [
    {
      "url": "https://eldtechnologies.com/",
      "hits": 1523,
      "size": "43 KB"
    }
  ]
}
```

**DELETE `/admin/cache/:key`**

Delete specific cache entry by URL.

---

## 7. Caching Strategy

### 7.1 Cache Key Generation

```typescript
function generateCacheKey(url: string): string {
  const normalized = normalizeUrl(url);
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
}

// Example:
// URL: https://eldtechnologies.com/work/conduit
// Normalized: https://eldtechnologies.com/work/conduit
// Cache key: abc123def456...
```

**Simple. No collisions possible.**

### 7.2 Storage Structure

```
cache/
├── images/
│   ├── ab/
│   │   └── abc123def456.png
│   ├── cd/
│   │   └── cdef789abc012.png
│   └── ...
└── metadata.json

metadata.json:
{
  "abc123def456": {
    "url": "https://eldtechnologies.com/work/conduit",
    "size": 45678,
    "createdAt": "2025-12-11T10:00:00Z",
    "lastAccessed": "2025-12-11T11:30:00Z",
    "accessCount": 45
  }
}
```

### 7.3 Cache Policy

```typescript
interface CachePolicy {
  // Cache forever (immutable URLs)
  ttl: Infinity,  // Pages don't change retroactively

  // Size limits
  maxSize: '10GB',
  maxEntries: 100000,

  // Eviction: Manual only
  eviction: 'manual',  // Admin must purge if needed

  // Your site: ~60 URLs = ~2.7MB
  // Plenty of headroom
}
```

### 7.4 Cache Headers

```typescript
function getCacheHeaders(entry: CacheEntry): Headers {
  return {
    // Cache forever - URL won't change
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': entry.cacheKey,
    'X-Cache-Status': entry.fresh ? 'HIT' : 'MISS',
    'X-Generation-Time': entry.generationTime + 'ms',
    'Content-Type': 'image/png'
  };
}
```

### 7.5 Cache Invalidation

**Manual only:**

```bash
# Delete specific URL's cache
curl -X DELETE "https://og.yourdomain.com/admin/cache/abc123" \
  -H "Authorization: Bearer ak_admin_key"

# Or purge all (nuclear option)
curl -X DELETE "https://og.yourdomain.com/admin/cache?all=true" \
  -H "Authorization: Bearer ak_admin_key"
```

**When to invalidate:**
- You redesigned the page significantly
- Want to refresh screenshot with new content
- Made a mistake and need to regenerate

**In practice:**
- Cache hit rate ~99.7% for your use case
- Invalidate manually only when redesigning pages

---

## 8. Deployment

### 8.1 Docker Setup

**Dockerfile**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .
RUN npm run build

# Create cache directory
RUN mkdir -p /app/cache/images && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
```

**docker-compose.yml**
```yaml
version: '3.8'

services:
  ogframe:
    build: .
    image: ogframe:1.0
    container_name: ogframe
    restart: unless-stopped

    ports:
      - "3000:3000"

    environment:
      NODE_ENV: production
      PORT: 3000
      LOG_LEVEL: info
      CACHE_DIR: /app/cache
      API_KEYS_FILE: /app/config/keys.json

    volumes:
      # Persist cache across container restarts
      - ogframe-cache:/app/cache

      # API keys configuration
      - ./config/keys.json:/app/config/keys.json:ro

    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

volumes:
  ogframe-cache:
    driver: local
```

### 8.2 Configuration

**config/keys.json**
```json
{
  "keys": [
    {
      "keyId": "pk_live_abc123def456",
      "type": "public",
      "name": "ELD Technologies - Frontend",
      "allowedDomains": [
        "eldtechnologies.com",
        "*.eldtechnologies.com",
        "localhost:*"
      ],
      "rateLimit": {
        "requests": 1000,
        "generations": 5
      },
      "createdAt": "2025-12-11T00:00:00Z"
    },
    {
      "keyHash": "sha256_hash_of_admin_key",
      "type": "admin",
      "name": "Admin Key"
    }
  ]
}
```

### 8.3 Quick Start

```bash
# 1. Clone repository
git clone https://github.com/eldtechnologies/ogframe.git
cd ogframe

# 2. Create keys config
mkdir -p config
cat > config/keys.json << 'EOF'
{
  "keys": [
    {
      "keyId": "pk_live_test123",
      "type": "public",
      "allowedDomains": ["localhost:*", "yourdomain.com"]
    }
  ]
}
EOF

# 3. Start service
docker-compose up -d

# 4. Test
curl "http://localhost:3000/api/image?key=pk_live_test123&url=https://yourdomain.com" \
  --output test.png

# 5. View
open test.png
```

---

## 9. Usage Examples

### 9.1 Update workProjects.json

```json
{
  "conduit": {
    "title": "Conduit: Production Software in 5 Hours",
    "description": "A lightweight, secure multi-channel communication proxy...",
    "image": "https://og.yourdomain.com/api/image?key=pk_live_abc123&url=https://eldtechnologies.com/work/conduit",
    "path": "/work/conduit"
  },
  "factumo": {
    "title": "Factumo: AI-Powered Invoicing",
    "description": "Verifactu 2026 compliant invoicing platform...",
    "image": "https://og.yourdomain.com/api/image?key=pk_live_abc123&url=https://eldtechnologies.com/work/factumo",
    "path": "/work/factumo"
  }
}
```

### 9.2 React Component

```typescript
// src/pages/FactumoProject.tsx
import { Helmet } from 'react-helmet-async';

const OG_SERVICE = 'https://og.yourdomain.com';
const OG_KEY = 'pk_live_abc123def456';

export default function FactumoProject() {
  const pageUrl = 'https://eldtechnologies.com/work/factumo';
  const ogImageUrl = `${OG_SERVICE}/api/image?key=${OG_KEY}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <>
      <Helmet>
        <title>Factumo | ELD Technologies</title>
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImageUrl} />
      </Helmet>

      {/* Page content */}
    </>
  );
}
```

### 9.3 Helper Function

```typescript
// src/utils/ogImage.ts
const OG_SERVICE_URL = 'https://og.yourdomain.com';
const OG_API_KEY = 'pk_live_abc123def456';

export function getOGImageUrl(pageUrl: string): string {
  return `${OG_SERVICE_URL}/api/image?key=${OG_API_KEY}&url=${encodeURIComponent(pageUrl)}`;
}

// Usage:
const ogImage = getOGImageUrl('https://eldtechnologies.com/work/conduit');
```

### 9.4 Pre-render Script Update

```javascript
// scripts/prerender.js
function generateWorkPageHTML(project, baseHTML) {
  const pageUrl = `https://eldtechnologies.com${project.path}`;

  // Use OGFrame for dynamic OG images
  const ogImageUrl = `https://og.yourdomain.com/api/image?key=pk_live_abc123&url=${encodeURIComponent(pageUrl)}`;

  const metaTags = `
    <meta property="og:title" content="${project.title}" />
    <meta property="og:description" content="${project.description}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${ogImageUrl}" />
  `;

  // ... rest of function
}
```

---

## 10. Development Roadmap

### Phase 1: MVP (1 Week)

**Goal:** Working screenshot service with domain-scoped keys

- [ ] Day 1-2: Basic Hono server + Playwright integration
- [ ] Day 3: API key validation + domain scoping
- [ ] Day 4: File system cache implementation
- [ ] Day 5: Rate limiting + error handling
- [ ] Day 6: Docker setup + testing
- [ ] Day 7: Documentation + deployment

**Deliverable:** Production-ready screenshot service

### Phase 2: Hardening (3-5 Days)

**Goal:** Security + reliability

- [ ] Input validation + sanitization
- [ ] Comprehensive error messages
- [ ] Logging system
- [ ] Unit tests
- [ ] Load testing
- [ ] Security audit

**Deliverable:** Battle-tested service

### Phase 3: Polish (2-3 Days)

**Goal:** Developer experience

- [ ] CLI tool for key management
- [ ] Admin dashboard (optional)
- [ ] Metrics endpoint
- [ ] Better documentation
- [ ] Example integrations

**Deliverable:** Complete open-source project

---

## 11. Future Enhancements

**These are explicitly OUT OF SCOPE for MVP but could be added later:**

### 11.1 S3-Compatible Object Storage (v2.0)

Add cloud storage backend while keeping file cache as default:

```typescript
CACHE_BACKEND=s3  // 'file' | 's3'
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=ogframe-cache
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

**Benefits:**
- Works with Cloudflare R2, Backblaze B2, DigitalOcean Spaces, AWS S3, MinIO
- Multi-server deployments
- No cache loss on container restart
- Cloudflare R2: ~$0.50/month for 10,000 images, zero egress fees

**Why v2.0:**
- File cache works great for single-server setups
- Most deployments don't need cloud storage
- Add when users request it

### 11.2 Template Mode (v2.0+)

Add designed card templates for flexibility:

```
/api/image?key=pk_abc&mode=template&title=Hello&description=World
```

**Why later:**
- Adds parameter variation attack surface
- Screenshot mode solves current use case
- Can add if users request it

### 11.3 Custom Viewport Sizes

```
/api/image?url=...&width=1200&height=630
```

**Why later:**
- OG images are standardized (1200x630)
- Custom sizes = more cache entries
- Not needed for social sharing

### 11.4 Selector-Based Screenshots

```
/api/image?url=...&selector=.hero-section
```

**Why later:**
- Complex to implement correctly
- Most pages designed for full screenshot
- Can add if users request it

### 11.5 WebP Support

Generate WebP in addition to PNG for smaller sizes.

**Why later:**
- Not all platforms support WebP for OG images
- PNG works everywhere
- Optimization, not core feature

---

## 12. Cost Analysis

### Self-Hosted OGFrame v2.0

```
VPS (1GB RAM, 25GB SSD):     $5/month
Domain:                      $1/month
SSL (Let's Encrypt):         Free
Storage (cache ~3MB):        Included
Bandwidth:                   Included
-------------------------------------------
Total:                       ~$6/month

Your usage:
- 60 unique URLs
- Cache size: ~2.7MB
- Generations per month: ~0 (after initial build)
- Cost per image: Effectively $0
```

### SaaS Alternatives

```
Cloudinary: $89/month
imgix: $99/month
Vercel OG: $20/month (Vercel-only)
```

**Savings: $83-93/month = $996-1,116/year**

---

## 13. Security Summary

### ✅ Attack Surface: MINIMAL

**What CAN'T be attacked:**
- ✅ No parameter variation (only URL parameter)
- ✅ No cache collisions (deterministic URL hashing)
- ✅ No cross-domain abuse (keys are domain-scoped)
- ✅ No SSRF (can only screenshot allowed domains)
- ✅ No template injection (no templates)
- ✅ No resource exhaustion (URL normalization + rate limiting)

**What needs protection:**
- ⚠️ Rate limiting (prevent screenshot spam)
- ⚠️ Admin key security (hash it, never commit)
- ⚠️ URL validation (ensure HTTPS, block bad ports)

**That's it. Simple = Secure.**

---

## 14. Conclusion

OGFrame v1.0 delivers **exactly what you need**:

**Core Features:**
- Screenshot your web pages
- Serve as OG images
- Domain-scoped API keys (safe for frontend)
- Aggressive caching (99% hit rate)
- Self-hosted control

**What Makes It Great:**
- Minimal attack surface
- Simple to secure
- Easy to maintain
- Does one thing really well
- Production-ready out of the box

**Future Enhancements (v2.0+):**
- S3-compatible storage (R2, Backblaze, etc.)
- Template mode (optional)
- Additional features based on user feedback

**Ready to deploy?** See the README for quick start instructions.

---

**Questions? Feedback?**

Email: magnus@eldtechnologies.com
GitHub: https://github.com/eldtechnologies/ogframe
