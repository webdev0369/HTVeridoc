# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
# packages/ may be empty; keep workspace layout for pnpm
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @htveridoc/web...
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
# Keep these as separate RUNs so a failed `next build` is not masked by the
# standalone path check (shell `&&`/`||` would otherwise hide the real error).
RUN pnpm --filter @htveridoc/web build
RUN test -f apps/web/.next/standalone/apps/web/server.js \
    -o -f apps/web/.next/standalone/server.js \
  || (echo "standalone server.js missing after successful next build" \
      && find apps/web/.next -maxdepth 4 -type f -name 'server.js' -print || true \
      && exit 1)

FROM node:20-bookworm-slim AS runner
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Railway injects PORT at runtime; 3000 is only the local/Docker default.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs docker/web-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
