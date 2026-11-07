#!/usr/bin/env bash
# 長い資料・動画のレビューや Google Workspace 系の作業を Gemini（Antigravity / Gemini CLI）に頼む。
# 使い方: ai-ecosystem/scripts/ask-gemini.sh "指示" [ファイル...]
#   ファイルは「@パス」の形でプロンプトに添付する（Gemini CLI の書き方）。
#   Antigravity の CLI など別のコマンドを使う場合は、環境変数 GEMINI_CMD にコマンド名を入れる。
set -euo pipefail

CMD="${GEMINI_CMD:-gemini}"
if [ "$#" -eq 0 ]; then
  echo "使い方: $0 \"指示\" [ファイル...]" >&2
  exit 2
fi
if ! command -v "$CMD" >/dev/null 2>&1; then
  echo "[ask-gemini] '$CMD' が見つかりません。Gemini CLI か Antigravity を入れ、必要なら GEMINI_CMD を設定してください（ai-ecosystem/SETUP.md）。" >&2
  exit 127
fi

PROMPT="$1"
shift
for f in "$@"; do
  if [ ! -e "$f" ]; then
    echo "[ask-gemini] ファイルが見つかりません: $f" >&2
    exit 2
  fi
  PROMPT="$PROMPT @$f"
done

exec "$CMD" -p "$PROMPT"
