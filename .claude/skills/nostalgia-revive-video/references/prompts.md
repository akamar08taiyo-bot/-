# 指示文（プロンプト）の型

画像・設定画・動画（Veo）・曲（Lyria）・声（TTS）の指示文の型と、実例で効いた言い回し。指示文は**英語**で書く（どのモデルも英語の方が細かい指示に従う）。

## 目次
1. カット画像（写実／アニメ／現在）
2. 文字・ロゴ・縁を出さないための言い回し
3. 作り直しの追加指示（--extra）の例
4. 設定画
5. 動き（Veo）
6. 曲（Lyria）
7. 声（TTS）

---

## 1. カット画像
storyboard.py の `build_prompt()` が次の順につなぐ：
```
[場面]  … 場所・時間・光・人物の動作・小物（1〜3文。動作は具体的に：「がま口から100円玉を2枚出して、少年の両手にのせる」）
[人物]  … "Characters: " + 各人物の ref（参照画像のどの人が誰かを言葉で結ぶ）
[小物の決まり] … 例：TOY_RULES（模型・電子ペットはオリジナルデザイン、ロゴなし）
[時代]  … ERA_1997 / ERA_2026
[質感]  … STYLE_1997 / STYLE_2026（写実）または アニメ調
```
**時代（過去）**：
```
Setting: a small seaside town in Japan, summer 1997. Everything must be period-accurate for 1997 Japan (no smartphones, no flat-screen TVs, no modern cars, no modern signage).
```
**写実（フィルム写真風）**：
```
Photorealistic candid snapshot taken in Japan in 1997 on 35mm color negative film: natural light, soft warm colors, mild film grain, slight lens vignetting, realistic skin, hair and fabric textures, authentic everyday details. It must look like a real photograph from a family album — not an illustration, not anime, not a 3D render, not a glossy modern photo. Ordinary-looking people, no celebrities. Absolutely no text, letters, numbers, readable signs, logos, brand names or watermark anywhere.
```
**現在（枠の場面）**：
```
Setting: Japan, autumn 2026 (present day). Photorealistic modern digital photograph, natural window light, slightly cool and calm tones, shallow depth of field. Not an illustration. Absolutely no text, letters, numbers, logos, brand names or watermark anywhere.
```
**アニメ調**（やさしい物語向き）：
```
Style: Japanese anime feature-film art with hand-painted detail and soft cel-shaded characters, warm natural light, nostalgic late-1990s atmosphere. Original character design, not based on any existing anime character. No text, no letters, no labels, no logos, no watermark.
```
場面の書き方のコツ：
- 「写真が動き出す」カットは家族写真らしく：`snapshot taken with a compact film camera with on-camera flash, slightly overexposed foreground`、カメラ目線で笑う。
- 人物なしの長回し（余韻）は最後に `No people.`。小物で季節と時代を語る（風鈴・蚊取り線香・扇風機・自販機の明かり）。
- 小さな画面にドット絵を描くカット：`the small rectangular LCD screen faces the camera directly and is completely blank, plain pale grey-green with nothing on it`。
- 時代の小物（ブラウン管テレビなど）は**その場面の指示にだけ**書く。共通の指示に入れるとバス停や屋台にまで出る。
- 実在の商品名は書かない（例：ミニ四駆 → `small toy 4WD race car with side guide rollers`、たまごっち → `egg-shaped keychain virtual pet toy with three round buttons`）。
- **形から実在の商品を連想させる物は、文字を特に禁止する**：電子ペットの殻には実在商品のロゴに似た青い筆記体が勝手に入る → `plain shell with no logo, no text, no letters`。模型店の棚の箱には実在メーカー風の星マークが大量に入る → `plain kit boxes with only simple color blocks, no logos, no stars, no text`（それでも入るので拡大して確かめる）。
- **靴は「無地」と指定する**：「白と青のスニーカー」と書くと、実在メーカー風のライン（ストライプ）が入りやすい → `plain white canvas sneakers with no stripes or logos`。設定画の時点で直しておくと全カットに効く。

## 2. 文字・ロゴ・縁を出さないための言い回し
- `Absolutely no text, letters, numbers, readable signs, logos, brand names or watermark anywhere.`（質感の指示の最後に必ず）
- 箱・袋・看板：`plain kit boxes`, `hanging snack bags with no readable text`, `small white kei truck with no markings`, `no stickers with text`
- 写真風で出やすいもの：白い縁・角丸・日付の刻印 → `no border, no frame, no rounded corners, no date stamp`
- それでも出るもの（実例）：模型の箱に実在メーカー風の星マーク、軽トラのエンブレム、アーケードの実在ゲーム名、靴の実在メーカー風ライン、Tシャツの英字、屋台の崩れた文字 → 3. で作り直すか、fixes.json でぼかす。

