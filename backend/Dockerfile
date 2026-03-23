# ── Stage 1: TypeScript build ──────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-slim

# System dependencies: ffmpeg for video frames, yt-dlp for social extraction
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      curl \
      ca-certificates && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Pre-download AI detection model so the first request never blocks on download.
# The model (~85 MB int8) is baked into the image and loaded from /app/models.
COPY scripts/ ./scripts/
ENV HF_CACHE_DIR=/app/models
RUN node scripts/download-model.mjs

# Compiled JS from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["npm", "start"]
