# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim
WORKDIR /app
COPY apps/gateway/package.json ./
RUN npm install --omit=dev
COPY apps/gateway/src ./src
ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
