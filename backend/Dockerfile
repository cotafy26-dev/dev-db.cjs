# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace backend --include-workspace-root

COPY backend ./backend
RUN npm run db:generate --workspace backend \
  && npm run build --workspace backend

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace backend --include-workspace-root --omit=dev

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

WORKDIR /app/backend
EXPOSE 3333
# Aplica migrations e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
