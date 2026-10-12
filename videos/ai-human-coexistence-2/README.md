# AIと人間の共存　第二章「砂の向こうから来た男」

2026年の夕暮れに砂丘を越えた男が、2080年の、昭和のままの島で過ごす日曜日（7分51秒・31カット。頭の16秒は冒頭のつかみ）。
台本は `../ai-human-coexistence/docs/chapter2_script.md`（第8版：制作で決めたことは文書のいちばん下）、
概要欄・タイトル・サムネイルは `../ai-human-coexistence/docs/youtube_ch2.txt` と `../ai-human-coexistence/thumbnails/ch2_*.jpg`。
作り方の全体は、スキル `.claude/skills/nostalgic-town-film` のとおり。

- 投稿キット（非公開）：https://claude.ai/artifact/MwTV3wKkDXAHpeEJxLpw29#ep2 （元の画質の MP4 の保存、試写、タイトル・概要欄・タグ・サムネイル・台本）
- 高画質の上映ページ（非公開、前の版 7分37秒）：https://claude.ai/artifact/DpVabfvR6hJwZpkkhGouWc
- 完成版：テーマ曲入り -14.0 LUFS（トゥルーピーク -1.9 dBTP）、環境音のみ -16.0 LUFS（-1.2 dBTP）、7分51秒・1080p／30fps
- 費用の目安：原画 44枚 約 $5.9、Veo Lite 1080p 28本 約 $17.9（合計 約 $24）

## この章で足した道具

| 道具 | すること |
|---|---|
| `scripts/bake_ink.py <ID>` | 画面の中の紙・カード・ページ・柱・板に書いてある文字を、クリップに焼き込む（手やめくれたページの下に隠れる、影もかかる）。`memory: true` のカットは昭和の色（色あせ・粒子・周辺減光）もかける。元のスロー映像は `work/raw/` に残る |
| `scripts/track_plane.py <ID>@<名前> 四隅` | 紙やカードの四隅を全コマで追いかける（射影変換）。`--start` の秒で測った四隅から、前へも後ろへも追う |
| `scripts/plane_check.py` | 追いかけた四隅を6コマに描いて確かめる |
| `scripts/recolor_region.py` | 原画の一部の色だけを塗り替える（実在のチェーンに似た看板の色を、この町の色に） |
| `scripts/sync_cliplen.py` | スロー映像の実際の長さを timeline.json の `clip` に書く（頭や後ろを切ったカット） |
| `scripts/slowmo.sh <ID> <元> [頭を切る秒] [倍率] [使う長さ]` | Veo の崩れた所を切ってからスローにする |
| `src/fx/Voice.tsx` | 話すだけで書ける空中のタブレット（声の波形、行番号、一文字ずつ刻まれる手順） |
| `src/fx/Ink.tsx` | 画面の中の板に文字を貼る（Remotion 側。焼き込みにしないとき） |
| `audio/src/sounds.py` の後半 | スマホの通知、舞う砂、サイフォン、カップ、空中電車、タブレットの文字の音、遠い声、空き缶、遠くで遊ぶ子どもの声、紙にはんこ |

## 作り直しが要るもの

- B1（喫茶店）と D2（境内の缶蹴り）は、2026年10月12日に Veo で作り直した（いきさつは台本の「残高の補充後の作り直し」）。Veo が「他社のコンテンツ」で弾いた原因は、看板ではなく窓の外のコンビニの店構えだった
- 終わりのあいさつは第一章と同じ声と言葉（「つぎまちの一日に、…」）。「日曜日に」の版にするなら、補充後に `scripts/tts_outro.py` で作り直す

## 書き出し

```bash
node scripts/render_shots.mjs                      # カットごと（済んだものは飛ばす）
python3 -I scripts/qa_faces.py                     # 全カットの点検：顔・実在のブランドに似た物（挙がったコマは目で確かめる）
python3 audio/src/build_mix.py && python3 -I audio/src/suno_theme.py && python3 audio/src/build_theme.py   # 曲は作者の Suno の曲（compose.py は使わない）
python3 -I scripts/assemble.py --crf 21 --maxrate 10M --preset medium --preview
```

画像・Veo の元動画・フォント（Hachi Maru Pop／Yomogi／Klee One の部分集合、SIL OFL 1.1、`assets/fonts_hand/OFL.txt`）はリポジトリに保存。スロー映像・書き出しは保存しない（作り直せる）。
