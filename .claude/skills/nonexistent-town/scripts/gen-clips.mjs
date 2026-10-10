#!/usr/bin/env node
// 画像を元に、Gemini の Veo で数秒の動画（AI 動画）を作る。参考動画の「静止画が少しだけ動く」画を作る工程。
// episode.json の場面のうち、video（保存先）・motion（動きの指示）・image（元の画像）がそろっていて、動画がまだ無いものを作る。
// 費用が大きいので、既定では 1 回に 3 本まで（--max で変える）。作る前に本数と秒数をユーザーに伝えて了承を取る。
//
// 使い方:
//   node gen-clips.mjs <episode.json> [--only c01_03,c02_03] [--max 3] [--force]
//                      [--model veo-3.1-fast-generate-preview] [--seconds 6] [--res 720p] [--dry-run]
//
// episode.json で使う項目：clipStyle（全体に足す指示）、clipModel / clipSeconds / clipResolution、
//   shots[].image・shots[].video・shots[].motion
// 動画には Veo が作った音（環境音など）も入る。render は場面の長さに切ってそのまま使う（使わないなら場面に "audio": false）
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ensureDir, ensureProxy } from './lib/common.mjs';
import { API, geminiPost, geminiGet, geminiDownload, isFatal } from './lib/gemini.mjs';
import { probe } from './lib/media.mjs';

ensureProxy();
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force', 'dry-run'] });
if (args.help || !args._[0]) {
  console.log('node gen-clips.mjs <episode.json> [--only c01_03] [--max 3] [--force] [--model …] [--seconds 6] [--res 720p] [--dry-run]');
  process.exit(args.help ? 0 : 1);
}

const EP_FILE = path.resolve(args._[0]);
const EP_DIR = path.dirname(EP_FILE);
const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
const model = args.model || ep.clipModel || 'veo-3.1-fast-generate-preview';
const seconds = Number(args.seconds || ep.clipSeconds || 6);
const res = args.res || ep.clipResolution || '720p';
const max = Math.max(1, Number(args.max) || 3);
const aspect = (ep.format?.height || 1080) > (ep.format?.width || 1920) ? '9:16' : '16:9';
const onlyList = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEG = 'text, letters, subtitles, captions, watermark, logo, brand names, distorted faces, extra limbs, morphing objects, fast camera movement, shaky camera, flicker';

function matchesOnly(file) {
  if (!onlyList) return true;
  const stem = path.parse(file).name;
  return onlyList.some((o) => o === file || o === path.basename(file) || o === stem);
}

function buildBody(s, variant) {
  const img = path.resolve(EP_DIR, s.image);
  const mime = /\.png$/i.test(img) ? 'image/png' : 'image/jpeg';
  const parameters = { aspectRatio: aspect, negativePrompt: NEG };
  if (variant !== 'minimal') {
    parameters.durationSeconds = seconds;
    parameters.resolution = res;
  }
  return {
    instances: [
      {
        prompt: [String(s.motion).trim().replace(/[.。]?$/, '.'), ep.clipStyle].filter(Boolean).join(' '),
        image: { bytesBase64Encoded: fs.readFileSync(img).toString('base64'), mimeType: mime },
      },
    ],
    parameters,
  };
}

