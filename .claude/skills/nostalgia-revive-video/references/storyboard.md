# 絵コンテ（storyboard.py → scenes.json）の書き方

`storyboard.py` は Python で書いた絵コンテ。実行すると `scenes.json`（全スクリプトが読む正本）と `絵コンテ.md`（人が読む一覧）を書き出す。
見本は `assets/example_storyboard.py`（59カット・12分の実例）。**新しい作品はこれを写して中身を書き換える**のが最短。

## 目次
1. 全体の形（scenes.json）
2. meta（作品の設定）
3. chars（登場人物）
4. カット（sc の各項目）
5. 写真が動き出す（reveal）とキャプション
6. 画面のドット絵（overlay）
7. 環境音（amb）と効果音（sfx）の名前
8. セリフ（lines）
9. 曲（music）
10. 尺と構成の目安

---

## 1. 全体の形
```json
{"fps": 30, "size": [1920, 1080], "total": 724.5,
 "meta": {...}, "chars": {...}, "scenes": [...], "lines": {...}, "music": {...}}
```
時刻はすべて**カットの開始（start）からの秒**で書く。start は storyboard.py が dur を足し合わせて自動で入れる。カットの長さを変えても、効果音・セリフ・BGM が全部ついてくる。

## 2. meta
| 項目 | 例 | 使う所 |
|---|---|---|
| title / subtitle | "電池の夏" / "1997" | 題字（text="title"）、エンドカード、字幕、mp4 のタイトル |
| end_question | "あなたの1997年の夏は、どんな夏でしたか。" | エンドカードと字幕。コメントを促す問いかけ |
| afterglow_title / afterglow_sub | "あの夏の音" / "環境音とピアノだけの…" | 環境音パートの題字（text="afterglow"） |
| out_name | "電池の夏_1997" | 出力ファイル名（out/<out_name>.mp4, _audio.wav, .srt, _概要欄.txt） |
| look | "photo" / "anime" | 設定画の作り方（gen_chars.py） |
| past_era / present_era | "1997" / "2026" | era がこの値のカットの色調整（過去=暖かい、現在=少し冷たい）、Veo の様式 |
| setting | "a small seaside town in Japan in summer 1997" | 画像検査の指示文（check_images.py） |
| stamp_text | "'97 7 26" | サムネイルの日付（stamp=True のとき） |
| thumbs | [{scene, name, stamp, text, sub, crop}] | サムネイル（1280×720）。text/sub は明朝体の大きな文字 |
| chapters | {"朝": "1997年 夏・朝（模型店…）"} | 概要欄のチャプター名（part 名 → 表示名） |
| afterglow_part | "余韻" | 環境音パートの part 名（音の平準化・検査の区切り） |
| music_gain / music_preroll / music_fade_in | {"M5": -6} / {"M1": 1.2} / {"M1": 4} | 曲ごとの音量・先行・フェード（mix.py） |
| amb_gain_story / amb_gain_after | -1 / +4 | 環境音の音量（dB） |
| sfx_captions | {"chime5": "♪（夕方5時のチャイム「夕焼け小焼け」）"} | 効果音に付ける字幕 |
| motion_style / motion_style_present | "Realistic 1990s 35mm color film look, ..." | Veo の様式の指示（gen_clips.py） |

## 3. chars（登場人物・動物）
```python
CHARS = {
  "haruto": dict(file="assets/chars/haruto.png",
                 ref="HARUTO is the boy in the attached reference photos with the faded sky-blue T-shirt ... (keep his face, cowlick hair and clothes exactly)",
                 desc="HARUTO: a 10-year-old Japanese boy with short slightly messy black hair ..."),
  "adult": dict(file=..., ref=..., desc=..., base="haruto", base_note="The attached photos show HARUTO as a 10-year-old boy; make the SAME person grown up at age 39 ..."),
  "shiba": dict(file=..., ref=..., desc=..., kind="animal"),
}
```
- `desc` は設定画を作るときの見た目（英語。髪・肌・服の色と柄・持ち物まで）。服は1人1色の目印（例：水色に白い1本線、赤ラグラン）にすると、カットをまたいでも見分けやすい。
- `ref` はカットの指示に添える一文。参照画像の「どの人が誰か」を言葉で結びつける（複数人のカットで取り違えを防ぐ）。
- `base` は「同じ人の別の年齢」。参照元の設定画を添付して作る。

