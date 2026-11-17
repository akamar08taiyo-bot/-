// BGM と効果音をコードだけで合成して public/audio/ に書き出す（素材サイト不要・権利フリー）。
//   node scripts/make-audio.mjs
// 場面の長さは src/schedule.js から読むので、選手データを変えたらこれを再実行する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BPM, CUES, FPS, FRAMES_PER_BAR, buildSchedule } from "../src/schedule.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { players } = JSON.parse(fs.readFileSync(path.join(root, "src/players.json"), "utf8"));
const schedule = buildSchedule(players);

const SR = 44100;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // 16分音符
const BAR = BEAT * 4;
const TOTAL = schedule.totalBars * BAR;
const frameToSec = (f) => f / FPS;

// ---------- 基本部品 ----------

let seed = 20261117;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rand() * 2 - 1;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const lpCoef = (hz) => 1 - Math.exp((-2 * Math.PI * hz) / SR);

const polyblep = (t, dt) => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

class Bus {
  constructor() {
    this.L = buf(TOTAL + 3);
    this.R = buf(TOTAL + 3);
  }
  add(time, mono, gain = 1, pan = 0) {
    const start = Math.round(time * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < mono.length; i++) {
      const j = start + i;
      if (j < 0 || j >= this.L.length) continue;
      this.L[j] += mono[i] * gl;
      this.R[j] += mono[i] * gr;
    }
  }
  mixInto(target, gain = 1) {
    for (let i = 0; i < this.L.length; i++) {
      target.L[i] += this.L[i] * gain;
      target.R[i] += this.R[i] * gain;
    }
  }
}

// ---------- 音色 ----------

const kick = () => {
  const out = buf(0.4);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (44 + 120 * Math.exp(-t / 0.028)) / SR;
    const body = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.13);
    const click = noise() * Math.exp(-t / 0.002) * 0.35;
    out[i] = Math.tanh((body + click) * 1.6);
  }
  return out;
};

const snare = (decay = 0.09) => {
  const out = buf(decay * 5);
  let lp = 0;
  const a = lpCoef(1400);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const n = noise();
    lp += a * (n - lp);
    const hiss = (n - lp) * Math.exp(-t / decay);
    const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.045) * 0.6;
    out[i] = hiss * 0.8 + tone;
  }
  return out;
};

const clap = () => {
  const out = buf(0.3);
  let lp = 0;
  const a = lpCoef(900);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const n = noise();
    lp += a * (n - lp);
    let env = Math.exp(-t / 0.09) * 0.5;
    for (const d of [0, 0.011, 0.022]) if (t >= d) env += Math.exp(-(t - d) / 0.006) * 0.5;
    out[i] = (n - lp) * env;
  }
  return out;
};

const hat = (open = false) => {
  const decay = open ? 0.11 : 0.022;
  const out = buf(decay * 6);
  let lp = 0;
  const a = lpCoef(7000);
  for (let i = 0; i < out.length; i++) {
    const n = noise();
    lp += a * (n - lp);
    out[i] = (n - lp) * Math.exp(-i / SR / decay);
  }
  return out;
};

const bass = (freq, dur) => {
  const out = buf(dur + 0.05);
  let phase = 0;
  let lp = 0;
  const dt = freq / SR;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase = (phase + dt) % 1;
    const saw = 2 * phase - 1 - polyblep(phase, dt);
    const sub = Math.sin(2 * Math.PI * freq * t);
    lp += lpCoef(180 + 900 * Math.exp(-t / 0.06)) * (saw - lp);
    const env = Math.min(1, t / 0.004) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.012));
    out[i] = (lp * 0.7 + sub * 0.8) * env;
  }
  return out;
};

// 和音のスタブ（少しずつ音程をずらしたノコギリ波を重ねる）
const stab = (notes, decay = 0.13, bright = 2600) => {
  const out = buf(decay * 5);
  const voices = notes.flatMap((n) =>
    [-9, 0, 8].map((cents) => ({ dt: (midi(n) * 2 ** (cents / 1200)) / SR, phase: rand() })),
  );
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const v of voices) {
      v.phase = (v.phase + v.dt) % 1;
      s += 2 * v.phase - 1 - polyblep(v.phase, v.dt);
    }
    lp += lpCoef(500 + bright * Math.exp(-t / 0.09)) * (s / voices.length - lp);
    out[i] = lp * Math.min(1, t / 0.003) * Math.exp(-t / decay);
  }
  return out;
};

