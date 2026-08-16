# ---------- Multi-stage Dockerfile for HydraSkript (Next.js + Prisma) ----------
# Use a smaller base image and leverage caching efficiently.

# ---------- Build stage ----------
FROM node:20-alpine AS builder

# Install system dependencies required by Prisma & optional tools
RUN apk add --no-cache python3 make g++ openssl

# Set working directory
WORKDIR /app

# Install dependencies (including dev dependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client (if using Prisma)
# RUN npx prisma generate

# Build Next.js app
RUN npm run build

# ---------- Production stage ----------
FROM node:20-alpine AS runner

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
WORKDIR /app
USER appuser

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/next-i18next.config.mjs ./ (if exists)
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/prisma ./prisma

# Set environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port Next.js runs on
EXPOSE 3000

# Start the Next.js server
CMD ["node", "server.js"]