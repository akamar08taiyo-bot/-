# src/timeline.json の書き方

合成の内容はすべてこのファイルで決まる。Remotion（`src/VShot.tsx`）と音の組み立て（`audio/src/build_mix.py`、`compose.py`）が同じファイルを読むので、尺を変えても絵と音がずれない。

## 全体

```json
{
  "slug": "ai_human_coexistence",   // 出力の名前（out/<slug>_theme.mp4）
  "fps": 30, "width": 1920, "height": 1080,
  "crossfade": 1.2,        // カット同士の重なり（秒）
  "clipLen": 15.9,         // スロー化したクリップの長さ（8秒×2）
  "fadeIn": 0.25,          // 冒頭の黒からのフェード（秒、省略時 2.5）。冒頭のつかみがある作品は短く
  "shots": [ ... ]         // 並び順がそのまま本編の順
}
```

各カットの開始時刻は「前のカットの開始＋前のカットの dur − crossfade」。全体の尺は最後のカットの開始＋dur。

## カット（shots の1要素）

| キー | 意味 | 例 |
|---|---|---|
| `id` | クリップ名（`public/clips/<id>.mp4`、`out/shots/<id>.mp4`） | `"A1"` |
| `chapter`, `name` | 章とカット名（メモ用） | `"一"`, `"朝焼けの漁港"` |
| `dur` | カットの長さ（秒）。普通 16、最初と最後は長め | `16` |
| `clipAt` | クリップを流し始める時刻（それまでは最初のコマの静止画） | `3.0` |
| `hold` | クリップが終わった後：`"reverse"` で逆再生して尺を延ばす（`<id>_rev.mp4` が要る） | `"reverse"` |
| `push` | 画面全体のゆっくりした寄り `[始め, 終わり]` の倍率 | `[1.0, 1.06]` |
| `captions` | 下の字幕 `[{t0, t1, text}]`。1文字ずつ浮かび上がる | `[{"t0": 4.5, "t1": 11.0, "text": "牛乳は、今も瓶で届く。"}]` |
| `chapterCard` | 右上の縦書きの章題 `{t0, t1, num, title, time, right?}`。`right` は右端からの px（看板に重なるとき左へ）。`title` を空にすると `num` だけ（「あの頃」など） | `{"t0":1.3,"t1":6.8,"num":"一","title":"夜明け","time":"午前五時四十分","right":1500}` |
| `title` | 中央の題 `{t0, t1, text, sub, top?, size?, subFirst?}`。`top` は縦位置（0..1）、`size` は px、`subFirst` で小見出しを上に | 予告：`{"text":"砂の向こうから来た男","sub":"次回　第二章","top":0.24,"size":92,"subFirst":true}` |
| `endCard` | 終わりの題 `{t0, t1, text, sub, note}` | `{"text":"AIと人間の共存","sub":"第一章　了","note":"この映像の街・人物・出来事はすべて架空です"}` |
| `holo` | 空中電子版・画面内の板の表示（下表） | |
| `ink` | 画面の中の紙・カード・柱・板に書いてある字（`bake: true` は焼き込み。references/in-frame-text.md） | |
| `voice` | 話すだけで書ける空中のタブレット `[{x, y, w, tilt, t0, lines, rate?, pause?}]`（in-frame-text.md の 7） | |
| `memory` | `true` で昭和の回想：bake_ink.py が色あせ・粒子・周辺減光をかけ、build_mix.py が環境音をこもらせる | `true` |
| `clip` | クリップの実際の長さ（秒）。頭や後ろを切ったカット。`scripts/sync_cliplen.py` が書く | `9.98` |
| `veil` | 画面全体を色でおおう `[{t0, t1, from, to, color}]`（砂が舞って場面が変わる、など） | `[{"t0": 14.5, "t1": 20, "from": 0, "to": 0.72, "color": "#cdbb9a"}]` |
| `events` | 効果音・声（sound.md） | `[{"t": 6.0, "type": "foghorn", "gain": -9}]` |
| `audio` | 音の割り当て `{veo, veo_lp?, bed_gain?, beds}`（sound.md） | `{"veo": 1.0, "beds": ["harbor_morning"]}` |
| `hook` | 冒頭のつかみ：本編のクリップから数秒ずつ切り出してつなぐ（下の例）。`scripts/make_hook.py` が `public/clips/<id>.mp4` と `clip` を作る | |

## hook（冒頭のつかみ）

```json
{"id": "H0", "chapter": "序", "name": "冒頭のつかみ", "dur": 16.0,
 "hook": {"xf": 0.5, "fadeOut": 1.7, "segs": [
   {"src": "C1", "ss": 0.2, "len": 3.9, "beds": ["shop_voices"], "events": [{"t": 3.0, "type": "robot_pi", "gain": -5}]},
   {"src": "B2", "ss": 0.8, "len": 3.9, "beds": ["cicadas_far", "workers_chat"],
    "events": [{"t": 1.2, "type": "laugh", "kind": "woman", "far": false, "soft": true, "seed": 11}]},
   {"src": "B4", "ss": 2.4, "len": 3.9, "beds": ["cicadas_far", "kids_near"]},
   {"src": "E4", "ss": 2.6, "len": 5.8, "beds": ["insects", "night_sea"], "events": [{"t": 0.3, "type": "aircar_pass"}]}]},
 "captions": [{"t0": 11.0, "t1": 14.9, "text": "どこにもないのに、知っている景色。"}]}
```