## 4. カット（sc の各項目）
| 項目 | 意味 | 例 |
|---|---|---|
| id | カットID（画像・動画のファイル名にもなる） | "S05" |
| part | 章の名前（概要欄のチャプター、音の区切り） | "朝" |
| dur | 長さ（秒）。8〜9秒が基本、見せ場は10秒前後 | 9.0 |
| jp | 日本語の説明（絵コンテ.md 用） | "縁側で、おばあちゃんが がま口から100円玉" |
| prompt | 英語の画像指示（場面・人物の動作・光）。None なら画像なし（エンドカード等） | "On the wooden engawa veranda ..." |
| refs | 出る人物（chars のキー）。設定画が参照画像として付く | ["grandma", "haruto", "shiba"] |
| move | カメラ：in / out / in_slow / out_slow / up / pan_r / pan_l / pan_r_slow / pan_l_slow / none | "in" |
| fx | 効果：dust（光の粒）/ rays（光の筋）/ rain（雨）/ flicker（花火などの明滅） | ["rays", "dust"] |
| amb | 環境音（7.の名前）。同じ名前が続くカットは1本につながる | ["engawa_soft"] |
| sfx | 単発の効果音 [名前, カット内の秒, dB] | [["coins", 1.8, -16]] |
| line | セリフID（1つか、リスト） | "G1" / ["C1", "C2"] |
| text | 文字のカード："title"（題字）/ "end"（エンドカード）/ "afterglow"（環境音パートの題字） | "title" |
| overlay | 画面のドット絵（6.） | "pet_eat" |
| bgm | 曲のキー（同じキーが続くカットは1曲でつながる。None は無音） | "M1" |
| era | 時代（meta の past_era / present_era） | "1997" |
| xfade | 前のカットからのクロスフェード秒（1.2〜2.6） | 1.6 |
| reveal | 写真が動き出す演出（5.） | dict(date="'97 8 2", hold=2.4, trans=2.0) |
| caption | 日英キャプション（左下） | ("1997年8月　縁側", "August 1997, on the veranda") |
| img | 別カットの画像を流用（差し込みカット。画像を作らない） | "S03" |
| transition | "white" で白に抜ける転換（現在→過去など） | "white" |
| bg | 画像のないカードの背景にするカットID（省略時は近くのカット） | "E05" |
| motion | Veo の動きの指示（MOTION 辞書から入る） | "The grandmother gently drops two coins ..." |

画像の指示文（full_prompt）は storyboard.py の `build_prompt()` が組み立てる：場面 + 人物の ref + 小物の決まり（TOY_RULES）+ 時代（ERA_*）+ 写真の質感（STYLE_*）。指示文の型は references/prompts.md。

## 5. 写真が動き出す（reveal）とキャプション
「蘇らせた」系で一番効く演出。色あせたプリント写真（白い縁・少し傾く・オレンジの日付）が机の上に置かれ、色が戻りながら画面いっぱいに広がり、そのまま場面が動き出す。
```python
reveal=dict(date="'97 7 26", hold=2.6, trans=2.2)   # hold 秒プリントのまま → trans 秒で色が戻る
caption=("1997年7月　模型店", "July 1997, the hobby shop")   # 色が戻った0.4秒後から約5秒
```
- 冒頭5秒以内に1回（何が起きる動画かを一瞬で分からせる）、章の入口でくり返す（章立てにもなる）。全カットでやるとくどいので5回前後。
- Veo の動画があるカットは、プリントの間は最初のコマで止まり、色が戻ると動き出す。
- 日付の数字は `'97 8 2` の形（アポストロフィ＋年2桁、空白区切り）。