const pluck = (freq, decay = 0.085) => {
  const out = buf(decay * 5);
  let phase = 0;
  let lp = 0;
  const dt = freq / SR;
  const a = lpCoef(4200);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase = (phase + dt) % 1;
    const pulse = (phase < 0.3 ? 1 : -1) + polyblep(phase, dt) - polyblep((phase + 0.7) % 1, dt);
    lp += a * (pulse - lp);
    out[i] = lp * Math.min(1, t / 0.002) * Math.exp(-t / decay);
  }
  return out;
};

const riser = (dur) => {
  const out = buf(dur);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    lp += lpCoef(250 * 40 ** p) * (noise() - lp);
    out[i] = lp * p * p;
  }
  return out;
};

const drone = (freq, dur) => {
  const out = buf(dur);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.3) * Math.min(1, (dur - t) / 0.08);
    out[i] = (Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(2 * Math.PI * freq * 2.005 * t)) * env;
  }
  return out;
};

const impact = (size = 1) => {
  const out = buf(1.6 * size);
  let phase = 0;
  let lp = 0;
  const a = lpCoef(520);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (30 + 60 * Math.exp(-t / 0.05)) / SR;
    const boom = Math.sin(2 * Math.PI * phase) * Math.exp(-t / (0.42 * size));
    lp += a * (noise() - lp);
    const dust = lp * Math.exp(-t / (0.22 * size)) * 1.4;
    const click = noise() * Math.exp(-t / 0.003) * 0.5;
    out[i] = Math.tanh((boom + dust + click) * 1.3);
  }
  return out;
};

const crash = (decay = 0.7) => {
  const out = buf(decay * 4);
  let lp = 0;
  const a = lpCoef(3500);
  for (let i = 0; i < out.length; i++) {
    const n = noise();
    lp += a * (n - lp);
    out[i] = (n - lp) * Math.exp(-i / SR / decay);
  }
  return out;
};

const whoosh = (dur = 0.34) => {
  const out = buf(dur);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    lp += lpCoef(400 + 5200 * Math.sin(Math.PI * p) ** 2) * (noise() - lp);
    out[i] = lp * Math.sin(Math.PI * p) ** 2;
  }
  return out;
};

const bell = (freq, decay = 0.38) => {
  const out = buf(decay * 5);
  const partials = [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.22],
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const [mult, amp] of partials) {
      s += Math.sin(2 * Math.PI * freq * mult * t) * amp * Math.exp((-t * mult ** 0.5) / decay);
    }
    out[i] = s * Math.min(1, t / 0.002);
  }
  return out;
};

const thud = () => {
  const out = buf(0.25);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (55 + 90 * Math.exp(-t / 0.02)) / SR;
    out[i] = Math.tanh(
      (Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.07) + noise() * Math.exp(-t / 0.004) * 0.6) * 1.4,
    );
  }
  return out;
};

const blip = (freq) => {
  const out = buf(0.06);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.014);
  }
  return out;
};

// ---------- BGM ----------

// Am → F → C → G（1小節ずつ）。[ベース, 和音3声]
const CHORDS = [
  { bass: 33, notes: [57, 60, 64] },
  { bass: 29, notes: [53, 57, 60] },
  { bass: 36, notes: [55, 60, 64] },
  { bass: 31, notes: [55, 59, 62] },
];
const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const STAB_STEPS = [0, 3, 6, 10, 12];
const ARP_ORDER = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];

const drums = new Bus();
const music = new Bus();
const arp = new Bus();
const kickTimes = [];

const groove = (barIndex, { energy = 1, lastBar = false } = {}) => {
  const t0 = barIndex * BAR;
  const chord = CHORDS[barIndex % CHORDS.length];
  const steps = lastBar ? 8 : 16;

  for (let s = 0; s < steps; s++) {
    const t = t0 + s * STEP;
    if (s % 4 === 0) {
      drums.add(t, kick(), 0.95);
      kickTimes.push(t);
    }
    if (s % 8 === 4) drums.add(t, clap(), 0.5, 0.05);
    if (s % 4 === 2) drums.add(t, hat(s === 14 && barIndex % 2 === 1), 0.2, 0.25);
    else if (s % 2 === 1) drums.add(t, hat(), 0.07, -0.25);

    if (BASS_STEPS.includes(s)) music.add(t, bass(midi(chord.bass), STEP * 1.3), 0.42);
    if (STAB_STEPS.includes(s)) music.add(t, stab(chord.notes), 0.3 * energy, s % 8 === 0 ? -0.2 : 0.2);

    const note = chord.notes[ARP_ORDER[s]] + (energy > 1 ? 24 : 12);
    arp.add(t, pluck(midi(note)), (s % 4 === 0 ? 0.2 : 0.13) * energy, s % 2 ? 0.35 : -0.35);
  }

  if (lastBar) {
    // 最後は和音を鳴らして締める
    const t = t0 + 8 * STEP;
    drums.add(t, kick(), 0.95);
    drums.add(t, crash(0.5), 0.3);
    music.add(t, stab([45, 57, 60, 64, 69], 0.4, 4200), 0.6);
    music.add(t, bass(midi(33), 0.5), 0.5);
  }
};

