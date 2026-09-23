# syntax=docker/dockerfile:1
# Build context is the REPOSITORY ROOT (see docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* .npmrc ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# --ignore-scripts for the same reason as backend/Dockerfile: the root `prepare`
# script points at .husky, which .dockerignore keeps out of the context.
RUN npm install --workspace frontend --include-workspace-root --ignore-scripts

COPY frontend ./frontend

# Vite inlines env vars at BUILD time, so the API URL is a build arg rather
# than a runtime environment variable.
ARG VITE_API_BASE_URL=http://localhost:5000
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
