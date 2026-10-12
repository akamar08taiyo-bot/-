# 音の設計と仕上げ

## 2つの版

| 版 | 中身 | 目標 |
|---|---|---|
| 環境音のみ（`audio/out/mix_asmr.wav`） | Veo の現場音（半速）＋合成した環境音・効果音＋終わりのあいさつ | -16 LUFS、トゥルーピーク -1 dBTP 以下 |
| テーマ曲入り（`audio/out/mix_theme.wav`） | 上に、オリジナルのテーマ曲を重ねる。曲が鳴る所は環境音を 5 dB 下げ、あいさつの間は曲を 10 dB 下げる | -14 LUFS、同上 |

```bash
python3 -I audio/src/compose.py      # テーマ曲 → audio/out/music.wav（尺は timeline.json から）
python3 -I audio/src/build_mix.py    # 環境音 → audio/out/ambience.wav と mix_asmr.wav
python3 -I audio/src/build_theme.py  # テーマ曲入り → audio/out/mix_theme.wav
```

## カットごとの割り当て（timeline.json の `audio`）

- `veo`：Veo の現場音の大きさ（-24 LUFS 基準の倍率）。0 で使わない。音楽が混じっていたら 0
- `veo_lp`：Veo の音の高音を削る（Hz）。耳に刺さる高音がある時（例 7000）
- `beds`：環境音の名前の一覧（下表）。前後のカットと 1 秒ずつ重ね、3.2 秒の等パワーでつなぐ
- `bed_gain`：そのカットだけ環境音を持ち上げる（dB）。合成音だけのカットが前後より静かすぎる時

### 環境音（build_mix.py の BEDS、目標 LUFS）

| 名前 | 中身 | 目標 |
|---|---|---|
| night_sea_calm / night_sea / dusk_bay / harbor_morning / distant_sea / pier_lapping | 波（周期・明るさを変えた合成） | -28〜-36 |
| morning_birds | 小鳥 | -36 |
| ferry_deck | 小舟のエンジン＋波 | -28 |
| wind_sea / rooftop_wind | 風 | -31〜-34 |
| onsen_steam | 湯けむり | -38 |
| shop_street_day / town_murmur_far / festival_stalls / festival_crowd_soft | 遠いざわめき（TTS の短い会話をぼかして重ねたもの） | -27〜-40 |
| workshop / clock_tick | 時計 | -36〜-44 |
| cicadas_strong / cicadas_far / cicadas_outside | ミンミンゼミ | -33〜-38 |
| higurashi | ヒグラシ | -33 |
| insects_start / insects / crickets / insects_fade | 鈴虫（最後は消えていく） | -34〜-38 |
| rain_after | 雨だれ | -34 |
| festival_music_far | 遠い祭り太鼓（Veo の太鼓の音を素材に） | -30 |
| broom_sweep | 竹ぼうきで掃く音 | -35 |

### 効果音・声（`events`）

`foghorn`（霧笛）、`ferry_horn`（汽笛）、`town_chime`（五時のチャイム、オリジナル旋律）、`robot_pi`（ロボットの「ピ。」）、`watering`（水やり）、`stamp`（はんこ）、`chalk`（`n` 文字ぶんのチョーク音）、`voice`（`file` で audio/src からの相対パス。例 `{"t": 19.6, "type": "voice", "file": "outro/closing.wav"}`）。空中電子版が出る時の電子音は holo ごとに自動で入る。`gain` で個別に上げ下げ。

## 第二章で足した音（sounds.py の後半）

| 名前 | 使い方 | 中身 |
|---|---|---|
| `sand_rise`／`sand_fall`（ベッド） | 砂が舞い上がって場面が変わる／おさまる | 舞う砂のざらつき＋風。カットの長さに合わせて強く／弱く（`RAMP`） |
| `siphon`、`cafe_room`（ベッド） | 喫茶店 | サイフォンの泡、遠い話し声と柱時計 |
| `kids_far`（ベッド） | 遠くで遊ぶ子ども | ざわめきの声を 4/3 倍の速さと高さにして、言葉にならない遠い声に |
| `phone_notify` | 2026年のスマートフォンの通知 | やわらかい二音（ロゴ音ではないオリジナル）。遠ざかるほど `gain` を下げて数回 |
| `cup_clink`、`monorail_pass` | カップと受け皿、空中電車の通過 | 陶器の短い音、モーターのうなりと風切り（左→右、近づいて遠ざかる） |
| `stamp_paper` | 紙のカードにはんこ | 「ポン」だけ（電子回覧板の `stamp` は確認音つき） |
| `can_kick` | 缶蹴り | 「カーン」と石畳で2、3度はねる音 |
| `voice`（カットの `voice` タブレット） | 自動 | 出る音、聞き取れない話し声（750 Hz で切る）、一文字ごとの小さな音を、画面と同じ時刻で |

