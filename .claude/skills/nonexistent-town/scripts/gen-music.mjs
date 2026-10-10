#!/usr/bin/env node
// Gemini（Lyria）で BGM を作る。歌なしのインスト曲にする指示を自動で足す。
//
// 使い方:
//   node gen-music.mjs <episode.json> [--force] [--model lyria-3.5] [--dry-run]
//     → episode.json の music.prompt から作り、audio.bgm.file に保存
//   node gen-music.mjs --prompt "…" --out audio/bgm.mp3 [--model …]
//
// モデル：lyria-3.5（既定・数分の曲）／lyria-3-pro-preview（数分の曲）／lyria-3-clip-preview（30 秒。ループ素材向き）
// できた曲は SynthID の透かし入り。使い方の条件は Google の利用規約に従う。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ensureDir, ensureProxy, writeText } from './lib/common.mjs';
import { API, geminiPost, readParts, extOf, isRawPcm, pcmToWav, rateFromMime, isFatal } from './lib/gemini.mjs';
import { ffmpeg, probe } from './lib/media.mjs';

ensureProxy();
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force', 'dry-run'] });
if (args.help || (!args._[0] && !args.prompt)) {
  console.log('node gen-music.mjs <episode.json> [--force] [--model lyria-3.5] [--dry-run]\nnode gen-music.mjs --prompt "…" --out audio/bgm.mp3');
  process.exit(args.help ? 0 : 1);
}

let prompt = args.prompt;
let out = args.out;
let model = args.model;
if (args._[0]) {
  const EP_FILE = path.resolve(args._[0]);
  const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
  prompt = prompt || ep.music?.prompt;
  model = model || ep.music?.model;
  out = out || (ep.audio?.bgm?.file ? path.resolve(path.dirname(EP_FILE), ep.audio.bgm.file) : null);
  if (!prompt || /^TODO/.test(prompt)) throw new Error('episode.json の music.prompt が空か TODO のままです');
  if (!out) throw new Error('episode.json に audio.bgm.file（保存先）がありません');
}
out = path.resolve(out || 'bgm.mp3');
model = model || 'lyria-3.5';
const fullPrompt = `${prompt}\n\nInstrumental only. No vocals, no singing, no lyrics, no spoken words. Smooth start and a gentle ending.`;

async function main() {
  if (fs.existsSync(out) && !args.force) {
    console.log(`もうあります：${out}（作り直すなら --force）`);
    return;
  }
  const bodies = [
    { contents: [{ role: 'user', parts: [{ text: fullPrompt }] }] },
    { contents: [{ role: 'user', parts: [{ text: fullPrompt }] }], generationConfig: { responseModalities: ['AUDIO'] } },
  ];
  if (args['dry-run']) {
    console.log(JSON.stringify({ model, body: bodies[0] }, null, 2));
    return;
  }
  console.log(`BGM を作っています（${model}）… 1〜2 分かかることがあります`);
  let last = null;
  for (const m of [model, ...(model === 'lyria-3.5' ? ['lyria-3-pro-preview'] : [])]) {
    for (const body of bodies) {
      const r = await geminiPost(`${API}/models/${encodeURIComponent(m)}:generateContent`, body, { timeoutMs: 600000, stream: true });
      if (r.ok) {
        const p = readParts(r.json);
        const a = p.media.find((x) => /^audio\//.test(x.mimeType));
        if (a) {
          ensureDir(path.dirname(out));
          const ext = extOf(a.mimeType);
          if (isRawPcm(a.mimeType)) a.data = pcmToWav(a.data, rateFromMime(a.mimeType, 48000), /channels=2|stereo/i.test(a.mimeType) ? 2 : 1);
          if (path.extname(out).toLowerCase() === ext) fs.writeFileSync(out, a.data);
          else {
            const tmp = `${out}.tmp${ext}`;
            fs.writeFileSync(tmp, a.data);
            ffmpeg(['-i', tmp, out], { label: '音声の形式変換' });
            fs.unlinkSync(tmp);
          }
          if (p.text) writeText(`${out}.txt`, p.text);
          const d = probe(out).duration;
          console.log(`✓ ${out}（${d.toFixed(1)}秒・${m}）`);
          console.log('ループさせるときは render の audio.bgm.loop を true のまま。つなぎ目が気になるなら fadeIn/fadeOut を長めに');
          return;
        }
        last = `音声が返ってこなかった（${p.finishReason}${p.text ? `：${p.text.slice(0, 160)}` : ''}）`;
        continue;
      }
      last = r.error;
      if (isFatal(r)) {
        console.error(last);
        process.exit(3);
      }
      if (r.status === 404) break; // 次のモデルへ
      if (!(r.status === 400 && /modalit|Unknown name|Invalid JSON|not supported/i.test(r.error))) {
        console.error(last);
        process.exit(3);
      }
    }
  }
  console.error(last || '不明なエラー');
  process.exit(3);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
