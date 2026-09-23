# syntax=docker/dockerfile:1
# Build context is the REPOSITORY ROOT (see docker-compose.yml) so the npm
# workspace manifests resolve the same way they do on a developer machine.

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* .npmrc ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Install only the backend workspace's production tree.
#
# --ignore-scripts is required, not optional: the root `prepare` script runs
# `node .husky/install.mjs`, and .husky is excluded by .dockerignore, so npm
# would abort the build with MODULE_NOT_FOUND. Git hooks have no meaning in an
# image anyway. None of the runtime dependencies need a postinstall step.
RUN npm install --omit=dev --workspace backend --include-workspace-root --ignore-scripts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# Run unprivileged. node:alpine ships a `node` user (uid 1000) already.
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --chown=node:node backend ./backend

# Uploads are a bind-mounted volume in compose; make sure the mount point is
# owned by the runtime user so multer can write into it.
RUN mkdir -p /repo/backend/uploads && chown -R node:node /repo/backend/uploads

USER node
WORKDIR /repo/backend
EXPOSE 5000

# No curl/wget in the slim image, so use node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
