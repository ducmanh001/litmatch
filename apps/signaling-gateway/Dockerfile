# Build context = repo root. Trước khi build image, chạy: pnpm nx build signaling-gateway
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-workspace.yaml ./
COPY dist/apps/signaling-gateway ./
RUN corepack enable pnpm \
  && pnpm install --prod --frozen-lockfile --ignore-scripts \
  && corepack disable \
  && rm -rf /root/.cache /root/.local/share/pnpm /usr/local/lib/node_modules/npm
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health/live >/dev/null || exit 1
CMD ["node", "main.js"]
