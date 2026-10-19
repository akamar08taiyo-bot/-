#!/bin/bash
# #2（過激版）の声と絵をまとめて作る（Gemini のクレジットが必要）。
#   1) bash scripts/make_honne02_assets.sh sheet   … 人物の設定画 v2（v1 を参照）。目で見て assets/characters/sheet_v2.png に置く
#   2) bash scripts/make_honne02_assets.sh scenes  … 新しい場面の絵（最新の設定画を参照）と、全行の声
set -euo pipefail
cd "$(dirname "$0")/.."
EP=honne02
mkdir -p "work/$EP"
case "${1:-scenes}" in
  sheet)
    python3 -I scripts/gen_image.py --ep $EP sheet --refs assets/characters/sheet_v1.png
    ;;
  scenes)
    for id in X1 X3 X5 X6 X7 X9 X10; do
      while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 2; done
      ( python3 -I scripts/gen_image.py --ep $EP $id > "work/$EP/gen_$id.log" 2>&1 || echo "FAILED $id" >> "work/$EP/gen_failed.log" ) &
    done
    python3 -I scripts/tts.py --ep $EP 2>&1 | tee "work/$EP/tts.log"
    wait
    echo "images:"; tail -q -n1 work/$EP/gen_X*.log
    cat "work/$EP/gen_failed.log" 2>/dev/null || true
    ;;
esac
