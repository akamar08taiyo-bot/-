#!/bin/bash
# スロー化の順番待ち：動き補間の ffmpeg が4本未満になったら次を始める（1行1ジョブ：ID 元動画 [頭を切る秒] [倍率] [使う長さ]）
# 先に全部の行を読んでから始める（ffmpeg が標準入力を読んで、行が欠けたことがあった）
cd "$(dirname "$0")/.."
mapfile -t JOBS < "$1"
for line in "${JOBS[@]}"; do
  [ -z "$line" ] && continue
  while [ "$(pgrep -c -f '^ffmpeg .*minterpolate')" -ge 4 ]; do sleep 5; done
  scripts/slowmo.sh $line < /dev/null &
  sleep 3
done
wait
echo "queue done"
