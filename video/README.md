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
npm run render:all                              # scripts/ の台本をすべて書き出す（16:9版つき）
node render-all.mjs keiba                       # ファイル名に keiba を含む台本だけ
```

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `--script <path>` | `scripts/weight-trend.json` | 台本JSON |
| `--out <path>` | `out/<id>.mp4` | 出力MP4。同名で `.srt`（字幕）も書き出す |
| `--preview <秒,秒,…>` | — | 全フレームを描かず、指定秒のPNGだけ `out/preview/` に出す |
| `--fps <n>` | 台本の `fps`（30） | フレームレート |
| `--quality <1-100>` | 96 | 中間フレーム（JPEG）の品質 |
| `--landscape` | 台本に `landscape` があれば自動ON | 16:9（1920x1080）版も併せて書き出す |
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
| `intro` | チャンネル名・タイトル・バッジで掴む | `badges[]` / `kicker` / `title` / `sub` |
| `horse` | 馬番と馬名を大きく提示（競馬用） | `mark` / `number` / `name` / `meta` |
| `reason` | 理由を1つずつ。下部に①②③の進捗 | `index` / `headline` / `detail` / `step` / `total` |

`punch` は `sub` を足すと、言い切りの下に補足行が出る。

文字列中の `\n` は改行になる。全シーン共通で `dur` と `caption` を持つ。

## テーマ（配色）

台本の `theme` が `:root` のCSS変数を上書きする。指定しなければ既定（ダーク＋ミント）になる。

```json
"theme": {
  "bg": "#0a1310", "ink": "#f8f5ec", "muted": "#9fb0a4",
  "accent": "#2fbf6a", "gold": "#f7c948", "mark": "#e5384f",
  "on-accent": "#05140c", "grad1": "#12331f", "grad2": "#2b2410",
  "glow1": "rgba(47,191,106,0.17)", "glow2": "rgba(247,201,72,0.13)", "sub": "#b9c6bd"
}
```

`accent` が主役の色（強調・マーカー・グラフの平均線）、`gold` が数値やバッジ、`mark` が◎などの札。
派生色は `color-mix()` で自動的に作られるので、上の6色だけ変えれば全体の印象が変わる。

## 16:9（通常のYouTube動画）

台本に `landscape` を書くか `--landscape` を付けると、縦型に加えて `<出力名>-16x9.mp4` も書き出す。
縦型の映像を中央に置き、背景は同じ映像をぼかしたもの、左右にはチャンネル名や本命馬を出す。

```json
"landscape": {
  "left": ["たろうまる競馬", "オーシャンステークス 予想", "2026年 回収率79% の“逆神”"],
  "right": ["◎ 15", "フリッカージャブ", "#オーシャンS #競馬予想"]
}
```

各配列の1行目が大きく、2行目以降が小さく表示される。

## 設計メモ

- **決定論的レンダリング**: CSSアニメーションは使わず、`window.__render(t)` が秒数 `t` から
  全要素の状態を計算する。これによりフレーム落ちや timing のばらつきが原理的に発生しない。
- **フォント**: `@fontsource/noto-sans-jp` の woff2 を data URI として HTML に埋め込むため、
  レンダリング時にネットワークへ出ない。未インストール時はシステムのゴシック体にフォールバックする。
- **BGM**: 素材ファイルを持たず、ffmpeg が静かなパッド音を合成する（ピーク約 -19dB）。
  自前のBGMを使う場合は `--no-audio` で書き出してから差し替える。
- **安全余白**: 各SNSのUIが重なる下部を避け、字幕バーは下端から292pxの位置に置いている。

## 出力物

| 台本 | 出力 | 尺 | 用途 |
| --- | --- | --- | --- |
| `scripts/keiba-ocean-s.json` | `out/keiba-ocean-s.mp4` | 38.0秒 | YouTube Shorts / TikTok / Reels |
| 〃 | `out/keiba-ocean-s-16x9.mp4` | 38.0秒 | 通常のYouTube動画 |
| `scripts/weight-trend.json` | `out/weight-trend.mp4` | 49.5秒 | 健康管理アプリのショート |
| 〃 | `out/weight-trend-16x9.mp4` | 49.5秒 | 同・横型 |

`.srt` は各MP4と同名で出力される。YouTubeの字幕としてそのままアップロードできるほか、
ナレーションを後から録る場合の読み上げ原稿にもなる。
投稿用のタイトル・概要欄・タグは `scripts/<id>.youtube.md` にまとめてある。

## 公開ページ

`page/taromaru-ocean-s.html` は、書き出した動画・シーン割り・YouTube投稿セット（タイトル／概要欄／タグ／
固定コメント）を1枚にまとめた配布用ページ。Artifactとして公開済みで、動画は添付アセットとして配信している。
別のレースで作り直すときは、このHTMLの `ASSETS` と本文を差し替えて再公開する。

## 内容についての注意

- 健康テーマ: 一般的な事実の整理にとどめ、診断・断定的な評価は行わない。
  最後に受診を促す注意書きを入れている（リポジトリ本体の医療安全ルールに合わせている）。
- 競馬テーマ: 予想は台本に書かれた内容をそのまま映像化するだけで、レース結果の予測も
  データの自動生成も行わない。締めに「馬券の購入は自己責任」「20歳未満は購入不可」の
  注意書きを入れている。
