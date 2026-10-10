#!/usr/bin/env node
// episode.json の各場面の prompt から、Gemini（Nano Banana）で画像を作る。
// まだ無い画像だけ作る（--force で作り直し、--only で画像の番号やファイル名を指定）。
//
// 使い方:
//   node gen-images.mjs <episode.json> [--only c01_01,c01_02] [--force] [--variants 2] [--model gemini-3.1-flash-image]
//                       [--aspect 16:9] [--size 2K] [--dry-run]
//   --only は画像ファイルの名前で指定する（images/c01_02.png なら c01_02、images/005.png なら 005 か 5）。場面の番号ではない
//
// episode.json で使う項目（詳しくは references/episode-schema.md）:
//   imageStyle  : 全カット共通の画風（スタイル設計書から）
//   imageRefs   : 絵柄をそろえる参照画像（最初に気に入った 1〜2 枚など）
//   imageModel / imageAspect / imageSize
//   shots[].image  : 保存先（例 images/003.png）
//   shots[].prompt : その場面の中身（何が・どこに・時間帯・天気・構図）
//   shots[].refs   : その場面だけの参照画像
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ensureDir, ensureProxy } from './lib/common.mjs';
import { API, geminiPost, readParts, extOf, isFatal } from './lib/gemini.mjs';
import { ffmpeg } from './lib/media.mjs';

ensureProxy();
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force', 'dry-run'] });
if (args.help || !args._[0]) {
  console.log('node gen-images.mjs <episode.json> [--only c01_01,c01_02] [--force] [--variants 2] [--model …] [--aspect 16:9] [--size 2K] [--dry-run]');
  process.exit(args.help ? 0 : 1);
}

const EP_FILE = path.resolve(args._[0]);
const EP_DIR = path.dirname(EP_FILE);
const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
const model = args.model || ep.imageModel || 'gemini-3.1-flash-image';
const aspect = args.aspect || ep.imageAspect || ((ep.format?.height || 1080) > (ep.format?.width || 1920) ? '9:16' : '16:9');
const size = args.size || ep.imageSize || '2K';
const variants = Math.max(1, Number(args.variants) || 1);
const onlyList = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;

/** --only の 1 項目が、この画像（images/005.png）に当たるか：005・5・005.png・images/005.png のどれでも */
function matchesOnly(file) {
  if (!onlyList) return true;
  const base = path.basename(file);
  const stem = path.parse(file).name;
  return onlyList.some((o) => o === file || o === base || o === stem || (/^\d+$/.test(o) && /^\d+$/.test(stem) && Number(o) === Number(stem)));
}

// どの画像にも付ける決まり（文字・ロゴ・実在の場所を出さない、実在の人物に似せない）
const RULES = [
  'Constraints: a fictional place that does not exist; do not depict any real landmark, real station name, or real town.',
  'No readable text anywhere: no letters, no signage words, no numbers, no logos, no brand names, no watermarks, no captions. Signs and posters, if any, are blank or unreadable.',
  'People must not resemble any real person or celebrity. Prefer people at a distance, from behind, or in profile.',
  'No frames, borders, split panels or collage. One single continuous photograph-like scene.',
].join('\n');

