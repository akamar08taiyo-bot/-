#!/usr/bin/env node
// Stop フック: 「最終的に出力された成果物は100%のクオリティか」をジェブに判断させてから終わる仕組み。
// この依頼でファイルを作った・直したのに、その後 jeb-judge の検品を通していなければ、終了を1回だけ止めて検品を促す。
// （止めるのは1回だけ。検品不要と判断した理由を述べればそのまま終われる）
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
if (input.stop_hook_active || process.env.JEB_STOP_GATE === 'off') process.exit(0);

const transcript = input.transcript_path;
if (!transcript || !existsSync(transcript)) process.exit(0);

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);

let lastHuman = -1;
let lastEdit = -1;
let lastJudge = -1;
const edited = new Set();

const lines = readFileSync(transcript, 'utf8').split('\n');
lines.forEach((line, i) => {
  if (!line.trim()) return;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  if (entry.isSidechain) return; // サブエージェント内部のやり取りは数えない
  const content = entry.message?.content;
  if (entry.type === 'user') {
    const isHuman = typeof content === 'string' || (Array.isArray(content) && content.some((c) => c.type === 'text') && !content.some((c) => c.type === 'tool_result'));
    if (isHuman && !entry.isMeta) {
      lastHuman = i;
      edited.clear();
    }
    return;
  }
  if (entry.type !== 'assistant' || !Array.isArray(content)) return;
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const inp = block.input || {};
    if (EDIT_TOOLS.has(block.name)) {
      const fp = path.resolve(projectDir, String(inp.file_path || inp.notebook_path || ''));
      const r = path.relative(projectDir, fp);
      if (r && !r.startsWith('..') && !path.isAbsolute(r)) {
        lastEdit = i;
        edited.add(r);
      }
    } else if (AGENT_TOOLS.has(block.name) && inp.subagent_type === 'jeb-judge') {
      lastJudge = i;
    } else if (block.name === 'Bash' && /judge-(text|image)\.mjs/.test(String(inp.command || ''))) {
      lastJudge = i;
    }
  }
});

if (lastEdit > lastHuman && lastEdit > lastJudge) {
  const files = [...edited].slice(0, 10).join(', ');
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `[ジェブ最終判断] この依頼で変更したファイル（${files}）が、まだ jeb-judge の検品を通っていません。` +
        'jeb-judge サブエージェントに「依頼内容・成果物のパス・確認してほしい点」を渡して判定を受け、FAIL なら直してから報告してください。' +
        '誤字1か所の修正など検品が不要な小さな変更なら、その理由を一文で述べて終えて構いません。',
    }),
  );
}