/** 作り始めて、終わるまで待ち、動画を保存する */
async function makeClip(s) {
  const url = `${API}/models/${encodeURIComponent(model)}:predictLongRunning`;
  let op = null;
  let lastErr = null;
  for (const variant of ['full', 'minimal']) {
    const r = await geminiPost(url, buildBody(s, variant), { timeoutMs: 120000, tries: 2 });
    if (r.ok) {
      op = r.json;
      break;
    }
    if (isFatal(r)) return { error: r.error, fatal: true };
    lastErr = r.error;
    if (!(r.status === 400 && /duration|resolution|Unknown name|not supported|invalid/i.test(r.error))) break;
  }
  if (!op?.name) return { error: lastErr || '作り始められませんでした' };
  // 終わるまで待つ（ふつう 1〜5 分）
  const t0 = Date.now();
  let done = null;
  while (Date.now() - t0 < 15 * 60 * 1000) {
    await sleep(10000);
    const g = await geminiGet(op.name);
    if (!g.ok) continue;
    const j = JSON.parse(g.body);
    if (j.done) {
      done = j;
      break;
    }
    process.stdout.write('.');
  }
  if (!done) return { error: '15 分待っても終わりませんでした（あとで同じコマンドをもう一度）' };
  if (done.error) return { error: `作れませんでした：${done.error.message || JSON.stringify(done.error)}` };
  const resp = done.response?.generateVideoResponse || done.response || {};
  const sample = (resp.generatedSamples || resp.generatedVideos || [])[0];
  const uri = sample?.video?.uri;
  if (!uri) {
    const why = (resp.raiMediaFilteredReasons || []).join(' / ');
    return { error: `動画が返ってきませんでした${why ? `（安全フィルター：${why}）` : ''}` };
  }
  const dl = await geminiDownload(uri);
  if (!dl.ok || dl.body.length < 1000) {
    return { error: `ダウンロードできませんでした（${dl.error || `HTTP ${dl.status}`}）。クラウドの作業環境なら、URL のドメインを Allowed domains に足す必要があるかもしれません：${new URL(uri).host}` };
  }
  return { data: dl.body };
}

async function main() {
  const shots = (ep.shots || []).map((s, i) => ({ ...s, no: i + 1 })).filter((s) => s.video && s.motion && s.image);
  let todo = shots.filter((s) => matchesOnly(s.video)).filter((s) => args.force || onlyList || !fs.existsSync(path.resolve(EP_DIR, s.video)));
  if (!todo.length) {
    console.log('作る動画はありません（video・motion・image がそろった場面の動画は全部あります。作り直すなら --force か --only）');
    return;
  }
  const bad = todo.filter((s) => /^TODO/.test(String(s.motion)) || !fs.existsSync(path.resolve(EP_DIR, s.image)));
  if (bad.length) {
    console.error(`motion が TODO のまま、または元の画像が無い場面があります：${bad.map((s) => path.parse(s.video).name).join(', ')}`);
    process.exit(1);
  }
  const all = todo.length;
  if (todo.length > max) todo = todo.slice(0, max);
  console.log(`AI 動画を ${todo.length} 本作ります（${model}・${seconds}秒・${res}・${aspect}）${all > todo.length ? `／残り ${all - todo.length} 本は --max を上げて続きを` : ''}`);
  if (args['dry-run']) {
    const b = buildBody(todo[0], 'full');
    b.instances[0].image.bytesBase64Encoded = `<${b.instances[0].image.bytesBase64Encoded.length} bytes>`;
    console.log(JSON.stringify({ model, body: b }, null, 2));
    return;
  }
  let ok = 0;
  for (const s of todo) {
    const dest = path.resolve(EP_DIR, s.video);
    ensureDir(path.dirname(dest));
    process.stdout.write(`${path.relative(EP_DIR, dest)}（場面 ${s.no}） `);
    const out = await makeClip(s);
    if (!out.data) {
      console.log(` ✗ ${String(out.error).split('\n')[0]}`);
      if (out.fatal) {
        console.error(String(out.error));
        process.exit(3);
      }
      continue;
    }
    fs.writeFileSync(dest, out.data);
    const p = probe(dest);
    console.log(` ✓ ${p.duration.toFixed(1)}秒・${p.width}×${p.height}${p.hasAudio ? '・音あり' : ''}`);
    ok++;
  }
  console.log(`\n${ok} 本できました。必ず確かめる：yt-frames などでコマを抜くか、render の --draft で見る（形の崩れ・文字・急な動き・音の違和感）`);
  if (ok < todo.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
