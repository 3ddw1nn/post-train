# Post Train — single-instance deploy (Fly.io / Railway / Render / any Docker host).
# node:sqlite is a Node built-in (compiled into the runtime), so unlike
# better-sqlite3 there's no native-binding rebuild step needed for alpine/musl.

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Persistent volume mounts here in production (SQLite db + uploaded media)
RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
