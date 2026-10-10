#!/usr/bin/env node
// episode.json の audio.voice[] の text を、Gemini TTS で 1 行ずつ WAV にする（前後の無音は削る）。
// まだ無いファイルだけ作る（--force で作り直し、--only v03 で 1 行だけ）。
//
// 使い方:
//   node gen-voice.mjs <episode.json> [--only v03,v05] [--force] [--voice Achernar] [--model gemini-3.8-flash-tts] [--dry-run]
//
// episode.json で使う項目（詳しくは references/episode-schema.md）:
//   narration.voice    : 声の名前（既定 Achernar。落ち着いた候補：Achernar / Vindemiatrix / Sulafat / Enceladus / Gacrux）
//   narration.style    : 読み方の指示（例：静かに、思い出をたどるように、少しゆっくり）
//   narration.model    : 既定 gemini-3.8-flash-tts
//   audio.voice[].file : 保存先（例 voice/v03.wav）
//   audio.voice[].text : 字幕にも使う文
//   audio.voice[].speak: 読み上げ用の文（読み違えやすい地名をかなにする等。無ければ text）
//   audio.voice[].style: その行だけの読み方
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, ensureDir, ensureProxy } from './lib/common.mjs';
import { API, geminiPost, readParts, pcmToWav, rateFromMime, isFatal } from './lib/gemini.mjs';
import { ffmpeg, probe } from './lib/media.mjs';

ensureProxy();
const args = parseArgs(process.argv.slice(2), { flags: ['help', 'force', 'dry-run'] });
if (args.help || !args._[0]) {
  console.log('node gen-voice.mjs <episode.json> [--only v03] [--force] [--voice 名前] [--model …] [--dry-run]');
  process.exit(args.help ? 0 : 1);
}

const EP_FILE = path.resolve(args._[0]);
const EP_DIR = path.dirname(EP_FILE);
const ep = JSON.parse(fs.readFileSync(EP_FILE, 'utf8'));
const nar = { voice: 'Achernar', model: 'gemini-3.8-flash-tts', language: 'ja-JP', style: '静かに、思い出をたどるように、少しゆっくり読んでください', ...(ep.narration || {}) };
const voice = args.voice || nar.voice;
const model = args.model || nar.model;
const only = args.only ? new Set(String(args.only).split(',').map((s) => s.trim())) : null;

const idOf = (v, i) => v.id || path.parse(v.file || `v${String(i + 1).padStart(2, '0')}`).name;

function buildBody(line, mode) {
  const say = (line.speak || line.text || '').replace(/\*\*/g, '');
  const style = line.style || nar.style;
  const speechConfig = {};
  if (mode === 'prebuilt' || mode === 'prebuilt-nolang') speechConfig.voiceConfig = { prebuiltVoiceConfig: { voiceName: voice } };
  if (mode === 'voice') speechConfig.voiceConfig = { voice };
  if (mode !== 'prebuilt-nolang') speechConfig.languageCode = nar.language;
  return {
    contents: [{ role: 'user', parts: [{ text: style ? `${style}：\n${say}` : say }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig },
  };
}

async function synth(line) {
  const url = `${API}/models/${encodeURIComponent(model)}:generateContent`;
  let last = null;
  for (const mode of ['prebuilt', 'prebuilt-nolang', 'voice']) {
    const r = await geminiPost(url, buildBody(line, mode), { timeoutMs: 180000, stream: true });
    if (r.ok) {
      const p = readParts(r.json);
      const a = p.media.find((m) => /^audio\//.test(m.mimeType));
      if (a) return { audio: a, mode };
      last = `音声が返ってこなかった（${p.finishReason}）`;
      continue;
    }
    if (isFatal(r)) return { error: r.error, fatal: true };
    last = r.error;
    if (!(r.status === 400 && /voice|language|speech_?config|Unknown name|Invalid JSON|not supported/i.test(r.error))) break;
  }
  return { error: last || '不明なエラー' };
}

async function main() {
  const lines = (ep.audio?.voice || []).map((v, i) => ({ ...v, id: idOf(v, i), i })).filter((v) => v.file && (v.text || v.speak));
  const todo = lines.filter((v) => (only ? only.has(v.id) : true)).filter((v) => args.force || only || !fs.existsSync(path.resolve(EP_DIR, v.file)));
  if (!todo.length) {
    console.log('作る声はありません（全部そろっています。作り直すなら --force か --only）');
    return;
  }
  const todoText = todo.filter((v) => /^TODO/.test(String(v.speak || v.text)));
  if (todoText.length) {
    console.error(`text が TODO のままです：${todoText.map((v) => v.id).join(', ')}`);
    process.exit(1);
  }
  console.log(`${todo.length} 行を合成します（${model}・声 ${voice}）`);
  if (args['dry-run']) {
    console.log(JSON.stringify({ model, body: buildBody(todo[0], 'prebuilt') }, null, 2));
    return;
  }
  let ok = 0;
  for (const v of todo) {
    const dest = path.resolve(EP_DIR, v.file);
    ensureDir(path.dirname(dest));
    process.stdout.write(`${v.id}：${(v.text || v.speak).slice(0, 24)}… `);
    try {
      const res = await synth(v);
      if (!res.audio) {
        console.log(`✗ ${String(res.error).split('\n')[0]}`);
        if (res.fatal) {
          console.error(String(res.error));
          process.exit(3);
        }
        continue;
      }
      const { audio } = res;
      const raw = `${dest}.raw.wav`;
      const isWav = /wav/i.test(audio.mimeType) && !/l16|pcm/i.test(audio.mimeType);
      fs.writeFileSync(raw, isWav ? audio.data : pcmToWav(audio.data, rateFromMime(audio.mimeType)));
      // 頭とお尻の無音を削る（間は台本の at で作る）
      ffmpeg(
        ['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse', '-ar', '48000', dest],
        { label: '無音の削除' },
      );
      fs.unlinkSync(raw);
      const d = probe(dest).duration;
      // 日本語の語りは 1 秒に 6〜8 文字くらい。長すぎるときは指示文まで読んだ可能性
      const chars = (v.speak || v.text).replace(/[\s、。「」・…！？!?,.]/g, '').length;
      const warn = d > Math.max(3, (chars / 4) * 1.6) ? '（長すぎる：指示文まで読み上げていないか確認）' : '';
      console.log(`✓ ${d.toFixed(1)}秒 ${warn}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${String(e.message || e).split('\n')[0]}`);
    }
  }
  console.log(`\n${ok} 行できました。読み間違い（地名・数字）は耳で確認してもらう。直すときは speak をかなにして --only <id>`);
  if (ok < todo.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
