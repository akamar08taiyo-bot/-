#!/bin/sh
# 見積書・請求書アプリのブラウザのテストを全部（21本）動かす（serve.mjs で http://localhost:5190 を配信しているあいだに。25分ほど）。
# usage: node serve.mjs <サイト> sh run-e2e.sh <出力フォルダ> [リポジトリ（既定 /home/user/-）]
OUT=${1:?出力フォルダ}
REPO=${2:-/home/user/-}
mkdir -p "$OUT"
cd "$REPO" || exit 1
FAIL=0
for t in "e2e.mjs http://localhost:5190/sasaoka/index.html" "e2e-settings.mjs http://localhost:5190/sasaoka/index.html" \
  "e2e-sheet.mjs http://localhost:5190" "e2e-estimate.mjs http://localhost:5190" "e2e-sync.mjs http://localhost:5190" "e2e-order.mjs http://localhost:5190" \
  "e2e-shinsei.mjs http://localhost:5190" "e2e-riyu.mjs http://localhost:5190" "e2e-card.mjs http://localhost:5190" \
  "e2e-trash.mjs http://localhost:5190" "e2e-data.mjs http://localhost:5190" "e2e-caresoft.mjs http://localhost:5190" \
  "e2e-bracket.mjs http://localhost:5190" "e2e-tokutei.mjs http://localhost:5190" "e2e-sales.mjs http://localhost:5190" \
  "e2e-photomark.mjs http://localhost:5190" "e2e-import-docs.mjs http://localhost:5190" "e2e-delete.mjs http://localhost:5190" "e2e-zip.mjs http://localhost:5190" \
  "e2e-toolbar.mjs http://localhost:5190" "e2e-care.mjs http://localhost:5190"; do
  set -- $t
  timeout 500 node "test/sasaoka/$1" "$2" "$OUT" > "$OUT/$1.log" 2>&1
  code=$?
  [ $code -ne 0 ] && FAIL=1
  echo "=== $1 exit $code $(tail -1 "$OUT/$1.log")"
done
exit $FAIL
