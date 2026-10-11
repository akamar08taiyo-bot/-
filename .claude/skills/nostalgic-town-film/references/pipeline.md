# 工程ごとのコマンドと所要時間

作業フォルダ（ひな形を複製したもの）の中で実行する。時間は 4コア・16GB の環境での実測。

## 0. 準備

```bash
bash <スキル>/scripts/new_project.sh <作業フォルダ> [slug]   # 例: videos/ai-human-coexistence-2 ai_human_coexistence_2
cd <作業フォルダ>
```

new_project.sh がすること：ひな形の複製（中身のあるフォルダには作らない）、timeline.json の slug の設定、フォントをシステムに入れる（fc-cache）、`npm ci`（版を固定）、道具の確認（Python の numpy scipy soundfile pyloudnorm opencv pretty_midi pillow、ffmpeg の rubberband・minterpolate・xfade・libx264、fluidsynth と FluidR3_GM、書き出し用ブラウザ、Gemini の鍵）。足りないものは最後に一覧で出る。

ひな形の `src/timeline.json` と `site/screening.html` は「AIと人間の共存 第一章」の実例のまま入っている。形を真似て書き換える。`audio/src/crowd/`（遠いざわめきの声の素材、TTS）と `audio/src/e2_taiko.wav`（遠い祭り太鼓の素材）はそのまま使える。終わりのあいさつ（`audio/src/outro/`）は作品ごとに `scripts/tts_outro.py` で作る。

## 1〜2. 分析とテーマ

references/reference-analysis.md。文書は `docs/` に置く。

## 3. 原画

```bash
python3 -I scripts/gen_image.py N01 --refs assets/gen/<参照1>.jpg,assets/gen/<参照2>.jpg   # 1枚 25〜30秒、4並列でよい
python3 -I scripts/edit_image.py ...                                                         # 部分修正
```

並べて見るときは opencv で縮小して1枚にまとめ、Read で見る。

## 4. Veo

```bash
python3 -I scripts/veo_batch.py P0 A1 A2 ...   # 1本 70〜110秒、4並列。結果は assets/veo/<ID>_v1.mp4
```

全カットを `clip_sheet.py`（または opencv で 0／1/3／2/3／最後のコマ）で確認。

## 5. 半速スロー

```bash
# work/slowjobs.txt に「ID 元動画」を1行ずつ
cat work/slowjobs.txt | xargs -P 4 -L 1 scripts/slowmo.sh   # 1本 7〜10分（4並列で 22本 約50分）
ffmpeg -i public/clips/F0.mp4 -vf reverse -c:v libx264 -crf 15 -pix_fmt yuv420p public/clips/F0_rev.mp4   # hold: reverse のカット
```

slowmo.sh：`minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=2.0*PTS` → 30fps、CRF 15。最初と最後のコマ（`<ID>_first.jpg`、`<ID>_last.jpg`）と、半速の音（`work/veoaudio/<ID>.wav`）も作る。

## 6. 合成の確認

```bash
python3 -I scripts/track.py A1 B2 B3 ...                         # 電子版のあるカット。1本 20〜40秒
python3 -I scripts/track_check.py A1 0.24 0.15 0.19 work/t.jpg   # 貼りつき具合
node scripts/stills.mjs A1:4,10 B3:6 F0:24                       # 静止画 → work/stills/
```

## 8. 書き出し

```bash
node scripts/render_shots.mjs                    # 全カット。1カット（16秒）2〜3分。済んだカットは飛ばす
node scripts/render_shots.mjs G1 --force         # 直したカットだけ
python3 -I scripts/assemble.py --crf 21 --maxrate 10M --preset medium --preview
```

- render_shots は 1カットにつき3回までやり直す。ブラウザは `/opt/pw-browsers/chromium_headless_shell-1194` を使う（renderMedia にも同じものを渡し、Remotion が別の Chrome を落としに行かないようにしてある）
- assemble.py：26本を xfade でつなぎ、最初と最後を 2.5 秒フェード、`vignette=angle=0.36`・黒の持ち上げ・`noise=c0s=9` の質感をかけ、2つの音を重ねる。7分の作品で約25分（＋720p 版2本で約8分）
- 全体を1回で書き出す方式は、途中で1つのタブが止まると全部やり直しになるので使わない（カットごとにする）
- 出力の名前は timeline.json の `"slug"`（例 `"ai_human_coexistence"`）で決まる：`out/<slug>_theme.mp4`・`out/<slug>_asmr.mp4`。下の点検のコマンドは、最初の行で slug を読み取る

## 9. 点検

```bash
SLUG=$(python3 -c "import json;print(json.load(open('src/timeline.json')).get('slug','film'))")
python3 -I scripts/qa_final.py out/${SLUG}_theme.mp4 work/qa_final   # 形式、黒コマ・止まったコマ、8秒ごとの一覧画像
for v in theme asmr; do ffmpeg -nostats -i out/${SLUG}_$v.mp4 -vn -af ebur128=peak=true -f null - 2>&1 | grep -A20 Summary | grep -E "I:|Peak:"; done
python3 -I scripts/review_video.py out/${SLUG}_theme.mp4 work/review.json   # Gemini に参照動画と並べて試写してもらう（任意）
```

一覧画像は全部見る（クロスフェードの途中の二重写しは正常）。黒コマは最後のフェードだけが正常。

## ディスク

- `public/clips`（スロー）約1.2GB、`out/`（カット・完成・軽量版）約3GB、`assets/veo` 約400MB（7分の作品）
- Remotion のバンドルは `work/bundle` に1つだけ。古い `/tmp/remotion-webpack-bundle-*` があれば消す
