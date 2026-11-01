# 睡眠MV（縦型リリックビデオ）

Remotion（React）でコマごとに描くリリックMV。1080×1920・30fps。
歌詞はフレーズ単位で歌声に同期し、ドラム（キック・スネア）に合わせて画面が脈打つ。

## 構成
| ファイル | 役割 |
|---|---|
| `src/data/lyrics.json` | 歌詞（セクション → 行 → フレーズ。全角スペースで区切る） |
| `src/data/timing.json` | 音源から作るタイミング（フレーズ開始・ビート・キック/スネア・カット位置） |
| `src/data/meta.ts` | 行ごとの強調語とイラスト（モチーフ）の割り当て、配色 |
| `src/components/Lyrics.tsx` | 歌詞のキネティックタイポ（文字の飛び込み＋歌唱に沿った塗り） |
| `src/components/Motifs.tsx` | 行ごとのイラスト 22 種（帳簿・株価・ベンチ・サングラス・月・REC など） |
| `src/components/Stage.tsx` | 背景、配信風HUD（LIVE・経過時間・睡眠残高ゲージ）、まばたき遷移、カット、パンチライン |
| `song/` | Lyria 3.5 で生成した仮の楽曲とプロンプト |

## 音源を差し替えるとき
1. 音源を `public/song.mp3` に置く（同じ名前で上書き）。
2. `npm run align` — Gemini で歌詞の位置を推定（全体 → 8秒ずつの細かい確認）。
3. `npm run timing` — 息継ぎの位置・ビート・ドラムを解析して `src/data/timing.json` を作る（`work/timing_check.png` で確認できる）。
4. `npm run stills` — `work/stills/sheet-*.png` で見た目を確認。
5. `npm run render` → `out/mv-suimin.mp4`、`npm run srt` → `out/mv-suimin.srt`。

歌詞を変えるときは `src/data/lyrics.json` と `src/data/meta.ts` を直してから 2 から進める。
Remotion は個人・従業員3人以下の会社なら無料。それ以上の会社が業務で使う場合は会社向けライセンスが必要。