for (const scene of schedule.scenes) {
  for (let b = 0; b < scene.bars; b++) {
    const bar = scene.startBar + b;
    const t0 = bar * BAR;

    if (scene.type === "intro") {
      // 1小節目：拍ごとに和音だけ。2小節目：スネアで本編へ駆け上がる
      if (b === 0) {
        for (let beat = 0; beat < 4; beat++) {
          music.add(t0 + beat * BEAT, stab(CHORDS[0].notes.concat(45), 0.2, 3600), 0.5);
          music.add(t0 + beat * BEAT, bass(midi(33), 0.16), 0.4);
        }
      } else {
        for (let s = 0; s < 16; s++) {
          const dense = s >= 8 || s % 2 === 0;
          if (dense) drums.add(t0 + s * STEP, snare(0.05), 0.2 + 0.3 * (s / 15), 0);
        }
        drums.add(t0, riser(BAR), 0.5);
        music.add(t0, drone(midi(33), BAR), 0.3);
      }
    } else if (scene.type === "top" && b === 0) {
      // 1位の前の溜め。太鼓は効果音側（sfx.wav）に入れてある
      music.add(t0, drone(midi(33), BAR), 0.4);
      music.add(t0, drone(midi(45), BAR), 0.15);
    } else {
      const isLastBar = scene.type === "board" && b === scene.bars - 1;
      groove(bar, { energy: scene.type === "top" ? 1.35 : 1, lastBar: isLastBar });
      if (b === 0 && (scene.type === "top" ? false : scene.startBar % 4 === 2)) {
        drums.add(t0, crash(0.45), 0.16, -0.2);
      }
    }
  }
}

// キックが鳴る瞬間だけ和音とベースを引っ込める（サイドチェイン）
const duck = new Float32Array(music.L.length).fill(1);
for (const t of kickTimes) {
  const start = Math.round(t * SR);
  for (let i = 0; i < SR * 0.3 && start + i < duck.length; i++) {
    duck[start + i] = Math.min(duck[start + i], 1 - 0.65 * Math.exp(-i / SR / 0.09));
  }
}
for (let i = 0; i < duck.length; i++) {
  music.L[i] *= duck[i];
  music.R[i] *= duck[i];
  arp.L[i] *= duck[i];
  arp.R[i] *= duck[i];
}

// アルペジオに左右へ跳ねるディレイをかける
const delaySamples = Math.round(STEP * 3 * SR);
for (let i = delaySamples; i < arp.L.length; i++) {
  arp.L[i] += arp.R[i - delaySamples] * 0.34;
  arp.R[i] += arp.L[i - delaySamples] * 0.34;
}

const bgm = new Bus();
drums.mixInto(bgm, 1);
music.mixInto(bgm, 1);
arp.mixInto(bgm, 1);

// ---------- 効果音 ----------

const sfx = new Bus();

