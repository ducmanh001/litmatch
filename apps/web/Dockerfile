# Build context = repo root. Trước khi build image, chạy: pnpm nx build web
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
WORKDIR /app
ENV NODE_ENV=production PORT=4300 HOSTNAME=0.0.0.0
COPY --chown=node:node apps/web/.next/standalone ./
COPY --chown=node:node apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node apps/web/public ./apps/web/public
USER node
EXPOSE 4300
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4300/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
