#!/bin/bash
# 仕上げ：無音の本編（out/video_silent.mp4）にフィルムの質感（周辺減光・黒の持ち上げ・粒子）をかけ、
# 2つの音（環境音のみ／テーマ曲入り）をそれぞれ重ねて書き出す
set -e
root=$(cd "$(dirname "$0")/.." && pwd); cd "$root"
look="vignette=angle=0.36:mode=forward,lutrgb=r='val*0.9934+1.7':g='val*0.9948+1.3':b='val*0.99+2.6',noise=c0s=9:c0f=t+u:c1s=4:c1f=t+u:c2s=4:c2f=t+u"
ffmpeg -v error -stats -y -i out/video_silent.mp4 -vf "$look" -c:v libx264 -preset slow -crf ${CRF:-20} -maxrate ${MAXRATE:-12M} -bufsize 24M \
  -pix_fmt yuv420p -r 30 -g 60 -bf 2 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -an out/video_look.mp4
for v in asmr theme; do
  ffmpeg -v error -y -i out/video_look.mp4 -i audio/out/mix_$v.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 \
    -shortest -movflags +faststart out/ai_human_coexistence_$v.mp4
done
ls -la out/ai_human_coexistence_*.mp4