for (const scene of schedule.scenes) {
  const t0 = scene.startBar * BAR;
  const at = (frame) => t0 + frameToSec(frame);

  if (scene.type !== "intro") {
    sfx.add(t0 - 0.26, whoosh(), 0.5, -0.1);
    if (scene.type !== "top") sfx.add(t0, impact(scene.type === "board" ? 0.8 : 0.7), 0.6);
  }

  if (scene.type === "intro") {
    CUES.intro.stamps.forEach((frame, i) => {
      const last = i === CUES.intro.stamps.length - 1;
      sfx.add(at(frame), last ? impact(0.8) : thud(), last ? 0.75 : 0.6);
    });
    sfx.add(at(CUES.intro.hook) - 0.2, whoosh(0.3), 0.35, 0.2);
  }

  if (scene.type === "single") {
    sfx.add(at(CUES.single.countEnd), bell(1320), 0.3, 0.15);
  }

  if (scene.type === "tie") {
    scene.players.forEach((_, i) => {
      const card = CUES.tie.firstCard + i * CUES.tie.cardGap;
      sfx.add(at(card) - 0.12, whoosh(0.22), 0.3, i ? 0.3 : -0.3);
      sfx.add(at(card), thud(), 0.4);
      sfx.add(at(card + CUES.tie.countDelay + CUES.tie.countLength), bell(1320), 0.3, 0.15);
    });
  }

  if (scene.type === "top") {
    const reveal = frameToSec(CUES.top.reveal);
    // 溜め：太鼓がだんだん細かくなる
    sfx.add(t0, thud(), 0.5);
    for (let t = 0; t < reveal - 0.01; ) {
      const p = t / reveal;
      sfx.add(t0 + t, snare(0.04), 0.1 + 0.45 * p * p, (rand() - 0.5) * 0.3);
      t += p < 0.4 ? STEP : p < 0.75 ? STEP / 2 : STEP / 3;
    }
    sfx.add(t0, riser(reveal), 0.7);
    // 発表
    sfx.add(at(CUES.top.reveal), impact(1.2), 0.95);
    sfx.add(at(CUES.top.reveal), crash(0.9), 0.4);
    [69, 73, 76, 81].forEach((n, i) => {
      sfx.add(at(CUES.top.reveal) + i * 0.07, bell(midi(n) * 2, 0.5), 0.2, (i - 1.5) * 0.3);
    });
    sfx.add(at(CUES.top.countEnd), bell(1760, 0.5), 0.34);
    sfx.add(at(CUES.top.callout), thud(), 0.55);
    sfx.add(at(CUES.top.callout), bell(880, 0.3), 0.2);
  }

  if (scene.type === "board") {
    scene.players.forEach((_, i) => {
      sfx.add(at(CUES.board.firstRow + i * CUES.board.rowGap), blip(900 + i * 60), 0.16, -0.4 + i * 0.08);
    });
    sfx.add(at(CUES.board.cta), thud(), 0.45);
    sfx.add(at(CUES.board.cta), bell(1320), 0.26);
  }
}

// 効果音が大きく鳴る瞬間は BGM を下げる（ドンという音が埋もれず、音割れもしない）
{
  let peak = 0;
  for (let i = 0; i < sfx.L.length; i++) peak = Math.max(peak, Math.abs(sfx.L[i]), Math.abs(sfx.R[i]));
  const release = Math.exp(-1 / (0.18 * SR));
  const smooth = lpCoef(250);
  let env = 0;
  let gain = 1;
  for (let i = 0; i < bgm.L.length; i++) {
    env = Math.max(Math.abs(sfx.L[i]), Math.abs(sfx.R[i]), env * release);
    const target = 1 - 0.62 * Math.min(1, (env / peak) * 1.6);
    gain += smooth * (target - gain);
    bgm.L[i] *= gain;
    bgm.R[i] *= gain;
  }
}

// ---------- 書き出し ----------

const writeWav = (file, bus, peakTarget) => {
  const n = Math.round(TOTAL * SR);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    bus.L[i] = Math.tanh(bus.L[i] * 1.1);
    bus.R[i] = Math.tanh(bus.R[i] * 1.1);
    peak = Math.max(peak, Math.abs(bus.L[i]), Math.abs(bus.R[i]));
  }
  const gain = peakTarget / peak;
  // 最後の 0.15 秒はフェードアウト（ループ再生でプチッと鳴らないように）
  const fade = Math.round(0.15 * SR);

  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const f = gain * Math.min(1, (n - i) / fade);
    data.writeInt16LE(Math.round(bus.L[i] * f * 32767), i * 4);
    data.writeInt16LE(Math.round(bus.R[i] * f * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  const out = path.join(root, "public/audio", file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([header, data]));
  console.log(`${file}  ${TOTAL.toFixed(2)}s  ${(data.length / 1e6).toFixed(1)}MB`);
};

writeWav("bgm.wav", bgm, 0.89);
writeWav("sfx.wav", sfx, 0.89);
console.log(
  `scenes: ${schedule.scenes.map((s) => `${s.id}(${s.bars})`).join(" ")} / ${schedule.durationInFrames} frames @ ${FPS}fps (${FRAMES_PER_BAR} per bar)`,
);
