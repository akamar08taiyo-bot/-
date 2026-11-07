#!/usr/bin/env node
// PreToolUse フック: 「ハーネス判断・権限・安全設定」の関門。
// - ファイル削除: 保護フォルダは停止、それ以外は人間に確認（プロジェクト内のビルド成果物と一時フォルダは素通し）
// - 強制push: 停止
// - .env（実キーの置き場所）への書き込み: 停止。安全設定（settings.json・フック）の書き換え: 人間に確認
// - 外部サービス（MCP）: 削除・消去は停止 / 送信・課金・公開・共有などは人間に確認
//   JEB_MCP_STRICT=on にすると、読み取り以外の MCP 操作をすべて確認にする
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
const startCwd = path.resolve(input.cwd || projectDir);
const HOME = os.homedir();

// 消してはいけない場所（プロジェクトからの相対パス）
const PROTECTED = ['.git', '.claude', '.env', 'CLAUDE.md', 'ai-ecosystem/knowledge', 'ai-ecosystem/design-systems'];
// 書き換えるときに人間の確認がいる安全設定
const SELF_CONFIG = ['.claude/settings.json', '.claude/settings.local.json', '.claude/hooks'];
// 作り直せるので消してよいフォルダ名（プロジェクト内だけ）
const REGENERABLE = new Set(['dist', 'build', 'coverage', 'node_modules', '.cache', '.vite', 'out', 'output', '.next', '.turbo']);
const TMP_ROOTS = [...new Set([os.tmpdir(), '/tmp', '/private/tmp'].map((d) => path.resolve(d)))];

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

// ---- パスの扱い -----------------------------------------------------------
const unquote = (s) => s.replace(/^(["'])(.*)\1$/s, '$2');
function expand(p) {
  let s = unquote(p).replace(/\$\{HOME\}|\$HOME/g, HOME);
  if (s === '~' || s.startsWith('~/')) s = HOME + s.slice(1);
  return s;
}
const resolveFrom = (cwd, p) => path.resolve(cwd, expand(p));
const relOf = (abs) => path.relative(projectDir, abs);
const insideProject = (abs) => {
  const r = relOf(abs);
  return !r.startsWith('..') && !path.isAbsolute(r);
};
const under = (r, base) => r === base || r.startsWith(base + path.sep);

function isProtected(abs) {
  if (!insideProject(abs)) return false;
  const r = relOf(abs);
  if (r === '') return true; // プロジェクト丸ごと
  return PROTECTED.some((p) => under(r, p) || p.startsWith(r + path.sep));
}
const isSelfConfig = (abs) => insideProject(abs) && SELF_CONFIG.some((p) => under(relOf(abs), p));
const isEnvFile = (abs) => /^\.env(\..+)?$/.test(path.basename(abs)) && !/\.example$/.test(abs);
function isRegenerable(abs) {
  if (TMP_ROOTS.some((t) => abs.startsWith(t + path.sep))) return true;
  return insideProject(abs) && relOf(abs).split(path.sep).some((seg) => REGENERABLE.has(seg));
}
function isDangerousRoot(abs) {
  const parentOfProject = !path.relative(abs, projectDir).startsWith('..');
  return abs === path.parse(abs).root || abs === HOME || parentOfProject;
}

// ---- シェルの分解（引用符を考慮） -----------------------------------------
// $( ) とバッククォートの中身を取り出す
function substitutions(cmd) {
  const found = [];
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") {
      if (c === "'") q = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === "'" && !q) q = "'";
    else if (c === '"') q = q === '"' ? null : '"';
    else if (c === '$' && cmd[i + 1] === '(') {
      let depth = 1;
      let j = i + 2;
      for (; j < cmd.length && depth; j++) {
        if (cmd[j] === '(') depth++;
        else if (cmd[j] === ')') depth--;
      }
      found.push(cmd.slice(i + 2, j - 1));
      i = j - 1;
    } else if (c === '`') {
      const end = cmd.indexOf('`', i + 1);
      if (end > i) {
        found.push(cmd.slice(i + 1, end));
        i = end;
      }
    }
  }
  return found;
}

// 引用符の外の ; && || | & 改行 で区切り、各部分を語に分ける
function segments(cmd) {
  const segs = [];
  let words = [];
  let word = '';
  let has = false;
  let q = null;
  const endWord = () => {
    if (has) words.push(word);
    word = '';
    has = false;
  };
  const endSeg = () => {
    endWord();
    if (words.length) segs.push(words);
    words = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) word += cmd[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === '\\' && i + 1 < cmd.length) {
      word += cmd[++i];
      has = true;
    } else if (c === ';' || c === '\n' || c === '|' || c === '&') {
      endSeg();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
    } else if (/\s/.test(c)) endWord();
    else {
      word += c;
      has = true;
    }
  }
  endSeg();
  return segs;
}

