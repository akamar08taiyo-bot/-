#!/usr/bin/env node
// 完成した回の「投稿セット」を作る：動画・サムネイル・概要欄・YouTube Studio に入れる値を 1 つにまとめる。
//   out/<id>_概要欄.txt   … そのまま貼れる概要欄（チャプターの時刻つき）
//   out/<id>_投稿セット.md … 渡すファイル・タイトル案・概要欄・入力の表・終了画面とカードの時刻・固定コメント・チェック
//   out/thumb_preview.jpg  … サムネイルを小さく表示したときの見え方（読めるかの確認用）
//
// 使い方:
//   node make-publish-kit.mjs <episode.json> [--series <シリーズのフォルダ>] [--video out/<id>.mp4] [--thumb out/thumb.jpg] [--allow-todo]
//
// 中身の文（タイトル案・概要欄の最初の文・固定コメント）は episode.json の publish 欄に書く（TODO のままだと止まる）。
// チャンネル共通の値（再生リストの URL・投稿の曜日と時間・ハッシュタグ・タグ）は <シリーズ>/channel.json。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, writeText, writeJson, fmtTime } from './lib/common.mjs';
import { ffmpeg, probe } from './lib/media.mjs';
import { buildTimeline } from './lib/timeline.mjs';

process.on('uncaughtException', (e) => {
  console.error(`エラー：${e?.message || e}`);
  process.exit(1);
});

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'allow-todo'] });
if (args.help || !args._[0]) {
  console.log('node make-publish-kit.mjs <episode.json> [--series DIR] [--video out/<id>.mp4] [--thumb out/thumb.jpg] [--allow-todo]');
  process.exit(args.help ? 0 : 1);
}

const EP_FILE = path.resolve(args._[0]);
const EP_DIR = path.dirname(EP_FILE);
const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
const id = ep.id || path.parse(EP_FILE).name;
const SERIES = path.resolve(args.series || path.dirname(EP_DIR));
const OUT_DIR = path.join(EP_DIR, 'out');
const isShort = (ep.format?.height || 1080) > (ep.format?.width || 1920);
const pub = ep.publish || {};
const town = ep.town || {};
const name = town.name || '（町名）';
const reading = town.reading ? `（${town.reading}）` : '';
const KIND = /村$/.test(name) ? '村' : /[市街]$/.test(name) ? '街' : '町'; // 〇〇村なら「この村は実在しません」

// ───── チャンネル共通の値（無ければひな形を作る） ─────
const CH_FILE = path.join(SERIES, 'channel.json');
const CH_DEFAULT = {
  _note: 'チャンネル共通の値。make-publish-kit.mjs が読む。決まったら書き換える（再生リストの URL は作ったあとに貼る）',
  name: '',
  handle: '',
  playlists: { main: '', shorts: '' },
  schedule: '',
  hashtags: ['#存在しない街の記憶', '#架空の町', '#環境音'],
  tags: ['存在しない街の記憶', '架空の町', '存在しない記憶', '環境映像', '環境音', '作業用', '睡眠用', 'ノスタルジー'],
  keywords: ['存在しない街の記憶', '架空の町', '存在しない記憶', '環境映像', '環境音', '作業用', '睡眠用', 'ノスタルジー', '昭和レトロ', 'AI映像'],
  setupDone: false,
};
let ch = CH_DEFAULT;
if (fs.existsSync(CH_FILE)) ch = { ...CH_DEFAULT, ...JSON.parse(fs.readFileSync(CH_FILE, 'utf8')) };
else writeJson(CH_FILE, CH_DEFAULT);

// ───── 中身の文が埋まっているか ─────
const isTodo = (v) => v == null || /^TODO/.test(String(v).trim()) || String(v).trim() === '';
const titles = (pub.titles || []).filter((t) => !isTodo(t));
const missing = [];
if (titles.length < 1) missing.push('publish.titles（タイトル案 3 つ）');
if (isTodo(pub.summary)) missing.push('publish.summary（概要欄の最初の 1〜2 行）');
if (isTodo(ep.title)) missing.push('title');
if (missing.length && !args['allow-todo']) {
  console.error(`episode.json の次の欄が空か TODO のままです：${missing.join('、')}\n（references/publish.md の型で書いてから、もう一度実行）`);
  process.exit(1);
}

