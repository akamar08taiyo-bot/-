# 参照動画の分析

## なぜ Gemini に見せるのか

この作業環境からは YouTube に接続できない（403）。Gemini API は YouTube の URL を `fileData.fileUri` に渡すと、Google 側で動画を読み込んで見て・聴いてくれる。手元に動画を落とさないので、参照動画を素材として使ってしまう心配もない。

## 手順

1. 全体の尺と章をつかむ（低解像度・速い）

```bash
curl -sS -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent" -H 'Content-Type: application/json' \
 -d '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://www.youtube.com/watch?v=<ID>"},"videoMetadata":{"fps":0.2}},{"text":"この動画全体について日本語でJSONのみ返す: {\"duration\":\"mm:ss\",\"title_on_screen\":…,\"chapters\":[…],\"summary\":…,\"has_music\":bool,\"has_voice\":bool}"}]}],"generationConfig":{"responseMimeType":"application/json","mediaResolution":"MEDIA_RESOLUTION_LOW"}}'
```

2. 全カットを区間ごとに書き出す（80秒ずつ、4本並列でよい。502 が出たら同じ区間をやり直す）

```bash
python3 -I scripts/analyze_youtube.py "https://www.youtube.com/watch?v=<ID>" work/yt/seg_0.json 0 80
python3 -I scripts/analyze_youtube.py "https://www.youtube.com/watch?v=<ID>" work/yt/seg_80.json 80 160
# …尺の終わりまで
```

区間の境目で1つのカットが2行に割れるので、場所と文字が同じで時刻が連続する行はまとめる（実例：カット表の 01:12–01:21）。

3. 音だけに集中した全編の解析（BGM の有無、声の場所、分ごとの環境音、つなぎ方、終わりの30秒）。区間解析の「BGMあり」は誤判定のことがあるので、こちらと突き合わせる。プロンプトは analyze_youtube.py と同じ形で「音だけに集中」と指示する（実例の判定：BGM なし、4:00 前後にラジオから短い音楽、最後に男性のあいさつ）。

4. 生の JSON を `docs/ref_<ID>/` に、カット表を `shots_table.md` に保存し、`docs/analysis.md` にまとめる。

## まとめに必ず入れる項目

| 項目 | 例（tGJRlrAXIoE） |
|---|---|
| 尺・カット数・平均の長さ | 5:18／33カット／平均9.6秒 |
| カメラ | ほぼ固定。ゆっくり前進は1カットだけ |
| つなぎ | 前半はストレートカット、終盤はディゾルブ |
| 字幕・声 | 本編に字幕なし。最後に右上のロゴとあいさつの声 |
| 音 | 環境音と生活音のみ（蝉・足音・食器・電車・波）。画面内のラジオから短い音楽 |
| 流れ | 昼 → 夕暮れ → 海の孤島（エンディング） |
| 画づくり | 固定カメラ＋人の通過、1カット1用事、手前・中景・遠景の三層、光で時間を語る |
| 懐かしさの理由 | 実在の手ざわり、説明がない、用事をしている人、時間が流れる、聞き流せる |

## 真似る型と写さないもの

- 真似る：一日の流れ、固定カメラと長めのカット、環境音中心、1カット1用事、ありえない器×ありふれた暮らし、最後の象徴カットとあいさつ
- 写さない：チャンネル名・ロゴ・英字の副題・決め台詞そのもの、実在の店名や看板、固有の場面・構図・人物・章の順番
- 決め台詞は言い換える（「存在しないのに懐かしい」→「まだ来ない未来なのに、懐かしい」）
- 新作との違い（意図した差）は表にして残す：1カットの長さ（半速で16秒）、クロスフェード、ご依頼で足した文字演出など

## 正直に書くこと

- AI の読み取りであり、看板の文字や人物の行為に誤読がありうる
- 人の目と耳で全編を確認していない
- 判定が揺れた項目（BGM の有無など）は、どちらを採ったかと理由
