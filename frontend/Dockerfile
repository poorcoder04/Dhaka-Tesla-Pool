# ── Frontend: Next.js ───────────────────────────────────────────────────────
#
# Multi-stage so the runtime image carries the traced server and nothing else.
# The old Dockerfile ran `npm run dev` (Turbopack dev server) inside the
# container, which is a development server: no production build, no compiled
# routes, and it recompiles on every request.
#
# Stages
#   deps     full dependency tree
#   builder  next build, with NEXT_PUBLIC_API_URL baked in
#   runner   .next/standalone + its static assets, runs server.js

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── builder ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* is substituted into the client bundle at BUILD time. Setting
# it on the running container does nothing: the value is already frozen into
# the JavaScript the browser downloads. It is an ARG, not an ENV, precisely so
# that editing a compose environment block cannot give the false impression
# that changing it took effect.
#
# Changing this value means rebuilding the image, not restarting it:
#   docker compose build frontend && docker compose up -d frontend
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone output does not copy public/ or .next/static on its own; the
# minimal server.js will not serve them unless they are placed here. Both
# copies below are needed - miss either and you get a page with no styles or
# no images, which looks like a styling bug rather than a packaging one.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
