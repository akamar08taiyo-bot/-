// 常時同期（ユーザーの指示「受注残管理アプリみたいに、常時同期させる」2026-11-01。cloud/engine.ts）で、クラウドに送る前に端末の中で暗号化する。
// 受注残・進捗管理と同じ Firebase（Firestore）に置くが、お客様の名前・住所・被保険者番号・写真などが入るので、営業所で決めた「合言葉」から作った鍵で
// AES-GCM の暗号にしてから送る（合言葉はどこにも送らない・保存しない。鍵は取り出せない形で端末の中にだけ持つ）。合言葉を知らない人（Google も）は読めない。
// 合言葉からは鍵と「置き場所の名前」（space）を一緒に作る（PBKDF2 の 384 ビットの前 256 ビットが鍵、うしろ 128 ビットが置き場所）。
// 置き場所の名前から合言葉を当てるのにも PBKDF2 の手間がかかる（置き場所だけ別のハッシュにすると、そこから速く当てられてしまう）

const enc = new TextEncoder();
const dec = new TextDecoder();

/** PBKDF2 のくり返しの回数（OWASP の 2023 年のすすめ。スマホでも 1 秒ほど） */
const ITERATIONS = 310_000;
const SALT = 'taiyo-jutaku-cloud/v1';
/** 合言葉のいちばん短い字数 */
export const PASSPHRASE_MIN = 8;

/** 合言葉の打ち方のちがい（全角・半角、前後の空白）をそろえる */
export const normalizePassphrase = (s: string): string => s.normalize('NFKC').trim();

export type CloudKeys = {key: CryptoKey; space: string};

/** 合言葉から鍵（取り出せない AES-GCM の鍵）と置き場所の名前を作る */
export async function deriveKeys(passphrase: string): Promise<CloudKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS}, base, 384));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const space = `taiyo-jutaku-${[...bits.slice(32)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return {key, space};
}

/** 暗号の形：1バイト目は版（1）、次の 12 バイトは IV、そのあとが暗号文（認証タグ込み） */
const VERSION = 1;

/**
 * 暗号にする。where（「jobs/様邸の id」など）は認証のための追加データ（暗号文を別の置き場所に移しかえると開けない）
 */
export async function seal(key: CryptoKey, where: string, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: enc.encode(where)}, key, plain as BufferSource));
  const out = new Uint8Array(1 + iv.length + body.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(body, 1 + iv.length);
  return out;
}

/** 暗号を開く（鍵・置き場所がちがう、こわれている → 例外） */
export async function open(key: CryptoKey, where: string, data: Uint8Array): Promise<Uint8Array> {
  if (data[0] !== VERSION || data.length < 1 + 12 + 16) throw new Error('暗号の形がちがいます');
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: data.slice(1, 13), additionalData: enc.encode(where)}, key, data.slice(13) as BufferSource);
  return new Uint8Array(plain);
}

/** gzip で縮める・戻す（部材リストのような大きな JSON を、Firestore の1件の上限 1MiB に入れるため。使えない端末ではそのまま） */
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** 値（JSON にできるもの）→ 暗号（1バイト目：1＝gzip した JSON、0＝そのままの JSON） */
export async function sealJson(key: CryptoKey, where: string, value: unknown): Promise<Uint8Array> {
  const json = enc.encode(JSON.stringify(value));
  const zipped = canZip() ? await pipe(json, new CompressionStream('gzip')) : null;
  const body = zipped ? zipped : json;
  const plain = new Uint8Array(1 + body.length);
  plain[0] = zipped ? 1 : 0;
  plain.set(body, 1);
  return seal(key, where, plain);
}

/** 暗号 → 値 */
export async function openJson(key: CryptoKey, where: string, data: Uint8Array): Promise<unknown> {
  const plain = await open(key, where, data);
  const body = plain.slice(1);
  const json = plain[0] === 1 ? await pipe(body, new DecompressionStream('gzip')) : body;
  return JSON.parse(dec.decode(json));
}
