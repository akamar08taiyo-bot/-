#!/usr/bin/env node
// Gemini に YouTube の URL を渡して、映像と音声の中身を読み取ってもらう。
// 動画はこちらでダウンロードしない（Google 側で見る）。公開動画だけ（限定公開・非公開は不可）。
// 費用の目安：低解像度（既定）で 1 秒あたり約 100 トークン（10 分で約 6 万トークン）。
//
// 使い方:
//   node yt-gemini.mjs <URL> [--mode summary|transcript|scenes|breakdown|ask] [--q "質問"]
//                      [--out <フォルダ>] [--model gemini-flash-latest] [--res low|medium|high]
//                      [--start 1:20] [--end 3:00] [--fps 1] [--prompt <プロンプトのファイル>]
//
//   summary    … 何の動画か・流れ・要点・雰囲気（既定）
//   transcript … 声の書き起こし（時刻・話者付き）＋画面の文字
//   scenes     … カットごとの表（映像・撮り方・質感・つなぎ・音）
//   breakdown  … 制作分析：同じ作り方で別の動画を作るための型・数値・手順
//   ask        … --q の質問に答える
//
// --out に yt-read.mjs の出力フォルダを指定すると、meta.json（タイトル・概要欄など）を前提情報として渡す。
// 結果は <out>/gemini-<mode>.md に保存し、画面にも出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureProxy,
  parseArgs,
  parseVideoId,
  parseTime,
  fmtTime,
  httpPostJson,
  writeText,
  ensureDir,
  findGeminiKey,
  viaProxy,
} from './lib/common.mjs';

ensureProxy();

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'dry-run'] });
const MODES = ['summary', 'transcript', 'scenes', 'breakdown', 'ask'];
const RES = { low: 'MEDIA_RESOLUTION_LOW', medium: 'MEDIA_RESOLUTION_MEDIUM', high: 'MEDIA_RESOLUTION_HIGH' };

