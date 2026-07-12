# Build context = repo root. Trước khi build image, chạy: pnpm nx build signaling-gateway
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
WORKDIR /app
ENV NODE_ENV=production
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
