# episode.json の書き方

1 本分の設計図。`new-episode.mjs` が骨組みを作り、`gen-images.mjs`・`gen-clips.mjs`・`gen-music.mjs`・`gen-voice.mjs`・`render-town.mjs` が読む。パスはすべて episode.json のフォルダからの相対パス。

## 目次
1. 全体の例（標準の型 cinematic）
2. 項目の一覧
3. 場面（shots）
4. 音（audio）と時刻の書き方
5. 書体
6. 速さ・容量の目安とコツ

## 1. 全体の例

```json
{
  "id": "ep003",
  "title": "凪ヶ浦町の記憶",
  "format": { "width": 1920, "height": 1080, "fps": 24 },
  "look": { "grade": "cinema", "grain": 0.18, "vignette": 0.15, "flicker": 0, "glow": 0.1, "letterbox": 0, "blur": 0 },
  "text": { "font": "mincho", "position": "bl", "size": 0.034 },
  "defaults": { "dur": 6, "transition": "cut", "zoom": 0.05 },
  "imageStyle": "Cinematic still from a live-action Japanese film set in a fictional small town in the 1980s; …",
  "imageRefs": ["images/c01_01.png"],
  "clipStyle": "Subtle natural motion only, slow and calm; …",
  "chapters": [ { "no": 1, "theme": "町に入る", "season": "春", "time": "朝", "place": "無人駅", "shots": [1, 18] } ],
  "shots": [
    { "image": "images/c01_01.png", "prompt": "A small harbor town along a curved bay seen from a hillside road, early spring morning mist, wide shot", "dur": 8.5, "move": "in", "caption": "凪ヶ浦町\n1989年", "captionStart": 1.5 },
    { "image": "images/c01_02.png", "prompt": "…", "dur": 7, "move": "still", "transition": "cut" },
    { "image": "images/c01_03.png", "video": "clips/c01_03.mp4", "motion": "A few people walk slowly across the far end of the street; steam rises from a shop; the camera stays still", "dur": 6, "transition": "cut" },
    { "image": "images/c02_01.png", "prompt": "…", "dur": 9, "transition": "fade", "transitionDur": 1.2 },
    { "card": { "title": "凪ヶ浦町", "subtitle": "この町は実在しません" }, "dur": 5, "transition": "fadeblack", "transitionDur": 2 }
  ],
  "music": { "prompt": "Very soft ambient piano and acoustic guitar, sparse notes, calm and nostalgic, 60 BPM" },
  "audio": {
    "bgm": { "file": "audio/bgm.mp3", "gain": -16, "fadeIn": 8, "fadeOut": 10 },
    "ambience": [
      { "file": "audio/amb_room.wav", "gain": 4 },
      { "file": "audio/amb_birds.wav", "gain": 6, "from": "shot:1", "to": "shot:19" },
      { "file": "audio/amb_rain.wav", "gain": 6, "from": "shot:73", "to": "shot:91" }
    ],
    "voice": [],
    "sfx": [],
    "clipGain": -2,
    "duck": 0,
    "loudness": -14
  },
  "startFade": 2,
  "endFade": 4
}
```

## 2. 項目の一覧

| 項目 | 意味 | 既定 |
|---|---|---|
| `id` | ファイル名に使う（半角英数字） | ファイル名 |
| `format.width/height/fps` | 画面の大きさと fps（縦は 1080×1920） | 1920×1080・30 |
| `look.grade` | 色：`cinema`（映画調・標準）`none` `faded-warm` `faded-cool` `dusk` `summer` `night` `vhs` `mono` | `faded-warm` |
| `look.grain` | 粒子 0〜1（標準 0.18） | 0.25 |
| `look.vignette` | 周辺減光 0〜1 | 0.3 |
| `look.flicker` | 明るさのゆらぎ 0〜1（標準 0：使わない） | 0.15 |
| `look.glow` | 明るい所のにじみ 0〜1（明るさだけにかかる） | 0 |
| `look.letterbox` | 黒帯の画面比（例 2.35）。0 でなし | 0 |
| `look.blur` | わずかなぼけ 0〜1 | 0 |
| `text.*` | テロップ：`font`（mincho／gothic／書体ファイル）、`size`（画面の高さに対する比）、`position`（bl bc br tl tc tr c）、`fade`、`shadow`、`box`（下敷きの濃さ） | 明朝・0.042・bl |
| `stamp` | 日付スタンプ（標準の型では使わない） | なし |
| `defaults` | 場面の既定（`dur` `move` `zoom` `transition` `transitionDur` `fit`） | 7・auto・0.1・fade・1.5 |
| `imageStyle` `imageRefs` `imageModel` `imageAspect` `imageSize` | 画像の生成（gen-images.mjs） | Nano Banana 2・16:9・2K |
| `clipStyle` `clipModel` `clipSeconds` `clipResolution` | AI 動画の生成（gen-clips.mjs） | veo-3.1-fast-generate-preview・6 秒・720p |
| `chapters` | 章の一覧（覚え書き。書き出しには使わない） | — |
| `music` | BGM の生成（`prompt` `model`） | lyria-3.5 |
| `narration` | 語りの生成（語りを入れる回だけ） | — |
| `audio` | 4 章 | — |
| `startFade` `endFade` | 最初と最後の黒からのフェード（秒） | 0.8・2 |

