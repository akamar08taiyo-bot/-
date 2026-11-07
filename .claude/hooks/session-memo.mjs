#!/usr/bin/env node
// SessionEnd フック: セッションが終わったら、何をしたかを Obsidian の日次ログに1行残す。
// 環境変数 OBSIDIAN_VAULT（Obsidian の保管庫フォルダ）が設定されているときだけ動く。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const vault = process.env.OBSIDIAN_VAULT;
if (!vault) process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const files = new Set();
let firstPrompt = '';
if (input.transcript_path && existsSync(input.transcript_path)) {
  for (const line of readFileSync(input.transcript_path, 'utf8').split('\n')) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const c = e.message?.content;
    if (!firstPrompt && e.type === 'user' && !e.isMeta) {
      if (typeof c === 'string') firstPrompt = c;
      else if (Array.isArray(c)) firstPrompt = c.find((b) => b.type === 'text')?.text || '';
    }
    if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b.type === 'tool_use' && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(b.name)) {
          const fp = b.input?.file_path || b.input?.notebook_path;
          if (fp) files.add(path.relative(projectDir, path.resolve(projectDir, fp)));
        }
      }
    }
  }
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const dir = path.join(vault, 'Claude', 'セッションログ');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${day}.md`);
if (!existsSync(file)) appendFileSync(file, `# ${day} の Claude Code セッション\n\n`);

const summary = firstPrompt.replace(/\s+/g, ' ').slice(0, 80);
const changed = files.size ? ` / 変更: ${[...files].slice(0, 8).join(', ')}` : '';
appendFileSync(
  file,
  `- ${pad(now.getHours())}:${pad(now.getMinutes())} [${path.basename(projectDir)}] ${summary || '(依頼なし)'}${changed}（${input.reason || 'end'}）\n`,
);