// ───── 時間軸：チャプター・終了画面・カード ─────
const { shots, TOTAL } = buildTimeline(ep);
const videoPath = path.resolve(EP_DIR, args.video || path.join('out', `${id}.mp4`));
const thumbPath = path.resolve(EP_DIR, args.thumb || path.join('out', 'thumb.jpg'));
const srtPath = videoPath.replace(/\.mp4$/i, '.srt');
const haveVideo = fs.existsSync(videoPath);
const vinfo = haveVideo ? probe(videoPath) : null;
const duration = vinfo?.videoDuration || TOTAL;
// 下書き（解像度が小さい）を渡さないように
const W = ep.format?.width || 1920;
const H = ep.format?.height || 1080;
const lowRes = vinfo && (vinfo.width < W || vinfo.height < H);
const mmss = fmtTime;

// チャプター：章の最初の場面が出きった時刻（前の章とのつなぎが終わった時刻）を秒に切り上げたもの。
// 押したときに新しい章の画だけが見えているように。YouTube の条件（最初が 0:00・3 つ以上・各 10 秒以上）を満たすときだけ入れる
const shown = (s) => (s ? Math.ceil(s.start + s.tIn) : 0);
const chapterRows = (ep.chapters || [])
  .map((c) => ({ title: c.title || c.theme, t: shown(shots[(c.shots?.[0] || 1) - 1]) }))
  .sort((a, b) => a.t - b.t);
if (chapterRows.length) chapterRows[0].t = 0;
const chapterOk =
  chapterRows.length >= 3 && chapterRows.every((c, k) => (chapterRows[k + 1] ? chapterRows[k + 1].t : duration) - c.t >= 10);
const chapterText = chapterOk ? chapterRows.map((c) => `${fmtTime(c.t)} ${c.title}`).join('\n') : '';

// 終了画面：最後の 20 秒まで。締めのカードがあれば、カードが出きってから（つなぎが終わった時刻を秒に切り上げ）
const last = shots[shots.length - 1];
const endStart = Math.max(0, Math.ceil(duration - 20), last?.card ? shown(last) : 0);
const endLen = duration - endStart;
// カード：真ん中にいちばん近い章に入って 2 秒後（新しい章の画が出きってから）
const mid = chapterRows.length ? chapterRows.reduce((a, b) => (Math.abs(b.t - duration / 2) < Math.abs(a.t - duration / 2) ? b : a)) : { t: duration / 2, title: '' };
const cardAt = Math.max(0, Math.min(duration - 30, mid.t + 2));

// 使った AI（概要欄の開示）。実際にあるファイルから決める。publish.aiTools があればそれを使う
const used = [];
const exists = (p) => p && fs.existsSync(path.resolve(EP_DIR, p));
const clips = shots.filter((s) => s.video && exists(s.video));
if (shots.some((s) => s.image && exists(s.image))) used.push('画像：Gemini');
if (clips.length) used.push('動画：Veo');
const voiceUsed = (ep.audio?.voice || []).some((v) => exists(v.file));
const musicUsed = Boolean(ep.audio?.bgm?.file && exists(ep.audio.bgm.file) && !isTodo(ep.music?.prompt));
if (musicUsed) used.push('音楽：Lyria');
if (voiceUsed) used.push('声：Gemini TTS');
// 音にも AI が入っているか（BGM・声・AI 動画の音）。入っていなければ「映像は AI で」と書く
const aiSound = musicUsed || voiceUsed || clips.some((s) => s.audio !== false);
const aiTools = pub.aiTools || used.join('、');

// ───── 概要欄 ─────
const playlistMain = ch.playlists?.main || '（再生リスト「本編」の URL を channel.json の playlists.main に貼る）';
const credits = (pub.credits || []).filter(Boolean);
const hashtags = (pub.hashtags || ch.hashtags || []).slice(0, 5);
// ショートの概要欄のリンクは押せないので、本編へは「関連動画」でつなぐ（概要欄には URL を入れない）
const description = [
  isTodo(pub.summary) ? `存在しない${KIND}「${name}${reading}」の、季節をまたいだ暮らしと景色。` : pub.summary.trim(),
  '',
  ...(isShort ? [] : ['▼ほかの町', `存在しない街の記憶｜本編：${playlistMain}`, '']),
  `※この${KIND}は実在しません。登場する町・場所・人物・出来事はすべて架空です。`,
  `※${aiSound || pub.aiTools ? '映像と音' : '映像'}は AI${aiTools ? `（${aiTools}）` : ' '}で生成し、編集して制作しています。`,
  ...(credits.length ? ['', '素材：', ...credits.map((c) => `・${c}`)] : []),
  ...(chapterText ? ['', chapterText] : []),
  '',
  hashtags.join(' '),
].join('\n');
writeText(path.join(OUT_DIR, `${id}_概要欄.txt`), description);

