#!/usr/bin/env bash
# Deploy this worktree as a navi-next PREVIEW (never production) and point the fixed
# Save v2 preview address at it, so admins keep one URL (owner request, 2026-11-02).
#   bash scripts/save-v2/deploy-preview.sh
set -euo pipefail
ALIAS="navi-next-savev2-navi01.vercel.app"
LOG="$(mktemp)"
vercel deploy --yes --scope navi01 --meta branch=feat/save-v2 --meta commit="$(git rev-parse --short HEAD)" >"$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
URL="$(grep -oE 'navi-next-[a-z0-9]+-navi01\.vercel\.app' "$LOG" | head -1)"
[ -n "$URL" ] || { tail -20 "$LOG"; exit 1; }
vercel alias set "$URL" "$ALIAS" --scope navi01
echo "Preview: https://$ALIAS (deployment $URL)"
