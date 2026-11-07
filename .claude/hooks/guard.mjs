#!/usr/bin/env node
// PreToolUse フック: 「ハーネス判断・権限・安全設定」の関門。
// - ファイル削除: 保護フォルダは停止、それ以外は人間に確認（プロジェクト内のビルド成果物と一時フォルダは素通し）
// - 強制push: 停止
// - .env（実キーの置き場所）への書き込み: 停止。安全設定（settings.json・フック）の書き換え: 人間に確認
// - 外部サービス（MCP）: 削除・消去は停止 / 送信・課金・公開・共有などは人間に確認
//   JEB_MCP_STRICT=on にすると、読み取り以外の MCP 操作をすべて確認にする
//
// コマンドの文字列を読んで判断する「網」であり、完全ではない。
// スクリプトファイルの中で行う削除（node script.js、npm run の中身など）は見えないので、最後の守りは Git とバックアップ。
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

// 消してはいけない場所（プロジェクトからの相対パス。大文字小文字は区別しない）
const PROTECTED = ['.git', '.claude', '.env', 'claude.md', 'ai-ecosystem/knowledge', 'ai-ecosystem/design-systems'];
// 書き換えるときに人間の確認がいる安全設定
const SELF_CONFIG = ['.claude/settings.json', '.claude/settings.local.json', '.claude/hooks'];
// 作り直せるので消してよいフォルダ名（プロジェクト内だけ）
const REGENERABLE = new Set(['dist', 'build', 'coverage', 'node_modules', '.cache', '.vite', '.next', '.turbo']);
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
function expand(p, cwd) {
  let s = unquote(p)
    .replace(/\$\{HOME\}|\$HOME\b/g, HOME)
    .replace(/\$\{PWD\}|\$PWD\b/g, cwd);
  if (s === '~' || s.startsWith('~/')) s = HOME + s.slice(1);
  return s;
}
const resolveFrom = (cwd, p) => path.resolve(cwd, expand(p, cwd));
const relOf = (abs) => path.relative(projectDir, abs);
const insideProject = (abs) => {
  const r = relOf(abs);
  return !r.startsWith('..') && !path.isAbsolute(r);
};
const relLower = (abs) => relOf(abs).toLowerCase();
const under = (r, base) => r === base || r.startsWith(base + path.sep);

function isProtected(abs) {
  if (!insideProject(abs)) return false;
  const r = relLower(abs);
  if (r === '') return true; // プロジェクト丸ごと
  return PROTECTED.some((p) => under(r, p) || p.startsWith(r + path.sep));
}
const isSelfConfig = (abs) => insideProject(abs) && SELF_CONFIG.some((p) => under(relLower(abs), p));
const isEnvFile = (abs) => /^\.env(\..+)?$/i.test(path.basename(abs)) && !/\.(example|template|sample)$/i.test(abs);
function isRegenerable(abs) {
  if (TMP_ROOTS.some((t) => abs.startsWith(t + path.sep))) return true;
  return insideProject(abs) && relLower(abs).split(path.sep).some((seg) => REGENERABLE.has(seg));
}
function isDangerousRoot(abs) {
  const parentOfProject = !path.relative(abs, projectDir).startsWith('..');
  return abs === path.parse(abs).root || abs === HOME || parentOfProject;
}
const hasGlob = (s) => /[*?[]/.test(s);
const hasVar = (s) => /\$/.test(s);

// ---- シェルの分解 -----------------------------------------------------------
// ヒアドキュメントの本文（<<EOF … EOF）はコマンドではないので外す
function stripHeredocs(cmd) {
  const lines = cmd.split('\n');
  const out = [];
  const pending = [];
  for (const line of lines) {
    if (pending.length) {
      const { tag, dash } = pending[0];
      if ((dash ? line.replace(/^\t+/, '') : line).trim() === tag) pending.shift();
      continue;
    }
    out.push(line);
    for (const m of line.matchAll(/(?<!<)<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g)) pending.push({ dash: m[1] === '-', tag: m[3] });
  }
  return out.join('\n');
}

// $( ) とバッククォートの中身（シングルクォートの中は除く）
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
    } else if (c === '|' && word.endsWith('>')) {
      word += c; // >| （上書きリダイレクト）
    } else if (c === '&' && (word.endsWith('>') || cmd[i + 1] === '>')) {
      word += c; // 2>&1、&>file
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

// リダイレクト先を取り出し、語の列から外す（入力リダイレクトも外す）
function splitRedirects(words) {
  const rest = [];
  const targets = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const out = w.match(/^(\d*|&)>>?\|?(.*)$/);
    if (out) {
      const t = out[2] || (out[2] === '' ? words[++i] : '');
      if (t && !t.startsWith('&')) targets.push(t);
      continue;
    }
    if (/^\d*<<?<?$/.test(w)) {
      i++;
      continue;
    }
    if (/^\d*<[^<]/.test(w) || /^<<-?/.test(w)) continue;
    rest.push(w);
  }
  return { rest, targets };
}

