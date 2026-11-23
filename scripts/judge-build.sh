#!/usr/bin/env bash
# Deploys the unlisted "Said & Done (judge build)" copy: same code, different app id.
# Marketplace-submitted apps can't be shared by installation link, so judges install this copy.
set -euo pipefail
: "${JUDGE_APP_ID:?set JUDGE_APP_ID to the judge build app id}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
(cd "$root" && npm run build:ui)
rsync -a --exclude .git --exclude node_modules "$root/" "$out/"
ln -s "$root/node_modules" "$out/node_modules"
sed -i -E "s#(  id: ari:cloud:ecosystem::app/).*#\1${JUDGE_APP_ID}#" "$out/manifest.yml"
cd "$out" && npx @forge/cli deploy -e "${FORGE_ENV:-production}" --non-interactive
