# episode.json の書き方

1 本分の設計図。`new-episode.mjs` が骨組みを作り、`gen-images.mjs`・`gen-voice.mjs`・`gen-music.mjs`・`render-town.mjs` が読む。パスはすべて episode.json のフォルダからの相対パス。

## 目次
1. 全体の例
2. 項目の一覧
3. 場面（shots）
4. 音（audio）と時刻の書き方
5. 書体
6. 速さの目安とコツ

## 1. 全体の例

```json
{
  "id": "ep003",
  "title": "凪ヶ浦町の記憶",
  "format": { "width": 1920, "height": 1080, "fps": 30 },
  "look": { "grade": "dusk", "grain": 0.28, "vignette": 0.35, "flicker": 0.15, "glow": 0.2, "letterbox": 0, "blur": 0 },
  "text": { "font": "mincho", "color": "#F3EEE6", "size": 0.04, "position": "bl", "fade": 0.8, "shadow": 0.6, "box": 0 },
  "stamp": { "text": "'89  8 14", "font": "mono", "position": "br" },
  "defaults": { "dur": 7, "transitionDur": 1.6, "zoom": 0.1 },
  "imageStyle": "Japanese small-town scenery as a 35mm film photograph taken in the 1980s; soft natural light, slightly faded colors…",
  "imageRefs": ["images/001.png"],
  "shots": [
    { "card": { "title": "凪ヶ浦町", "subtitle": "存在しない街の記憶 #003" }, "dur": 5, "transition": "fadeblack" },
    { "image": "images/001.png", "prompt": "A small harbor town seen from a hillside road at dusk…", "dur": 8, "move": "in", "caption": "一九八九年　夏の終わり" },
    { "image": "images/002.png", "prompt": "…", "move": "right", "focus": [0.3, 0.6] },
    { "video": "clips/004.mp4", "from": 1.0, "dur": 5, "speed": 0.8 },
    { "card": { "title": "凪ヶ浦町", "subtitle": "この町は実在しません" }, "dur": 5, "transition": "fadeblack" }
  ],
  "narration": { "voice": "Achernar", "style": "静かに、思い出をたどるように、少しゆっくり読んでください" },
  "music": { "prompt": "Slow nostalgic instrumental… 70 BPM", "model": "lyria-3.5" },
  "audio": {
    "bgm": { "file": "audio/bgm.mp3", "gain": -8, "fadeIn": 3, "fadeOut": 6, "loop": true },
    "ambience": [
      { "file": "audio/amb_waves.wav", "gain": 4 },
      { "file": "audio/amb_crossing.wav", "gain": 2, "from": "shot:12", "to": "shot:14" }
    ],
    "voice": [
      { "file": "voice/v01.wav", "at": "shot:2+0.8", "text": "あの夏、坂の上から港の灯りを数えた。", "speak": "あの夏、さかのうえから、みなとのあかりをかぞえた。" }
    ],
    "sfx": [ { "file": "audio/bell.wav", "at": 41.5, "gain": -6 } ],
    "duck": 8,
    "loudness": -14
  },
  "startFade": 0.8,
  "endFade": 3
}
```

## 2. 項目の一覧

| 項目 | 意味 | 既定 |
|---|---|---|
| `id` | ファイル名に使う（半角英数字） | ファイル名 |
| `format.width/height/fps` | 画面の大きさと fps（縦は 1080×1920） | 1920×1080・30 |
| `look.grade` | 色：`none` `faded-warm` `faded-cool` `dusk` `summer` `night` `vhs` `mono` | `faded-warm` |
| `look.grain` | 粒子の強さ 0〜1（0.2〜0.35 が目安） | 0.25 |
| `look.vignette` | 周辺減光 0〜1 | 0.3 |
| `look.flicker` | 明るさのゆらぎ 0〜1（フィルムっぽさ。0.3 を超えると目立つ） | 0.15 |
| `look.glow` | 明るい所のにじみ 0〜1（夏・夕方に合う） | 0 |
| `look.letterbox` | 黒帯の画面比（例 2.0、2.35）。0 でなし | 0 |
| `look.blur` | わずかなぼけ 0〜1 | 0 |
| `text.*` | テロップ：`font`（mincho／gothic／書体ファイル）、`size`（画面の高さに対する比）、`position`（bl bc br tl tc tr c）、`fade`（秒）、`shadow`（0〜1）、`box`（文字の下敷きの濃さ 0〜1） | 明朝・0.042・bl |
| `stamp` | 日付スタンプ（`text` `font` `position` `color` `size` `opacity`）。タイトルカードには出ない。場面に `"stamp": false` で消せる | なし |
| `defaults` | 場面の既定（`dur` `move` `zoom` `transition` `transitionDur` `fit`） | 7 秒・auto・0.1・fade・1.5 |
| `imageStyle` `imageRefs` `imageModel` `imageAspect` `imageSize` | 画像の生成（gen-images.mjs） | Nano Banana 2・16:9・2K |
| `narration` | 語りの生成（`voice` `style` `model` `language`） | Achernar・gemini-3.8-flash-tts・ja-JP |
| `music` | BGM の生成（`prompt` `model`） | lyria-3.5 |
| `audio` | 4 章 | — |
| `startFade` `endFade` | 最初と最後の黒からのフェード（秒） | 0.8・2 |

