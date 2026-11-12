# Loads the Save v2 import settings into the current bash shell without printing them.
#   . scripts/save-v2/load-import-env.sh        (run from the navi-save-v2 worktree root)
#
# Reads:
#   .env.import.local (this worktree, git-ignored): NAVI_STUDIO_DATABASE_URL, the navi-studio-v2
#     Transaction pooler URI with the database password. Kept on purpose for reuse (owner, 2026-11-12).
#   ../../navi-next/.env.development.local: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the old
#     navi-development project, used only for select queries by import-old-map.ts.
# Prints yes/NO checks only, never a value.
_val() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
_yn() { if [ "$1" = 1 ]; then echo yes; else echo NO; fi; }
_old_env="${NAVI_OLD_ENV_FILE:-../../navi-next/.env.development.local}"

export NAVI_STUDIO_DATABASE_URL="$(_val .env.import.local NAVI_STUDIO_DATABASE_URL)"
export NAVI_STUDIO_ALLOWED_DB_REF=ztbnicoiwjghzttchqmp
export NAVI_OLD_SUPABASE_URL="$(_val "$_old_env" SUPABASE_URL)"
export NAVI_OLD_SUPABASE_SERVICE_KEY="$(_val "$_old_env" SUPABASE_SERVICE_ROLE_KEY)"

echo "studio url is postgres + navi-studio-v2: $(_yn $(case "$NAVI_STUDIO_DATABASE_URL" in postgres*ztbnicoiwjghzttchqmp*) echo 1;; esac))"
echo "old url is navi-development: $(_yn $(case "$NAVI_OLD_SUPABASE_URL" in *scvgulusmutnzasmgysx*) echo 1;; esac))"
echo "old key set: $(_yn $([ -n "$NAVI_OLD_SUPABASE_SERVICE_KEY" ] && echo 1))"