if (args.help || !args._[0]) {
  console.log(
    'node yt-gemini.mjs <URL> [--mode summary|transcript|scenes|breakdown|ask] [--q "質問"] [--out <フォルダ>]\n' +
      '                  [--model gemini-flash-latest] [--res low|medium|high] [--start 1:20] [--end 3:00] [--fps 1]',
  );
  process.exit(args.help ? 0 : 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadContext(outDir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(outDir, 'meta.json'), 'utf8'));
    const lines = ['## 前提情報（視聴ページから取得済み。映像・音声で確かめること）'];
    if (m.title) lines.push(`- タイトル: ${m.title}`);
    if (m.author) lines.push(`- 投稿者: ${m.author}`);
    if (m.lengthSeconds) lines.push(`- 長さ: ${fmtTime(m.lengthSeconds)}`);
    if (m.chapters?.length) lines.push(`- チャプター: ${m.chapters.map((c) => `${fmtTime(c.start)} ${c.title}`).join(' / ')}`);
    if (m.description) lines.push(`- 概要欄（先頭）: ${m.description.slice(0, 600).replace(/\s+/g, ' ')}`);
    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

function explain(status, json, text) {
  const msg = json?.error?.message || text?.slice(0, 300) || '';
  if (status === 402) return `Gemini のクレジットが切れています。AI Studio（https://aistudio.google.com）でチャージしてください。\n${msg}`;
  if (status === 401 || status === 403) {
    return `API キーが無効か、Generative Language API が使えない設定です（キーの貼り間違い・制限付きキー）。\n${msg}`;
  }
  if (status === 404) return `モデルが見つかりません。--model で別のモデルを指定してください（例：gemini-flash-latest）。\n${msg}`;
  if (status === 429) {
    return `使用量の上限に達しました（無料枠は YouTube 動画 1 日 8 時間まで）。時間をおくか、課金を有効にしてください。\n${msg}`;
  }
  if (status === 400) {
    if (/private|unlisted|not\s*found|unavailable|could not|cannot be accessed|invalid.*(uri|url)/i.test(msg)) {
      return `動画を読めませんでした。公開動画か、URL が正しいかを確かめてください（限定公開・非公開・年齢制限・地域制限は不可）。\n${msg}`;
    }
    return `リクエストが不正です。\n${msg}`;
  }
  if (status === 0) {
    return `Gemini に届きません（${text}）。${viaProxy() ? '作業環境のネットワーク設定で generativelanguage.googleapis.com を許可してください。' : ''}`;
  }
  return `HTTP ${status}\n${msg}`;
}

async function main() {
  const vid = parseVideoId(args._[0]);
  if (!vid) {
    console.error('YouTube の URL か 11 文字の動画 ID を渡してください');
    process.exit(1);
  }
  const mode = String(args.mode || 'summary');
  if (!MODES.includes(mode)) {
    console.error(`--mode は ${MODES.join(' / ')} のどれか`);
    process.exit(1);
  }
  if (mode === 'ask' && !args.q) {
    console.error('--mode ask には --q "質問" が必要です');
    process.exit(1);
  }
  const out = path.resolve(args.out || `yt_${vid.id}`);
  ensureDir(out);
  const watchUrl = `https://www.youtube.com/watch?v=${vid.id}`;

  // プロンプト：references/prompts/<mode>.md（--prompt で差し替え可）＋前提情報
  let prompt;
  if (args.prompt) prompt = fs.readFileSync(path.resolve(args.prompt), 'utf8');
  else if (mode === 'ask') {
    prompt =
      'この YouTube 動画（映像・音声・画面の文字）を見て、次の質問に日本語で答えてください。' +
      '見ていない・聞いていないことは作らず、根拠になる時刻（分:秒）を添えてください。推測には（推測）と付けてください。\n\n' +
      `質問：${args.q}`;
  } else prompt = fs.readFileSync(path.join(SKILL_DIR, 'references', 'prompts', `${mode}.md`), 'utf8');
  const context = loadContext(out);
  prompt = prompt.replace('{{context}}', context);
  if (!prompt.includes(context)) prompt = `${context}\n\n${prompt}`.trim();

  // 範囲・fps
  const start = parseTime(args.start ?? (vid.start || null));
  const end = parseTime(args.end);
  const videoPart = { fileData: { fileUri: watchUrl } };
  const vm = {};
  if (start != null) vm.startOffset = `${Math.floor(start)}s`;
  if (end != null) vm.endOffset = `${Math.floor(end)}s`;
  if (args.fps) vm.fps = Number(args.fps);
  if (Object.keys(vm).length) videoPart.videoMetadata = vm;

  const model = String(args.model || 'gemini-flash-latest');
  const res = RES[String(args.res || 'low')] || RES.low;
  const body = {
    contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }],
    generationConfig: { temperature: mode === 'transcript' ? 0.1 : 0.3, mediaResolution: res },
  };

  if (args['dry-run']) {
    console.log(JSON.stringify({ model, body }, null, 2));
    return;
  }

  const key = findGeminiKey(SKILL_DIR);
  if (!key && !viaProxy()) {
    console.error(
      'Gemini の API キーが見つかりません。\n' +
        '- https://aistudio.google.com/apikey でキーを発行し、作業フォルダの .env に GEMINI_API_KEY=… と書いてもらう（チャットには貼らせない）\n' +
        '- ai-video-studio / motion-vault の .env にキーがあれば自動で使います',
    );
    process.exit(2);
  }
  const headers = key ? { 'x-goog-api-key': key.key } : {};
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const range = start != null || end != null ? `${fmtTime(start || 0)}〜${end != null ? fmtTime(end) : '最後'}` : '全体';
  console.error(`Gemini（${model}・${res.replace('MEDIA_RESOLUTION_', '').toLowerCase()}）で ${mode} を実行中… 範囲：${range}`);

  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await httpPostJson(url, body, { headers });
    if (r.ok) break;
    const retryable = r.status === 0 || r.status === 500 || r.status === 502 || r.status === 503 || r.status === 504 || (r.status === 429 && attempt === 0);
    if (!retryable || attempt === 2) break;
    await sleep(r.status === 429 ? 30000 : 8000);
  }
  if (!r.ok) {
    console.error(explain(r.status, r.json, r.error || r.text));
    process.exit(3);
  }

  const cand = r.json?.candidates?.[0];
  const textOut = (cand?.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  const finish = cand?.finishReason || r.json?.promptFeedback?.blockReason || 'UNKNOWN';
  if (!textOut) {
    const why =
      finish === 'RECITATION'
        ? '著作物の書き写しと判断されて止まりました。transcript ではなく summary / scenes / breakdown を使うか、範囲を短くしてください。'
        : finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT'
          ? '安全フィルターで止まりました。'
          : `空の応答でした（${finish}）。`;
    console.error(why);
    process.exit(4);
  }
  const u = r.json.usageMetadata || {};
  const header = [
    `<!-- Gemini ${mode} | model=${r.json.modelVersion || model} | 範囲=${range} | 入力 ${u.promptTokenCount ?? '?'} / 出力 ${u.candidatesTokenCount ?? '?'} トークン | ${new Date().toISOString()} -->`,
    `# Gemini ${mode}：${watchUrl}`,
    '',
  ].join('\n');
  const file = path.join(out, `gemini-${mode}.md`);
  writeText(file, `${header}${textOut}${finish !== 'STOP' ? `\n\n（注意：途中で止まった可能性があります：${finish}）` : ''}`);
  console.log(textOut);
  console.error(`\n保存先: ${file}（入力 ${u.promptTokenCount ?? '?'} トークン・出力 ${u.candidatesTokenCount ?? '?'} トークン）`);
}

main().catch((e) => {
  console.error(`予期しないエラー: ${e?.stack || e}`);
  process.exit(1);
});