## 3. 作り直しの追加指示（--extra）の例
`gen_scenes.py --only <ID> --extra "<追加の指示>"`。直したい点を**具体的に・禁止形で**：
- `No star-shaped logos or brand marks on any boxes; all kit boxes are plain with simple color blocks.`
- `No border or white frame around the image, no printed date, no text of any kind.`
- `The arcade cabinet has a plain dark marquee with no title text or characters.`
- `Sneakers are plain white canvas with no stripes or logos.`
- `The two boys must be the ones in the attached reference photos (sky-blue T-shirt with one white stripe; buzz-cut boy with red raglan sleeves).`
作り直しても直らない人物違い・小物は、`fixes.json` の crop で見える範囲を切る（手元や背中だけ見せる）か、別カットの画像を `img` で流用する。

## 4. 設定画（gen_chars.py が使う）
写実の人物：
```
Photographic character reference sheet for a film: three photographs side by side of the SAME person on a plain light grey studio backdrop with soft natural light — (1) full body standing front view, (2) full body standing side view, (3) head-and-shoulders close-up. Photorealistic, looks like 35mm color film, realistic skin texture, ordinary-looking person (not a celebrity). No text, no labels, no numbers. <desc>
```
動物：`... of the SAME dog ... (1) standing side view, (2) sitting front view, (3) close-up of the face ...`
同じ人の別の年齢（base）：子どもの設定画を添付し、`The attached photos show HARUTO as a 10-year-old boy; make the SAME person grown up at age 39 in 2026, clearly recognizable as him (same face shape, eyes and cowlick).`
desc の例：`HARUTO: a 10-year-old Japanese boy with short slightly messy black hair and a small cowlick on top, round friendly face, sun-tanned skin; wearing a faded sky-blue T-shirt with one thin white horizontal stripe across the chest, navy blue knee-length shorts, white socks and white-and-blue sneakers; a small white egg-shaped keychain virtual pet toy hangs from his belt loop.`

## 5. 動き（Veo、gen_clips.py）
カットの `motion` に「何がどう動くか」を1文で。最後に様式（meta.motion_style）が付く。
```
The grandmother gently drops two coins into the boy's cupped hands and smiles, the boy bows happily, the dog wags its tail.
The two boys ride their bicycles down the gentle slope toward the camera, wind in their hair, natural subtle motion, steady camera.
Clouds drift slowly across the summer sky, a gentle breeze moves the trees, the sea sparkles, very slow steady camera.
```
＋ `Realistic 1990s 35mm color film look, natural subtle motion, no text, no subtitles, no logos.`
- 「蘇る」感じを出すのは**人物の小さな動き**（瞬き・笑み・振り向く・手を振る）。大きな動きは崩れやすい。
- 写真が動き出すカットで効いた書き方（実例）：動きを1〜2個に絞り、最後に
  `Keep every person and object exactly as in the photo; do not add, remove or duplicate any objects. Very subtle, natural, slow motion. The camera does not move.`
  - 採用できた例：縁側で改造する2人（手元の小さな動き・蚊取り線香の煙・眠る犬の呼吸）、夏祭りを歩く3人（笑顔・提灯の揺れ）、引っ越しの朝（荷物を運ぶ大人・立ち尽くす少年）。
  - 使えなかった例：おもちゃを掲げて笑う2人 → **手の中の車が0.6秒で増えた**（「増やさない」と書いても起きる）。大会の群衆 → 顔が崩れ、カメラも動いた。こういうカットは静止画＋カメラ移動のまま。
  - 同じ「おもちゃを掲げて笑う2人」も、**「顔だけが動く：まばたき・笑顔が広がる・小さく笑う。手と車はまったく動かさない」**と書き直したら、車は増えずに2人が笑い出した（冒頭のフックに採用）。
  - 2回目の結果（20本中18本採用）：起きる・食べる・犬が歩く・硬貨を受け取る・泣きながら車を受け取る・雨宿り・自転車で水たまり・雲が流れる、は自然。子どもが何人も並ぶカット（模型店のコース）は、途中で並びや服の柄が変わって不採用。「陽炎（heat haze）」と書いたカットは煙が出て、人が現れたり消えたりして不採用。ピッチャーの手にグローブが0.6秒で現れたカットは、先頭1.3秒を使わずに採用（fixes.json の clip.start）。