// コマンドの前に付く語（グループ化・制御構文・否定）
const PREFIX_WORDS = new Set(['(', '{', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time']);
// ラッパーと「値を取るオプション」
const WRAPPERS = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-U', '-r', '-t', '-D', '-R', '-T']),
  doas: new Set(['-u', '-C']),
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p', '-t']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  stdbuf: new Set(['-i', '-o', '-e']),
  nohup: new Set(),
  command: new Set(),
  builtin: new Set(),
  exec: new Set(['-a']),
  caffeinate: new Set(['-t', '-w']),
};
const XARGS_VALUE_OPTS = new Set(['-n', '-I', '-L', '-P', '-d', '-s', '-a', '-E', '-e', '-i', '-l']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const DELETE_CMDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'trash', 'srm']);
const INTERPRETERS = { node: ['-e', '--eval', '-p', '--print'], python: ['-c'], python3: ['-c'], perl: ['-e', '-E'], ruby: ['-e'], deno: ['eval'], bun: ['-e', '--eval'] };
const CODE_DELETE = /(rmSync|rmdirSync|unlinkSync|\.rm\(|\.rmdir\(|\.unlink\(|rimraf|shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir|\.unlink\(\)|rmtree|File\.delete|FileUtils\.rm|unlink\s)/;

// 先頭のグループ化記号・制御構文・環境変数代入・ラッパーを外して、本当のコマンドを取り出す
function stripPrefixes(words) {
  const w = [...words];
  // 語にくっついた ( { と ) } を外す
  if (w.length) w[0] = w[0].replace(/^[({]+/, '');
  // 末尾は、対になる開き括弧がない「余った」閉じ括弧だけを外す（${HOME} や $(…) は残す）
  const count = (s, ch) => s.split(ch).length - 1;
  while (w.length) {
    const last = w[w.length - 1];
    if (last.endsWith(')') && count(last, ')') > count(last, '(')) w[w.length - 1] = last.slice(0, -1);
    else if (last.endsWith('}') && count(last, '}') > count(last, '{')) w[w.length - 1] = last.slice(0, -1);
    else break;
  }
  let viaXargs = false;
  for (;;) {
    while (w.length && (w[0] === '' || PREFIX_WORDS.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w.shift();
    if (!w.length) break;
    const name = path.basename(w[0]);
    if (name in WRAPPERS) {
      const valueOpts = WRAPPERS[name];
      w.shift();
      while (w.length && (w[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) {
        const opt = w.shift();
        if (valueOpts.has(opt)) w.shift();
        if (opt === '--') break;
      }
      if (name === 'timeout' && w.length && /^\d/.test(w[0])) w.shift(); // 時間
      continue;
    }
    if (name === 'xargs') {
      viaXargs = true;
      w.shift();
      while (w.length && w[0].startsWith('-')) {
        const opt = w.shift();
        if (XARGS_VALUE_OPTS.has(opt)) w.shift();
      }
      continue;
    }
    break;
  }
  return { words: w.filter((x) => x !== ')' && x !== '}'), viaXargs };
}

function checkDeleteTargets(targets, cwd, seg, { viaXargs = false, findFiltered = false } = {}) {
  if (targets.length === 0) {
    decide('ask', `ファイル削除（${seg}）です。${viaXargs ? '消す対象が前のコマンドから渡されるため、' : ''}消してよいか人間が確認してください。`);
  }
  let needAsk = false;
  for (const raw of targets) {
    const t = unquote(raw).replace(/\/+$/, '') || '/';
    if (['*', '/*', '~/*', '.*'].includes(t)) decide('deny', `「${seg}」はフォルダの中身を丸ごと消す恐れがあるため止めました。`);
    if (hasGlob(t)) {
      // ワイルドカードは、展開される前の固定部分（親フォルダ）で判断する
      const head = t.split('/');
      const idx = head.findIndex(hasGlob);
      const base = resolveFrom(cwd, head.slice(0, idx).join('/') || '.');
      if (isDangerousRoot(base) || isProtected(base)) decide('deny', `「${seg}」は保護フォルダやプロジェクト全体に及ぶ恐れがあるため止めました。`);
      if (!isRegenerable(base)) needAsk = true;
      continue;
    }
    const abs = resolveFrom(cwd, t);
    if (hasVar(expand(t, cwd))) {
      needAsk = true; // 中身の分からない変数
      continue;
    }
    if (isDangerousRoot(abs)) {
      if (findFiltered && abs === projectDir) {
        needAsk = true; // find . -name '*.log' のように絞り込んでいる
        continue;
      }
      decide('deny', `「${seg}」はルート・ホーム・プロジェクト全体を消す恐れがあるため止めました。`);
    }
    if (isProtected(abs)) decide('deny', `保護フォルダ（${relOf(abs) || '.'}）の削除は禁止です。どうしても必要なら人間が手動で行ってください。`);
    if (!isRegenerable(abs)) needAsk = true;
  }
  if (needAsk) decide('ask', `ファイル削除（${seg}）です。消してよいか人間が確認してください。`);
}

function checkBash(command, cwdIn = startCwd, depth = 0) {
  if (depth > 5) return;
  const cmdText = stripHeredocs(command);
  for (const inner of substitutions(cmdText)) checkBash(inner, cwdIn, depth + 1);

  let cwd = cwdIn;
  for (const raw of segments(cmdText)) {
    const { rest, targets: redirects } = splitRedirects(raw);
    const { words, viaXargs } = stripPrefixes(rest);
    const seg = raw.join(' ');
    for (const t of redirects) checkWritePath(resolveFrom(cwd, t), `リダイレクト（${seg}）`, cwd);
    if (!words.length) continue;

    const cmd = path.basename(words[0]);
    const args = words.slice(1);

    if (cmd === 'cd' || cmd === 'pushd') {
      cwd = args[0] && args[0] !== '-' ? resolveFrom(cwd, args[0]) : HOME;
      continue;
    }
    if (SHELLS.has(cmd)) {
      const ci = args.findIndex((a) => a === '-c' || /^-[a-z]*c$/.test(a));
      if (ci >= 0 && args[ci + 1] !== undefined) checkBash(args[ci + 1], cwd, depth + 1);
      continue;
    }
    if (cmd === 'eval') {
      checkBash(args.join(' '), cwd, depth + 1);
      continue;
    }
    if (cmd in INTERPRETERS || /^python3?(\.\d+)?$/.test(cmd)) {
      const flags = INTERPRETERS[cmd] ?? INTERPRETERS.python;
      const ci = args.findIndex((a) => flags.includes(a));
      const code = ci >= 0 ? args.slice(ci + 1).join(' ') : '';
      if (code && CODE_DELETE.test(code)) {
        const lower = code.toLowerCase();
        if (PROTECTED.some((p) => lower.includes(p))) decide('deny', `プログラムの中から保護フォルダを消そうとしています（${seg}）。`);
        decide('ask', `プログラムの中でファイルを削除しています（${seg}）。消してよいか人間が確認してください。`);
      }
      continue;
    }

    // git: グローバルオプション（-C <dir>、-c <k=v> など）を飛ばしてからサブコマンドを見る
    if (cmd === 'git') {
      const g = [...args];
      let gcwd = cwd;
      while (g.length && g[0].startsWith('-')) {
        const opt = g.shift();
        if (opt === '-C') gcwd = resolveFrom(gcwd, g.shift() ?? '.');
        else if (opt === '-c' || opt === '--namespace' || opt === '--git-dir' || opt === '--work-tree') g.shift();
      }
      const sub = g[0];
      const subArgs = g.slice(1);
      if (sub === 'push') {
        if (subArgs.some((a) => a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || a.startsWith('--force-with-lease') || a === '--force-if-includes' || /^\+/.test(a) || /:\+/.test(a))) {
          decide('deny', 'git push の強制（--force / -f / --force-with-lease / +ブランチ）は禁止です。履歴を書き換えない方法を選ぶか、人間に依頼してください。');
        }
        continue;
      }
      if (sub === 'clean') {
        if (subArgs.some((a) => a === '--dry-run' || /^-[a-zA-Z]*n/.test(a))) continue;
        checkDeleteTargets(subArgs.filter((a) => !a.startsWith('-')), gcwd, seg);
        continue;
      }
      if (sub === 'rm') {
        if (subArgs.includes('--cached')) continue; // 管理から外すだけで、ファイルは消えない
        checkDeleteTargets(subArgs.filter((a) => !a.startsWith('-')), gcwd, seg);
        continue;
      }
      if (sub === 'mv') {
        checkMove(subArgs, gcwd, seg);
        continue;
      }
      if (sub === 'checkout' || sub === 'restore') {
        const dd = subArgs.indexOf('--');
        const paths = dd >= 0 ? subArgs.slice(dd + 1) : sub === 'restore' ? subArgs.filter((a) => !a.startsWith('-')) : [];
        for (const p of paths) checkWritePath(resolveFrom(gcwd, p), `git ${sub}（${seg}）`, gcwd);
      }
      continue;
    }

    if (cmd === 'mv') {
      checkMove(args, cwd, seg);
      continue;
    }
    if (['cp', 'install', 'tee', 'ln'].includes(cmd)) {
      const paths = args.filter((a) => !a.startsWith('-'));
      const dests = cmd === 'tee' ? paths : paths.slice(-1);
      for (const d of dests) checkWritePath(resolveFrom(cwd, d), `書き込み（${seg}）`, cwd);
      continue;
    }
    if (cmd === 'rsync') {
      const paths = args.filter((a) => !a.startsWith('-'));
      const dest = paths.at(-1);
      if (dest) {
        const abs = resolveFrom(cwd, dest);
        if (args.some((a) => a.startsWith('--delete') || a === '--remove-source-files')) {
          if (isProtected(abs) || isDangerousRoot(abs)) decide('deny', `保護フォルダを同期で消す恐れがあります（${seg}）。`);
          decide('ask', `削除を伴う同期（${seg}）です。人間が確認してください。`);
        }
        checkWritePath(abs, `同期（${seg}）`, cwd);
      }
      continue;
    }
    if (cmd === 'dd') {
      for (const a of args) if (a.startsWith('of=')) checkWritePath(resolveFrom(cwd, a.slice(3)), `dd（${seg}）`, cwd);
      continue;
    }
    if (cmd === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
      const files = args.filter((a) => !a.startsWith('-') && a !== '');
      for (const f of files.slice(1)) checkWritePath(resolveFrom(cwd, f), `書き換え（${seg}）`, cwd);
      continue;
    }
    if (['truncate', 'chmod', 'chown', 'chattr'].includes(cmd)) {
      const files = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a) && !/^[ugoa]*[+=-][rwxXst]*$/.test(a));
      for (const f of files) {
        const abs = resolveFrom(cwd, f);
        checkWritePath(abs, `${cmd}（${seg}）`, cwd);
        if (isProtected(abs)) decide('ask', `保護フォルダのファイルを ${cmd} で変更します（${seg}）。人間が確認してください。`);
      }
      continue;
    }

    // 削除系
    if (DELETE_CMDS.has(cmd)) {
      checkDeleteTargets(args.filter((a) => !a.startsWith('-')), cwd, seg, { viaXargs });
      continue;
    }
    if (cmd === 'find') {
      const execIdx = args.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a));
      const execDeletes = execIdx >= 0 && DELETE_CMDS.has(path.basename(args[execIdx + 1] || ''));
      if (!args.includes('-delete') && !execDeletes) continue;
      const starts = [];
      for (const a of args) {
        if (a.startsWith('-') || a === '(' || a === '!') break;
        starts.push(a);
      }
      const filtered = args.some((a) => ['-name', '-iname', '-path', '-ipath', '-regex', '-type', '-newer', '-mtime', '-size'].includes(a));
      checkDeleteTargets(starts.length ? starts : ['.'], cwd, seg, { findFiltered: filtered });
    }
  }
}

function checkMove(args, cwd, seg) {
  const paths = args.filter((a) => !a.startsWith('-'));
  const dest = paths.pop();
  for (const s of paths) {
    const abs = resolveFrom(cwd, s);
    if (isProtected(abs) || isDangerousRoot(abs)) decide('deny', `保護フォルダ（${relOf(abs) || '.'}）の移動は禁止です。必要なら人間が手動で行ってください。`);
  }
  if (dest) checkWritePath(resolveFrom(cwd, dest), `移動（${seg}）`, cwd);
}

// ---- ファイル書き込み -------------------------------------------------------
function checkWritePath(abs, what = '書き込み') {
  if (isEnvFile(abs)) {
    decide('deny', `.env には実際のキーが入るため、AIは書き換えません（${what}）。キーは 1Password に入れ、.env には op:// の参照だけを人間が書いてください（見本は .env.example）。`);
  }
  if (insideProject(abs) && under(relLower(abs), '.git')) decide('deny', `.git フォルダの中を直接書き換えることは禁止です（${what}）。`);
  if (isSelfConfig(abs)) {
    decide('ask', `安全設定（${relOf(abs)}）の書き換えです（${what}）。AIが自分で安全設定を外していないか、人間が確認してください。`);
  }
}

// ---- MCP（外部サービス） ---------------------------------------------------
const READ_WORDS = /(^|_)(get|list|search|read|fetch|query|describe|count|aggregate|whoami|help|find|view|show|download|lookup|check|preview)(_|$)/;
const DELETE_WORDS = /(^|_)(delete|remove|trash|destroy|purge|wipe|erase|clear|truncate|drop)(_|$)/;
const DELETE_EXCEPTIONS = /remove_background/;
const RISKY_WORDS =
  /(^|_)(send|reply|forward|pay|payment|buy|purchase|order|transfer|remit|invoice|billing|charge|refund|publish|deploy|deployment|promote|rollback|share|invite|post|tweet|comment|push|pull|merge|fork|repository|project|domain|alias|release|protection|firewall|bypass|secret|env|permission|permissions|token|config)(_|$)/;
const SQL_DESTRUCTIVE = /\b(drop\s+(table|database|schema|view|index)|truncate\s+(table\s+)?[\w."]+|delete\s+from)\b/i;

function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

function checkMcp(name) {
  // camelCase も語に分ける（deleteConfluencePage → delete_confluence_page）
  const words = name
    .split('__')
    .slice(2)
    .join('__')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
  const toolPart = words || name.toLowerCase();

  // 端末操作系の MCP（コマンド実行・ファイル操作）も Bash や書き込みと同じ関門に通す
  if (typeof ti.command === 'string') checkBash(ti.command);
  if (/interact/.test(toolPart) && typeof ti.input === 'string') checkBash(ti.input);
  if (/(write|edit|move|create|rename|copy|block)/.test(toolPart)) {
    for (const key of ['path', 'file_path', 'filePath', 'destination', 'target']) {
      if (typeof ti[key] === 'string') checkWritePath(path.resolve(startCwd, expand(ti[key], startCwd)), name);
    }
  }
  if (typeof ti.source === 'string' && /(move|rename)/.test(toolPart) && isProtected(path.resolve(startCwd, expand(ti.source, startCwd)))) {
    decide('deny', `保護フォルダの移動（${name}）は禁止です。`);
  }

  // 削除・消去（名前か、引数の中身で判断）
  if (DELETE_WORDS.test(toolPart) && !DELETE_EXCEPTIONS.test(toolPart)) {
    decide('deny', `外部サービス上の削除・消去（${name}）はAIに禁止しています。必要なら人間が画面から操作してください。`);
  }
  const strs = stringsIn(ti);
  if (strs.some((s) => SQL_DESTRUCTIVE.test(s))) decide('deny', `データを消す SQL（DROP / TRUNCATE / DELETE FROM）を含む操作（${name}）は禁止です。`);
  if (/(modify|label)/.test(toolPart) && strs.includes('TRASH')) decide('deny', `ゴミ箱へ移す操作（${name}）は、削除と同じ扱いで禁止です。`);

  if (lower(name).startsWith('mcp__claude-code-remote__')) return; // セッション管理系は Claude Code 側の確認に任せる
  if (READ_WORDS.test(toolPart)) return;

  // 参加者を入れた予定は招待メールが飛ぶ
  if (Array.isArray(ti.attendees) && ti.attendees.length) decide('ask', `参加者に招待が届く操作（${name}）です。宛先と内容を人間が確認してください。`);
  if (RISKY_WORDS.test(toolPart)) {
    decide('ask', `送信・お金・公開・共有・設定変更に関わる操作（${name}）です。内容（宛先・金額・本文・公開範囲）を人間が確認してから実行してください。`);
  }
  if (process.env.JEB_MCP_STRICT === 'on') {
    decide('ask', `外部サービスへの書き込み（${name}）です（JEB_MCP_STRICT=on）。人間が確認してください。`);
  }
}
function lower(s) {
  return s.toLowerCase();
}

if (tool === 'Bash') checkBash(String(ti.command || ''));
else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const fp = ti.file_path || ti.notebook_path;
  if (fp) checkWritePath(path.resolve(startCwd, fp), tool);
} else if (tool.startsWith('mcp__')) checkMcp(tool);

process.exit(0);
