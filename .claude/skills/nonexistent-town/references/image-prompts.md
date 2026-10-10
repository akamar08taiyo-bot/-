# 画像の指示（prompt）の書き方と確かめ方

## 指示の組み立て
`gen-images.mjs` は「共通の画風（imageStyle）」＋「場面（shots[].prompt）」＋「決まり（文字・ロゴ・実在の場所・顔を出さない）」をつないで送る。場面の prompt には**その場面にしか無いこと**だけを書く。英語で書くと安定しやすい（日本語でもよい）。

**場面の型**：`[何が]、[どこに・どう置かれているか]、[時間帯と光]、[天気・季節のしるし]、[カメラの距離と高さ]、[感情を一言]`

例（凪ヶ浦町・夏の終わりの夕方）：
- 遠景：`A small harbor town spread along a curved bay, seen from a hillside road; low evening sun, long shadows; late summer haze; wide shot from high angle; calm and distant`
- 中景：`An empty covered shopping arcade with closed shutters and a single lit shop at the far end; dusk light from the entrance; warm and lonely; eye-level medium shot`
- 寄り：`A rusty bicycle leaning against a wooden fence with morning glories; soft backlight; close-up at handlebar height; quiet`
- 物：`A table fan and a glass of barley tea on a tatami room floor, curtains moving slightly; afternoon light; detail shot`

## 1 本の中でそろえること・変えること
- **そろえる**：時代、季節、時間帯の流れ（昼→夕→夜のように一方向に進める）、色の方向（街のカードの「色」）、レンズ感（imageStyle）
- **変える**：距離（遠景 2：中景 4：寄り 3：物のアップ 1 くらい）、高さ（見下ろし・目の高さ・低い位置）、向き（横・奥行き・見上げ）
- 最初に作った 2 枚から良い方を `imageRefs` に入れると、残りの絵柄がそろう。ずれてきたら refs を差し替える
- 同じ場所を 2 回出すなら、時間帯か距離を変える（「同じ給水塔を、昼は遠景、夜は真下から」など）

## 時代のしるし（ブランド名・実在の型番を書かずに）
- 昭和 40〜50 年代：木造の駅舎、トタン屋根、ブラウン管のテレビ、丸い郵便ポスト（文字なし）、ホーロー看板（文字なし）、黒電話、扇風機、蚊帳、ボンネットバス風の古いバス
- 昭和の終わり〜平成のはじめ：公衆電話ボックス、自動販売機（ロゴなし・ボタンだけ）、ラジカセ、カセットテープ、団地、ゲームセンターの灯り（文字なし）
- 一九九〇年代の終わり：ポケットベル風の小物、ガラケー風（ロゴなし）、コンビニ風の明るい店（看板の文字なし）
- **出さない**：スマートフォン、新しい車、LED の大型ビジョン、現代の駅の電光掲示板（年代がずれる）

## 書かない・出さないもの
- 実在の地名・駅名・会社名・ブランド名・キャラクター名・作品名（prompt にも書かない）
- 読める文字（看板・ポスター・標識・車のナンバー）。どうしても看板が要るなら「blank sign」「unreadable sign」
- はっきりした顔の人物。人は遠くの小さな姿・後ろ姿・影だけ
- 実在の有名な景色にそっくりな構図（特定の観光地・特定の橋や塔）

## できた画像の確かめ方（1 枚ずつ Read で見る）
- [ ] 読める文字・それっぽい偽の文字・ロゴが出ていない（出ていたら作り直す。小さければ構図で切る：`focus`／`zoom`）
- [ ] 顔がはっきり写った人がいない
- [ ] 手・自転車・電線・線路・窓などの形が崩れていない
- [ ] 時代に合わない物（スマホ・新しい車など）が無い
- [ ] 実在の場所や有名な建物に見えない
- [ ] 前後の場面と絵柄・色がそろっている。同じ構図が続いていない
- [ ] 動かしたとき（寄る・流す）に、大事な物が画面から外れない
- 直すときは、だめな理由を prompt に足す（例：`no people`、`no text on the sign`、`wider shot`）か、別の距離・角度に変えて `--only 番号`