// ───── サムネイルの縮小プレビュー ─────
// ショートのサムネイルは動画の中から 1 コマを選ぶのが基本なので、無くても止めない
const thumbRequired = !isShort;
let thumbNote = thumbRequired ? '✗ まだ無い（make-thumb.mjs で作る）' : '－ 無し（ショートはアップロード画面で動画の中から 1 コマを選ぶ）';
if (fs.existsSync(thumbPath)) {
  const prev = path.join(OUT_DIR, 'thumb_preview.jpg');
  ffmpeg(['-i', thumbPath, '-vf', 'scale=320:180', '-q:v', '3', prev], { label: 'サムネイルの縮小' });
  thumbNote = `✓ ${path.relative(EP_DIR, thumbPath)}（${Math.round(fs.statSync(thumbPath).size / 1024)}KB。小さく表示した見え方：out/thumb_preview.jpg）`;
}

// ───── 固定コメント ─────
const PINNED = [
  'この町で、いちばん歩いてみたかった場所はどこでしたか？',
  'あなたの“存在しない記憶”の町は、どんな季節でしたか？',
  '次はどんな町を見てみたいですか？（海辺・山あい・雪国…）',
  'この町のどの音が、いちばん記憶に残りましたか？',
];
const no = Number(String(id).match(/\d+/)?.[0] || 1);
const pinned = pub.pinnedComment && !isTodo(pub.pinnedComment) ? pub.pinnedComment : PINNED[(no - 1) % PINNED.length].replace(/この町/g, `この${KIND}`);
const tags = (pub.tags || ch.tags || []).join(', ');

