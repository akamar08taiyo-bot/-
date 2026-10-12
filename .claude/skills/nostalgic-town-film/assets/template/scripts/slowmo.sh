#!/bin/bash
# 使い方: slowmo.sh <ID> <src.mp4> [頭を切る秒] [遅くする倍率] [使う長さ（秒）]
#   → public/clips/<ID>.mp4（動き補間でスロー、30fps）＋最初/最後のコマ＋伸ばした音
#   既定は頭を切らずに半速（8秒 → 16秒）。Veo の最初の数秒が崩れたときは、頭を切って倍率を上げ、長さを保つ
#   例：slowmo.sh A1 assets/veo/A1_v1.mp4 2.3 2.78（残り 5.7秒 → 15.9秒）
#   後ろが崩れたとき（顔がこちらを向く等）は、使う長さで切る：slowmo.sh T0 assets/veo/T0_v1.mp4 0 2 5.0（5秒 → 10秒）
set -e
id=$1; src=$2; ss=${3:-0}; k=${4:-2.0}; len=${5:-}
cut=(); [ -n "$len" ] && cut=(-t "$len")
root=$(cd "$(dirname "$0")/.." && pwd)
out=$root/public/clips/$id.mp4
fps=$(python3 -c "print(round(30*$k, 3))")
tempo=$(python3 -c "print(round(1/$k, 5))")
if [ ! -f "$out" ]; then
  ffmpeg -v error -y -ss "$ss" "${cut[@]}" -i "$src" -an -vf "minterpolate=fps=$fps:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=$k*PTS" -r 30 -c:v libx264 -preset medium -crf 15 -pix_fmt yuv420p -movflags +faststart "$out.tmp.mp4"
  mv "$out.tmp.mp4" "$out"
fi
ffmpeg -v error -y -i "$out" -frames:v 1 -q:v 2 "$root/public/clips/${id}_first.jpg"
ffmpeg -v error -y -sseof -0.05 -i "$out" -frames:v 1 -q:v 2 "$root/public/clips/${id}_last.jpg"
ffmpeg -v error -y -ss "$ss" "${cut[@]}" -i "$src" -vn -af "rubberband=tempo=$tempo:transients=crisp:detector=compound:phase=independent:window=standard:formant=preserved:pitchq=quality" -ar 48000 -ac 2 "$root/work/veoaudio/$id.wav" || true
echo "$id done $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")"