- `memory: true` のカットは、Veo の音に `veo_lp: 2400`、環境音も 2.6 kHz で切って、遠くこもらせる
- 動かない静止画のカット（Veo が作れなかったとき）には、動きに合わせる音（電車の通過、缶の音）を入れない

## 終わりのあいさつ（声）

```bash
python3 -I scripts/tts_outro.py "〇〇の一日に、最後までお付き合いいただき、ありがとうございました。"   # → audio/src/outro/<声>.wav（4声）
```

`audio_qa.py` で読み違い・自然さを聞き比べ、選んだものを `audio/src/outro/closing.wav` にコピー（または event の `file` に直接書く）。地名はひらがなで書く。声の素材が無いまま組み立てると、build_mix.py は警告を出して声なしで続ける。

## Veo の音の扱い

- `slowmo.sh` が rubberband で半速に伸ばす（`transients=crisp:detector=compound:phase=independent:window=standard:formant=preserved:pitchq=quality`）。既定の設定より自然と判定された。
- Veo は頼んでいない**音楽**を付けることがある（実例：C3・D4・E1・G1）。全カットを確認する：
  - Gemini が使えるとき：`python3 -I scripts/audio_qa.py assets/veo/<ID>_v1.mp4 "<場面の説明>"` の `music`
  - 使えないとき：スペクトログラム（`ffmpeg -i x.mp4 -lavfi showspectrumpic=s=900x260:scale=log:fscale=log -frames:v 1 spec.png`）を見て、音程が段々に変わる持続音（旋律）があれば音楽

## テーマ曲（compose.py）

- pretty_midi で書いて FluidSynth（FluidR3_GM）で音にする。主題 A（オルゴール・ピアノ）と主題 B（フルート）、和音進行は F 調
- 章ごとの入り方は timeline.json の `chapter`（序・一・二・三・四・五・結）の頭で決まる。同じ7章の構成ならそのまま合う。章の数や並びが違う作品では、compose.py の `SEC`（区切り）と各章の編成を書き換える
  - 序：オルゴールの前奏／一：オルゴール＋ピアノ／二：ピアノ＋弦＋低音×2巡（長い章は3巡目を軽く）／三：フルート主題B×2＋オルゴール／四：チャイムの後に哀愁の主題A'／五（祭り）：休み、屋上の二人でオルゴール／結：主題Aの再現と終止和音
- 章を足して尺が延びたら、`music.wav` の 4 秒ごとの音量を見て無音の穴を探し、巡を足す
- build_theme.py は章ごとの音量差をならす（4秒ごと、最大 -7 dB／+2 dB）

## 仕上げ（dsp.py の master）

ラウドネスを目標に合わせ、先読みリミッター（0.08 秒の最小ゲイン、0.04 秒でならす、上限 -2.5 dBFS）を3回くり返す。AAC にした後のトゥルーピークが -1 dBTP 以下になることを `ffmpeg -i out.mp4 -vn -af ebur128=peak=true -f null -` で確かめる。

## 聞けない私の代わりの確認

1. 抜粋（20〜35秒）を `audio_qa.py` で Gemini に聴かせ、`naturalness`・`artifacts`・`music`・`speech_or_voice` を見る。判定は揺れるので、同じ所が2回悪い時だけ直す。単独で聞いて問題がなければ、混ぜた時の文脈による誤判定のことが多い
2. カットごとのラウドネスを並べ、前後より 6 dB 以上静かなカットは環境音を足すか `bed_gain`
3. 最後は必ず人の耳で聞いてもらうよう伝える
