#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Pulling latest changes..."
git -C "$REPO_DIR" pull origin main

echo "==> Installing dependencies..."
npm --prefix "$REPO_DIR" ci --prefer-offline

echo "==> Building site..."
npm --prefix "$REPO_DIR" run build

echo "==> Done. Site is live at dist/"
