#!/usr/bin/env bash
# Deploy the static HAA demo to the `gh-pages` branch without GitHub Actions.
# This path exists because the local GitHub token may not have `workflow` scope.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"
VITE_DEMO=1 VITE_BASE=./ npm run build:demo
cp -R dist/. "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name='Orangecy deploy' -c user.email='deploy@orangecy.local' commit -qm 'Deploy HAA demo'
git remote add origin "$REMOTE"
git push --force origin gh-pages
echo "Deployed dist to gh-pages."
