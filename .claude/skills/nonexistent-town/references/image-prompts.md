# 画像と動きの指示（prompt・motion）の書き方と確かめ方

## 画像の指示の組み立て
`gen-images.mjs` は「共通の画風（imageStyle）」＋「場面（shots[].prompt）」＋「決まり（文字・ロゴ・実在の場所を出さない、実在の人物に似せない）」をつないで送る。場面の prompt には**その場面にしか無いこと**だけを書く。英語のほうが安定しやすい。

**場面の型**：`[何が・誰が]、[どこに・どう置かれているか]、[時間帯と光]、[天気・季節のしるし]、[カメラの距離と高さ]、[空気を一言]`

例（凪ヶ浦町・第 3 章「暮らしの場所」・夏の昼）：
- 遠景：`A narrow shopping street climbing a hill toward the sea, summer noon, strong sunlight and deep shadows under awnings, a few people far away, wide shot from the bottom of the slope, bright and quiet`
- 中景：`An open-front fish shop with ice and wooden crates, the shopkeeper seen from behind, light reflecting from the wet floor, eye-level medium shot, lively but calm`
- 寄り：`Hands slicing watermelon on a wooden counter, a glass of barley tea sweating beside it, soft window light, close-up, shallow depth of field`
- 物のアップ：`A wind chime with a paper strip moving slightly under the eaves, blurred street behind, detail shot`

## 1 本の中でそろえること・変えること
- **そろえる**：時代、レンズ感と画風（imageStyle）、色の方向（町のカードの「色」）
- **進める**：季節と時間（章ごとに一方向に）
- **変える**：距離（遠景 2：中景 4：寄り 3：物のアップ 1）、高さ（見下ろし・目の高さ・低い位置）、向き（横・奥行き・見上げ）。各章の最初は遠景
- 最初に作った 2 枚から良い方を `imageRefs` に入れると、残りの絵柄がそろう。章が変わって季節や光が大きく変わるときは、その章の最初の 1 枚を refs に足す
- 同じ場所を 2 回出すなら、季節・時間・距離のどれかを変える

## 人物
- 暮らしの気配として人を入れてよい（遠景・後ろ姿・横顔・手元が自然。寄りの顔も可）
- 実在の人物・有名人に似せない。同じ人物を何度も出すなら、服装と体つきを prompt に固定で書く
- 子どもを入れるなら、遠景か後ろ姿にとどめる

## 時代のしるし（ブランド名・実在の型番を書かずに）
- 昭和 40〜50 年代：木造の駅舎、トタン屋根、ブラウン管のテレビ、黒電話、扇風機、蚊帳、古い路線バス、路面電車
- 昭和の終わり〜平成のはじめ：公衆電話ボックス、ロゴの無い自動販売機、ラジカセ、団地、商店街のアーケード
- 一九九〇年代の終わり：ガラケーのような小物（ロゴなし）、明るいコンビニ風の店（看板の文字なし）
- **出さない**：スマートフォン、新しい車、LED の大型ビジョン、現代の駅の電光掲示板

## 書かない・出さないもの
- 実在の地名・駅名・会社名・ブランド名・キャラクター名・作品名（prompt にも書かない）
- 読める文字（看板・ポスター・標識・車のナンバー）。看板が要るなら「blank sign」「unreadable sign」
- 実在の有名な景色や建物にそっくりな構図（参考動画のような「水没した実在の名所」も使わない）

## AI 動画の動きの指示（shots[].motion）
`gen-clips.mjs` は元の画像＋motion＋clipStyle（ゆっくり・自然・カメラはほぼ固定・構図を変えない）を Veo に送る。
- 1 つの場面で動くものは 1〜2 つまで：`steam rises slowly from the bowl` `a tram passes far in the background` `curtains sway in the breeze` `rain drips from the awning` `snow falls gently` `two people walk away down the street`
- カメラは止めるか、ごくゆっくり：`the camera slowly pushes in`（使うなら静止画の move とは別の画で）
- 顔の表情や手の細かい動き、速い動き、文字の出る物（新聞・看板）は崩れやすいので避ける
- 動画には Veo が作った音（環境音・生活音）が付く。会話の声が入っていたら、言葉が聞き取れても内容が意味を持たないか確かめる（変なら `"audio": false` か作り直し）

## できた画像・動画の確かめ方
- [ ] 読める文字・それっぽい偽の文字・ロゴが出ていない（小さければ `focus`／`zoom` で外す）
- [ ] 手・顔・自転車・電線・線路・窓などの形が崩れていない（動画は動いている間も）
- [ ] 時代に合わない物が無い
- [ ] 実在の場所・有名な建物・実在の人物に見えない
- [ ] 前後の場面と絵柄・色がそろっている。同じ構図・距離が続いていない
- [ ] 動かしたとき（寄る・流す）に、大事な物が画面から外れない
- [ ] AI 動画：動きがゆっくりで自然、最初と最後で急に形が変わらない、音が画と合っている
- 直すときは、だめな理由を prompt に足す（例：`no text on the sign`、`wider shot`）か、別の距離・角度に変えて `--only <ファイル名>`
