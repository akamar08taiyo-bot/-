#!/bin/bash
# #2（過激版）の声と絵をまとめて作る（Gemini のクレジットが必要）。終わったら静止画で確認してから render する。
set -euo pipefail
cd "$(dirname "$0")/.."
EP=honne02
mkdir -p "work/$EP"

# 絵：新しい場面を4本ずつ並列で（人物の設定画を参照）
for id in X1 X3 X5 X6 X7 X9 X10; do
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 2; done
  ( python3 -I scripts/gen_image.py --ep $EP $id > "work/$EP/gen_$id.log" 2>&1 || echo "FAILED $id" >> "work/$EP/gen_failed.log" ) &
done

# 声：全行（読み間違いは自動で取り直し）
python3 -I scripts/tts.py --ep $EP 2>&1 | tee "work/$EP/tts.log"
wait
echo "images:"; tail -q -n1 work/$EP/gen_X*.log
cat "work/$EP/gen_failed.log" 2>/dev/null || true
