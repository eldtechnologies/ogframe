# OGFrame v1.0

**Self-hosted OG image generator. Screenshot your pages, serve as OG images. That's it.**

Simple = Secure.

## Features

- 🎯 **One Job:** Screenshot URL → Serve as PNG
- 🔒 **Secure:** Domain-scoped API keys safe for frontend use
- ⚡ **Fast:** Aggressive caching (99% hit rate)
- 🐳 **Simple:** Single Docker command deployment
- 📦 **Minimal:** Hono + Playwright

## Why OGFrame?

Every SPA faces the same problem: social media crawlers don't execute JavaScript, so every page shows the same generic preview image.

**Solutions**:
- ❌ Manual screenshots: 5 min/image, outdated when design changes
- ❌ SaaS: $89-299/month, API keys can't be public
- ✅ **OGFrame**: $6/month VPS, domain-scoped keys, auto-generated screenshots

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

This creates `config/keys.json` with your domain-scoped API keys.

### 3. Start Development Server

```bash
npm run dev
```

Server starts at http://localhost:3000

### 4. Test It Works

```bash
# Using the example key (pk_test_example123)
curl "http://localhost:3000/api/image?key=pk_test_example123&url=http://localhost:8080" \
  --output test.png

open test.png
```

**Expected:** A PNG screenshot in ~3 seconds. Second request: <100ms (cache hit!)

---

**Need more details?** See [SETUP.md](SETUP.md) for complete setup guide including Docker and Coolify deployment.

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

### Key Management for Docker

**Option A: Mount keys.json as file (Development)**
- The docker-compose.yml mounts `./config/keys.json` as read-only
- Edit the file locally, restart container