## 6. 画面のドット絵（overlay）
電子ペットなどの液晶に、**オリジナルの**ドット絵をコードで描く（実在の商品のキャラクターは描かない）。
1. 画像に、画面が正面を向いて**何も映っていない**状態で写るよう指示する（"the small LCD screen faces the camera and is completely blank"）。
2. `scripts/detect_lcd.py <ID> --seed x y` で画面の位置を取る → `work/lcd_<ID>.jpg` で確認。傾いていたら `--rot`。
3. カットに `overlay="pet_eat"` など。用意されている動き：pet_eat（ごはん→ハート）、pet_ghost（おばけ）、pet_egg（たまご）。
4. 新しい絵は render.py の `SPR`（16×16 の文字列）と `ANIM`（[(秒, 絵の名前), ...]）に足す。
5. 別カットの画像に描くときは `img="S03"` で流用できる（画面が見えないカットに無理に描かない）。

## 7. 環境音・効果音の名前（scripts/sfx.py）
**環境音（amb）**：
| 名前 | 中身 |
|---|---|
| morning / morning_quiet / morning_end | 朝のスズメ＋遠いセミ / 静かな朝 / 朝の終わり（ひぐらし） |
| day / day_far | 昼のミンミンゼミ・アブラゼミ / 遠く（こもった）セミ |
| engawa / engawa_soft | 縁側：セミ＋風鈴＋扇風機＋風 / 控えめ |
| fan | 扇風機 |
| bike | 自転車の走行音＋風 |
| shop / shop_quiet / shop_closed | 店のざわめき / 静かな店（時計の音）/ 閉店後（ひぐらし） |
| track | 店のコースを数台のレーサーが周回 |
| park | 午後の公園（セミ・遠くの子どもの声・鳥） |
| storm / thunder_bed | 夕立前の風と草のざわめき＋遠雷 / 遠雷の帯 |
| rain_heavy / rain_soft / after_rain | 夕立 / 小雨としずく / 雨上がり（しずく＋ひぐらし） |
| dusk / dusk_late | ひぐらし / 夕暮れ遅く（ひぐらし＋虫） |
| crossing | 踏切の警報音と電車の通過 |
| river / sea | 川 / 海 |
| dinner | 夕飯：テレビの野球中継・食器・虫 |
| tv_morning | 朝のテレビ番組（スピーカー越し） |
| festival / fireworks | 夏祭り（ざわめき・太鼓）/ 花火（遠い破裂音・歓声） |
| night / night_wind | 夜の虫（スズムシ・コオロギ）/ ＋風 |
| event / event_far | 大会の会場のざわめき＋コース / 遠く |
| truck_idle / truck_away | 引っ越しトラックのアイドリング / 走り去る |
| autumn_day / autumn_wind / room_2026 / room_1997 | 秋の昼 / 秋の風と草 / 現在の部屋 / 過去の夜の部屋 |
| distant_train / chime_soft | 遠くの電車 / 風鈴だけ |

**単発の効果音（sfx）**：pet_alarm（電子ペットの呼び出し音）、pet_btn（ボタン）、pet_eat（食べる）、pet_flat（しぼんだ音）、pet_birth（生まれる）、bleeps（携帯ゲームの電子音）、tin_lid（缶のふた）、coins（硬貨）、ramune（ラムネのビー玉を落とす）、bike_bell（自転車のベル）、motor_rev / motor_pass / motor_whir（模型のモーター：空回し／通過／回り続ける）、flip（ひっくり返る）、battery（電池を入れる）、switch（スイッチ）、swing（ブランコ）、pencil（鉛筆）、thunder / thunder_far（雷：近い／遠い）、chime5（夕方5時のチャイム「夕焼け小焼け」前半2フレーズ）、dog_bell（犬の首輪の鈴）、gamaguchi（がま口を開ける）、glove（ボールがグローブに入る）、bat_hit（金属バットの打球音）。

