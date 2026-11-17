# 日本代表 歴代ゴール数ランキング（縦型ショート動画）

サッカー男子日本代表の国際Aマッチ通算得点 TOP10 を、10位から順に発表していく
縦型（1080×1920・30fps・約42秒）のショート動画です。映像は [Remotion](https://www.remotion.dev/)（React）で、
BGM と効果音は `scripts/make-audio.mjs` がコードで合成しています（素材サイト不要）。

## 使い方

```bash
npm install
npm run dev      # プレビュー（Remotion Studio）
npm run render   # out/japan-goal-ranking.mp4 に書き出し
npm run stills   # 各場面の確認用の静止画を out/stills/ に書き出し
```

## 数字を直す・更新する

`src/players.json` だけを書き換えます。順位・同点（タイ）・場面の長さ・音のタイミングは自動で付いてきます。

- `goals`（得点）と `caps`（出場試合数）を更新する
- `asOf` / `asOfLabel`（いつ時点の数字か）を更新する
- 現役選手には `"active": true` を付けると「現役」の札が出る
- 11位以下の選手も入れておけば、順位が入れ替わったときに自動で反映される

**公開前に、数字を JFA の公式記録で必ず確認してください。** 現在入っている数字は
2026年11月14日のブラジル戦までの報道をもとにしたものです。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/players.json` | 選手データと出典 |
| `src/schedule.mjs` | 場面の順番と長さ、演出のタイミング（映像と音の両方がここを読む） |
| `src/Video.tsx` | 全体の組み立て（背景・場面・ヘッダー・切り替え・音） |
| `src/scenes/` | イントロ／順位発表／同点の順位／1位／まとめ |
| `scripts/make-audio.mjs` | BGM（`public/audio/bgm.wav`）と効果音（`sfx.wav`）の合成 |

## BGM を差し替える

`public/audio/bgm.wav` を好きな曲に置き換えるか、`src/Video.tsx` の `<Audio>` の `src` を変えます。
演出は BPM150（1拍=12フレーム）に合わせてあるので、同じテンポの曲だと切り替えが拍に乗ります。
音量は `src/Root.tsx` の `bgmVolume` / `sfxVolume` で調整できます。

## 素材について

- 選手の写真・エンブレム・ユニフォームなど、権利のある素材は使っていません。
- フォントは Noto Sans JP と Barlow Condensed（どちらも SIL Open Font License、`public/fonts/` にライセンス同梱）。
- Remotion は個人と3人以下の会社は無料です。それ以上の会社で使う場合は[ライセンス](https://www.remotion.dev/docs/license)が必要です。
