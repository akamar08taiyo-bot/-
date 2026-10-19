# 本音あるある（30〜50代女性向けの縦型ショート）

同じ主人公（40代の妻）と夫で作る、あるある型のショート。声は Gemini 3.8 Flash TTS「Sulafat」、
絵は Gemini 3 Pro Image（人物の設定画 `assets/characters/sheet_v<n>.jpg` の最新版を毎回参照）、映像は Remotion、
BGM・効果音は numpy で合成（権利フリー）。フォントは Zen Maru Gothic / Dela Gothic One / Yusei Magic / Zen Old Mincho（SIL OFL）。

| 回 | タイトル | 長さ | 完成品 |
| --- | --- | --- | --- |
| honne01 | 夫に冷めた瞬間あるある【結婚10年目】 | 46秒 | `out/honne01.mp4` |
| honne02 | 「誰のおかげで生活できてると思ってるんだ」…はい、記録しました。【しのぶの失言ノート#2】 | 53秒 | `out/honne02.mp4` |

## 登場人物（#2 から、シリーズ名は「しのぶの失言ノート」）

設定画は `assets/characters/sheet_v2.jpg`。くわしい設定・グッズ案・タイトルの型は「本音あるある キャラクター設定書」（Claude Docs）にある。

| 名前 | 立場 | 目印 |
| --- | --- | --- |
| しのぶ（44） | 妻・語り。夫の失言を「失言ノート」に記録し、へそくりを貯めている（目標300万、今は200万） | からし色のカーディガン、黒い手帳 |
| まもる（46） | 夫。名前は「守」なのに、守るのは自分だけ | 紺、黒縁メガネ、頭のアホ毛、スマホ |
| よしえ（72） | まもるの母。息子を今も「まーくん」と呼ぶ | ラベンダーのカーディガン、真珠のネックレス |
| みなと（9） | 息子。家でいちばん大人 | 赤白しま模様のTシャツ |

手を上げる・物を壊す・浮気は描かない。イライラは「言葉と態度」までにする。

## 置き場所

- `episodes/<回>/`：台本 `script.json`（行・テロップ・字幕の色分け・効果音・BGM の止め所・語の頭の時刻 marks）、
  絵の指示文 `prompts.json`、声 `voice/`、行の時刻 `timeline.json`、絵の中の顔の位置 `faces.json`
- `public/<回>/img`：画面で使う絵（`public/shared/sfx` は全部の回で共通の効果音）
- `src/episodes/<回>.tsx`：その回の場面・カメラ・演出。共通の部品は `src/parts.tsx`（字幕・テロップ・題字・投票ボタンなど）と `src/props.tsx`（離婚届・値札・へそくりメーター・失言ノート・名札）
- `out/`：完成品（mp4・字幕・概要欄・サムネ）

## 作る手順（回ごと、例は honne02）

```bash
npm install && pip install fonttools brotli
python3 -I scripts/tts.py --ep honne02             # 声（読み間違いは文字起こしで確認して自動で取り直し）
python3 -I scripts/voice_takes.py a1 --ep honne02 --criteria "…"   # 大事な行は数テイクから聞き比べ
python3 -I scripts/gen_image.py --ep honne02 X3     # 絵（設定画を参照）→ 目で見て public/honne02/img/X3.jpg に
python3 -I scripts/detect.py --ep honne02 X3        # 絵の中の顔の位置
python3 -I scripts/prep_audio.py --ep honne02       # 無音を詰めて話す速さをそろえ、行の時刻を作る
python3 -I scripts/segments.py --ep honne02 a5t ask # 語の頭の時刻を見て script.json の marks に書く
python3 -I scripts/subset_fonts.py                  # 画面の文字だけのフォント（台本を変えたら）
python3 -I scripts/sfx.py && python3 -I scripts/bgm.py --ep honne02 && python3 -I scripts/mix.py --ep honne02
node scripts/stills.mjs honne02 0 9 22.9 42.6       # 確認用の静止画（work/honne02/stills/sheet.jpg）
node scripts/render.mjs honne02                     # 映像（無音）
python3 -I scripts/finish.py --ep honne02           # -14 LUFS に合わせて重ね、字幕を書き、検査
```

声がまだ無いときは `prep_audio.py --estimate` で文字数から仮の時刻を作れば、画面の確認だけ先にできる。

メモ：Gemini API は前払いクレジット制。尽きると 402 になり、声と絵が作れない（AI Studio で補充する）。
