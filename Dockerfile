FROM node:20-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/open-uni-recorder-api/package.json ./apps/open-uni-recorder-api/
COPY packages/ ./packages/


FROM base AS builder

RUN pnpm install --frozen-lockfile

COPY apps/open-uni-recorder-api ./apps/open-uni-recorder-api

RUN pnpm --filter @toolbox/open-uni-recorder-api build


FROM base

RUN pnpm install --frozen-lockfile --prod

RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/open-uni-recorder-api/dist ./apps/open-uni-recorder-api/dist

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "apps/open-uni-recorder-api/dist/src/main.js"]