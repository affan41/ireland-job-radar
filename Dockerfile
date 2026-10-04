FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=8099 \
    JOBS_DB=/app/data/jobs.db
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups

USER node
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8099/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "server.js"]
