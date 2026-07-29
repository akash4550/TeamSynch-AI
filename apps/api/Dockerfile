# Stage 1: Builder Stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

# Copy root workspace and API package manifests
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install build dependencies
RUN npm ci --ignore-scripts --workspace=api --include-workspace-root=false

# Copy API source code
COPY apps/api ./apps/api

# Generate Prisma Client & compile TypeScript
WORKDIR /app/apps/api
RUN npm run generate
RUN npm run build

# Stage 2: Production Runner Stage
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

# Install production dependencies only
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --omit=dev --ignore-scripts --workspace=api --include-workspace-root=false

# Copy built artifacts from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/node_modules/@prisma ./apps/api/node_modules/@prisma
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma

WORKDIR /app/apps/api

# Create uploads directory and set non-root ownership for node user (UID 1000)
RUN mkdir -p /app/apps/api/uploads /app/apps/api/logs \
    && chown -R node:node /app

# Drop root privileges and switch to unprivileged node user
USER node

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Start the Node.js application as unprivileged user
CMD ["node", "dist/server.js"]