// リダイレクト先（> file, >> file）を取り出し、語の列から外す
function splitRedirects(words) {
  const rest = [];
  const targets = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const m = w.match(/^\d*>>?(.*)$/);
    if (m && !w.startsWith('>&') && !/^\d*>&/.test(w)) {
      if (m[1]) targets.push(m[1]);
      else if (words[i + 1] !== undefined) targets.push(words[++i]);
    } else rest.push(w);
  }
  return { rest, targets };
}

const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'nohup', 'time', 'exec', 'env', 'nice']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const DELETE_CMDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'trash', 'srm']);

function checkBash(command, cwdIn = startCwd, depth = 0) {
  if (depth > 4) return;
  for (const inner of substitutions(command)) checkBash(inner, cwdIn, depth + 1);

  let cwd = cwdIn;
  for (const raw of segments(command)) {
    const { rest, targets: redirects } = splitRedirects(raw);
    const words = [...rest];
    let viaXargs = false;
    while (words.length) {
      const w = words[0];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w)) words.shift();
      else if (w === 'xargs') {
        viaXargs = true;
        words.shift();
        while (words[0]?.startsWith('-')) words.shift();
      } else break;
    }
    const seg = raw.join(' ');
    const cmd = path.basename(words[0] || '');
    const args = words.slice(1);

    // リダイレクトでの書き込み
    for (const t of redirects) checkWritePath(resolveFrom(cwd, t), `リダイレクト（${seg}）`);

    if (!cmd) continue;
    if (cmd === 'cd') {
      cwd = args[0] ? resolveFrom(cwd, args[0]) : HOME;
      continue;
    }
    if (SHELLS.has(cmd)) {
      const ci = args.findIndex((a) => a === '-c' || /^-[a-z]*c$/.test(a));
      if (ci >= 0 && args[ci + 1]) checkBash(args[ci + 1], cwd, depth + 1);
      continue;
    }
    if (cmd === 'eval') {
      checkBash(args.join(' '), cwd, depth + 1);
      continue;
    }

    // 強制push
    if (cmd === 'git' && args[0] === 'push') {
      if (args.some((a) => a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+/.test(a) || a.includes(':+') || /^\+/.test(a.split(':')[0]))) {
        decide('deny', 'git push --force は禁止です。履歴を書き換えない方法を選ぶか、人間に依頼してください。');
      }
      if (args.some((a) => a.startsWith('--force-with-lease') || a === '--force-if-includes')) {
        decide('ask', 'force-with-lease でのpushです。実行してよいか人間が確認してください。');
      }
    }

    // 移動（移動元が保護フォルダなら、消すのと同じ扱い）
    if (cmd === 'mv') {
      const paths = args.filter((a) => !a.startsWith('-'));
      const dest = paths.pop();
      for (const s of paths) {
        const abs = resolveFrom(cwd, s);
        if (isProtected(abs)) decide('deny', `保護フォルダ（${relOf(abs) || '.'}）の移動は禁止です。必要なら人間が手動で行ってください。`);
      }
      if (dest) checkWritePath(resolveFrom(cwd, dest), `移動（${seg}）`);
      continue;
    }
    if (['cp', 'install', 'tee', 'rsync', 'ln'].includes(cmd)) {
      const paths = args.filter((a) => !a.startsWith('-'));
      const dests = cmd === 'tee' ? paths : paths.slice(-1);
      for (const d of dests) checkWritePath(resolveFrom(cwd, d), `書き込み（${seg}）`);
      if (cmd === 'rsync' && args.some((a) => a.startsWith('--delete'))) decide('ask', `削除を伴う同期（${seg}）です。人間が確認してください。`);
      continue;
    }
    if (cmd === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
      for (const f of args.filter((a) => !a.startsWith('-')).slice(1)) checkWritePath(resolveFrom(cwd, f), `書き換え（${seg}）`);
    }

    // 削除系
    let targets = null;
    if (DELETE_CMDS.has(cmd)) targets = args.filter((a) => !a.startsWith('-'));
    else if (cmd === 'git' && args[0] === 'clean') {
      if (args.some((a) => a === '-n' || a === '--dry-run' || /^-[a-zA-Z]*n/.test(a))) continue; // 試し実行
      targets = args.slice(1).filter((a) => !a.startsWith('-'));
    } else if (cmd === 'git' && args[0] === 'rm') {
      if (args.includes('--cached')) continue; // 管理から外すだけで、ファイルは消えない
      targets = args.slice(1).filter((a) => !a.startsWith('-'));
    } else if (cmd === 'find') {
      const execIdx = args.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a));
      const execDeletes = execIdx >= 0 && DELETE_CMDS.has(path.basename(args[execIdx + 1] || ''));
      if (args.includes('-delete') || execDeletes) {
        const starts = [];
        for (const a of args) {
          if (a.startsWith('-') || a === '(' || a === '!') break;
          starts.push(a);
        }
        targets = starts.length ? starts : ['.'];
      }
    }
    if (targets === null) continue;

    if (targets.length === 0) {
      // 対象が引数にない（xargs や git clean で、前の処理から渡される）
      decide('ask', `ファイル削除（${seg}）です。${viaXargs ? '消す対象が前のコマンドから渡されるため、' : ''}消してよいか人間が確認してください。`);
    }
    const abs = targets.map((t) => resolveFrom(cwd, t.replace(/\/+$/, '') || '/'));
    const literalDanger = targets.some((t) => ['*', '/*', '~/*', '.*'].includes(unquote(t)));
    const root = abs.find(isDangerousRoot);
    if (literalDanger || root) decide('deny', `「${seg}」はルート・ホーム・プロジェクト全体を消す恐れがあるため止めました。`);
    const hit = abs.find(isProtected);
    if (hit) decide('deny', `保護フォルダ（${relOf(hit) || '.'}）の削除は禁止です。どうしても必要なら人間が手動で行ってください。`);
    if (abs.every(isRegenerable)) continue;
    decide('ask', `ファイル削除（${seg}）です。消してよいか人間が確認してください。`);
  }
}

