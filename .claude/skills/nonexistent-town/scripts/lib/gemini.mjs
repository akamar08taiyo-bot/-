// Gemini API の呼び出し（画像・音声・音楽・動画）。キーの扱い・再試行・エラーの説明をまとめる。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpPostJson, httpPostSSE, httpGet, findGeminiKey, viaProxy } from './common.mjs';

export const API = 'https://generativelanguage.googleapis.com/v1beta';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** キーのヘッダー。クラウドの作業環境ではプロキシが付けるのでキーが無くても進める */
export function authHeaders() {
  const key = findGeminiKey(SKILL_DIR);
  if (key) return { headers: { 'x-goog-api-key': key.key }, from: key.from };
  if (viaProxy()) return { headers: {}, from: 'プロキシが付与' };
  return null;
}

/** HTTP の状態と応答から、日本語の説明を作る。致命的なもの（続けても無駄）は 1 行目に「クレジット」「キー」を含める */
export function explainError(status, json, text) {
  const msg = json?.error?.message || text?.slice?.(0, 300) || '';
  const keyBad = /API[ _]?key not valid|API_KEY_INVALID|API key expired|invalid api key/i.test(`${msg} ${JSON.stringify(json?.error?.details || '')}`);
  if (status === 402) return `Gemini のクレジットが切れています。AI Studio（https://aistudio.google.com）でチャージしてください。\n${msg}`;
  if (keyBad) return `Gemini の API キーが無効です（貼り間違い・期限切れ・削除済み）。.env の GEMINI_API_KEY を確かめてもらってください。\n${msg}`;
  if (status === 401 || status === 403) return `Gemini の API キーが使えない設定です（制限付きキー・API が無効）。\n${msg}`;
  if (status === 404) return `モデルが見つかりません（--model で指定し直す）。\n${msg}`;
  if (status === 429) return `使用量の上限です。時間をおくか、課金の設定を確認してください。\n${msg}`;
  if (status === 400) return `リクエストが受け付けられませんでした。\n${msg}`;
  if (status === 0) return `Gemini に届きません（${text}）。`;
  return `HTTP ${status}\n${msg}`;
}

/** 続けても無駄なエラーか（クレジット切れ・キーの問題・接続できない） */
export const isFatal = (r) => r && !r.ok && (r.status === 402 || r.status === 401 || r.status === 403 || r.status === -1 || r.status === 0 || /キー/.test(r.error || ''));

/**
 * POST（再試行つき）。成功なら { ok: true, json }、失敗なら { ok: false, error, status }（例外は投げない）。
 * stream: true なら streamGenerateContent で少しずつ受け取る（長い生成でも途中のプロキシに切られにくい）。
 * ストリーミングに対応しないモデルなら、ふつうの呼び出しに切り替える。
 */
export async function geminiPost(url, body, { timeoutMs = 600000, tries = 3, stream = false } = {}) {
  const auth = authHeaders();
  if (!auth) {
    return {
      ok: false,
      status: -1,
      error:
        'Gemini の API キーが見つかりません。https://aistudio.google.com/apikey で発行し、作業フォルダの .env に GEMINI_API_KEY=… と書いてもらう（チャットには貼らせない）。ai-video-studio / motion-vault の .env にあれば自動で使う。',
    };
  }
  let useStream = stream && /:generateContent$/.test(url);
  let r;
  for (let i = 0; i < tries; i++) {
    r = useStream
      ? await httpPostSSE(url.replace(/:generateContent$/, ':streamGenerateContent?alt=sse'), body, { headers: auth.headers, timeoutMs })
      : await httpPostJson(url, body, { headers: auth.headers, timeoutMs });
    if (r.ok) return { ok: true, json: r.json };
    const msg = r.json?.error?.message || r.text || '';
    if (useStream && (r.status === 404 || (r.status === 400 && /stream/i.test(msg)))) {
      useStream = false; // このモデルはストリーミング非対応
      i--;
      continue;
    }
    const retry = [0, 500, 502, 503, 504].includes(r.status) || (r.status === 429 && i === 0);
    if (!retry || i === tries - 1) break;
    await sleep(r.status === 429 ? 30000 : 6000 * (i + 1));
  }
  return { ok: false, error: explainError(r.status, r.json, r.error || r.text), status: r.status, json: r.json };
}

export async function geminiGet(urlOrName) {
  const auth = authHeaders();
  const url = urlOrName.startsWith('http') ? urlOrName : `${API}/${urlOrName}`;
  return httpGet(url, { headers: auth?.headers || {}, timeoutMs: 120000 });
}

export async function geminiDownload(url) {
  const auth = authHeaders();
  return httpGet(url, { headers: auth?.headers || {}, timeoutMs: 600000, as: 'buffer' });
}

/** 応答の parts から、文章と inlineData（画像・音声）を取り出す */
export function readParts(json) {
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const texts = [];
  const media = [];
  for (const p of parts) {
    if (p.thought) continue;
    if (typeof p.text === 'string') texts.push(p.text);
    const d = p.inlineData || p.inline_data;
    if (d?.data) media.push({ mimeType: d.mimeType || d.mime_type || '', data: Buffer.from(d.data, 'base64') });
  }
  return {
    text: texts.join('').trim(),
    media,
    finishReason: cand?.finishReason || json?.promptFeedback?.blockReason || 'UNKNOWN',
    usage: json?.usageMetadata,
  };
}

/** "audio/L16;codec=pcm;rate=24000" → 24000 */
export function rateFromMime(mime, fallback = 24000) {
  const m = String(mime).match(/rate=(\d+)/);
  return m ? Number(m[1]) : fallback;
}

/** 生の PCM（audio/L16・audio/pcm）か */
export const isRawPcm = (mime) => /audio\/(l16|pcm)/i.test(String(mime));

/** 16bit リニア PCM（リトルエンディアン）に WAV のヘッダーを付ける */
export function pcmToWav(pcm, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** MIME → 拡張子 */
export function extOf(mime) {
  if (/png/.test(mime)) return '.png';
  if (/jpe?g/.test(mime)) return '.jpg';
  if (/webp/.test(mime)) return '.webp';
  if (/mpeg|mp3/.test(mime)) return '.mp3';
  if (/wav/.test(mime) || isRawPcm(mime)) return '.wav';
  if (/mp4/.test(mime)) return '.mp4';
  return '.bin';
}
