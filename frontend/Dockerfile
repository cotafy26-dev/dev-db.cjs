# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --workspace frontend --include-workspace-root
COPY frontend ./frontend
RUN npm run build --workspace frontend

# ---- serve ----
FROM nginx:1.27-alpine AS serve
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