## 3. 場面（shots）

どの場面も `dur`（秒）を持つ。前の場面とのつなぎは、後ろの場面の `transition` と `transitionDur` で決める。

- **画像**：`image`（保存先）、`prompt`（生成の指示）、`move`、`zoom`、`focus`、`fit`
  - `move`：`in`（寄る）`out`（引く）`left` `right`（横に流す）`up` `down`（縦に流す）`still`（ほぼ止める）`hold`（完全に止める）`auto`
  - `zoom`：動きの量（標準 0.05。0.1 を超えると速く見える）
  - `focus`：寄る中心 [横, 縦]（0〜1）
  - `fit`：`cover`（切り抜く）／`contain-blur`（全体を見せ、余白はぼかした同じ画像）
- **AI 動画**：`video`（保存先）、`motion`（動きの指示）、`from`（元の動画の何秒目から）、`speed`、`audio`（false で動画の音を使わない）、`audioGain`（dB）
  - `image` と `video` を両方書いておくと、動画ができるまでは画像で、できたら動画で書き出す
- **文字だけの場面**：`card: { title, subtitle, bg, color, font, size }`
- **テロップ**：`caption`（改行は `\n`）、`captionStart` `captionEnd`（**場面の頭**からの秒）、`captionPos`、`captionSize`、`captionFont`。省くと、つなぎが終わってから出て、次のつなぎの前に消える
- **つなぎ** `transition`：`cut`（ふつうのカット）`fade`（ディゾルブ）`fadeblack`（黒へ）`fadewhite`（白へ）`fadegrays`（色が抜けながら）`blur`（にじみながら）`slideleft` `slideright` `circle`。長さは場面の 45% までに自動で縮む

## 4. 音（audio）と時刻の書き方

- `bgm`：`file` `gain`（dB）`fadeIn` `fadeOut` `start` `loop`（既定 true）
- `ambience[]`：`file` `gain` `from` `to` `fadeIn` `fadeOut` `loop`。`from/to` を省くと全編
- `voice[]`：`file` `at` `gain` `text`（.srt にも使う）`speak` `style`
- `sfx[]`：`file` `at` `gain`（一度だけ鳴らす音）
- `clipGain`：AI 動画の音の大きさ（dB。場面ごとの `audioGain` が優先）
- `duck`：声の間だけ、ほかの音（動画の音・環境音・BGM）を下げる量（dB。語りが無ければ 0）
- `loudness`：最後にそろえる大きさ（LUFS。標準 -14）

**場面の頭**＝前の場面とのつなぎの真ん中。テロップの `captionStart/End` も、音の `"shot:N"` も、ここを基準にする。

**時刻**は次のどれか。読めない書き方は書き出しの前にエラーで止まる：
- 秒の数字：`41.5`
- 分:秒：`"1:30"`、`"1:02:03"`
- 場面から：`"shot:12"`、`"shot:12+0.8"`、`"shot:12-1"`（12 番目の場面の頭から ±秒）

## 5. 書体

明朝・ゴシック・等幅を、Windows の Fonts → Linux の IPA／Noto → macOS のヒラギノの順に自動で探す。見つからないとき：
- Linux（クラウド）：`apt-get install -y fonts-ipafont-mincho fonts-ipafont-gothic`
- 好きな書体：エピソードのフォルダに `fonts/` を作って .ttf／.otf を置き、`"font": "fonts/〇〇.otf"`。ライセンスがはっきりした無料の書体（Noto Serif JP、Zen Old Mincho、Shippori Mincho など）を使う

## 6. 速さ・容量の目安とコツ

- 1080p の本番は動画の長さの 3〜4 倍の時間がかかる（20 分の回で 1 時間強）。確認は `--draft`（約 4 倍速い）。`--sheet 48` で確認用のコマを増やせる
- 途中のファイルは 16 場面ずつまとめてつなぎ、使い終わったものから消す。それでも 20 分の回は一時的に数 GB 使う
- 画像は出力の 3 倍に広げてから動かすので、元の画像は 1920px 以上（2K 推奨）
- 同じ `move`・同じ距離を続けない。各章の最初は遠景で場所を見せる
- AI 動画は各章 2〜3 本が目安（費用と、静止画との見分けがつかないくらいの自然さのバランス）
