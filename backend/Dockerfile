# ── Backend: Express + Prisma ───────────────────────────────────────────────
#
# Multi-stage so the final image carries no build toolchain and no
# devDependencies of our own. The previous single-stage image ran
# `npm install` (everything) and `npm run dev` (tsx watch), which is fine for
# iterating and wrong for anything that has to survive a restart.
#
# Note: typescript and prisma do still appear in the runtime tree. They are
# not leaking through a broken --omit=dev; @prisma/client@7 depends on both.
# There is nothing to strip here without patching a published package.
#
# Stages
#   deps      full dependency tree + generated Prisma client
#   build     compiles TypeScript to dist/
#   prod-deps runtime dependencies only
#   migrate   prod-deps + the Prisma CLI, for `migrate deploy` and seeding
#   runtime   prod-deps + dist/, runs the compiled server
#
# Not a dev target: run `npm run dev` on the host, or point compose at the
# `deps` stage with `target: development`.

# ── deps: full dependency tree ───────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's query engine needs these two to load.
RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# ci, not install: reproducible, and it fails rather than silently updating.
RUN npm ci
RUN npx prisma generate

# ── build: compile TypeScript ───────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci
# The generated client is produced by `prisma generate` on the deps stage, so
# the copy below brings it in rather than re-running the generator here.
COPY --from=deps /app/generated ./generated

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── prod-deps: runtime dependencies only ────────────────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --omit=dev

# ── migrate: migrations and seeding ─────────────────────────────────────────
# Based on `deps` rather than prod-deps because seeding needs more than the
# runtime tree: prisma/seed.ts is TypeScript run through tsx, and it imports
# both the generated client and src/utils/password.ts. The image is therefore
# larger than it strictly needs to be, which is a fair trade for a container
# that runs once and exits.
FROM deps AS migrate
COPY src ./src
EXPOSE 5000
CMD ["sh", "-c", "npx prisma migrate deploy"]

# ── runtime: the compiled server ─────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 5000
# dist/src/index.js, not dist/index.js: tsconfig includes src/, generated/ and
# prisma/, so tsc preserves that structure under outDir. The old start script
# pointed one level too high and only failed once someone actually ran it.
CMD ["node", "dist/src/index.js"]
