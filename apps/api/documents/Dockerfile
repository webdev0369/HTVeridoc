# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/documents/package.json ./apps/api/documents/
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @htveridoc/documents...
COPY apps/api/documents ./apps/api/documents
RUN pnpm --filter @htveridoc/shared build \
  && pnpm --filter @htveridoc/db build \
  && pnpm --filter @htveridoc/domains build \
  && pnpm --filter @htveridoc/documents build \
  && pnpm --filter @htveridoc/documents deploy --prod /out

FROM node:20-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nestjs
WORKDIR /app
ENV NODE_ENV=production
ENV APP_NAME=documents
COPY --from=build --chown=nestjs:nodejs /out ./
COPY --chown=nestjs:nodejs docker/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /data/storage \
  && chown -R nestjs:nodejs /data/storage
USER nestjs
EXPOSE 3012
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3012)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
