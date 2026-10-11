#!/bin/bash
# 使い方: slowmo.sh <ID> <src.mp4>  → public/clips/<ID>.mp4（動き補間で半速、30fps、16秒）＋最初/最後のコマ＋伸ばした音
set -e
id=$1; src=$2
root=$(cd "$(dirname "$0")/.." && pwd)
out=$root/public/clips/$id.mp4
if [ ! -f "$out" ]; then
  ffmpeg -v error -y -i "$src" -an -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=2.0*PTS" -r 30 -c:v libx264 -preset medium -crf 15 -pix_fmt yuv420p -movflags +faststart "$out.tmp.mp4"
  mv "$out.tmp.mp4" "$out"
fi
ffmpeg -v error -y -i "$out" -frames:v 1 -q:v 2 "$root/public/clips/${id}_first.jpg"
ffmpeg -v error -y -sseof -0.05 -i "$out" -frames:v 1 -q:v 2 "$root/public/clips/${id}_last.jpg"
ffmpeg -v error -y -i "$src" -vn -af "rubberband=tempo=0.5:transients=crisp:detector=compound:phase=independent:window=standard:formant=preserved:pitchq=quality" -ar 48000 -ac 2 "$root/work/veoaudio/$id.wav" || true
echo "$id done $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")"
