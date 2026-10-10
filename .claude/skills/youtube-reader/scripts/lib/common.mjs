// 共通の部品：プロキシ対応・URL の読み取り・取得・保存・外部コマンド
// 依存パッケージなし（Node 18 以上の標準機能だけで動く）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * クラウドの作業環境では HTTPS_PROXY 経由でしか外へ出られない。
 * Node の fetch は既定でプロキシを使わないので、NODE_USE_ENV_PROXY=1 を付けて自分を起動し直す
 * （Node 22.21 以降・24 以降で有効。古い Node では無視されて直接つなぐ）。
 * PC（プロキシなし）では何もしない。
 */
export function ensureProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY === '1') return;
  const r = spawnSync(process.execPath, ['--no-warnings', process.argv[1], ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** "90" "1m30s" "1:30" "1h2m3s" → 秒。読めなければ null */
export function parseTime(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (hms && (hms[1] || hms[2] || hms[3])) return (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
  const parts = s.split(':');
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return parts.map(Number).reduce((a, n) => a * 60 + n, 0);
  }
  return null;
}

/** 秒 → "1:05" / "1:02:03" */
export function fmtTime(sec) {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * YouTube の URL・動画 ID から 11 文字の ID を取り出す。
 * 対応：watch?v= / youtu.be / shorts / live / embed / m. / music. / 末尾の ?si= や &t=
 * @returns {{id: string, start: number|null, shorts: boolean} | null}
 */
export function parseVideoId(input) {
  const s = String(input ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { id: s, start: null, shorts: false };
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  let shorts = false;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|live|embed|v|e)\/([A-Za-z0-9_-]{11})/);
      if (m) {
        id = m[2];
        shorts = m[1] === 'shorts';
      }
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const t = u.searchParams.get('t') ?? u.searchParams.get('start');
  return { id, start: t ? parseTime(t) : null, shorts };
}

function netErrorText(e) {
  const code = e?.cause?.code || e?.code || '';
  const msg = e?.cause?.message || e?.message || String(e);
  if (e?.name === 'AbortError' || /aborted|timed? ?out/i.test(msg)) return '時間切れ';
  const viaProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
  if (viaProxy && /cancel|403|407|tunnel|ECONNRESET|socket|closed/i.test(`${msg} ${code}`)) {
    return `接続を断られた（作業環境のネットワーク制限の可能性）：${code || msg}`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `名前解決できない（ネット未接続か制限）：${code}`;
  return `${code ? `${code}: ` : ''}${msg}`;
}

/**
 * GET（タイムアウト付き）。失敗しても例外を投げず { ok:false, error } を返す。
 * @param {'text'|'buffer'} as
 */
export async function httpGet(url, { headers = {}, timeoutMs = 25000, as = 'text' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const body = as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url, contentType: res.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: 0, error: netErrorText(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** POST JSON（Gemini 用）。長い処理に備えてタイムアウトは長め */
export async function httpPostJson(url, payload, { headers = {}, timeoutMs = 600000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* JSON でない応答はそのまま text で返す */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, error: netErrorText(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HTML の中の `marker` の直後にある JSON オブジェクトを取り出す（文字列中の括弧を無視して対応を数える）。
 * 例：extractJsonAfter(html, 'ytInitialPlayerResponse = ')
 */
export function extractJsonAfter(html, marker) {
  let i = html.indexOf(marker);
  if (i < 0) return null;
  i = html.indexOf('{', i + marker.length);
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 外部コマンドを実行（無ければ found:false）。出力は UTF-8 文字列 */
export function run(cmd, args = [], { cwd, timeoutMs = 0, input } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
    timeout: timeoutMs || undefined,
    windowsHide: true,
  });
  if (r.error && r.error.code === 'ENOENT') return { found: false, ok: false, code: null, stdout: '', stderr: '' };
  return { found: true, ok: r.status === 0, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

/** コマンドのバージョン（無ければ null） */
export function versionOf(cmd, args = ['--version']) {
  const r = run(cmd, args, { timeoutMs: 20000 });
  if (!r.found || !r.ok) return null;
  return (r.stdout || r.stderr).trim().split(/\r?\n/)[0];
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

export function writeJson(file, obj) {
  writeText(file, JSON.stringify(obj, null, 2));
}

/** 簡易な引数の読み取り：--key value / --flag / 位置引数 */
export function parseArgs(argv, { flags = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        if (flags.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) out[key] = true;
        else out[key] = argv[++i];
      }
    } else out._.push(a);
  }
  return out;
}

/**
 * Gemini の API キーを探す（表示はしない）。
 * 環境変数 → 作業フォルダの .env → スキルの .env → ユーザーの制作キット（ai-video-studio / motion-vault）の .env
 */
export function findGeminiKey(skillDir) {
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    if (process.env[k]) return { key: process.env[k], from: `環境変数 ${k}` };
  }
  const home = os.homedir();
  const candidates = [
    path.join(process.cwd(), '.env'),
    skillDir && path.join(skillDir, '.env'),
    path.join(home, 'Videos', 'ai-video-studio', '.env'),
    path.join(home, 'Videos', 'motion-vault', '.env'),
    path.join(home, 'ai-video-studio', '.env'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const m = text.match(/^\s*(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*["']?([^"'\r\n#]+)["']?/m);
      if (m && m[1].trim()) return { key: m[1].trim(), from: file };
    } catch {
      /* 無いファイルは飛ばす */
    }
  }
  return null;
}

export function viaProxy() {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
}
