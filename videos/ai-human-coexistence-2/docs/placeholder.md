B1・D2 は、Veo の作り直し（Gemini の残高補充後）まで、原画の静止画をクリップにしている（public/clips/B1.mp4・D2.mp4、寄りだけ）。
作り直したら：
  python3 -I scripts/veo_batch.py B1 D2
  scripts/slowmo.sh B1 assets/veo/B1_v1.mp4 ; scripts/slowmo.sh D2 assets/veo/D2_v1.mp4   （先に public/clips/B1.mp4・D2.mp4 を消す）
  timeline.json の B1 に {"t": 4.6, "type": "monorail_pass", "gain": -2}、D2 に {"t": 4.2, "type": "can_kick"} を戻し、audio の veo を 1.0 に
  B1 は原画を B1_v4（コンビニの看板の色を塗り替えたもの）にしてある
