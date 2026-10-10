#!/usr/bin/env node
// YouTube の URL から、タイトル・投稿者・概要欄・チャプター・字幕・サムネイル・
// ストーリーボード（数秒おきの縮小コマを並べた画像）を集めて、フォルダに保存する。
// 動画そのものはダウンロードしない（軽い・速い・権利面でも穏当）。
//
// 使い方:
//   node yt-read.mjs <URL|動画ID> [--out <フォルダ>] [--lang ja,en] [--tlang ja]
//                    [--no-storyboard] [--sb-max 40] [--no-thumb]
//   node yt-read.mjs --check [<URL>]     この環境で使える方法を調べる（ネット・道具・Gemini）
//
// 出力（--out、既定は ./yt_<動画ID>）:
//   info.md          … まとめ（最初にこれを読む）
//   meta.json        … 取れた情報すべて（機械向け）
//   description.txt  … 概要欄の全文
//   transcript.txt   … 字幕（[分:秒] 付き）。取れたときだけ
//   thumbnail.jpg    … サムネイル
//   storyboard/      … 縮小コマのシート（sb_*.jpg）と index.md（各シートの時間帯）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureProxy,
  parseArgs,
  parseVideoId,
  httpGet,
  httpPostJson,
  extractJsonAfter,
  fmtTime,
  writeText,
  writeJson,
  ensureDir,
  versionOf,
  run,
  findGeminiKey,
  viaProxy,
} from './lib/common.mjs';
import {
  chaptersFromHtml,
  chaptersFromDescription,
  parseCaptionBody,
  captionTracks,
  pickTrack,
  parseStoryboardSpec,
  chooseStoryboardLevel,
  sheetRange,
  formatInfo,
} from './lib/youtube.mjs';

ensureProxy();

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2), { flags: ['check', 'no-storyboard', 'no-thumb', 'json', 'help'] });

if (args.help || (!args.check && !args._[0])) {
  console.log(
    'node yt-read.mjs <URL|動画ID> [--out <フォルダ>] [--lang ja,en] [--tlang ja] [--no-storyboard] [--sb-max 40]\n' +
      'node yt-read.mjs --check [<URL>]',
  );
  process.exit(args.help ? 0 : 1);
}

const HEADERS_YT = { Cookie: 'SOCS=CAI; CONSENT=YES+cb' }; // EU の同意画面を飛ばす

// ───────────────────────── 取得 ─────────────────────────

async function getOEmbed(id) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const r = await httpGet(url);
  if (!r.ok) {
    const why =
      r.error ||
      (r.status === 401 || r.status === 403
        ? `HTTP ${r.status}（非公開・埋め込み禁止の可能性）`
        : r.status === 404 || r.status === 400
          ? `HTTP ${r.status}（動画が無い・非公開の可能性）`
          : `HTTP ${r.status}`);
    return { ok: false, why };
  }
  try {
    return { ok: true, data: JSON.parse(r.body) };
  } catch {
    return { ok: false, why: 'oEmbed の応答が JSON ではない' };
  }
}

async function getWatchPage(id) {
  const url = `https://www.youtube.com/watch?v=${id}&hl=ja&gl=JP&has_verified=1&bpctr=9999999999`;
  const r = await httpGet(url, { headers: HEADERS_YT });
  if (!r.ok) return { ok: false, why: r.error || `HTTP ${r.status}` };
  if (/consent\.youtube\.com/.test(r.finalUrl || '')) return { ok: false, why: '同意画面に転送された（Cookie が効かない地域）' };
  const pr =
    extractJsonAfter(r.body, 'var ytInitialPlayerResponse = ') ||
    extractJsonAfter(r.body, 'ytInitialPlayerResponse = ') ||
    extractJsonAfter(r.body, 'window["ytInitialPlayerResponse"] = ');
  if (!pr) return { ok: false, why: 'ページの中に動画情報（ytInitialPlayerResponse）が見つからない', html: r.body };
  return { ok: true, pr, html: r.body };
}

