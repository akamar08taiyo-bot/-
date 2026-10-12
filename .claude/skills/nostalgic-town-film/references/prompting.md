# 原画・Veo・音声の指示文

## 原画（Gemini 画像、`gemini-3-pro-image`、16:9・2K）

`assets/gen/prompts.json` は `{"common": "...", "scenes": [{"id", "time", "title", "prompt"}]}`。
`gen_image.py <ID> --refs <参照画像1>,<参照画像2>` で、共通ブロック＋場面の指示を送る。保存は `assets/gen/<ID>_vN.jpg`、記録は `ledger.json`（版は自動で増える。上書きしない）。

### 共通ブロックに入れるもの（実例：assets/examples/image_prompts_tsugimachi.json の common）

1. 用途と形式：写真のように自然な映画の一コマ、16:9、枠なし、コラージュなし、文字の重ね書きなし
2. 世界：町と島の名前、年代、技術が進んだうえで古いものを直して使っている理由、地形（斜面の温泉町、団地の島）
3. 未来の要素の統一デザイン：建物（曲面ガラス・陶器の骨組み・植栽テラス）、飛行車（白い車体・四隅のリング状ファン・車輪なし）
4. **ロボットの統一デザイン**：身長、色と材質、顔の代わりの光の帯、手、交換された部品。「既存のキャラクター・商標に似せない」
5. 見た目の言葉：手前・中景・遠景、28〜35mm、色（コバルト・シアン・蜂蜜色の木・青磁・クリーム）、質感（木目・布・波打つ古いガラス）、HDR やネオンを避ける
6. 人物：後ろ姿か遠景で小さく。顔の見せ場なし
7. 文字：指定した短い看板だけ、場面の中の物として。ほかは「No readable text anywhere」

### 作者から参考の絵・写真が届いたら

1. `assets/refs/<届いた日>/ref01.jpg…` に保存し（PNG は品質92の JPG に。git に入れる大きさにする）、一覧の `sheet.jpg` を作る
2. 一枚ずつ見て、**時刻と光・構図・未来の要素の形・町の紋や看板・繰り返し出てくるもの（例：三毛猫）・昭和の物・季節・絵に書かれた言葉**を書き出し、テーマ設定書に「参考写真」の節として残す。これまでの決まりと食い違う所（例：使わないと決めていた空中都市が主役になっている）は、作者の参考を優先して決まりを書き直し、その旨を伝える
3. 看板の名前が設定と違う字のとき（例：「次島」と「継島」）は、設定の字にそろえて書き、作者に一言確かめる
4. 原画を作るときは、場面の近い参考を2枚 `--refs` に渡す。共通ブロックの「見た目の言葉」に、参考から読んだ光と色（例：マジックアワー、提灯の琥珀、雪の青白さ、空の橙と紫）を足す。写真風の質感の言葉は消さない
5. 参考の絵そのものを本編の素材に使うのは、作者が「使って」と言ったときだけ（「参考にする」は見た目の手本）

### 場面の指示の書き方

- 時刻と光、カメラの位置、手前の物、中景の用事（1カット1用事）、遠景、未来の要素を1〜2個、読ませる看板（「reads exactly "継町漁港"」）
- 例（教室）：`Where the blackboard would be, a large completely transparent glass electronic board stands in the original dark wooden blackboard frame, with the old wooden chalk tray still attached ... The glass is blank — no writing ... A helper robot teacher stands beside the board holding a slender wooden pointer.`
- 実物の板に後から文字を出す場面（電子掲示板・黒板）は、板を**空白**で描かせ、文字は合成で入れる（AI に書かせると崩れる）

### 生成後の確認と直し

- 看板の文字化け、ロボットのデザインの揺れ、余計な文字 → `edit_image.py` で部分修正（例：木箱の文字を消す、品書きを直す、ロボットを町の標準デザインに描き替え）
- Veo で「他社のコンテンツ」と弾かれた原画は、既存キャラクターに似て見える要素を描き替える

## 動き（Veo、`veo-3.1-lite-generate-preview`、1080p・8秒）

`assets/veo/prompts.json` に `{"common_tail": "...", "shots": {"<ID>": {"photo": "N02_v2", "prompt": "..."}}}` を書き、`python3 -I scripts/veo_batch.py <ID> ...` で4並列で生成（ID を省くと、まだ無いカットを全部）。`photo` は採用した原画の版まで書く（版を省くと一番新しい版）。送る文は `prompt` ＋ 共通の締め（カットごとに `tail` で差し替え可）。保存は `assets/veo/<ID>_vN.mp4`、記録は `ledger.json`。実例：assets/examples/veo_prompts_tsugimachi.json

### 指示文の形

```
<カメラ>. <場面の一言>. <動くもの1>; <動くもの2>; <動くもの3>. <共通の締め>
```

- カメラ：`Locked-off static camera.` が基本。寄りたい時だけ `Very slow, smooth camera push-in.`、船の上なら `Camera on the moving ferry, gentle natural sway`
- 動くもの：人の用事（ゆっくり）、ロボットの光の帯、湯気、波、カーテン、飛行車が空をゆっくり横切る
- 共通の締め（assets/examples/veo_prompts_tsugimachi.json の common_tail）：
  `Keep every sign, text, building, vehicle design and person exactly as in the image; no new objects, no morphing, no camera shake, no cuts. Photorealistic, natural gentle motion, calm and quiet mood. Audio: natural ambient sound of the place only, no music, no speech, no singing.`
- Lite は `negativePrompt` を受け付けない（veo.py は Lite のとき付けない）

### よく起きること

| 起きること | 対処 |
|---|---|
| 「固定」と頼んでもカメラが動く | 空中電子版は track.py で追跡して貼る |
| ロボットの頭や飛行車の形が途中で変わる | 小さければ受け入れる。目立てば別の指示で作り直し（費用が増えるのでユーザーに確認） |
| 人物が増える（予告のスーツの男が2人に） | 演出として成り立つなら使う |
| 画面の板に偽の文字を描く | 合成の電子版（opaque を上げる）で覆う |
| 頼んでいない音楽を付ける | そのカットは Veo の音を使わない（sound.md） |
| 何度も弾かれる | 原画の側を描き替える |

## 声（Gemini TTS、`gemini-3.8-flash-tts`）

- 終わりのあいさつ：`python3 -I scripts/tts_outro.py "<文>" --voices Algieba,Charon,Iapetus,Schedar` → 聞き比べ（audio_qa.py）で一番自然なものを `audio/src/outro/closing.wav` にコピー
  - 「Say slowly…:」の前置きは読み上げられることがある。付けない
  - 地名・造語はひらがなで（継町 → つぎまち）
  - 文面はオリジナル。元動画のあいさつを写さない
- 祭りのざわめき：`tts_crowd.py` で短い会話を何人分か作り、遠くにぼかして重ねる（近くで鳴らすと不自然と判定された）
