# OGFrame

**Self-hosted OG image generator. Screenshot your pages, serve as OG images. That's it.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)]()
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-blue.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

Simple = Secure.

---

## Why OGFrame?

Every SPA faces the same problem: social media crawlers don't execute JavaScript, so every page shows the same generic preview image.

**Existing solutions:**
- ❌ **Manual screenshots**: 5 min/image, outdated when design changes
- ❌ **SaaS services**: $89-299/month, API keys can't be exposed publicly
- ✅ **OGFrame**: Free, self-hosted, domain-scoped keys safe for frontend use

---

## Features

- 🎯 **One Job:** Screenshot URL → Serve as PNG
- 🔒 **Secure:** Domain-scoped API keys safe for frontend use
- ⚡ **Fast:** Aggressive caching (99%+ hit rate)
- 🐳 **Simple:** Single Docker command deployment
- 📦 **Minimal:** Hono + Playwright, nothing else

---

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/eldtechnologies/ogframe.git
cd ogframe
npm install
npx playwright install chromium
```

### 2. Configure API Keys

**Fastest way (for testing):**
```bash
cp config/keys.example.json config/keys.json
```

**For production (generate your own keys):**
```bash
npm run generate-key public "Production" yourdomain.com *.yourdomain.com localhost:*
npm run generate-key admin "Admin Access"
```

### 3. Start Development Server

```bash
npm run dev
```

Server starts at http://localhost:3000

### 4. Test It Works

```bash
curl "http://localhost:3000/api/image?key=pk_test_example123&url=https://example.com" \
  --output test.png

open test.png
```

**Expected:** A PNG screenshot in ~3 seconds. Second request: <100ms (cache hit!)

---

## Docker Deployment

### Quick Start

```bash
# 1. Copy example config
cp config/keys.example.json config/keys.json

# 2. (Optional) Generate production keys
npm run generate-key public "Production" yourdomain.com

# 3. Build and run
docker-compose up -d

# 4. Check status
curl http://localhost:3000/health
```

**Note:** Cache is persisted using a Docker named volume (`ogframe-cache`). This survives container restarts and updates.

### Useful Docker Commands

```bash
docker-compose logs -f          # View logs
docker-compose restart          # Restart after config changes
docker-compose up -d --build    # Rebuild after code changes
docker volume rm ogframe_ogframe-cache  # Clear cache
docker-compose down             # Stop service
```

### Coolify Deployment

See **[SETUP.md](SETUP.md)** for detailed Coolify deployment instructions including secrets management and persistent volumes.

---

## Integration Examples

### React Component

```tsx
import { Helmet } from 'react-helmet-async';

const OG_SERVICE = 'https://og.yourdomain.com';
const OG_KEY = 'pk_live_abc123';  // Safe to expose (domain-scoped)

export default function Page() {
  const pageUrl = 'https://yourdomain.com/page';
  const ogImage = `${OG_SERVICE}/api/image?key=${OG_KEY}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <>
      <Helmet>
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      {/* Page content */}
    </>
  );
}
```

### Static HTML / Pre-render

```html
<meta property="og:image" content="https://og.yourdomain.com/api/image?key=pk_live_abc123&url=https://yourdomain.com/page" />
```

---

## API Reference

### Generate OG Image

```
GET /api/image?key={api_key}&url={url}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `key` | Yes | API key (public or admin) |
| `url` | Yes | URL to screenshot |

**Response Headers:**
- `Content-Type: image/png`
- `Cache-Control: public, max-age=31536000, immutable`
- `X-Cache-Status: HIT` or `MISS`
- `X-Generation-Time: 234ms`

### Health Check

```
GET /health
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "cache": {
    "enabled": true,
    "entries": 63,
    "size": "2.8 MB",
    "hitRate": 0.997
  }
}
```

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/cache/stats` | GET | Detailed cache statistics |
| `/admin/cache/:key` | DELETE | Delete specific cache entry |
| `/admin/cache?all=true` | DELETE | Purge entire cache |

Requires admin key via `Authorization: Bearer {key}` header or `?key=` parameter.

---

## Security Model

### Domain-Scoped Public Keys

Public keys are **safe to use in frontend code** because they're scoped to specific domains:

```json
{
  "keyId": "pk_live_abc123",
  "type": "public",
  "allowedDomains": [
    "yourdomain.com",
    "*.yourdomain.com",
    "localhost:*"
  ]
}
```

