# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS runner

WORKDIR /app

# Create non-root user
RUN useradd --system --uid 1001 --create-home app

# Copy built files, server, and scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/scripts ./scripts

# Create data directory for SQLite and set ownership
RUN mkdir -p /app/data && chown -R app:app /app

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Switch to non-root user
USER app

EXPOSE 4000

CMD ["bun", "run", "start"]
