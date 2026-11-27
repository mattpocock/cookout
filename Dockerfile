# The cookout server: `cookout serve` on SQLite, with the database on the /data volume.
# Build: docker build -t cookout .   Recipes: docs/verification.md ("Run it in Docker").

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Every dependency, then the root build (tsdown and the Vite web build, into dist/).
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# Only the runtime dependencies the built bin imports.
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --prod

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    COOKOUT_HOST=0.0.0.0 \
    COOKOUT_DB=/data/cookout.db
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# A fresh named volume copies this folder's owner, so the non-root user can write the database.
# `cookout` on the PATH runs the console commands, such as `cookout admin login-link <name>`.
RUN mkdir -p /data && chown node:node /data && chmod +x dist/main.js && ln -s /app/dist/main.js /usr/local/bin/cookout
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/v1/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js", "serve"]