新しい音は sfx.py に関数を足して AMB / ONE に登録する（雑音の帯域・揺れ・残響の組み合わせで作る。既存の関数が見本）。

**言葉が聞こえる音は TTS で**：テレビ・ラジオ・店の呼び込み・子どもの歓声など。絵コンテの `SFX_VOICES`（scenes.json の sfx_voices）に書き、`gen_sfx_voices.py` で `assets/sfx/<名前>.wav` を作る。sfx.py が決まった名前を読む：`tv_morning_voice`（朝の番組。tv_morning がスピーカー越しの音にする）、`tv_baseball_voice`（野球の実況。dinner）、`crowd_kids_01…`（子どもの歓声。shop・event・park のざわめきに遠く小さく散らす）、`crowd_fest_01…`（祭りの呼び込み・話し声。festival）。なければ合成の声だけになる（機械っぽく聞こえる）。台本は時代に合わせ、実在のチーム名・商品名は入れない。登場人物の声（同じプリセット）はざわめきに使わない。

## 8. セリフ（lines）
```python
"G1": dict(who="おばあちゃん", text="はい、お小遣い。むだづかいしちゃ、だめよ。", voice="Vindemiatrix", at=2.2,
           profile="A very old Japanese grandmother in her late 70s with a thin, slightly hoarse and gentle elderly voice.",
           scene="On the veranda on a summer morning, giving her grandson two 100-yen coins of pocket money.",
           notes="Speak slowly and softly like an elderly woman, warm, with a little tremble of age."),
"M1": dict(..., at=-1.6, far=True),        # 遠くからの声（前のカットの終わりから呼ぶ）
"L4": dict(..., room=[0.6, 0.12]),         # 狭い部屋の響き
```
- `at` はカット内の開始秒（負なら前のカットに食い込む）。同じカットに2行あるときは重ならない秒に。
- 声の名前（voice）は Gemini TTS のプリセット。**同じ人物は同じ声**。年齢・性別が合っているかは `gen_voices.py --age-check` で確かめる（実例：祖母役の最初の声は「30代・3/10」と判定された → 候補を5つ作って聞き比べさせ、Vindemiatrix（70代後半〜80代・9/10）に替えた）。
- 子ども：Puck（少年）、Leda（少女）、Fenrir（少年・別の子）。大人の男性：Charon。母：Kore。（作品ごとに確かめる）
- セリフは全体で4〜8行。字幕（.srt）には「話者：セリフ」で入る。

## 9. 曲（music）
```python
MUSIC = {"M1": ("lyria-3.5", "Instrumental only, no vocals, no drums. ..."),   # 約2分半
         "M0": ("lyria-3-clip-preview", "..."),                               # 30秒（冒頭など短い区間）
         "M5a": (...), "M5b": (...),                                          # M5 の区間で順につなぐ
         "M3": ("lyria-3.5", "existing")}                                     # 手元の曲（作らない）
```
- カットの `bgm` は曲のキー。区間より曲が短いときは、短い小品なら最後まで流して自然に終わらせ、長い区間なら4秒のクロスフェードでつなぐ。
- Lyria が使えない区間は `synth_music.py --box M2 --amb M5`（オルゴール・アンビエントピアノ）。

## 10. 尺と構成の目安
- 物語：枠（現在）→ 写真が動き出す → 朝 → 午後 → 夕方 → 夜 → 晩夏 → 別れ → 枠（現在）→ エンドカード。7分前後・45〜50カット。
- 長時間パート（余韻）：人物なし・各30秒前後の長回しを10カット（約5分）。環境音は場面ごとに替え、ピアノは静かに。1時間版はこのパートを延ばす。
- 1カット8〜9秒・クロスフェード1.6秒（見せ場・章の変わり目は2.2〜2.6秒）。