async function fetchCaptions(track, tlang) {
  const base = track.baseUrl.startsWith('http') ? track.baseUrl : `https://www.youtube.com${track.baseUrl}`;
  const extra = tlang && tlang !== track.lang ? `&tlang=${encodeURIComponent(tlang)}` : '';
  for (const fmt of ['&fmt=json3', '']) {
    const r = await httpGet(`${base}${fmt}${extra}`, { headers: HEADERS_YT });
    if (!r.ok) {
      if (r.status === 429) return { ok: false, why: 'HTTP 429（YouTube が字幕の取得を制限。クラウドの IP で起きやすい）' };
      continue;
    }
    const lines = parseCaptionBody(r.body);
    if (lines.length) return { ok: true, lines, translated: Boolean(extra) };
  }
  return {
    ok: false,
    why: track.needsPoToken
      ? '字幕の取得に PO トークンが必要（このスクリプトでは取れない）'
      : '字幕の中身が空で返ってきた（ボット対策・地域制限の可能性）',
  };
}

async function downloadStoryboard(levels, out, sbMax) {
  const choice = chooseStoryboardLevel(levels, sbMax);
  if (!choice) return { ok: false, why: 'ストーリーボードが無い（ライブ・ごく短い動画など）' };
  const { lv, sheets, thinned } = choice;
  const dir = ensureDir(path.join(out, 'storyboard'));
  const rows = [];
  let fails = 0;
  for (const j of sheets) {
    const r = await httpGet(lv.url.replace('$M', String(j)), { as: 'buffer' });
    if (!r.ok || !/image\//.test(r.contentType) || r.body.length < 500) {
      fails++;
      if (fails >= 3 && rows.length === 0) return { ok: false, why: r.error || `HTTP ${r.status}（i.ytimg.com に届かない？）` };
      continue;
    }
    const file = `sb_${String(j).padStart(3, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), r.body);
    rows.push({ file, ...sheetRange(lv, j) });
  }
  if (!rows.length) return { ok: false, why: 'シートを 1 枚も取得できなかった' };
  const per = lv.frameDur != null ? `${Math.round(lv.frameDur * 10) / 10}秒` : '不明';
  const md = [
    '# ストーリーボード（縮小コマのシート）',
    '',
    `- 1 コマ ${lv.width}×${lv.height}px、1 枚に ${lv.cols}列×${lv.rows}行。**左上から右へ、行が終わったら次の行**の順に時間が進む`,
    `- 1 コマ = 約 ${per}${thinned ? `（シートが多いので ${sheets.length} 枚に間引き）` : ''}`,
    '- YouTube がシークバー用に作った縮小画像。色・構図・場面の移り変わり・テロップの有無はわかるが、細かい文字は読めない',
    '',
    '| ファイル | 時間帯 | コマ番号 |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.file} | ${r.label} | ${r.first}〜${r.last} |`),
  ].join('\n');
  writeText(path.join(dir, 'index.md'), md);
  return { ok: true, level: lv, sheets: rows.length, thinned, per };
}

async function downloadThumb(id, out) {
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const r = await httpGet(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { as: 'buffer' });
    if (r.ok && /image\//.test(r.contentType) && r.body.length > 2000) {
      fs.writeFileSync(path.join(out, 'thumbnail.jpg'), r.body);
      return { ok: true, name };
    }
    if (!r.ok && r.status === 0) return { ok: false, why: r.error };
  }
  return { ok: false, why: 'サムネイルが見つからない' };
}

// ───────────────────────── 環境チェック ─────────────────────────

