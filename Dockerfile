# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════
# NA — ảnh production cho Next.js 16 (standalone) + Prisma 7.
# Prisma 7 dùng driver adapter (@prisma/adapter-pg) + query compiler wasm
# → KHÔNG cần native query engine binary, chạy tốt trên alpine.
# ════════════════════════════════════════════════════════════════════

# ─── deps: cài dependencies (postinstall tự chạy `prisma generate`) ───
FROM node:22-alpine AS deps
WORKDIR /app
# prisma/ phải có mặt trước npm install vì postinstall gọi prisma generate.
COPY package.json ./
COPY prisma ./prisma
# Repo chưa commit lockfile → dùng npm install. Nên commit package-lock.json
# để build tái lập được (khi đó đổi sang `npm ci`).
RUN npm install

# ─── builder: build Next standalone ───
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Sinh lại Prisma Client (src/generated/prisma bị gitignore, không có trong context).
RUN npx prisma generate
RUN npm run build

# ─── runner: ảnh chạy tối giản ───
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Belt-and-suspenders: đảm bảo Prisma Client (kèm .wasm query compiler) có mặt
# ngay cả khi output tracing của Next bỏ sót file sinh ra.
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
