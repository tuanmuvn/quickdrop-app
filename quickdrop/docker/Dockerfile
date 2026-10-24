# QuickDrop v1.0 - Production Dockerfile
# Node.js 22 LTS on Alpine Linux for ultra-small image footprint (< 120MB)

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy application source
COPY server/ ./server/
COPY public/ ./public/
COPY .env.example ./

# Production runner image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user for security
RUN addgroup -S quickdrop && adduser -S quickdrop -G quickdrop

# Copy node_modules and app files from builder
COPY --from=builder --chown=quickdrop:quickdrop /app/node_modules ./node_modules
COPY --from=builder --chown=quickdrop:quickdrop /app/package.json ./package.json
COPY --from=builder --chown=quickdrop:quickdrop /app/server ./server
COPY --from=builder --chown=quickdrop:quickdrop /app/public ./public
COPY --from=builder --chown=quickdrop:quickdrop /app/.env.example ./.env.example

USER quickdrop

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server/app.js"]