const mimeOf = (f) => (/\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg');
function refPart(p) {
  const f = path.resolve(EP_DIR, p);
  if (!fs.existsSync(f)) throw new Error(`参照画像が見つかりません：${p}`);
  return { inlineData: { mimeType: mimeOf(f), data: fs.readFileSync(f).toString('base64') } };
}

function buildBody(shot, mode) {
  const refs = [...(ep.imageRefs || []), ...(shot.refs || [])];
  const lines = [];
  if (refs.length) lines.push('Match the look of the reference image(s): same color grading, film texture, lens, era and atmosphere. Do not copy their exact composition.');
  if (ep.imageStyle) lines.push(`Style: ${ep.imageStyle}`);
  lines.push(`Scene: ${shot.prompt}`);
  if (mode === 'no-config') lines.push(`Aspect ratio: ${aspect} (${aspect === '9:16' ? 'vertical' : 'horizontal'} framing).`);
  lines.push(RULES);
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  if (mode === 'full') generationConfig.imageConfig = { aspectRatio: aspect, imageSize: size };
  if (mode === 'no-size') generationConfig.imageConfig = { aspectRatio: aspect };
  return {
    contents: [{ role: 'user', parts: [...refs.map(refPart), { text: lines.join('\n\n') }] }],
    generationConfig,
  };
}

/** API の違い（imageSize 非対応など）に合わせて書き方を変えながら試す。結果は { img } か { error, fatal } */
async function generate(shot) {
  const url = `${API}/models/${encodeURIComponent(model)}:generateContent`;
  let last = null;
  for (const mode of ['full', 'no-size', 'no-config']) {
    const r = await geminiPost(url, buildBody(shot, mode), { timeoutMs: 300000, stream: true });
    if (r.ok) {
      const parts = readParts(r.json);
      const img = parts.media.find((m) => /^image\//.test(m.mimeType));
      if (img) return { img, mode };
      last = `画像が返ってこなかった（${parts.finishReason}${parts.text ? `：${parts.text.slice(0, 200)}` : ''}）`;
      if (/SAFETY|PROHIBITED|IMAGE_SAFETY|RECITATION|OTHER/.test(parts.finishReason)) break;
      continue;
    }
    if (isFatal(r)) return { error: r.error, fatal: true };
    last = r.error;
    // 書き方の問題（400 で項目名に触れている）なら次の書き方へ。それ以外はやめる
    if (!(r.status === 400 && /image_?config|image_?size|aspect|Unknown name|Invalid JSON|not supported/i.test(r.error))) break;
  }
  return { error: last || '不明なエラー' };
}

async function main() {
  const shots = (ep.shots || []).map((s, i) => ({ ...s, no: i + 1 })).filter((s) => s.image && s.prompt);
  const todo = shots.filter((s) => matchesOnly(s.image)).filter((s) => args.force || onlyList || !fs.existsSync(path.resolve(EP_DIR, s.image)));
  if (!todo.length) {
    console.log(onlyList ? `--only ${onlyList.join(',')} に当たる画像がありません（ファイル名で指定：images/c01_02.png なら c01_02）` : '作る画像はありません（全部そろっています。作り直すなら --force か --only）');
    return;
  }
  const todoPrompts = todo.filter((s) => /^TODO/.test(String(s.prompt)));
  if (todoPrompts.length) {
    console.error(`prompt が TODO のままです：${todoPrompts.map((s) => s.image).join(', ')}`);
    process.exit(1);
  }
  console.log(`${todo.length} 枚 × ${variants} 案を作ります（${model}・${aspect}・${size}）：${todo.map((s) => path.parse(s.image).name).join(', ')}`);
  if (args['dry-run']) {
    const b = buildBody(todo[0], 'full');
    b.contents[0].parts = b.contents[0].parts.map((p) => (p.inlineData ? { inlineData: { mimeType: p.inlineData.mimeType, data: `<${p.inlineData.data.length} bytes>` } } : p));
    console.log(JSON.stringify({ model, body: b }, null, 2));
    return;
  }
  const log = path.join(EP_DIR, 'images', 'prompts.log.jsonl');
  ensureDir(path.dirname(log));
  let ok = 0;
  for (const s of todo) {
    const target = path.resolve(EP_DIR, s.image);
    ensureDir(path.dirname(target));
    for (let v = 1; v <= variants; v++) {
      const dest = variants > 1 ? target.replace(/(\.\w+)$/, `_v${v}$1`) : target;
      process.stdout.write(`${path.relative(EP_DIR, dest)}（場面 ${s.no}） … `);
      const res = await generate(s);
      if (!res.img) {
        console.log(`✗ ${String(res.error).split('\n')[0]}`);
        if (res.fatal) {
          console.error(String(res.error));
          process.exit(3);
        }
        continue;
      }
      const ext = extOf(res.img.mimeType);
      if (path.extname(dest).toLowerCase() === ext || (ext === '.jpg' && /\.jpe?g$/i.test(dest))) fs.writeFileSync(dest, res.img.data);
      else {
        const tmp = `${dest}.tmp${ext}`;
        fs.writeFileSync(tmp, res.img.data);
        ffmpeg(['-i', tmp, dest], { label: '画像の形式変換' });
        fs.unlinkSync(tmp);
      }
      fs.appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), shot: s.no, file: path.relative(EP_DIR, dest), model, aspect, size, mode: res.mode, prompt: s.prompt })}\n`);
      console.log(`✓${res.mode !== 'full' ? `（${res.mode}）` : ''}`);
      ok++;
    }
  }
  console.log(`\n${ok} 枚できました。必ず Read で 1 枚ずつ見て、文字・ロゴ・実在の場所っぽさ・崩れ・絵柄のばらつきを確認する（references/image-prompts.md の確認項目）`);
  if (ok < todo.length * variants) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
