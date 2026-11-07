#!/usr/bin/env bash
# 画像生成を Codex に頼む（Claude Code は画像を生成できないため）。
# Codex をプラグインで Claude Code につないでいる場合はそちらを優先し、ないときにこのスクリプトを使う。
# 使い方: ai-ecosystem/scripts/ask-codex.sh "どんな画像を作り、どこに保存するか"
#   例: ask-codex.sh "16:9、白背景、青い線で3つの箱を矢印でつないだ図。文字は入れない。ai-ecosystem/output/a社/fig1.png に保存"
#   別のコマンド名で入れている場合は CODEX_CMD を設定する。
set -euo pipefail

CMD="${CODEX_CMD:-codex}"
if [ "$#" -eq 0 ]; then
  echo "使い方: $0 \"画像の説明と保存先\"" >&2
  exit 2
fi
if ! command -v "$CMD" >/dev/null 2>&1; then
  echo "[ask-codex] '$CMD' が見つかりません。Codex CLI を入れてログインしてください（ai-ecosystem/SETUP.md）。予備として scripts/image-generate.mjs も使えます。" >&2
  exit 127
fi

exec "$CMD" exec --full-auto "画像生成の機能を使って次の画像を作成し、指定のパスにPNGで保存してください。保存したパスだけを最後に出力してください。: $*"