## 3. 場面（shots）

どの場面も `dur`（秒）を持つ。次の場面との重なり（つなぎ）は、後ろの場面の `transition` と `transitionDur` で決める。

- **画像**：`image`（保存先）、`prompt`（生成の指示）、`move`、`zoom`、`focus`、`fit`
  - `move`：`in`（寄る）`out`（引く）`left` `right`（横に流す）`up` `down`（縦に流す）`still`（ほぼ止める）`hold`（完全に止める）`auto`（順番に変える）
  - `zoom`：動きの量（0.08〜0.15。大きいほど速く見える）
  - `focus`：寄る中心 [横, 縦]（0〜1。[0.3, 0.6] なら左下寄り）
  - `fit`：`cover`（画面いっぱいに切り抜く）／`contain-blur`（全体を見せ、余白はぼかした同じ画像）
- **動画**：`video`、`from`（元の動画の何秒目から）、`speed`（0.8 ならゆっくり）
- **文字だけの場面**：`card: { title, subtitle, bg, color, font, size }`
- **テロップ**：`caption`（改行は `\n`）、`captionStart` `captionEnd`（場面の頭からの秒）、`captionPos`、`captionSize`、`captionFont`
- **つなぎ** `transition`：`fade`（ディゾルブ）`fadeblack`（黒へ）`fadewhite`（白へ）`fadegrays`（色が抜けながら）`blur`（にじみながら）`slideleft` `slideright` `circle` `cut`（1 コマで切り替え）。長さは場面の 45% までに自動で縮む

## 4. 音（audio）と時刻の書き方

- `bgm`：`file` `gain`（dB）`fadeIn` `fadeOut` `start`（秒）`loop`（短い曲をくり返す。既定 true）
- `ambience[]`：`file` `gain` `from` `to` `fadeIn` `fadeOut` `loop`。`from/to` を省くと全編
- `voice[]`：`file` `at` `gain` `text`（字幕 .srt にも使う）`speak`（読み上げ用）`style`（その行の読み方）
- `sfx[]`：`file` `at` `gain`（一度だけ鳴らす音）
- `duck`：声の間だけ BGM と環境音を下げる量（dB。0 で下げない）
- `loudness`：最後にそろえる大きさ（LUFS。long／short は -14、ambient は -16〜-18）

**時刻**は秒の数字か `"shot:N+秒"`（N 番目の場面の頭から。つなぎの途中を頭とする）。場面の長さを変えても声や音がずれない。声どうしは 1.5 秒以上あける。

## 5. 書体

明朝・ゴシック・等幅を、Windows の Fonts → Linux の IPA／Noto → macOS のヒラギノの順に自動で探す。見つからないとき：
- Linux（クラウド）：`apt-get install -y fonts-ipafont-mincho fonts-ipafont-gothic`
- 好きな書体を使う：エピソードのフォルダに `fonts/` を作って .ttf／.otf を置き、`"font": "fonts/〇〇.otf"`。ライセンスがはっきりした無料の書体（Google Fonts の Noto Serif JP、Zen Old Mincho、Shippori Mincho など）を使う

## 6. 速さの目安とコツ

- 1080p の本番は動画の長さの約 4 倍の時間がかかる（5 分の回で 20 分前後）。確認は `--draft`（半分の解像度で約 4 倍速い）
- 画像は出力の 3 倍に広げてから動かすので、元の画像は 1920px 以上あると細部がきれい（2K 推奨）
- 同じ `move` を続けない。寄る→流す→引く…と変え、静かな場面に `still` を混ぜる
- テロップは 4〜5 場面に 1 回くらい。表示は 3 秒以上。画面の明るい所に重なるなら `text.box` を 0.25〜0.35 に
- 黒・白へのつなぎは区切り（章の変わり目）だけに使うと効く
