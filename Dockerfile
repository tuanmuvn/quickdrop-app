# QuickDrop v1.0 - Production Dockerfile
# Node.js 22 LTS on Alpine Linux for ultra-small image footprint (< 120MB)

FROM node:22-alpine AS builder

WORKDIR /app

# Install production dependencies using clean server package.json
# This prevents ERESOLVE conflicts with development build tools
COPY server/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts

# Production runner image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8055

# Create non-root user for security
RUN addgroup -S quickdrop && adduser -S quickdrop -G quickdrop

# Copy node_modules and app files
COPY --from=builder --chown=quickdrop:quickdrop /app/node_modules ./node_modules
COPY --from=builder --chown=quickdrop:quickdrop /app/package.json ./package.json
COPY --chown=quickdrop:quickdrop server/ ./server/
COPY --chown=quickdrop:quickdrop public/ ./public/
COPY --chown=quickdrop:quickdrop .env.example ./

USER quickdrop

EXPOSE 8055

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8055/api/health || exit 1

CMD ["node", "server/app.js"]
