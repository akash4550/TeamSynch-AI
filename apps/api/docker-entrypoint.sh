#!/bin/sh
set -e

echo "Applying database migrations..."
node /app/node_modules/prisma/build/index.js migrate deploy

echo "Starting TeamSynch AI API..."
exec node /app/apps/api/dist/server.js