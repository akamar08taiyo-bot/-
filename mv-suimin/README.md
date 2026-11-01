# 睡眠MV（縦型リリックビデオ）

Remotion（React）でコマごとに描くリリックMV。1080×1920・30fps・約1分46秒。
歌詞はフレーズ単位で歌声に同期し、ドラム（キック・スネア）に合わせて画面が脈打つ。

## 流れ
| 時間 | 場面 |
|---|---|
| 0:00–0:01 | 「LIVE」が点灯して配信開始 |
| 0:01–0:32 | VERSE 1：帳簿・株価・ベンチ・懸垂・サングラスなど行ごとのイラスト。睡眠残高ゲージが減っていく |
| 0:32–0:49 | HOOK：夜空に切り替わり、月・目・再生/停止ボタン・鏡。ゲージが回復 |
| 0:49–1:21 | VERSE 2：コラボ・請求書・「13」・無我→無理・REC・足元・返信/返済。最後は幕とまぶたが閉じる |
| 1:21–1:32 | FINAL HOOK：「投資先＝自分」、配信画面の顔 |
| 1:32–1:38 | パンチライン「自分と見つめ合うのは／いつだ」。鏡合わせの二人と反射する文字 |
| 1:38 | 楽器が止まるのと同時に暗転 |
| 1:38–1:46 | ピアノの終わり：OFFLINE／配信終了、月と閉じた目、睡眠残高 FULL |

## 構成
| ファイル | 役割 |
|---|---|
| `src/data/lyrics.json` | 歌詞（セクション → 行 → フレーズ。全角スペースで区切る） |
| `src/data/timing.json` | 音源から作るタイミング（フレーズ開始・ビート・キック/スネア・暗転位置） |
| `src/data/meta.ts` | 行ごとの強調語とイラスト（モチーフ）の割り当て、配色 |
| `src/components/Lyrics.tsx` | 歌詞のキネティックタイポ（文字の飛び込み＋歌唱に沿った塗り） |
| `src/components/Motifs.tsx` | 行ごとのイラスト 22 種 |
| `src/components/Stage.tsx` | 背景、配信風HUD、まばたき遷移、イントロ、パンチライン、アウトロ |
| `song/lyrics_timing.srt` | 音源ファイルに埋め込まれていた歌詞の行タイミング |
| `scripts/` | タイミング作成・静止画チェック・字幕書き出し |

## 作り直すとき
音源は git に入れていない。手元の曲を WAV にして `public/song.wav` に置く：
```
ffmpeg -i 曲.m4a -map 0:a:0 -ar 48000 -c:a pcm_s16le public/song.wav
npm install
npm run timing   # 行タイミング(SRT) → フレーズ位置を息継ぎに合わせる → src/data/timing.json（work/timing_check.png で確認）
npm run stills   # work/stills/sheet-*.png で見た目を確認
npm run render   # out/mv-suimin.mp4（REMOTION_BROWSER で Chrome の場所を指定できる）
npm run srt      # out/mv-suimin.srt
```
行タイミングの SRT がない曲は `npm run timing:gemini`（Gemini API で歌詞位置を推定）を使う。

Remotion は個人・従業員3人以下の会社なら無料。それ以上の会社が業務で使う場合は会社向けライセンスが必要。
