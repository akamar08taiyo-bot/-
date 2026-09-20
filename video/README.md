# ショート動画ジェネレーター（縦型 1080x1920）

台本（JSON）から、SNS向けの縦型ショート動画（MP4 / H.264 / 30fps / 1080x1920）を書き出す。
映像は HTML+CSS+SVG をヘッドレス Chromium で1フレームずつ描画し、ffmpeg で連結する。
外部の動画編集ソフトも素材ファイルも不要で、台本を書き換えるだけで別テーマの動画を量産できる。

## 使い方

```
cd video
npm install
npm run render                                  # out/weight-trend.mp4 と .srt を書き出し
node render.mjs --preview 0,12,26               # 指定秒の静止画だけ確認（数秒で終わる）
node render.mjs --script scripts/foo.json --out out/foo.mp4
node render.mjs --no-audio                      # BGMなし（自前の音源を後から載せる場合）
```

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `--script <path>` | `scripts/weight-trend.json` | 台本JSON |
| `--out <path>` | `out/<id>.mp4` | 出力MP4。同名で `.srt`（字幕）も書き出す |
| `--preview <秒,秒,…>` | — | 全フレームを描かず、指定秒のPNGだけ `out/preview/` に出す |
| `--fps <n>` | 台本の `fps`（30） | フレームレート |
| `--quality <1-100>` | 96 | 中間フレーム（JPEG）の品質 |
| `--no-audio` | — | BGMを付けない |
| `--keep-frames` | — | 中間フレームを `out/.work/` に残す |

1080x1920を約1500フレーム描くため、フル書き出しは5〜8分かかる。
構図や文言の調整中は `--preview` を使うのが速い。

## 台本JSON

`scenes` を上から順に再生する。各シーンの `dur`（秒）の合計が動画の長さになる。
`caption` は画面下部の字幕バーに焼き込まれ、同じ文面が `.srt` にも出力される
（ナレーションを後から録る場合は、この `.srt` が読み上げ原稿になる）。

対応しているシーンタイプ:

| type | 用途 | 主なフィールド |
| --- | --- | --- |
| `hook` | 冒頭3秒の掴み。数値がカウントアップする | `kicker` / `line` / `big` / `unit` / `sub` |
| `punch` | 一文で言い切る。`**…**` で囲むとマーカー風に強調される | `text` |
| `fact` | 見出し＋根拠のチップを順に出す | `headline` / `chips[]` |
| `number` | 大きな数字のカウントアップ | `value` / `unit` / `label` / `footnote` |
| `chart` | 日々の実測値（ギザギザ）に7日平均（なめらか）を重ねて描画 | `headline` / `legendA` / `legendB` / `note` |
| `steps` | 手順カードを左から順に差し込む | `headline` / `steps[]` |
| `cta` | 締めの一文と注意書き | `text` / `sub` / `footnote` |

文字列中の `\n` は改行になる。全シーン共通で `dur` と `caption` を持つ。

## 設計メモ

- **決定論的レンダリング**: CSSアニメーションは使わず、`window.__render(t)` が秒数 `t` から
  全要素の状態を計算する。これによりフレーム落ちや timing のばらつきが原理的に発生しない。
- **フォント**: `@fontsource/noto-sans-jp` の woff2 を data URI として HTML に埋め込むため、
  レンダリング時にネットワークへ出ない。未インストール時はシステムのゴシック体にフォールバックする。
- **BGM**: 素材ファイルを持たず、ffmpeg が静かなパッド音を合成する（ピーク約 -19dB）。
  自前のBGMを使う場合は `--no-audio` で書き出してから差し替える。
- **安全余白**: 各SNSのUIが重なる下部を避け、字幕バーは下端から292pxの位置に置いている。

## 出力物

- `out/weight-trend.mp4` — 本編（49.5秒）
- `out/weight-trend.srt` — 字幕／ナレーション原稿

## 内容についての注意

健康に関する一般的な事実の整理にとどめ、診断・断定的な評価は行わない。
体重の増減について「太った」等の評価語を使わず、最後に受診を促す注意書きを入れている
（リポジトリ本体の医療安全ルールに合わせている）。
