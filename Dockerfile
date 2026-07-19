# Post Train — stateless web deploy (Render worker / Railway / any Docker host).

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
# ffmpeg renders Content Studio templates (lib/ffmpeg.ts).
RUN apk add --no-cache ffmpeg
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data
USER nextjs
EXPOSE 3000
ENV PORT=3000
# Docker auto-sets HOSTNAME to the container ID; the Next.js standalone
# server binds to it if present instead of falling back to 0.0.0.0, making
# the app unreachable from outside the container. Force the real default.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
