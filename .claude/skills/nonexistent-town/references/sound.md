# 音の作り方（環境音が主役）

参考動画の型では、語りは無く、**環境音・生活音が主役**。無音にせず、低い空気の音をずっと敷き、その上に章ごとの音と、AI 動画の音を重ねる。BGM は入れるならごく小さく（参考動画での有無は style-bible.md で要確認）。

## 層と音量の目安
| 層 | 役目 | 例 | 音量（render の gain） |
|---|---|---|---|
| 下地（ずっと） | 無音にしない | room（部屋の空気）、hum（街のうなり） | +4 dB 前後 |
| 章の環境音 | 季節・場所 | birds・rain・wind・waves・crickets・cicada・crowd・train | +4〜+8 dB |
| AI 動画の音 | 画と合った生活音 | 足音・食器・電車・湯気・人のざわめき | `clipGain` -2 dB 前後 |
| 合図の音（ところどころ） | 場面の印象 | crossing（踏切）・chime（風鈴）・clock（秒針） | 該当の章だけ（from/to） |
| BGM（入れるなら） | 感情の下支え | ごく静かなピアノ・アコースティック | -14〜-18 dB |
| 一度だけの効果音 | 区切り | 鐘・扉 | -6 dB 前後（多くて数分に 1 回） |

- gen-ambience の音は -30 LUFS で作ってあるので、gain は＋側で調整する
- 最後に全体を `audio.loudness`（-14 LUFS）にそろえる。ピークは -2 dBTP 以下にそろえ、AAC にしてから -1.0 dBTP を超えていたら、超えた分だけ自動で下げて入れ直す（雨・風のようなザーッという音が多い回で起きやすい）
- 語りの無い回は `duck` 0

## 環境音（gen-ambience.mjs）
ffmpeg で合成するので、権利の心配が無くネットも要らない。本物の録音ほどではないので、AI 動画の音や下地と重ねて「空気」として使う。
- 種類：rain（雨）wind（風）waves（波）room（部屋の空気）crickets（秋の虫）cicada（蝉）crossing（踏切）chime（風鈴）clock（秒針）hum（街のうなり）train（電車の通過）birds（小鳥）crowd（遠くのざわめき）
- **長さは使う区間以上にする**（plan.md の見積もりに秒数が出る）。短いとくり返しのつなぎ目が聞こえる
- フェードは render が付ける（ファイルには付けない）

## AI 動画の音
- `gen-clips.mjs`（Veo）で作った動画には音が付く。render は場面の長さに切って、つなぎに合わせてフェードし、ミックスに入れる
- 会話の声が入ることがある。言葉に意味が出てしまう・不自然なら、その場面に `"audio": false`
- 音の大きさがばらつくときは場面ごとに `audioGain`

## BGM（入れるなら）
1. **Lyria（gen-music.mjs）**：`music.prompt` を英語で。歌なしの指示は自動で足される
   - 型：`[テンポ] [ジャンル] with [楽器 2〜3 つ], [質感], [季節と時間帯], [空気], [展開]`
   - 例：`Very soft 60 BPM ambient piano with a little acoustic guitar, sparse notes and long silences, early summer evening in a small seaside town, calm and nostalgic, no big climax`
   - モデル：`lyria-3.5`（既定・数分）／`lyria-3-clip-preview`（30 秒）。20 分の回では曲をくり返す（`loop`）ので、つなぎ目が目立たない静かな曲にする
   - 実在の曲名・アーティスト名を prompt に書かない（「〇〇風」もしない）。できた曲には SynthID の透かしが入る
2. **手持ちの曲**：権利がはっきりしていて YouTube で使えるものだけ。クレジットが要るなら概要欄に
3. 入れないなら `audio.bgm` を消す

## 外部の効果音素材を使うとき
サイトごとに商用利用・YouTube・クレジット表記の条件を確かめ、必要な表記を概要欄に入れる。条件がはっきりしない素材は使わない。

## 確かめ方
- render の検査：平均の大きさ（目標 ±1 LU）、ピーク（-1.0 dBTP 以下）
- 下書きを人に聞いてもらう：章の変わり目で音が急に変わらないか、AI 動画の音が浮いていないか、ずっと同じ音が鳴り続けて疲れないか
