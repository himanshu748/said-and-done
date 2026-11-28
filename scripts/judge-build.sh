#!/usr/bin/env bash
# Deploys the unlisted judge build after checking it has a distinct app identity.
set -euo pipefail
case "${1:-}" in
  '') ;;
  --check) ;;
  *) printf 'Usage: %s [--check]\n' "$0" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [--check]\n' "$0" >&2
  exit 2
fi
: "${JUDGE_APP_ID:?set JUDGE_APP_ID to the judge build app id}"
root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="$root/manifest.yml"
uuid='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
source_id="$(sed -nE 's#^  id: ari:cloud:ecosystem::app/([^[:space:]]+)$#\1#p' "$manifest")"
if ! [[ "$JUDGE_APP_ID" =~ $uuid && "$source_id" =~ $uuid ]]; then
  printf 'Expected one Forge app UUID in the manifest and a UUID in JUDGE_APP_ID.\n' >&2
  exit 2
fi
judge_id="$(printf '%s' "$JUDGE_APP_ID" | tr '[:upper:]' '[:lower:]')"
if [[ "$judge_id" == "$(printf '%s' "$source_id" | tr '[:upper:]' '[:lower:]')" ]]; then
  printf 'JUDGE_APP_ID must differ from the working app identity.\n' >&2
  exit 2
fi
judge_manifest() {
  sed -E "s#^  id: ari:cloud:ecosystem::app/$source_id\$#  id: ari:cloud:ecosystem::app/$judge_id#" "$manifest"
}
if [[ "${1:-}" == '--check' ]]; then
  judge_manifest
  exit 0
fi
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
(cd "$root" && npm run build:ui)
rsync -a --exclude .git --exclude node_modules --exclude .env --exclude '.env.*' "$root/" "$out/"
ln -s "$root/node_modules" "$out/node_modules"
judge_manifest > "$out/manifest.yml"
cd "$out" && npx @forge/cli deploy -e "${FORGE_ENV:-production}" --non-interactive