- カメラは `steady camera` / `The camera does not move`。8秒の動画を、カットの長さに合わせてゆっくり再生する（render.py が前後のコマを混ぜる）。
- Veo には fixes.json のぼかしを当てた画像を渡す（gen_clips.py が自動で）。それでも動画AIはぼかした文字を描き直すことがあるので、render.py は動画のコマにも同じ所のぼかしを当てる。
- 子どもが写る画像でも動かせた例がある（personGeneration=allow_adult で S07 の自転車の2人が通った）。通らないこともあるので**まず1本試してから**まとめて作る。
- 費用：1080p 8秒で約$0.64（2026年の目安）。`gen_clips.py --dry` で本数と見積もりを出して、ユーザーに確認してから作る。

## 6. 曲（Lyria、gen_music.py）
```
Instrumental only, no vocals, no drums. <どんな場面の曲か> : <楽器>, <BPM>, <調>, <雰囲気>, never loud, smooth ending.
```
実例：
- 朝：`Nostalgic Japanese film score for a bright summer morning in 1997 in a small seaside town: warm acoustic piano melody with a soft string ensemble and light glockenspiel accents, gentle and hopeful, 76 BPM, D major, flowing and calm, smooth ending.`
- 午後：`Light, warm and playful but calm Japanese film score for kids spending a lazy summer afternoon tinkering with toy race cars and playing baseball in a park in the 1990s: acoustic piano, pizzicato strings, soft nylon guitar, a little celesta, 88 BPM, G major, cozy, never loud, smooth ending.`
- 別れ：`Emotional film score for a farewell between two childhood best friends at the end of summer, then a quiet memory decades later: solo piano opening, strings gradually swelling to a heartfelt but restrained climax around the middle, then resolving softly to solo piano at the end, 66 BPM, D major.`
- 環境音パート：`Very calm ambient piano for relaxing, studying and sleeping, evoking a quiet summer evening in rural Japan in the 1990s: soft felt piano with long pauses, a faint warm string pad, slow 60 BPM, F major, minimal, peaceful and steady with no sudden changes.`
- `lyria-3.5` は約2分半、`lyria-3-clip-preview` は30秒（冒頭の短い区間に）。長い区間は2曲（M5a・M5b）作ってつなぐ。
- 「anime」と書くと元気すぎることがある。落ち着かせたいときは `film score`、`never loud`、`no sudden changes`。

## 7. 声（TTS、gen_voices.py が組み立てる）
```
# AUDIO PROFILE: A very old Japanese grandmother in her late 70s with a thin, slightly hoarse and gentle elderly voice.
## SCENE: On the veranda on a summer morning, giving her grandson two 100-yen coins of pocket money.
### DIRECTOR NOTES: Speak slowly and softly like an elderly woman, warm, with a little tremble of age. Do not read these notes aloud.
#### TRANSCRIPT
はい、お小遣い。むだづかいしちゃ、だめよ。
```
- 指示は英語、セリフだけ日本語。日本語で指示を書くと**指示文まで読み上げる**ことがある。
- 台本は**ひらがな多め**（読み間違いを減らす）。間は「……」、語尾は「、」で区切る。
- 語尾が変わることがある（「しような」→「しようぜ」）。notes に `Say the last word exactly as written: shiyou-na.` のように書いて撮り直す。
- **子どもの役は AUDIO PROFILE に「軽く高い、子どもらしい声」まで書く**：`A 10-year-old Japanese boy with a light, high, childlike voice.`。年齢だけ（`A 10-year-old Japanese boy.`）だと、同じ声でも1つずつ判定させると18〜30歳に聞こえた（実例：Fenrir）。書き足すと同じ声が「推定10歳・満点」になった。
- notes の最後に `Natural like a real elementary school kid talking, not theatrical, not like an anime voice actor, not like a teenager or an adult.` を足す。
- **悲しい・照れたセリフほど声が低く大人びる**（ささやく、うつむく、泣きそう、と書くと16〜28歳に聞こえた）。「平気なふりをして少し明るく言う（a small, bright childlike voice, trying to sound cheerful and brave）」と書くと子どもらしさが残る（実例：別れのセリフが推定11歳に）。それでも大人びるテイクは、声の高さと響きを少し上げる（ffmpeg の `asetrate=元のレート×1.22,aresample=元のレート,atempo=0.82` で約3.5半音）。加工感が出るので最後の手段。
- 撮り直しは `voice_takes.py`（何テイクか撮り、今の声もテイク0として、1つずつ独立に採点させて選ぶ）。並べて比べさせると、互いに引きずられて年齢の判定がぶれた。