// ---- ファイル書き込み -------------------------------------------------------
function checkWritePath(abs, what = '書き込み') {
  if (isEnvFile(abs)) {
    decide('deny', `.env には実際のキーが入るため、AIは書き換えません（${what}）。キーは 1Password に入れ、.env には op:// の参照だけを人間が書いてください（見本は .env.example）。`);
  }
  if (insideProject(abs) && under(relOf(abs), '.git')) decide('deny', `.git フォルダの中を直接書き換えることは禁止です（${what}）。`);
  if (isSelfConfig(abs)) {
    decide('ask', `安全設定（${relOf(abs)}）の書き換えです（${what}）。AIが自分で安全設定を外していないか、人間が確認してください。`);
  }
}

// ---- MCP（外部サービス） ---------------------------------------------------
const READ_ONLY = /^(get|list|search|read|fetch|query|describe|count|aggregate|whoami|help|find|view|show|download|lookup|check|preview)([_-]|$)/;
const DELETE_WORDS = /(^|[_-])(delete|remove|trash|destroy|purge|wipe|erase|clear|truncate)([_-]|$)/;
const DELETE_EXCEPTIONS = /remove[_-]background/;
const RISKY_WORDS =
  /(^|[_-])(send|reply|forward|pay|payment|buy|purchase|order|transfer|remit|invoice|billing|charge|refund|publish|deploy|deployment|promote|rollback|share|invite|post|tweet|merge|domain|alias|release|protection|firewall|bypass|secret|env|permission|permissions|token)([_-]|$)/;

function checkMcp(name) {
  const lower = name.toLowerCase();
  const toolPart = lower.split('__').slice(2).join('__') || lower;

  // 端末操作系の MCP（コマンド実行・ファイル操作）も Bash や書き込みと同じ関門に通す
  if (typeof ti.command === 'string') checkBash(ti.command);
  if (/interact/.test(toolPart) && typeof ti.input === 'string') checkBash(ti.input);
  for (const key of ['path', 'file_path', 'filePath', 'destination', 'target']) {
    if (typeof ti[key] === 'string' && /(write|edit|move|create|rename|copy|block)/.test(toolPart)) checkWritePath(path.resolve(startCwd, expand(ti[key])), name);
  }
  if (typeof ti.source === 'string' && /(move|rename)/.test(toolPart) && isProtected(path.resolve(startCwd, expand(ti.source)))) {
    decide('deny', `保護フォルダの移動（${name}）は禁止です。`);
  }

  if (DELETE_WORDS.test(toolPart) && !DELETE_EXCEPTIONS.test(toolPart)) {
    decide('deny', `外部サービス上の削除・消去（${name}）はAIに禁止しています。必要なら人間が画面から操作してください。`);
  }
  if (READ_ONLY.test(toolPart)) return;
  if (lower.startsWith('mcp__claude-code-remote__')) return; // セッション管理系は Claude Code 側の確認に任せる
  if (RISKY_WORDS.test(toolPart)) {
    decide('ask', `送信・お金・公開・共有に関わる操作（${name}）です。内容（宛先・金額・本文・公開範囲）を人間が確認してから実行してください。`);
  }
  if (process.env.JEB_MCP_STRICT === 'on') {
    decide('ask', `外部サービスへの書き込み（${name}）です（JEB_MCP_STRICT=on）。人間が確認してください。`);
  }
}

if (tool === 'Bash') checkBash(String(ti.command || ''));
else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const fp = ti.file_path || ti.notebook_path;
  if (fp) checkWritePath(path.resolve(startCwd, fp), tool);
} else if (tool.startsWith('mcp__')) checkMcp(tool);

process.exit(0);
