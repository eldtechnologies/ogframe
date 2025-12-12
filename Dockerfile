# Multi-stage Dockerfile for OGFrame
# Using Playwright's official base image for reliable browser automation

# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ============================================
# Stage 2: Production
# ============================================
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create non-root user
RUN groupadd -g 1001 ogframe && \
    useradd -u 1001 -g ogframe -m ogframe

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Create cache directory
RUN mkdir -p /app/cache/images

# Change ownership to non-root user
RUN chown -R ogframe:ogframe /app

# Switch to non-root user
USER ogframe

# Expose port (default: 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
