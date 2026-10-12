B1・D2 は、Veo の作り直し（Gemini の残高補充後）まで、原画の静止画をクリップにしている（public/clips/B1.mp4・D2.mp4、寄りだけ）。
作り直したら：
  python3 -I scripts/veo_batch.py B1 D2
  scripts/slowmo.sh B1 assets/veo/B1_v1.mp4 ; scripts/slowmo.sh D2 assets/veo/D2_v1.mp4   （先に public/clips/B1.mp4・D2.mp4 を消す）
  timeline.json の B1 に {"t": 4.6, "type": "monorail_pass", "gain": -2}、D2 に {"t": 4.2, "type": "can_kick"} を戻し、audio の veo を 1.0 に
  B1 は原画を B1_v4（コンビニの看板の色を塗り替えたもの）にしてある

D2 の仮の絵は、原画 D2_v1 の上の方（夕焼けの塔と空中電車、鳥居の端）だけを切り出したもの（assets/gen/D2_crop.jpg）。
D2_v1 は男の横顔と子どもたちの顔がはっきり映っているため、そのままは使わない。Veo の前に、男を後ろ姿にした原画を作り直す
（「男は後ろ姿、子どもたちは遠く小さく、顔は見せない」を指示に足す）。缶の音は、画面の外で鳴る音として入れてある。
