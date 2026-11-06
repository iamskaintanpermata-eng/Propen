FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-build

WORKDIR /app/backend
ENV DATABASE_URL=postgresql://sipes_app:build_only@localhost:5432/sipes_unand?schema=public
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma/ ./prisma/
RUN npm run prisma:generate
COPY backend/src/ ./src/
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend-build --chown=node:node /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=backend-build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /app/backend/prisma ./prisma
COPY --from=backend-build --chown=node:node /app/backend/src ./src
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node
EXPOSE 5000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node src/index.js"]
