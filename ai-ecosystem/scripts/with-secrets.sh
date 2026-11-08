#!/usr/bin/env bash
# 1Password から APIキーを取り出してコマンドを実行する。
# .env には「op://保管庫/項目/フィールド」という参照だけが書いてあり、実際のキーはファイルに残らない。
# 使い方: ai-ecosystem/scripts/with-secrets.sh <コマンド...>
#   例: ai-ecosystem/scripts/with-secrets.sh node ai-ecosystem/scripts/judge-image.mjs out.png
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# .env を探す順番: 環境変数 ENV_FILE → リポジトリ直下（ai-ecosystem/scripts から2つ上）→ PC全体の置き場所（~/.claude/jeb）
if [ -z "${ENV_FILE:-}" ]; then
  for candidate in "$SCRIPT_DIR/../../.env" "$SCRIPT_DIR/../.env"; do
    if [ -f "$candidate" ]; then
      ENV_FILE="$candidate"
      break
    fi
  done
  ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../.env}"
fi

if [ "$#" -eq 0 ]; then
  echo "使い方: $0 <コマンド...>" >&2
  exit 2
fi

if command -v op >/dev/null 2>&1 && [ -f "$ENV_FILE" ]; then
  exec op run --env-file="$ENV_FILE" -- "$@"
fi

echo "[with-secrets] 1Password CLI（op）か $ENV_FILE が見つからないため、今の環境変数のまま実行します。" >&2
exec "$@"
