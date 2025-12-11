# OGFrame Setup Guide

Complete step-by-step guide to get OGFrame running in development or production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Setup](#docker-setup)
4. [Coolify Deployment](#coolify-deployment)
5. [Testing Your Setup](#testing-your-setup)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required
- **Node.js 20+** - [Download](https://nodejs.org/)
- **npm** - Comes with Node.js

### For Docker Deployment
- **Docker** - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** - Usually included with Docker Desktop

### For Production
- VPS with at least **512MB RAM** and **1GB disk space**
- Domain name (optional, but recommended)

---

## Local Development Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/eldtechnologies/ogframe.git
cd ogframe
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs Hono, Playwright, and all required dependencies.

### Step 3: Install Playwright Browsers

```bash
npx playwright install chromium
```

This downloads the Chromium browser needed for screenshots.

### Step 4: Configure API Keys

#### Option A: Use the Example File (Quickest)

```bash
# Copy the example configuration
cp config/keys.example.json config/keys.json
```

The example file includes a test key that works with `localhost`. You can start testing immediately!

#### Option B: Generate Your Own Keys (Recommended for Production)

```bash
# Generate a public key for your domain
npm run generate-key public "Production Key" yourdomain.com *.yourdomain.com localhost:*

# Generate an admin key for cache management
npm run generate-key admin "Admin Access"
```

**Important notes:**
- **Public keys** can be safely used in frontend code (they're domain-scoped)
- **Admin keys** should be kept secret (only use in backend/curl commands)
- The admin key is shown ONLY ONCE - save it to your password manager!

### Step 5: Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

You should see:
```
Loaded 2 API keys from ./config/keys.json
Server running on http://localhost:3000
```

### Step 6: Test It Works

```bash
# Using the example key from keys.example.json
curl "http://localhost:3000/api/image?key=pk_test_example123&url=http://localhost:3000" \
  --output test.png

# View the screenshot
open test.png  # macOS
# or
xdg-open test.png  # Linux
```

**Expected result:** A PNG screenshot of your app's homepage.

---

## Docker Setup

### Step 1: Prepare Configuration

```bash
# Copy example keys file
cp config/keys.example.json config/keys.json

# (Optional) Generate production keys
npm run generate-key public "Production" yourdomain.com
```

### Step 2: Build and Run with Docker Compose

```bash
# Build the Docker image
docker-compose build

# Start the service
docker-compose up -d

# Check logs
docker-compose logs -f
```

Server runs on `http://localhost:3000`

### Step 3: Verify Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 10,
  "cache": {
    "enabled": true,
    "entries": 0,
    "size": "0 B",
    "hitRate": 0
  }
}
```

### Docker Commands Reference

```bash
# View logs
docker-compose logs -f

# Restart service
docker-compose restart

# Stop service
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Clear cache volume
docker volume rm ogframe_ogframe-cache
```

---

## Coolify Deployment

[Coolify](https://coolify.io/) is an open-source, self-hostable Heroku alternative.

### Step 1: Push to Git

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit"

# Push to your Git provider (GitHub, GitLab, etc.)
git remote add origin https://github.com/yourusername/ogframe.git
git push -u origin main
```

### Step 2: Create Resource in Coolify

1. Log into Coolify
2. Click **"+ New Resource"**
3. Select **"Docker Compose"**
4. Connect your Git repository
5. Branch: `main`

### Step 3: Configure Persistent Storage

In Coolify's **"Storages"** section, add:

| Source | Destination | Description |
|--------|-------------|-------------|
| `ogframe-cache` | `/app/cache` | Persistent cache across deployments |

This ensures your cached screenshots survive redeployments.

### Step 4: Configure API Keys

**Option A: Mount as Secret (Recommended)**

1. In Coolify, go to **"Secrets"**
2. Create a new secret: `keys.json`
3. Paste your `config/keys.json` content
4. In **"Storages"**, add:
   - Source: `keys.json` (secret)
   - Destination: `/app/config/keys.json`

**Option B: Commit to Private Repo**

1. Generate keys locally:
   ```bash
   npm run generate-key public "Production" yourdomain.com
   ```
2. Commit `config/keys.json` to your **private** repository
3. Coolify will use the committed file

**⚠️ NEVER commit keys to a public repository!**

### Step 5: Environment Variables (Optional)

In Coolify's **"Environment Variables"** section:

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
REQUIRE_HTTPS=true
SCREENSHOT_TIMEOUT=30000
MAX_CONCURRENT_SCREENSHOTS=3
```

### Step 6: Deploy

1. Click **"Deploy"**
2. Coolify builds the Docker image
3. Wait for deployment to complete (2-3 minutes)
4. Check logs for any errors

### Step 7: Configure Domain (Optional)

1. In Coolify, go to **"Domains"**
2. Add your domain: `og.yourdomain.com`
3. Coolify automatically configures SSL with Let's Encrypt

### Step 8: Test Production Deployment

```bash
# Health check
curl https://og.yourdomain.com/health

# Generate test screenshot
curl "https://og.yourdomain.com/api/image?key=pk_live_...&url=https://yourdomain.com" \
  --output test.png
```

---

## Testing Your Setup

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Should return `"status": "healthy"`

### Test 2: Screenshot Generation

```bash
curl "http://localhost:3000/api/image?key=YOUR_KEY&url=https://example.com" \
  --output screenshot.png

open screenshot.png
```

**Expected:**
- First request: ~3 seconds (screenshot generation)
- Second request: <100ms (cache hit)
- Response headers: `X-Cache-Status: HIT` or `MISS`

### Test 3: Cache Hit Rate

```bash
# Generate 5 screenshots of the same URL
for i in {1..5}; do
  curl "http://localhost:3000/api/image?key=YOUR_KEY&url=https://example.com" \
    -o /dev/null -w "Time: %{time_total}s\n"
done
```

**Expected:**
- First request: ~3 seconds
- Requests 2-5: <0.1 seconds

### Test 4: Domain Scoping

Try to screenshot a domain NOT in your `allowedDomains`:

```bash
curl "http://localhost:3000/api/image?key=YOUR_KEY&url=https://google.com"
```

**Expected:** `403 Forbidden - Domain not allowed`

This proves your keys are properly scoped!

### Test 5: Admin Endpoints (Optional)

```bash
# Get cache statistics
curl http://localhost:3000/admin/cache/stats \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"

# Purge all cache
curl -X DELETE http://localhost:3000/admin/cache?all=true \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

---

## Troubleshooting

### "Playwright browser not installed"

**Solution:**
```bash
npx playwright install chromium
```

For Docker:
```bash
docker-compose down
docker-compose up -d --build
```

### "Failed to load API keys"

**Problem:** `config/keys.json` doesn't exist

**Solution:**
```bash
cp config/keys.example.json config/keys.json
```

Or generate new keys:
```bash
npm run generate-key public "Test" localhost:*
```

### "Domain not allowed for this key"

**Problem:** The URL's domain isn't in your key's `allowedDomains`

**Solution:** Edit `config/keys.json` and add the domain:
```json
{
  "allowedDomains": [
    "yourdomain.com",
    "*.yourdomain.com",
    "localhost:*"
  ]
}
```

### Screenshots are blank/broken

**Possible causes:**
1. Target website blocks headless browsers
2. Website requires authentication
3. Website has anti-bot protection

**Solution:** Check the URL loads in a regular browser first

### Cache not persisting (Docker)

**Problem:** Cache is lost on container restart

**Solution:** Ensure docker-compose.yml has the named volume:
```yaml
volumes:
  - ogframe-cache:/app/cache

volumes:
  ogframe-cache:
    driver: local
```

### High memory usage

**Problem:** Multiple concurrent screenshots

**Solution:** Reduce `MAX_CONCURRENT_SCREENSHOTS`:
```bash
# In .env or environment variables
MAX_CONCURRENT_SCREENSHOTS=2
```

### Rate limit errors

**Problem:** Hitting rate limits during testing

**Solution:** Increase limits in `config/keys.json`:
```json
{
  "rateLimit": {
    "requests": 10000,
    "generations": 100
  }
}
```

---

## Next Steps

1. **Integrate with your app** - See [README.md](README.md#integration-examples)
2. **Set up monitoring** - Use `/health` endpoint with uptime monitoring
3. **Configure backups** - Back up `config/keys.json` and cache directory
4. **Read the spec** - See [docs/specification.md](docs/specification.md) for architecture details

---

## Need Help?

- **GitHub Issues:** [https://github.com/eldtechnologies/ogframe/issues](https://github.com/eldtechnologies/ogframe/issues)
- **Email:** magnus@eldtechnologies.com
- **Documentation:** [docs/specification.md](docs/specification.md)

---

**Built by ELD Technologies**

Simple tools for real problems. No bloat, just value.