// ───── 投稿セット ─────
const md = [];
md.push(`# 投稿セット：${ep.title || name}（${id}）`, '');
md.push(`動画の長さ ${mmss(duration)}${haveVideo ? '' : '（まだ書き出していないので計画の長さ）'}・${isShort ? 'ショート（縦）' : '本編（横）'}`, '');
md.push('## 1. 渡すファイル');
md.push(
  `- 動画：${
    !haveVideo
      ? '✗ まだ無い（render-town.mjs で書き出す）'
      : lowRes
        ? `✗ ${path.relative(EP_DIR, videoPath)} は下書き（${vinfo.width}×${vinfo.height}）。本番（${W}×${H}）を書き出してから渡す`
        : `✓ ${path.relative(EP_DIR, videoPath)}（${vinfo.width}×${vinfo.height}・${mmss(duration)}・${Math.round(fs.statSync(videoPath).size / 1048576)}MB）`
  }`,
);
md.push(`- サムネイル：${thumbNote}`);
md.push(`- 概要欄：✓ out/${id}_概要欄.txt`);
if (fs.existsSync(srtPath)) md.push(`- 字幕：✓ ${path.relative(EP_DIR, srtPath)}（アップロード画面の「字幕」から）`);
md.push('', '## 2. タイトル案（1 つ選ぶ）');
(titles.length ? titles : ['（TODO：publish.titles を書く）']).forEach((t, k) => md.push(`${k + 1}. ${t}`));
md.push('', '## 3. 概要欄（そのまま貼る）', '```', description, '```');
if (!chapterOk && !isShort) md.push('（章が 3 つ未満か、10 秒より短い章があるので、チャプターは入れていない）');
md.push('', '## 4. YouTube Studio に入れる値');
md.push('| 画面 | 項目 | 入れる値 |', '|---|---|---|');
md.push(`| 詳細 | タイトル | 2 の案から 1 つ |`);
md.push(`| 詳細 | 説明 | 3 の概要欄 |`);
md.push(
  isShort
    ? `| 詳細 | サムネイル | 動画の中から町名がいちばん映える 1 コマを選ぶ${fs.existsSync(thumbPath) ? `（画像を指定できる画面なら ${path.relative(EP_DIR, thumbPath)}）` : ''} |`
    : `| 詳細 | サムネイル | ${path.relative(EP_DIR, thumbPath)} |`,
);
md.push(`| 詳細 | 再生リスト | ${isShort ? '「存在しない街の記憶｜ショート」' : '「存在しない街の記憶｜本編」'} |`);
md.push('| 詳細 | 視聴者 | 「いいえ、子ども向けではありません」 |');
md.push('| 詳細 | 年齢制限 | 「いいえ」 |');
md.push('| 詳細 → すべて表示 | 改変または合成されたコンテンツ | **「はい」**（本物らしい町や人を AI で作っているため） |');
md.push('| 詳細 → すべて表示 | 有料プロモーション | チェックしない |');
md.push(`| 詳細 → すべて表示 | タグ | ${tags} |`);
md.push('| 詳細 → すべて表示 | 撮影場所 | 入れない（架空の町） |');
md.push('| 詳細 → すべて表示 | カテゴリ | エンターテイメント |');
if (isShort) {
  md.push(`| 詳細 | 関連動画 | この町の本編${pub.mainVideoUrl ? `（${pub.mainVideoUrl}）` : '（本編を公開してから。URL は publish.mainVideoUrl に）'}。ショートの概要欄のリンクは押せないので、本編へはここでつなぐ |`);
} else {
  md.push(`| 動画の要素 | 終了画面 | **${mmss(endStart)}〜${mmss(duration)}**（${Math.round(endLen)}秒）：「動画（最新のアップロード）」＋「再生リスト（本編）」＋「チャンネル登録」。画面の下半分に置く（上は町名の文字） |`);
  md.push(`| 動画の要素 | カード | **${mmss(cardAt)}**：再生リスト「本編」（${mid.title ? `「${mid.title}」の章に入って 2 秒後` : '中ほど'}） |`);
}
md.push(`| 公開設定 | 公開 | 予約${ch.schedule ? `（${ch.schedule}）` : '（毎回なるべく同じ曜日・時間。決まったら channel.json の schedule に）'} |`);
md.push('', '## 5. 公開したあと');
md.push(`- 固定コメント（投稿者として書いて「固定」）：`, `  > ${pinned}`);
md.push('- 宣伝は、興味を持ちそうな人に届く場所だけ。身内に再生を頼まない');
md.push('- 2〜3 日後にアナリティクスで、最初の 30 秒で離れた人の割合と、終了画面・カードのクリックを見る');
md.push('', '## 6. チェック');
for (const c of [
  'タイトルに町名。誤解を招く言い方（実在した・記録映像 など）なし',
  '概要欄に「実在しない」「AI で生成」、チャプター、本編の再生リスト、外部素材のクレジット',
  '改変または合成されたコンテンツ「はい」、子ども向け「いいえ」',
  isShort ? '関連動画に本編' : '終了画面とカード',
  'サムネイルが小さくても町名が読める、偽の文字やロゴが紛れていない',
  '公開後：固定コメント、台帳（towns.json）に記録',
]) md.push(`- [ ] ${c}`);
if (!ch.setupDone) {
  md.push('', '## 7. チャンネルの初期設定（まだなら最初の 1 回だけ）');
  md.push('- カスタマイズ → プロフィール：名前・ハンドル・説明（説明の例は references/publish.md の 1 章）');
  md.push('- 設定 → チャンネル → 基本情報：居住国「日本」、キーワード：', `  \`${(ch.keywords || []).join(', ')}\``);
  md.push('- 設定 → チャンネル → 詳細設定：「いいえ、このチャンネルを子ども向けとして設定しません」');
  md.push('- 設定 → アップロード動画のデフォルト設定：説明に「※」の 2 行、公開設定「非公開」、カテゴリ「エンターテイメント」、言語「日本語」、コメント「不適切な可能性があるコメントを保留して確認する」');
  md.push('- 設定 → コミュニティ：ブロックする単語 `副業, 稼げる, LINE, 投資, 儲かる, http`');
  md.push('- 再生リストを 2 つ：「存在しない街の記憶｜本編」「存在しない街の記憶｜ショート」→ URL を channel.json の playlists に貼る');
  md.push('- 済んだら channel.json の setupDone を true に（次からこの節は出ない）');
}
const kit = md.join('\n');
writeText(path.join(OUT_DIR, `${id}_投稿セット.md`), kit);
console.log(kit);
console.log(`\n保存：out/${id}_投稿セット.md ／ out/${id}_概要欄.txt${fs.existsSync(thumbPath) ? ' ／ out/thumb_preview.jpg' : ''}`);
if (!haveVideo || lowRes || (thumbRequired && !fs.existsSync(thumbPath))) {
  console.error('✗ まだ渡せません：上の「1. 渡すファイル」の ✗ を直して、もう一度実行してください');
  process.exitCode = 2;
}
