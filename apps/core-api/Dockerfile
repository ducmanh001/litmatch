# Build context = repo root. Trước khi build image, chạy: pnpm nx build core-api
# (webpack generatePackageJson tạo dist/apps/core-api gồm main.js + package.json + pnpm-lock.yaml đã prune)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY dist/apps/core-api ./
RUN corepack enable pnpm && pnpm install --prod --frozen-lockfile --ignore-scripts
USER node
EXPOSE 3000
CMD ["node", "main.js"]