**Option B: Use Docker secrets (Production/Coolify)**
- See [SETUP.md - Coolify Deployment](SETUP.md#coolify-deployment) for detailed instructions
- Mount keys as a secret for better security

### Useful Docker Commands

```bash
# View logs
docker-compose logs -f

# Restart after config changes
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build

# Clear cache volume
docker volume rm ogframe_ogframe-cache

# Stop service
docker-compose down
```

## API Usage

### Generate OG Image

```
GET /api/image?key={api_key}&url={url}
```

**Parameters:**
- `key` (required): API key
- `url` (required): URL to screenshot

**Example:**

```bash
curl "http://localhost:3000/api/image?key=pk_live_abc123&url=https://eldtechnologies.com/work/conduit" \
  --output og-image.png
```

**Response:**
- Content-Type: `image/png`
- Cache-Control: `public, max-age=31536000, immutable`
- X-Cache-Status: `HIT` or `MISS`
- X-Generation-Time: `234ms`

### Health Check

```
GET /health
```

**Response:**

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

### Admin: Get Cache Stats

```
GET /admin/cache/stats
Authorization: Bearer {admin_key}
```

### Admin: Purge Cache

```
DELETE /admin/cache?all=true
Authorization: Bearer {admin_key}
```

## Integration Examples

### React Component

```tsx
import { Helmet } from 'react-helmet-async';

const OG_SERVICE = 'https://og.yourdomain.com';
const OG_KEY = 'pk_live_abc123';

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

### Static Pre-render

```javascript
// workProjects.json
{
  "project": {
    "title": "My Project",
    "image": "https://og.yourdomain.com/api/image?key=pk_live_abc123&url=https://yourdomain.com/work/project"
  }
}
```

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

Admin keys are hashed and stored securely:

```json
{
  "keyHash": "sha256_hash...",
  "type": "admin"
}
```

**Never commit actual admin keys to git.** Use environment variables or password managers.

## Configuration

### Environment Variables

```bash
NODE_ENV=production          # production | development
PORT=3000                    # HTTP port
LOG_LEVEL=info              # debug | info | warn | error

CACHE_DIR=./cache           # Cache directory
API_KEYS_FILE=./config/keys.json

SCREENSHOT_TIMEOUT=30000     # Screenshot timeout (ms)
SCREENSHOT_WIDTH=1200        # Image width
SCREENSHOT_HEIGHT=630        # Image height
MAX_CONCURRENT_SCREENSHOTS=3

REQUIRE_HTTPS=true          # Require HTTPS URLs (production)
```

### Rate Limits

Configure per key in `config/keys.json`:

```json
{
  "rateLimit": {
    "requests": 1000,    # Total requests per minute
    "generations": 10    # New screenshots per minute
  }
}
```

## How It Works

1. **Request**: Social crawler requests `GET /api/image?key=pk_abc&url=https://yourdomain.com/page`
2. **Validate**: Check API key, validate domain is allowed
3. **Normalize**: `https://yourdomain.com/page?ref=twitter` → `https://yourdomain.com/page`
4. **Cache Check**: SHA-256 hash of normalized URL
5. **Cache HIT**: Return PNG (<100ms)
6. **Cache MISS**: Screenshot URL with Playwright (~3s), save to cache, return PNG
7. **Next Request**: Cache HIT (99% of traffic)

## Performance

**Your typical usage** (60 pages):
- Cache entries: 60
- Storage: ~2.7 MB
- Cache hit rate: 99.7%
- Generations per day: <1

**Cost**: $6/month VPS vs $89-299/month SaaS

## Development

### Project Structure

```
ogframe/
├── src/
│   ├── index.ts              # Main Hono server
│   ├── types.ts              # TypeScript types
│   ├── config.ts             # Configuration
│   ├── cli.ts                # Key generation CLI
│   ├── services/
│   │   ├── auth.ts           # API key validation
│   │   ├── cache.ts          # File-based caching
│   │   ├── rateLimit.ts      # Rate limiting
│   │   └── screenshot.ts     # Playwright screenshots
│   └── utils/
│       ├── url.ts            # URL normalization
│       ├── crypto.ts         # Hashing utilities
│       └── logger.ts         # Structured logging
├── config/
│   └── keys.json             # API keys (gitignored)
├── cache/                    # Cache storage (gitignored)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Scripts

```bash
npm run dev          # Development server with hot reload
npm run build        # Build TypeScript
npm run start        # Production server
npm run generate-key # Generate API keys
npm run lint         # ESLint
```

### Testing

```bash
# Generate test key
npm run generate-key public "Test" localhost:*

# Start dev server
npm run dev

# Test screenshot
curl "http://localhost:3000/api/image?key=pk_test_...&url=http://localhost:8080" \
  --output test.png
```

## Deployment

### Docker Compose (Recommended)

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Logs
docker-compose logs -f

# Stop
docker-compose down
```

**Cache Persistence:**
The docker-compose.yml uses a named volume (`ogframe-cache`) to persist cache across container restarts. This means:
- Cache survives container restarts and updates
- Cache is stored in Docker's volume storage
- To clear cache: `docker volume rm ogframe_ogframe-cache`

### Coolify Deployment

[Coolify](https://coolify.io/) is an open-source, self-hostable alternative to Heroku/Netlify.

**Setup Steps:**

1. **Create New Resource** in Coolify
   - Select "Docker Compose"
   - Connect your Git repository

2. **Configure Build**
   - Coolify auto-detects `docker-compose.yml`
   - Uses the Dockerfile for multi-stage build

3. **Add Persistent Volume**

   In Coolify's "Storages" section, add:
   ```
   Source: ogframe-cache
   Destination: /app/cache
   ```

   This ensures cache persists across deployments.

4. **Configure API Keys**

   Two options:

   **Option A: Mount keys.json as secret (recommended)**
   - In Coolify "Secrets", create `keys.json` with your API keys
   - Add storage mount:
     ```
     Source: keys.json (secret)
     Destination: /app/config/keys.json
     ```

   **Option B: Build keys into image**
   - Generate keys locally: `npm run generate-key`
   - Commit `config/keys.json` to private repository
   - Let Coolify build from source

5. **Environment Variables**

   In Coolify's "Environment Variables" section:
   ```bash
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info
   REQUIRE_HTTPS=true
   SCREENSHOT_TIMEOUT=30000
   MAX_CONCURRENT_SCREENSHOTS=3
   ```

6. **Deploy**
   - Click "Deploy"
   - Coolify builds and starts the container
   - Access via your configured domain

**Cache Behavior:**
- **With volume mount**: Cache persists across deployments (recommended)
- **Without volume**: Cache rebuilds on each deployment (acceptable for low-traffic sites)

**Estimated Costs:**
- VPS (Hetzner, DigitalOcean): $6-12/month
- Handles thousands of requests/day
- 99%+ cache hit rate = minimal CPU usage

### Manual

```bash
# Install dependencies
npm ci --only=production

# Build
npm run build

# Install Playwright browsers
npx playwright install chromium

# Start
NODE_ENV=production npm start
```

## Future Enhancements (v2.0+)

These features are deliberately **out of scope** for v1.0 to keep it simple:

- **S3-compatible object storage**: Support any S3 API (Cloudflare R2, Backblaze B2, DigitalOcean Spaces, AWS S3, MinIO). File cache remains default.
- Template mode (designed cards with title/description)
- Custom viewport sizes
- Selector-based screenshots
- WebP support
- Redis/Valkey cache backend

Ship MVP first, add features based on real user feedback.

**Note on cache storage:** File-based caching is optimal for most use cases. For multi-server deployments or very high traffic, v2.0 will add S3-compatible storage with zero breaking changes.

## Troubleshooting

### "Playwright browser not installed"

```bash
npx playwright install chromium
```

### "Failed to load API keys"

Ensure `config/keys.json` exists:

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
    "*.yourdomain.com"  // Includes subdomains
  ]
}
```

### Docker build fails

Make sure you're in the `ogframe/` directory:

```bash
cd ogframe
docker-compose build
```

## License

MIT License - see LICENSE file

## Documentation

For complete technical specification, architecture details, and security model, see:

**[Technical Specification](docs/specification.md)**

## Support

- GitHub Issues: https://github.com/eldtechnologies/ogframe/issues
- Email: magnus@eldtechnologies.com

---

**Built by ELD Technologies**

Simple tools for real problems. No bloat, just value.
