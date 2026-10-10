#!/usr/bin/env node
// 環境音を ffmpeg だけで合成する（権利の心配がない・ネット不要）。
// 本物の録音や Lyria の音には及ばないので、BGM の下に薄く敷く「空気」として使う。
//
// 使い方:
//   node gen-ambience.mjs <種類> [--dur 60] [--out audio/amb_rain.wav] [--seed 1]
//   node gen-ambience.mjs --list
//
// 種類：rain（雨）/ wind（風）/ waves（波）/ room（部屋の空気）/ crickets（秋の虫）/
//       cicada（蝉っぽいジー音）/ crossing（踏切の警報）/ chime（風鈴）/ clock（柱時計の秒針）/ hum（遠くの街のうなり）
import path from 'node:path';
import { parseArgs, ensureDir } from './lib/common.mjs';
import { ffmpeg, measureLoudness } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'list'] });
const PRESETS = {
  rain: '雨（ピンクノイズの帯域を整え、強弱をゆっくり揺らす）',
  wind: '風（ブラウンノイズを帯域で絞り、ゆっくり強弱）',
  waves: '波（低めのノイズが寄せては返す）',
  room: '部屋の空気（ごく小さな低いノイズ）',
  crickets: '秋の虫（高い音の短い鳴き声を何匹か重ねる）',
  cicada: '蝉っぽいジー音（高い帯域のノイズを細かく震わせる）',
  crossing: '踏切の警報（金属的な打音を交互に）',
  chime: '風鈴（高い倍音がときどき鳴る）',
  clock: '柱時計の秒針（1 秒ごとの小さなカチ）',
  hum: '遠くの街のうなり（低い持続音＋かすかな車の通過）',
};
if (args.help || args.list || !args._[0]) {
  console.log(Object.entries(PRESETS).map(([k, v]) => `${k.padEnd(9)} ${v}`).join('\n'));
  console.log('\nnode gen-ambience.mjs <種類> [--dur 60] [--out audio/amb_<種類>.wav] [--seed 1]');
  process.exit(args.help || args.list ? 0 : 1);
}
const kind = args._[0];
if (!PRESETS[kind]) {
  console.error(`種類は ${Object.keys(PRESETS).join(' / ')} のどれか`);
  process.exit(1);
}
const dur = Math.max(2, Number(args.dur) || 60);
const seed = Number(args.seed) || 1;
const out = path.resolve(args.out || `audio/amb_${kind}.wav`);
ensureDir(path.dirname(out));
const D = String(dur);
const ns = (c, a = 0.5) => ['-f', 'lavfi', '-i', `anoisesrc=c=${c}:a=${a}:d=${D}:r=48000:seed=${seed}`];
const ev = (expr) => ['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${D}`];
const st = 'aformat=channel_layouts=stereo';

// 各プリセット：[入力..., フィルタ]
const recipes = {
  rain: [[...ns('pink', 0.6)], `[0]highpass=f=350,lowpass=f=7000,volume='0.75+0.25*sin(2*PI*t*0.05)':eval=frame,aecho=0.8:0.6:40:0.25,${st}`],
  wind: [[...ns('brown', 0.9)], `[0]bandpass=f=450:width_type=o:w=1.6,volume='0.25+0.75*pow(0.5+0.5*sin(2*PI*t*0.07)*sin(2*PI*t*0.031+1),2)':eval=frame,${st}`],
  waves: [[...ns('brown', 0.9)], `[0]lowpass=f=1400,highpass=f=60,volume='0.12+0.88*pow(max(0,sin(2*PI*t/8.5)),3)':eval=frame,aecho=0.8:0.7:60:0.3,${st}`],
  room: [[...ns('brown', 0.15)], `[0]lowpass=f=500,highpass=f=40,${st}`],
  crickets: [
    [...ev(`0.4*sin(2*PI*4600*t)*gt(sin(2*PI*28*t),0)*gt(sin(2*PI*1.3*t),0.55)`), ...ev(`0.3*sin(2*PI*5200*t)*gt(sin(2*PI*34*t),0)*gt(sin(2*PI*0.9*t+2),0.6)`), ...ev(`0.25*sin(2*PI*4100*t)*gt(sin(2*PI*24*t),0)*gt(sin(2*PI*1.7*t+4),0.7)`)],
    `[0][1][2]amix=inputs=3:normalize=0,bandpass=f=4700:width_type=o:w=1.2,aecho=0.8:0.5:70:0.3,${st}`,
  ],
  cicada: [[...ns('white', 0.7)], `[0]bandpass=f=5200:width_type=o:w=0.8,volume='(0.55+0.45*sin(2*PI*t*95))*(0.6+0.4*sin(2*PI*t*0.12))':eval=frame,aecho=0.8:0.5:50:0.2,${st}`],
  crossing: [
    [...ev(`0.5*(sin(2*PI*720*t)+0.6*sin(2*PI*1685*t)+0.35*sin(2*PI*2710*t))*exp(-9*mod(t,0.55))*lt(mod(t,1.1),0.55)+0.5*(sin(2*PI*655*t)+0.6*sin(2*PI*1540*t)+0.35*sin(2*PI*2480*t))*exp(-9*mod(t-0.55,0.55))*gte(mod(t,1.1),0.55)`)],
    `[0]aecho=0.8:0.6:120:0.35,highpass=f=300,${st}`,
  ],
  chime: [
    [...ev(`0.35*(sin(2*PI*2240*t)+0.5*sin(2*PI*5120*t)+0.3*sin(2*PI*7630*t))*exp(-1.6*mod(t,3.1))+0.25*(sin(2*PI*2520*t)+0.5*sin(2*PI*5790*t))*exp(-1.8*mod(t+1.3,4.7))+0.2*(sin(2*PI*2010*t)+0.4*sin(2*PI*4730*t))*exp(-2*mod(t+2.2,6.3))`)],
    `[0]aecho=0.8:0.7:90:0.3,${st}`,
  ],
  clock: [[...ns('white', 0.9)], `[0]volume='exp(-180*mod(t,1))':eval=frame,bandpass=f=3200:width_type=o:w=1,aecho=0.8:0.5:30:0.2,${st}`],
  hum: [
    [...ns('brown', 0.5), ...ns('pink', 0.3)],
    `[0]lowpass=f=180,volume=1.2[a];[1]bandpass=f=900:width_type=o:w=2,volume='0.05+0.5*pow(max(0,sin(2*PI*t/23)),6)':eval=frame[b];[a][b]amix=inputs=2:normalize=0,${st}`,
  ],
};
const [inputs, graph] = recipes[kind];
// 最後に音量をそろえ（-30 LUFS 前後：BGM の下に敷く前提）、頭と尾を短くフェード
const fx = `${graph},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, dur - 1.5)}:d=1.5,loudnorm=I=-30:TP=-6:LRA=11[out]`;
ffmpeg([...inputs, '-filter_complex', fx, '-map', '[out]', '-ar', '48000', '-t', D, out], { label: `環境音（${kind}）` });
const l = measureLoudness(out);
console.log(`✓ ${out}（${PRESETS[kind]}・${dur}秒・${l.lufs} LUFS）`);
console.log('render の audio.ambience に入れ、gain は 0〜+6dB 前後から耳で調整（-30 LUFS で作ってあるので小さめ）');
