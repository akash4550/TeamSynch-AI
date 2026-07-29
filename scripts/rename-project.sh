#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "   TeamSynch AI Global Branding Migration Sweep   "
echo "=================================================="

# 1. Replace display strings in source files, UI components, and documentation
echo "[1/3] Updating display text and titles to 'TeamSynch AI'..."
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.html" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i 's/AIWorkspace/TeamSynch AI/g' {} +

# 2. Replace workspace slugs, package names, and container tags
echo "[2/3] Updating workspace slugs to 'teamsynch-ai'..."
find . -type f \( -name "*.json" -o -name "*.yml" -o -name "*.yaml" -o -name "*.ts" -o -name "*.js" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i 's/aiworkspace/teamsynch-ai/g' {} +

# 3. Update HTML page title in apps/web/index.html
if [ -f "apps/web/index.html" ]; then
  sed -i 's/<title>.*<\/title>/<title>TeamSynch AI<\/title>/g' apps/web/index.html
fi

echo "[3/3] Renaming completed successfully!"
echo "=================================================="
