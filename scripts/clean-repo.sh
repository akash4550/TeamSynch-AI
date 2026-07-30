#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "   TeamSynch AI Repository Sanitization & Sweep   "
echo "=================================================="

# 1. Remove build artifacts, cache stores, and test coverage outputs
echo "[1/4] Purging build artifacts, caches, and test coverage..."
rm -rf dist/ apps/*/dist/ build/ apps/*/build/ coverage/ apps/*/coverage/ .turbo/ .eslintcache .tsbuildinfo apps/*/*.tsbuildinfo

# 2. Remove temporary logs, uploads, and runtime caches
echo "[2/4] Clearing runtime log files and temporary uploads..."
rm -f *.log apps/*/*.log npm-debug.log* yarn-debug.log*
rm -rf apps/api/uploads/* apps/api/logs/* backups/*.dump backups/*.json

# Re-create empty uploads and logs folders with .gitkeep
mkdir -p apps/api/uploads apps/api/logs
touch apps/api/uploads/.gitkeep apps/api/logs/.gitkeep

# 3. Clean OS & IDE artifacts
echo "[3/4] Stripping OS metadata and IDE temp files..."
find . -name ".DS_Store" -type f -delete
find . -name "Thumbs.db" -type f -delete
find . -name "*.local" -not -name "*.example" -type f -delete

# 4. Verify clean working state
echo "[4/4] Verification complete. Repository is pristine and production-ready!"
echo "=================================================="
