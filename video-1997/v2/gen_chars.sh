#!/bin/bash
# 写実の人物設定画（全シーン共通の参照）。ハルトを先に作り、大人のハルトはそれを参照して作る
cd "$(dirname "$0")"
G=../pipeline/genimg.py
D() { python3 -c "import json;print(json.load(open('scenes.json'))['chars']['$1']['desc'])"; }
SHEET='Photographic character reference sheet for a film: three photographs side by side of the SAME person on a plain light grey studio backdrop with soft natural light — (1) full body standing front view, (2) full body standing side view, (3) head-and-shoulders close-up. Photorealistic, looks like 35mm color film, realistic skin texture, ordinary-looking person (not a celebrity). No text, no labels, no numbers.'
python3 $G --prompt "$SHEET $(D haruto)" --out assets/chars/haruto.png > work/char_haruto.log 2>&1 &
python3 $G --prompt "$SHEET $(D yusuke)" --out assets/chars/yusuke.png > work/char_yusuke.log 2>&1 &
python3 $G --prompt "$SHEET $(D natsumi)" --out assets/chars/natsumi.png > work/char_natsumi.log 2>&1 &
python3 $G --prompt "$SHEET $(D grandma)" --out assets/chars/grandma.png > work/char_grandma.log 2>&1 &
python3 $G --prompt "Photographic reference sheet for a film: three photographs side by side of the SAME dog on a plain light grey studio backdrop with soft natural light — (1) standing side view, (2) sitting front view, (3) close-up of the face. Photorealistic, 35mm color film look. No text. $(D shiba)" --out assets/chars/shiba.png > work/char_shiba.log 2>&1 &
wait
python3 $G --ref assets/chars/haruto.png --prompt "$SHEET The attached photos show HARUTO as a 10-year-old boy; make the SAME person grown up at age 39 in 2026, clearly recognizable as him (same face shape, eyes and cowlick). $(D adult)" --out assets/chars/adult.png > work/char_adult.log 2>&1
cat work/char_*.log
