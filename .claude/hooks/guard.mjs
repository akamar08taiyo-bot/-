#!/usr/bin/env node
// PreToolUse フック: 「ハーネス判断・権限・安全設定」の関門。
// - ファイル削除: 保護フォルダは強制停止、それ以外は人間に確認（ビルド成果物や一時フォルダは素通し）
// - 強制push: 停止
// - .env（実キーの置き場所）への書き込み: 停止
// - 外部サービス（MCP）上の削除: 停止 / お金・送信・公開系: 人間に確認
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const tool = input.tool_name || '';
const ti = input.tool_input || {};
const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const cwd = path.resolve(input.cwd || projectDir);

// 消してはいけない場所（プロジェクトからの相対パス）
const PROTECTED = [
  '.git',
  '.claude',
  '.env',
  'CLAUDE.md',
  'ai-ecosystem/knowledge',
  'ai-ecosystem/design-systems',
];
// 作り直せるので消してよい場所（フォルダ名）
const REGENERABLE = new Set(['dist', 'build', 'coverage', 'node_modules', '.cache', '.vite', 'out', 'output', '.next', '.turbo']);

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: `[ジェブ安全設定] ${reason}`,
      },
    }),
  );
  process.exit(0);
}

const expandHome = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);
const resolveTarget = (p) => path.resolve(cwd, expandHome(p.replace(/^["']|["']$/g, '')));
const rel = (abs) => path.relative(projectDir, abs);
const insideProject = (abs) => !rel(abs).startsWith('..') && !path.isAbsolute(rel(abs));

function isProtected(abs) {
  if (!insideProject(abs)) return false;
  const r = rel(abs) || '.';
  if (r === '.') return true; // プロジェクト丸ごと
  return PROTECTED.some((p) => r === p || r.startsWith(p + path.sep) || p.startsWith(r + path.sep));
}

function isRegenerable(abs) {
  const tmpRoots = [os.tmpdir(), '/tmp', '/private/tmp'].map((d) => path.resolve(d));
  if (tmpRoots.some((t) => abs.startsWith(t + path.sep))) return true;
  return abs.split(path.sep).some((seg) => REGENERABLE.has(seg));
}

// --- Bash ---------------------------------------------------------------
function checkBash(command) {
  const segments = command.split(/\n|;|&&|\|\||\|/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const tokens = seg.match(/"[^"]*"|'[^']*'|\S+/g) || [];
    // 先頭の sudo / env 代入 / command を飛ばす
    while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || ['sudo', 'command', 'builtin', 'xargs'].includes(tokens[0]))) tokens.shift();
    const cmd = tokens[0] || '';
    const args = tokens.slice(1);

    // 強制push
    if (cmd === 'git' && args[0] === 'push') {
      if (args.some((a) => a === '--force' || a === '-f' || /^-[a-zA-Z]*f/.test(a) || a.startsWith('+'))) {
        decide('deny', 'git push --force は禁止です。履歴を書き換えない方法を選ぶか、人間に依頼してください。');
      }
      if (args.some((a) => a.startsWith('--force-with-lease'))) {
        decide('ask', 'force-with-lease でのpushです。実行してよいか人間が確認してください。');
      }
    }

    // 削除系コマンド
    const isDelete =
      ['rm', 'rmdir', 'unlink', 'shred', 'trash', 'srm'].includes(path.basename(cmd)) ||
      (cmd === 'git' && (args[0] === 'clean' || args[0] === 'rm')) ||
      (cmd === 'find' && args.includes('-delete'));
    if (!isDelete) continue;

    let targets = args.filter((a) => !a.startsWith('-'));
    if (cmd === 'git') targets = targets.slice(1);
    if (cmd === 'find') targets = targets.slice(0, 1);
    if (targets.length === 0) targets = ['.'];

    const dangerous = targets.some((t) => ['/', '~', '$HOME', '*', '.', '..', '/*', '~/*'].includes(t.replace(/^["']|["']$/g, '')));
    if (dangerous) decide('deny', `「${seg}」はルートやホーム、フォルダ全体を消す恐れがあるため止めました。`);

    const abs = targets.map(resolveTarget);
    const hit = abs.find(isProtected);
    if (hit) decide('deny', `保護フォルダ（${rel(hit) || '.'}）の削除は禁止です。どうしても必要なら人間が手動で行ってください。`);
    if (abs.every(isRegenerable)) continue; // ビルド成果物・一時ファイルは素通し
    decide('ask', `ファイル削除（${seg}）です。消してよいか人間が確認してください。`);
  }
}

// --- ファイル書き込み ---------------------------------------------------
function checkWrite(filePath) {
  if (!filePath) return;
  const base = path.basename(filePath);
  if (/^\.env(\..+)?$/.test(base) && !/\.example$/.test(base)) {
    decide('deny', `.env には実際のキーが入るため、AIは書き換えません。キーは 1Password に入れ、.env には op:// の参照だけを人間が書いてください（見本は .env.example）。`);
  }
  const abs = path.resolve(cwd, filePath);
  if (insideProject(abs) && (rel(abs) === '.git' || rel(abs).startsWith('.git' + path.sep))) {
    decide('deny', '.git フォルダの中を直接書き換えることは禁止です。');
  }
}

// --- MCP（外部サービス） ------------------------------------------------
function checkMcp(name) {
  const lower = name.toLowerCase();
  const toolPart = lower.split('__').slice(2).join('__') || lower;
  if (/(delete|remove|trash|destroy|purge|wipe|erase)/.test(toolPart)) {
    decide('deny', `外部サービス上の削除（${name}）はAIに禁止しています。必要なら人間が画面から操作してください。`);
  }
  if (lower.startsWith('mcp__claude-code-remote__')) return; // セッション管理系は対象外
  if (/(pay|payment|transfer|remit|invoice|billing|send_message|send_email|send_mail|forward|publish|post_tweet|create_post|merge)/.test(toolPart)) {
    decide('ask', `お金・送信・公開に関わる操作（${name}）です。内容（宛先・金額・本文）を人間が確認してから実行してください。`);
  }
}

if (tool === 'Bash') checkBash(String(ti.command || ''));
else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) checkWrite(ti.file_path || ti.notebook_path);
else if (tool.startsWith('mcp__')) checkMcp(tool);

process.exit(0);
