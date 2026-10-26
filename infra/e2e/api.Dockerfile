# The real API for the full-stack e2e environment (never a deployable image: it carries the dev
# dependencies and the seed). Build context: the repository root.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /repo
COPY . .
# Only what the API needs: its workspace dependencies (config, contracts) and its own packages.
RUN pnpm install --frozen-lockfile --filter @app/api...
RUN pnpm --filter @app/api prisma:generate && pnpm --filter @app/api build

WORKDIR /repo/services/api
EXPOSE 3000
# Migrations first, then the test clubs (idempotent), then the API.
CMD ["sh", "-c", "pnpm db:migrate && node dist/seed.cjs && exec node dist/main.cjs"]
