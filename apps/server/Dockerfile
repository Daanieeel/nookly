# The sync server. Built from the repository root:
#   docker build -f apps/server/Dockerfile -t nookly-server .
FROM oven/bun:1.4-alpine
WORKDIR /app
ENV NODE_ENV=production
# The whole workspace (minus what .dockerignore leaves out): a frozen install needs
# every package manifest the lockfile names.
COPY . .
RUN bun install --frozen-lockfile --production --ignore-scripts
WORKDIR /app/apps/server
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["bun", "src/index.ts"]