**What this means:**
- Key can ONLY screenshot URLs on allowed domains
- Even if someone steals the key, they can't use it for their own site
- Rate limiting prevents abuse (10 screenshots/min by default)

### Admin Keys

Admin keys are SHA-256 hashed and stored securely:

```bash
npm run generate-key admin "Admin Access"
# Output: sk_admin_xxx... (save this, shown only once!)
```

**Never commit actual admin keys to git.** Use environment variables or secrets management.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | `production` or `development` |
| `PORT` | 3000 | HTTP port |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error` |
| `CACHE_DIR` | ./cache | Cache storage directory |
| `API_KEYS_FILE` | ./config/keys.json | API keys file path |
| `SCREENSHOT_TIMEOUT` | 30000 | Screenshot timeout (ms) |
| `SCREENSHOT_WIDTH` | 1200 | Image width |
| `SCREENSHOT_HEIGHT` | 630 | Image height |
| `MAX_CONCURRENT_SCREENSHOTS` | 3 | Concurrent screenshot limit |
| `REQUIRE_HTTPS` | false (dev) | Require HTTPS URLs |

### Rate Limits

Configure per key in `config/keys.json`:

```json
{
  "rateLimit": {
    "requests": 1000,
    "generations": 10
  }
}
```

---

## How It Works

1. **Request**: Social crawler requests `GET /api/image?key=pk_abc&url=https://yourdomain.com/page`
2. **Validate**: Check API key, validate domain is allowed
3. **Normalize**: `https://yourdomain.com/page?ref=twitter` → `https://yourdomain.com/page`
4. **Cache Check**: SHA-256 hash of normalized URL
5. **Cache HIT**: Return PNG (<100ms)
6. **Cache MISS**: Screenshot URL with Playwright (~3s), save to cache, return PNG
7. **Next Request**: Cache HIT (99%+ of traffic)

---

## Performance

**Typical usage** (60 pages):
- Cache entries: 60
- Storage: ~2.7 MB
- Cache hit rate: 99.7%
- Generations per day: <1

First request ~3 seconds (screenshot), subsequent requests <100ms (cached).

---

## Architecture

```
src/
├── index.ts           # Hono server, routes, middleware
├── types.ts           # TypeScript interfaces
├── config.ts          # Configuration
├── cli.ts             # Key generation CLI
├── services/
│   ├── auth.ts        # API key validation
│   ├── cache.ts       # File-based caching
│   ├── rateLimit.ts   # Rate limiting
│   └── screenshot.ts  # Playwright automation
└── utils/
    ├── url.ts         # URL normalization
    ├── crypto.ts      # Hashing utilities
    └── logger.ts      # Structured logging
```

---

## Troubleshooting

### "Playwright browser not installed"

```bash
npx playwright install chromium
```

### "Failed to load API keys"

```bash
cp config/keys.example.json config/keys.json
npm run generate-key public "Test" localhost:*
```

### "Domain not allowed"

Check your key's `allowedDomains` in `config/keys.json`:

```json
{
  "allowedDomains": [
    "yourdomain.com",
    "*.yourdomain.com"
  ]
}
```

### Docker build fails

Make sure you're in the `ogframe/` directory:

```bash
cd ogframe
docker-compose build
```

---

## Project Status

**Current Version:** v1.0.0 - Production Ready ✅

### Future (v2.0+)
- S3-compatible object storage (R2, B2, MinIO)
- Template mode (designed cards)
- Custom viewport sizes
- WebP support
- Redis cache backend

Ship MVP first, add features based on real user feedback.

---

## Contributing

Contributions welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

### Development Scripts

```bash
npm run dev          # Development server with hot reload
npm run build        # Build TypeScript
npm run start        # Production server
npm run generate-key # Generate API keys
npm run lint         # ESLint
npm run test         # Run tests
```

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** [Hono](https://hono.dev/) (ultra-lightweight)
- **Screenshots:** [Playwright](https://playwright.dev/)
- **Language:** TypeScript
- **Deployment:** Docker

---

## Documentation

- **[SETUP.md](SETUP.md)** - Complete setup guide with Coolify deployment
- **[docs/specification.md](docs/specification.md)** - Technical architecture

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/eldtechnologies/ogframe/issues)
- **Email:** magnus@eldtechnologies.com

---

<p align="center">
  <strong>Simple tools for real problems. No bloat, just value.</strong>
  <br>
  Made with ❤️ by <a href="https://github.com/eldtechnologies">ELD Technologies SL</a>
</p>
