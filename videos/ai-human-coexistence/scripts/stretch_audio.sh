#!/bin/bash
# Veo の音を半速に伸ばす（音程は保つ。rubberband の crisp 設定が一番自然と判定された）
# 使い方: stretch_audio.sh <ID> <src.mp4>
id=$1; src=$2; root=$(cd "$(dirname "$0")/.." && pwd)
ffmpeg -v error -y -i "$src" -vn -af "rubberband=tempo=0.5:transients=crisp:detector=compound:phase=independent:window=standard:formant=preserved:pitchq=quality" -ar 48000 -ac 2 "$root/work/veoaudio/$id.wav" && echo "$id ok"
