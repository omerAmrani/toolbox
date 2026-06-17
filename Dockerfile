FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/open-uni-recorder-api/package.json ./apps/open-uni-recorder-api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile

COPY apps/open-uni-recorder-api ./apps/open-uni-recorder-api

RUN pnpm --filter @toolbox/open-uni-recorder-api build


FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/open-uni-recorder-api/package.json ./apps/open-uni-recorder-api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile --prod

RUN npx playwright install --with-deps chromium

COPY --from=builder /app/apps/open-uni-recorder-api/dist ./apps/open-uni-recorder-api/dist

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "apps/open-uni-recorder-api/dist/src/main.js"]