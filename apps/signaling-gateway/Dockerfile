# Build context = repo root. Trước khi build image, chạy: pnpm nx build signaling-gateway
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY dist/apps/signaling-gateway ./
RUN corepack enable pnpm && pnpm install --prod --frozen-lockfile --ignore-scripts
USER node
EXPOSE 3001
CMD ["node", "main.js"]