- `src` は本編のカットの ID（文字を焼き込んだ後の `public/clips/<src>.mp4` から切る）、`ss` はその何秒目から、`len` は何秒。長さは Σlen − xf×(区間数−1)
- `fadeOut`：最後を黒へ（秒）。VShot に `veil` がある作品は `"veil": [{"t0": 14.3, "t1": 16, "from": 0, "to": 1, "color": "#000"}]` でもよい（字幕は上に残る）
- 空中電子版・タブレット・`ink` の焼き込みでない文字は Remotion が描くので、つかみのクリップには出ない。出したいときは、このカットの `holo`／`voice` に区間の時刻で書き直す
- `beds`・`events` の時刻は区間の頭から。省略すると元のカットのベッドを使う
- 字幕の位置は本編と同じ（下中央）。最後の区間の、見せ場が過ぎたあたりに置く

## holo（空中電子版・板の表示）

| キー | 意味 |
|---|---|
| `x`, `y` | 中心の位置（画面の幅・高さに対する割合）。**クリップの最初のコマ**での位置で書く。track.json があればカメラの動きに合わせて動く |
| `w` | 幅（割合）。文字の大きさは行の長さから自動で決まる（枠の86%に収める） |
| `lines` | 行。1行目が見出し |
| `t0`, `t1` | 出る時刻・消える時刻（`t1` 省略時はカットの終わりの0.6秒前） |
| `tilt` | 奥行きの傾き（度） |
| `small` | 文字を一回り小さく |
| `variant` | `"holo"`（既定：線→板→文字の順に光って現れる）／`"chalk"`（透明な電子黒板に白い文字を1字ずつ。板は描かない） |
| `stamp` | 既読のはんこ `{t, text, pos?}`（`pos`: `"tr"` 右上／`"br"` 右下） |
| `h` | 板の高さ（割合）。実物の板の大きさに合わせるとき |
| `opaque` | 暗いガラスの濃さ（既定 0.46）。実物の板に Veo が描いた偽の文字を隠すときは 0.9〜0.97 |
| `fixed` | 実物の板に貼る表示：浮き沈み・ちらつきなし |

### 置き場所の決め方

1. 原画に 5% 刻みのマス目を描いて見る（または `track_check.py` で数コマ並べる）
2. 見せ場（飛行車、開く扉、手の動き）と、元からある看板を隠さない。空の空いた所が第一候補
3. `python3 -I scripts/track.py <ID>` で追跡 → `python3 -I scripts/track_check.py <ID> <x> <y> <w> 出力.jpg` で、全コマで景色に貼りついているかを見る（カメラが寄ると上端で切れることがある → y を下げる）
4. `node scripts/stills.mjs <ID>:<秒>,<秒>` で文字の読みやすさを確認

## 例（そのまま使える形）

```json
{"id": "C5", "chapter": "三", "name": "空のりば", "dur": 16,
 "audio": {"veo": 1.0, "veo_lp": 7000, "beds": ["cicadas_far"]},
 "holo": [{"x": 0.64, "y": 0.105, "w": 0.17, "lines": ["空のりば  16:20", "継島行き  まもなく"], "t0": 1.0, "tilt": -4}],
 "captions": [{"t0": 10.4, "t1": 15.4, "text": "扉は、何もしなくても開く。"}]}
```

```json
{"id": "G1", "chapter": "二", "name": "町内の電子掲示板（回覧板）", "dur": 16,
 "audio": {"veo": 0.0, "bed_gain": 6, "beds": ["morning_birds", "broom_sweep", "town_murmur_far"]},
 "holo": [
  {"x": 0.398, "y": 0.414, "w": 0.108, "h": 0.153, "opaque": 0.97, "fixed": true,
   "lines": ["回覧板", "海岸のごみ拾い", "8/25（日）朝6時"], "t0": 0.8, "stamp": {"t": 4.4, "text": "済", "pos": "tr"}},
  {"x": 0.505, "y": 0.40, "w": 0.1, "lines": ["▶ 既読にする"], "t0": 2.9, "t1": 4.9, "small": true}],
 "events": [{"t": 4.4, "type": "stamp"}],
 "captions": [{"t0": 7.0, "t1": 13.4, "text": "回覧板は電子になっても、はんこは押す。"}]}
```

```json
{"id": "G3", "chapter": "二", "name": "透明な電子黒板とロボットの先生", "dur": 16,
 "audio": {"veo": 1.0, "beds": ["cicadas_far"]},
 "holo": [
  {"x": 0.595, "y": 0.335, "w": 0.1, "lines": ["8月24日（土）"], "t0": 0.4, "variant": "chalk"},
  {"x": 0.40, "y": 0.43, "w": 0.16, "lines": ["自由研究", "町の古い道具を", "しらべよう"], "t0": 1.6, "variant": "chalk"}],
 "events": [{"t": 0.7, "type": "chalk", "n": 7}, {"t": 1.9, "type": "chalk", "n": 4}, {"t": 2.84, "type": "chalk", "n": 7}, {"t": 4.11, "type": "chalk", "n": 5}],
 "captions": [{"t0": 6.4, "t1": 13.4, "text": "黒板は透明になった。先生は、ロボットになった。"}]}
```

黒板（chalk）の行は前の行を書き終えてから次の行が始まる：行 i の開始 = t0 + 0.3 + Σ(前の行の文字数×0.11 + 0.5)。チョークの音（`chalk` イベント）の t と n はこれに合わせる。

## 書き換えたら

- 字幕・電子版の文言を変えても、フォントはシステムに入っているので追加の作業はない
- 尺や順番を変えたら、音（`build_mix.py`、`compose.py`、`build_theme.py`）を作り直す
- 中身を変えたカットだけ `node scripts/render_shots.mjs <ID> --force` で書き出し直し、`assemble.py` でつなぎ直す
