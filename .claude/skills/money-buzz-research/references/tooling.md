# 道具の使い方（調べ方）

初回のフル調査（2026年10月、クラウド環境）で分かったことをまとめた。環境が変われば結果も変わるので、最初に確かめる。

## 最初の確認（1〜2分）

1. **WebSearch** を1回（例：「がまぐち夫婦 人気動画 再生回数」）。要約に再生数が出るかを見る。
2. **WebFetch** を集計サイトに1回（例：`https://yutura.net/`）。`EGRESS_BLOCKED` なら以後は使わない。
3. **Gemini API** に届くか:
   ```bash
   curl -sS -m 30 "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" \
     | python3 -c "import sys,json;[print(m['name']) for m in json.load(sys.stdin).get('models',[]) if 'generateContent' in m.get('supportedGenerationMethods',[])]"
   ```
   - クラウド環境ではプロキシがAPIキーを自動で付けるので、キーは書かない。
   - キーが要る環境では、環境変数（例：`GEMINI_API_KEY`）から `?key=` に付ける。キーを画面やファイルに出さない。
   - モデルは一覧の中の新しい Flash 系を使う（2026年10月時点では `gemini-3.8-flash`）。
   - 一覧の取得は無料だが、生成の呼び出しは有料。下の「費用の管理」を先に読む。

## 費用の管理（Gemini を使う前に必ず）

初回の調査（2026-10-04）では、7つのサブエージェントが並行して動画解析・URL読み取り・検索つき回答を使い、前払い残高（オートチャージはオフ）を超えて **約2,500円のマイナス** になった。402が返ったのは超えた後で、ユーザーへの報告も後手になった。

- 使う前に、目的と上限（呼び出し回数・金額の目安）をユーザーに伝えて許可をもらう。許可がなければ使わない。
- 重いのは動画を丸ごと見せる使い方（28分で約16万トークン）。再生数集めは url_context で足りる。動画を見るのは本当に必要な数本だけ、冒頭3分に切って。
- 呼び出しごとに応答の `usageMetadata.totalTokenCount` を記録し、合計を数える。残高はAPIから見えないので、この合計が唯一の手がかり。
- 上限の半分・上限・終了の各時点で、ユーザーに使った量を報告する。上限を超えそうなら止めて聞く。
- サブエージェントに渡すときは、エージェントごとの呼び出し上限を指示文に書く。並行で動くと、気づいたときには超えている。

## WebSearch

- **上限**：セッション全体で約200回。サブエージェントとも共有で、初回は7観点が途中で使い切った。観点ごとに回数を割り振る。
- **再生数を拾う検索**：「<チャンネル名> 人気動画 再生回数」「<チャンネル名> 万回再生」「<チャンネル名> ユーチュラ」
- **バズの手がかり**：「<キーワード> YouTube バズ 2026」「<キーワード> 再生回数 急上昇」
- **再生数が載る集計サイト**：yutura.net（ユーチュラ）、youranks.com、tuber-ch.com、jp.noxinfluencer.com、kamui-tracker、playboard.co
- 要約の数字は検索した時点のスナップショット。検索した日を確認日として残す。

## Gemini：ページを読む（url_context）— 再生数集めの本命

YouTubeの動画ページ（`/watch?v=`）、チャンネルの動画一覧（`/@ハンドル/videos`）、ユーチュラのページから、表示どおりの再生数（「1.1M views」などのK/M表記）と「◯か月前」が取れた。

```json
{
  "contents": [{"parts": [{"text": "次のページを読み、載っている動画のタイトル・再生数・公開時期を、ページの表示どおりに列挙してください。読めなければ『読めなかった』と書き、推測で埋めないこと。\nhttps://www.youtube.com/@<ハンドル>/videos"}]}],
  "tools": [{"url_context": {}}]
}
```

- 応答の `urlContextMetadata` の `urlRetrievalStatus` を見る。成功でも一覧が空のことがある。そのときは個別の動画ページで取る。
- 公開日は「◯か月前」からの推定になる。そう書いておく。
- YouTubeが英語に自動翻訳したタイトルを返すことがある。日本語の原文は別の出典で確かめ、作らない。

## Gemini：動画の中身を見る

画面の文字、冒頭フック、構成、口調、締めの誘導が分かる。再生数・公開日は分からない（聞くと推測で答えることがある）。

```json
{
  "contents": [{"parts": [
    {"file_data": {"file_uri": "https://www.youtube.com/watch?v=<VIDEO_ID>", "mime_type": "video/*"},
     "video_metadata": {"start_offset": "0s", "end_offset": "180s"}},
    {"text": "この動画の 1)画面に出るタイトル文字 2)冒頭30秒のフック 3)構成 4)話し方・キャラ 5)締めの誘導 を日本語で"}
  ]}],
  "generationConfig": {"mediaResolution": "MEDIA_RESOLUTION_LOW"}
}
```

- 丸ごと見せると重い（28分の動画で約16万トークン）。冒頭3分に切り、1観点1〜2本までにする。
- ショートは短いので丸ごとでよい。

## Gemini：Google検索つきで手がかりを集める

```json
{"contents": [{"parts": [{"text": "<質問>"}]}], "tools": [{"google_search": {}}]}
```

- 手がかり止まりにする。初回は、再生数が集計サイトと食い違ったり、2024年の動画を2026年としたりした。返ってきた出典URLも、半分ほどは無関係な記事か404だった。
- 使う主張は別の出典で確かめる。確かめられなければ「Gemini検索由来・未検証」と書き、そのURLは出典にしない。

## 送り方とエラー

```bash
D=<作業用フォルダ>; mkdir -p "$D"   # JSONはファイルに書いて -d @file で送る（日本語や引用符の事故を防ぐ）
curl -sS -m 300 -X POST "https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent" \
  -H "Content-Type: application/json" -d @"$D/req.json" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);c=d['candidates'][0];print(''.join(p.get('text','') for p in c['content']['parts']))"
```

- 402：前払いクレジット切れ。以後は使わず、ユーザーにチャージが必要と伝える。
- 429：混雑。少し待って1回だけやり直す。続くなら諦めて記録に残す。

## YouTube Data API があれば

APIキーがある環境ならいちばん正確（再生数・公開日・尺が正確に取れる）。`search.list` で動画を探し、`videos.list`（part=statistics,contentDetails,snippet）で数字を取る。キーは表示しない。