async function checkEnv(target) {
  const id = parseVideoId(target || '')?.id || 'jNQXAC9IVRw';
  const rows = [];
  const add = (ok, item, detail) => rows.push(`${ok ? '✓' : '✗'} ${item} — ${detail}`);

  rows.push(`・Node ${process.version}${viaProxy() ? '（HTTPS_PROXY 経由で接続：クラウドの作業環境）' : ''}`);

  const oe = await getOEmbed(id);
  add(oe.ok, 'youtube.com（oEmbed）', oe.ok ? `OK：「${oe.data.title}」` : oe.why);
  if (oe.ok || !viaProxy()) {
    const wp = await getWatchPage(id);
    const ps = wp.pr?.playabilityStatus;
    add(
      wp.ok && (!ps || ps.status === 'OK'),
      'youtube.com（視聴ページ）',
      wp.ok ? `OK${ps && ps.status !== 'OK' ? `（再生状態 ${ps.status}：${ps.reason || ''}）` : ''}` : wp.why,
    );
  }
  const th = await httpGet(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, { as: 'buffer' });
  add(th.ok, 'i.ytimg.com（サムネイル・ストーリーボード）', th.ok ? 'OK' : th.error || `HTTP ${th.status}`);

  const key = findGeminiKey(SKILL_DIR);
  if (!key && !viaProxy()) {
    add(false, 'Gemini API', 'キーが見つからない（GEMINI_API_KEY を .env か環境変数に）');
  } else {
    // 動画の最初の 1 秒だけを見せる呼び出しで、キー・課金・YouTube の読み取りをまとめて確かめる
    // （文字だけの呼び出しは通っても、動画はクレジット切れで止まることがあるため。費用は 100 トークン前後）
    const headers = key ? { 'x-goog-api-key': key.key } : {};
    const g = await httpPostJson(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        contents: [
          {
            parts: [
              { fileData: { fileUri: `https://www.youtube.com/watch?v=${id}` }, videoMetadata: { startOffset: '0s', endOffset: '1s' } },
              { text: 'OK とだけ返して' },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 5, mediaResolution: 'MEDIA_RESOLUTION_LOW' },
      },
      { headers, timeoutMs: 120000 },
    );
    const from = key ? `キー：${key.from}` : 'キーはプロキシが付与';
    if (g.ok) add(true, 'Gemini API（動画の中身を丸ごと理解）', `OK（${from}）`);
    else {
      const msg = g.json?.error?.message || g.error || g.text?.slice(0, 120) || '';
      const hint =
        g.status === 402
          ? 'クレジット切れ → AI Studio（https://aistudio.google.com）で課金・チャージ'
          : g.status === 401 || g.status === 403
            ? 'キーが無効か API が無効'
            : g.status === 429
              ? '使用量の上限'
              : '';
      add(false, 'Gemini API', `HTTP ${g.status} ${hint} ${msg.slice(0, 160)}`.trim());
    }
  }

  const ytdlp =
    versionOf('yt-dlp') || versionOf('python3', ['-m', 'yt_dlp', '--version']) || versionOf('python', ['-m', 'yt_dlp', '--version']);
  add(Boolean(ytdlp), 'yt-dlp（字幕・動画の一時取得）', ytdlp ? `v${ytdlp}` : '未導入（references/methods.md の入れ方）');
  const deno = versionOf('deno');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(
    Boolean(deno) || nodeMajor >= 22,
    'JS ランタイム（yt-dlp が YouTube で使う）',
    deno || (nodeMajor >= 22 ? 'deno なし → node を使う（yt-dlp に --js-runtimes node）' : 'deno か Node 22 以上が必要'),
  );
  const ff = versionOf('ffmpeg', ['-hide_banner', '-version']);
  const drawtext = ff ? /drawtext/.test(run('ffmpeg', ['-hide_banner', '-filters']).stdout) : false;
  add(
    Boolean(ff),
    'ffmpeg（コマ抜き・音声）',
    ff ? `${ff.split(' ').slice(0, 3).join(' ')}${drawtext ? '' : '（drawtext なし：コマに時刻を焼き込めない）'}` : '未導入',
  );

  console.log(rows.join('\n'));
  if (viaProxy() && !oe.ok) {
    console.log(
      '\nYouTube に届かない：作業環境のネットワーク設定で次を許可してもらう（Custom → Allowed domains、既定のリストも含める）\n' +
        '  youtube.com / *.youtube.com / youtu.be / *.ytimg.com / *.googlevideo.com / youtubei.googleapis.com\n' +
        '  ※第三者のミラーやダウンロードサイトで迂回しない',
    );
  }
}

// ───────────────────────── 本体 ─────────────────────────

async function main() {
  if (args.check) return checkEnv(args._[0]);

  const vid = parseVideoId(args._[0]);
  if (!vid) {
    console.error('YouTube の URL か 11 文字の動画 ID を渡してください');
    process.exit(1);
  }
  const out = path.resolve(args.out || `yt_${vid.id}`);
  ensureDir(out);
  const watchUrl = `https://www.youtube.com/watch?v=${vid.id}`;
  const langs = String(args.lang || 'ja,en')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const sbMax = Math.max(1, Number(args['sb-max']) || 40);

  const meta = { id: vid.id, url: watchUrl, inputStart: vid.start, fetchedAt: new Date().toISOString() };
  const status = {};
  const files = [];

  // 1) oEmbed：タイトル・投稿者（いちばん壊れにくい）
  const oe = await getOEmbed(vid.id);
  status.oembed = oe.ok ? { ok: true } : { ok: false, why: oe.why };
  if (oe.ok) Object.assign(meta, { title: oe.data.title, author: oe.data.author_name, authorUrl: oe.data.author_url });

  // 2) 視聴ページ：概要欄・長さ・タグ・公開日・字幕一覧・ストーリーボード
  const wp = await getWatchPage(vid.id);
  let pr = null;
  if (wp.ok) {
    pr = wp.pr;
    const ps = pr.playabilityStatus || {};
    const vd = pr.videoDetails || {};
    const mf = pr.microformat?.playerMicroformatRenderer || {};
    status.watchPage = { ok: true, playability: ps.status || 'unknown' };
    Object.assign(meta, {
      title: meta.title || vd.title || mf.title?.simpleText,
      author: meta.author || vd.author || mf.ownerChannelName,
      channelId: vd.channelId || mf.externalChannelId,
      authorUrl: meta.authorUrl || mf.ownerProfileUrl,
      lengthSeconds: Number(vd.lengthSeconds || mf.lengthSeconds) || null,
      viewCount: Number(vd.viewCount || mf.viewCount) || null,
      keywords: vd.keywords || [],
      publishDate: mf.publishDate || null,
      uploadDate: mf.uploadDate || null,
      category: mf.category || null,
      isLive: Boolean(vd.isLiveContent),
      isUnlisted: Boolean(mf.isUnlisted),
      description: vd.shortDescription ?? mf.description?.simpleText ?? '',
      format: formatInfo(pr),
    });
    if (ps.status && ps.status !== 'OK') {
      status.watchPage.note =
        ps.status === 'LOGIN_REQUIRED'
          ? 'ログインかボット確認を求められた（年齢制限、またはクラウドの IP）。字幕・ストーリーボードが欠けることがある'
          : `再生できない状態（${ps.status}${ps.reason ? `：${ps.reason}` : ''}）`;
    }
  } else {
    status.watchPage = { ok: false, why: wp.why };
  }

  // 3) 概要欄・チャプター
  if (meta.description) {
    writeText(path.join(out, 'description.txt'), meta.description);
    files.push('description.txt');
  }
  let chapters = wp.html ? chaptersFromHtml(wp.html) : [];
  if (!chapters.length) chapters = chaptersFromDescription(meta.description);
  meta.chapters = chapters;

  // 4) 字幕
  const tracks = pr ? captionTracks(pr) : [];
  meta.captionTracks = tracks.map(({ baseUrl, ...t }) => t);
  if (!pr) status.captions = { ok: false, why: '視聴ページが読めないので字幕の一覧も無い' };
  else if (!tracks.length) status.captions = { ok: false, why: 'この動画には字幕が無い（ナレーションの無い動画も多い）' };
  else {
    const track = pickTrack(tracks, langs);
    const cap = await fetchCaptions(track, args.tlang);
    if (cap.ok) {
      const head = `# 字幕：${track.name}（${track.lang}${track.auto ? '・自動生成' : ''}${cap.translated ? `→${args.tlang} 自動翻訳` : ''}）`;
      writeText(path.join(out, 'transcript.txt'), [head, ...cap.lines.map((l) => `[${fmtTime(l.t)}] ${l.text}`)].join('\n'));
      files.push('transcript.txt');
      status.captions = { ok: true, track: `${track.lang}${track.auto ? '（自動生成）' : ''}`, lines: cap.lines.length };
    } else status.captions = { ok: false, why: cap.why };
  }

  // 5) サムネイル
  if (!args['no-thumb']) {
    const th = await downloadThumb(vid.id, out);
    status.thumbnail = th.ok ? { ok: true } : { ok: false, why: th.why };
    if (th.ok) files.push('thumbnail.jpg');
  }

  // 6) ストーリーボード
  if (!args['no-storyboard']) {
    if (!pr) status.storyboard = { ok: false, why: '視聴ページが読めないので場所が分からない' };
    else {
      const levels = parseStoryboardSpec(pr.storyboards?.playerStoryboardSpecRenderer?.spec, meta.lengthSeconds);
      const sb = await downloadStoryboard(levels, out, sbMax);
      status.storyboard = sb.ok
        ? { ok: true, sheets: sb.sheets, frame: `${sb.level.width}×${sb.level.height}`, every: sb.per, thinned: sb.thinned }
        : { ok: false, why: sb.why };
      if (sb.ok) {
        files.push('storyboard/index.md（シート画像 sb_*.jpg）');
        meta.vertical = sb.level.height > sb.level.width;
      }
    }
  }
  if (meta.format) meta.vertical = meta.format.height > meta.format.width;
  if (vid.shorts) meta.vertical = true;

  meta.status = status;
  writeJson(path.join(out, 'meta.json'), meta);

  // 7) まとめ（info.md）
  const md = [`# ${meta.title || '(タイトル不明)'}`, ''];
  md.push(`- URL: ${watchUrl}${vid.start ? `（指定の開始位置 ${fmtTime(vid.start)}）` : ''}`);
  if (meta.author) md.push(`- 投稿者: ${meta.author}${meta.authorUrl ? `（${meta.authorUrl}）` : ''}`);
  if (meta.publishDate) md.push(`- 公開日: ${meta.publishDate.slice(0, 10)}`);
  if (meta.lengthSeconds) md.push(`- 長さ: ${fmtTime(meta.lengthSeconds)}（${meta.lengthSeconds}秒）`);
  if (meta.viewCount) md.push(`- 再生回数: ${meta.viewCount.toLocaleString('ja-JP')}`);
  if (meta.category) md.push(`- カテゴリ: ${meta.category}`);
  if (meta.format) {
    md.push(`- 画面: ${meta.format.width}×${meta.format.height}・${meta.format.fps.join('/') || '?'}fps（${meta.vertical ? '縦長' : '横長'}）`);
  } else if (meta.vertical != null) md.push(`- 画面: ${meta.vertical ? '縦長' : '横長'}`);
  if (meta.isUnlisted) md.push('- 公開範囲: 限定公開（Gemini の URL 読み取りは公開動画のみ）');
  if (meta.keywords?.length) md.push(`- タグ: ${meta.keywords.join(' / ')}`);
  if (chapters.length) md.push('', '## チャプター', ...chapters.map((c) => `- ${fmtTime(c.start)} ${c.title}`));
  if (meta.description) {
    const head = meta.description.split(/\r?\n/).slice(0, 12).join('\n');
    md.push('', '## 概要欄（先頭。全文は description.txt）', '```', head, '```');
  }
  md.push('', '## 取れたもの・取れなかったもの');
  const label = {
    oembed: 'タイトル・投稿者（oEmbed）',
    watchPage: '概要欄・長さ・字幕一覧（視聴ページ）',
    captions: '字幕',
    thumbnail: 'サムネイル',
    storyboard: 'ストーリーボード（縮小コマ）',
  };
  for (const [k, v] of Object.entries(status)) {
    let detail = '';
    if (v.ok && k === 'captions') detail = `：${v.track}・${v.lines}行 → transcript.txt`;
    if (v.ok && k === 'storyboard') detail = `：${v.sheets}枚（1コマ ${v.frame}・約${v.every}ごと）→ storyboard/index.md`;
    if (v.ok && k === 'watchPage' && v.note) detail = `（注意：${v.note}）`;
    md.push(`- ${v.ok ? '✓' : '✗'} ${label[k] || k}${v.ok ? detail : `：${v.why}`}`);
  }
  if (meta.captionTracks.length) {
    md.push(`- 字幕の種類: ${meta.captionTracks.map((t) => `${t.lang}${t.auto ? '(自動)' : ''}`).join(', ')}`);
  }
  const next = [];
  if (!status.oembed.ok && !status.watchPage.ok) {
    next.push(
      viaProxy()
        ? 'YouTube に届いていない。作業環境のネットワーク設定で YouTube のドメインを許可してもらう（`--check` の案内）。急ぐなら Gemini（yt-gemini.mjs）で読む'
        : 'URL が正しいか・公開されているかを確かめる。ネットにつながっているかも確認',
    );
  }
  if (pr && tracks.length && !status.captions.ok) next.push('字幕は yt-dlp（`--write-subs --write-auto-subs`）か Gemini の transcript モードで取る');
  if (pr && !tracks.length) next.push('声の中身が要るなら Gemini の transcript モードで文字起こしする（字幕の無い動画）');
  next.push('映像の作り（カット割り・質感・音）まで要るなら yt-frames.mjs（コマ抜き）か yt-gemini.mjs --mode breakdown');
  md.push('', '## 次の手', ...next.map((s) => `- ${s}`));
  if (files.length) md.push('', '## ファイル', ...files.map((f) => `- ${f}`));
  writeText(path.join(out, 'info.md'), md.join('\n'));

  console.log(md.join('\n'));
  console.log(`\n保存先: ${out}`);
  if (args.json) console.log(JSON.stringify(meta));
}

main().catch((e) => {
  console.error(`予期しないエラー: ${e?.stack || e}`);
  process.exit(1);
});
