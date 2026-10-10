# 音の作り方（BGM・環境音・声・大きさ）

## 重ね方の基本
| 層 | 役目 | 例 | 音量の目安（render の gain） |
|---|---|---|---|
| BGM | 感情の流れ | ゆっくりのピアノ、やわらかいパッド、テープの揺れ | -6〜-10 dB |
| 環境音（ずっと） | 空気・場所 | 波・雨・風・虫・部屋の空気 | gen-ambience の音は 0〜+6 dB |
| 環境音（ところどころ） | 場面の合図 | 踏切・風鈴・柱時計・遠くの汽笛 | 該当の場面だけ（from/to） |
| 声 | 記憶の言葉 | 語り | 0 dB（BGM・環境音は `duck` で自動的に下がる） |
| 効果音（一度だけ） | 区切り | 鐘・扉・自転車のベル | -6 dB 前後（多くて 30 秒に 1 回） |

- 最後に全体を `audio.loudness` にそろえる（long／short は -14 LUFS、ambient は -16〜-18）。ピークは -1.5 dBTP 以下に自動で収まる
- 声のある回は `duck` 6〜10 dB。声の無い回は 0
- 無音は使ってよい。区切り（黒へのつなぎ）の前後で BGM を少し引くと効く（`bgm.fadeOut` や場面の構成で）

## BGM
1. **Lyria（gen-music.mjs）**：`music.prompt` を英語で。歌なしの指示は自動で足される
   - 型：`[テンポ・BPM] [ジャンル] with [楽器 2〜3 つ], [質感], [季節と時間帯], [感情], [展開]`
   - 例：`Slow 68 BPM ambient piano with soft synth pads and a distant music box, warm tape hiss, late summer evening in a small seaside town, nostalgic and slightly mysterious, gentle swell in the middle and quiet ending`
   - モデル：`lyria-3.5`（既定・数分）／`lyria-3-clip-preview`（30 秒。ループ素材に）
   - 実在の曲名・アーティスト名・作曲家名を prompt に書かない（「〇〇風」もしない）
   - できた曲には SynthID の透かしが入る。使い方の条件は Google の利用規約に従う
2. **手持ちの曲**：権利がはっきりしていて YouTube で使えるもの（自作、商用 OK と明記された素材）だけ。クレジットが必要なら概要欄に書く
3. **ai-video-studio のキット**がある PC なら、キットの BGM 合成（ambient／lofi／cinematic など）で作ってもよい

## 環境音
1. **gen-ambience.mjs**（ffmpeg で合成。権利の心配なし・ネット不要）：rain／wind／waves／room／crickets／cicada／crossing／chime／clock／hum。合成なので本物らしさは控えめ。BGM の下に薄く敷く「空気」として使う
   - 長さは動画と同じか短め（`--dur`）。render がくり返してつなぐ（`loop`）
2. **Lyria** で「環境音だけの音」を作る：`Field recording style ambience of light rain on a tin roof with distant thunder, no music`
3. **外部の効果音素材**を使うなら、サイトごとに商用利用・YouTube・クレジット表記の条件を確かめ、概要欄に必要な表記を入れる。条件がはっきりしない素材は使わない

## 街のカードの「音」から決める
`new-episode.mjs` が、カードの「音」を環境音の種類に置き換えて `audio.ambience` に入れる（`formats.json` の `soundPresets`）。対応する種類が無い音（汽笛・祭囃子・カラスなど）は、Lyria で作るか使わない。

## 確かめ方
- render の検査：平均の大きさ（目標 ±1 LU）、ピーク（-1.0 dBTP 以下）
- 下書きの動画を人に聞いてもらう：声が聞き取れるか、BGM が急に大きくならないか、環境音がノイズに聞こえないか
