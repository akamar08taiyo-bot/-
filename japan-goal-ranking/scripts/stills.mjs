// 確認用：指定したフレームの静止画を out/stills/ に書き出す。
//   node scripts/stills.mjs            … 各場面の見どころを自動で選ぶ
//   node scripts/stills.mjs 150 912    … フレーム番号を指定
// 書き出しに使うブラウザを指定したいときは環境変数 REMOTION_BROWSER にパスを入れる。

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUES, buildSchedule } from "../src/schedule.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { players } = JSON.parse(fs.readFileSync(path.join(root, "src/players.json"), "utf8"));
const schedule = buildSchedule(players);
const browserExecutable = process.env.REMOTION_BROWSER || undefined;

let frames = process.argv.slice(2).map(Number);
if (frames.length === 0) {
  frames = schedule.scenes.flatMap((s) => {
    if (s.type === "top") return [s.from + CUES.top.reveal - 8, s.from + s.durationInFrames - 10];
    return [s.from + s.durationInFrames - 10];
  });
}

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "GoalRanking", browserExecutable });
fs.mkdirSync(path.join(root, "out/stills"), { recursive: true });

for (const frame of frames) {
  const output = path.join(root, "out/stills", `f${String(frame).padStart(4, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale: 0.5, browserExecutable });
  console.log(output);
}
