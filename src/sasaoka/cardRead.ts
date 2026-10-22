// 介護保険証の画像1枚を読む流れ（読み取りの部品 recognize は外から渡す。ブラウザは cardOcr.ts の tesseract.js、テストは node の tesseract.js）：
// 1. 白黒にして（写真の影にも負けないよう、まわりの明るさに合わせて）、表の罫線を消す（罫線にさわった字が読めないため）
// 2. 向き：字の行が横か縦かを画素で見て（スキャンは横向きのことが多い）、その向きで全体を読む。保険証のラベル（番号・氏名・生年月日…）が
//    少ししか読めなければ、ほかの向きでも読んで、一番多く読めた向き
// 3. 値の行（生年月日の行から上へたどった番号・フリガナ・氏名、ラベルの右のます）だけを切り出して読み直す（番号は数字だけ・日付は日付の字だけ）。
//    全体で読むより読み違いが少ない
// 4. 切り出して読んだ行（ラベル＋値）と全体の行を parseCard へ（項目ごとに、形に合って多く読めた値）

import {cropGray, despeckle, inkAdaptive, removeLines, rotateGray, scaleGray, textIsVertical, valueRect, verticalLines} from './cardImage.ts';
import type {Gray, Rect} from './cardImage.ts';
import {cardScore, fixOcr, latestOffice, locateValues, officeEntries} from './hokensho.ts';
import type {OcrLine, OcrPage, OcrWord} from './hokensho.ts';

/** 読み方：auto（ページ全体・段組みを見る）・block（ひとかたまりの文）・line（1行）・digits（数字だけ・1行／かたまり）・date（和暦の日付の字だけ）・kana（カタカナだけ） */
export type OcrMode = 'auto' | 'block' | 'line' | 'digits' | 'digitsBlock' | 'date' | 'range' | 'kana' | 'care' | 'burden' | 'ratio';
export type Recognize = (img: Gray, mode: OcrMode) => Promise<OcrPage>;

const KATAKANA = Array.from({length: 0x30f6 - 0x30a1 + 1}, (_, i) => String.fromCharCode(0x30a1 + i)).join('') + 'ー' + Array.from({length: 0xff9f - 0xff66 + 1}, (_, i) => String.fromCharCode(0xff66 + i)).join('');
/** 読み方ごとの tesseract の設定（psm：ページの分け方。whitelist：読む字をしぼると読み違いが減る） */
export const OCR_MODES: Record<OcrMode, {psm: string; whitelist: string}> = {
  auto: {psm: '3', whitelist: ''},
  block: {psm: '6', whitelist: ''},
  line: {psm: '7', whitelist: ''},
  digits: {psm: '7', whitelist: '0123456789'},
  digitsBlock: {psm: '6', whitelist: '0123456789'},
  date: {psm: '7', whitelist: '0123456789明治大正昭和平成令元年月日'},
  range: {psm: '7', whitelist: '0123456789平成令和元年月日～~'},
  kana: {psm: '7', whitelist: KATAKANA},
  care: {psm: '7', whitelist: '要支援介護経過的12345'},
  burden: {psm: '7', whitelist: '123割'},
  ratio: {psm: '10', whitelist: '123'}, // 「1割」の数字だけ（1字）
};

const squeeze = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
const pageText = (p: OcrPage) => p.lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n');

type LabelKey = 'number' | 'address' | 'kana' | 'name' | 'birth' | 'care' | 'term' | 'office' | 'insurer' | 'burden';
/** ラベル（空白をつめた字で探す）と、値の行に付けるラベルの字 */
const LABELS: {key: LabelKey; re: RegExp; text: string}[] = [
  {key: 'insurer', re: /保険者番号/, text: '保険者番号'},
  {key: 'number', re: /(?<!者)番号/, text: '番号'},
  {key: 'address', re: /住所/, text: '住所'},
  {key: 'kana', re: /フリ[ガカ]ナ/, text: 'フリガナ'},
  {key: 'name', re: /氏名/, text: '氏名'},
  {key: 'birth', re: /生年月日/, text: '生年月日'},
  {key: 'care', re: /要介護状態|状態区分/, text: '要介護状態区分等'},
  {key: 'term', re: /有効期間|認定の有効|の有効期/, text: '認定の有効期間'},
  {key: 'office', re: /居宅介護支|居宅介護|介護支援事業/, text: '居宅介護支援事業者'},
  {key: 'burden', re: /利用者負担|負担の割合/, text: '利用者負担の割合'},
];

/** 1行の中のラベルの位置（字ごとの位置があればその字だけ、なければ語の位置） */
function findIn(line: OcrLine, re: RegExp): Rect | null {
  const chars: {text: string; x0: number; y0: number; x1: number; y1: number}[] = [];
  for (const w of line.words) {
    const cs = w.chars?.length ? w.chars : [...w.text].map((c, i, all) => ({text: c, x0: w.x0 + ((w.x1 - w.x0) * i) / all.length, x1: w.x0 + ((w.x1 - w.x0) * (i + 1)) / all.length, y0: w.y0, y1: w.y1}));
    for (const c of cs) for (const ch of c.text.normalize('NFKC')) if (ch.trim()) chars.push({...c, text: ch});
  }
  const text = chars.map((c) => c.text).join('');
  const m = re.exec(text);
  if (!m) return null;
  const used = chars.slice(m.index, m.index + m[0].length);
  return {x0: Math.min(...used.map((c) => c.x0)), y0: Math.min(...used.map((c) => c.y0)), x1: Math.max(...used.map((c) => c.x1)), y1: Math.max(...used.map((c) => c.y1))};
}

/** ページの中のラベルの位置（同じラベルが2つあれば上のもの） */
export function findLabels(page: OcrPage): Partial<Record<LabelKey, Rect>> {
  const out: Partial<Record<LabelKey, Rect>> = {};
  const lines = [...page.lines].sort((a, b) => Math.min(...a.words.map((w) => w.y0)) - Math.min(...b.words.map((w) => w.y0)));
  for (const l of LABELS) {
    for (const line of lines) {
      const r = findIn(line, l.re);
      // 「保険者番号」の「番号」を被保険者番号のラベルにしない
      if (r && !(l.key === 'number' && out.insurer && Math.abs(r.y0 - out.insurer.y0) < 4 && Math.abs(r.x1 - out.insurer.x1) < 4)) {
        out[l.key] = r;
        break;
      }
    }
  }
  return out;
}

/** 読んだ語を、切り出した所からページの位置に戻す（拡大した分も） */
const shiftXY = (p: OcrPage, dx: number, dy: number, kx: number, ky: number): OcrLine[] =>
  p.lines.map((l) => ({
    words: l.words.map((w) => ({
      text: w.text,
      conf: w.conf,
      x0: dx + w.x0 / kx,
      x1: dx + w.x1 / kx,
      y0: dy + w.y0 / ky,
      y1: dy + w.y1 / ky,
      chars: w.chars?.map((c) => ({text: c.text, x0: dx + c.x0 / kx, x1: dx + c.x1 / kx, y0: dy + c.y0 / ky, y1: dy + c.y1 / ky})),
    })),
  }));

/**
 * 読めなかった字がありそうか：読めた字と字の間（字の高さの 35% 以上あいた所）に、字の高さの 6 割以上の縦の画がある
 * （細い明朝の「1」がとなりの字にくっついて読めず「昭和13年」が「昭和3年」になる、など。形は合うので、確かめてもらう）
 */
export function missedStroke(ink: Uint8Array, w: number, h: number, lines: OcrLine[]): boolean {
  const cs = lines.flatMap((l) => l.words.flatMap((x) => (x.chars?.length ? x.chars : [x]))).sort((a, b) => a.x0 - b.x0);
  // 数字1字の幅が広すぎる（となりの「1」を含んで1字に読んだ）
  if (cs.some((c) => /^[0-9]$/.test(c.text.normalize('NFKC')) && c.x1 - c.x0 > (c.y1 - c.y0) * 0.85)) return true;
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1];
    const b = cs[i];
    const lh = Math.max(a.y1 - a.y0, b.y1 - b.y0, 8);
    if (b.x0 - a.x1 < lh * 0.35) continue;
    const y0 = Math.max(0, Math.floor(Math.min(a.y0, b.y0)));
    const y1 = Math.min(h, Math.ceil(Math.max(a.y1, b.y1)));
    for (let x = Math.ceil(a.x1 + 1); x < Math.floor(b.x0 - 1); x++) {
      if (x < 0 || x >= w) continue;
      let run = 0;
      let best = 0;
      for (let y = y0; y < y1; y++) {
        run = ink[y * w + x] ? run + 1 : 0;
        best = Math.max(best, run);
      }
      if (best >= lh * 0.6) return true;
    }
  }
  return false;
}

/** 横だけ sx 倍に広げる */
function stretch(img: Gray, sx: number): Gray {
  const W = Math.round(img.w * sx);
  const out = new Uint8Array(W * img.h);
  for (let y = 0; y < img.h; y++) {
    for (let X = 0; X < W; X++) {
      const fx = Math.min(img.w - 1, Math.max(0, (X + 0.5) / sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(img.w - 1, x0 + 1);
      const t = fx - x0;
      out[y * W + X] = Math.round(img.g[y * img.w + x0] * (1 - t) + img.g[y * img.w + x1] * t);
    }
  }
  return {g: out, w: W, h: img.h};
}

const meanConf = (lines: OcrLine[]) => {
  const cs = lines.flatMap((l) => l.words.map((w) => w.conf)).filter((c): c is number => typeof c === 'number');
  return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0;
};

/**
 * 切り出した所を読む。字の高さを 38・52・30 画素くらいに広げて読み、形の合う（ok）読みのうち多く同じに読めたもの
 * （同じ字でも大きさで読み違いが変わる。細い明朝の「1」がとなりの字にくっついて消える・6 と 8 など）
 */
async function readRect(img: Gray, r: Rect, mode: OcrMode, recognize: Recognize, lh: number, ok: (t: string) => boolean = () => true): Promise<OcrLine[]> {
  if (r.x1 - r.x0 < 4 || r.y1 - r.y0 < 4) return [];
  // まわりに白い余白（上下は r の外の字を入れないよう、白で埋める）
  const pad = Math.round(lh * 0.4);
  const inner = cropGray(img, r);
  const crop: Gray = {w: inner.w + pad * 2, h: inner.h + pad * 2, g: new Uint8Array((inner.w + pad * 2) * (inner.h + pad * 2)).fill(255)};
  for (let y = 0; y < inner.h; y++) crop.g.set(inner.g.subarray(y * inner.w, (y + 1) * inner.w), (y + pad) * crop.w + pad);
  // 半角のカタカナ（フリガナ）は横に1.5倍に広げると全角の形に近くなって読みやすい
  const sx = mode === 'kana' ? 1.5 : 1;
  // 3つの大きさで読み、形の合う読みのうち、同じ字に一番多く読めたもの（同じ数なら自信の高い方）。2回同じに読めたらそこでやめる
  const got: {lines: OcrLine[]; text: string; ok: boolean; conf: number}[] = [];
  for (const target of [38, 52, 30]) {
    const k = Math.min(4, Math.max(1, target / Math.max(lh, 8)));
    const img2 = sx === 1 ? (k === 1 ? crop : scaleGray(crop, k)) : stretch(scaleGray(crop, k), sx);
    const lines = shiftXY(await recognize(img2, mode), r.x0 - pad, r.y0 - pad, k * sx, k);
    const text = fixOcr(lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n')).replace(/\s+/g, '');
    got.push({lines, text, ok: !!text && ok(text), conf: meanConf(lines)});
    const same = got.filter((g) => g.ok && g.text === got[got.length - 1].text);
    if (same.length >= 2 || (got.length === 1 && got[0].ok && got[0].conf >= 92)) break;
  }
  const votes = (g: (typeof got)[number]) => got.filter((x) => x.ok === g.ok && x.text === g.text).length;
  const best = [...got].sort((a, b) => Number(b.ok) - Number(a.ok) || votes(b) - votes(a) || b.conf - a.conf)[0];
  return best?.lines ?? [];
}

/** 形を確かめる（読み直した値が決まった形か） */
const OK = {
  number: (t: string) => /(?<!\d)\d{10}(?!\d)/.test(t.replace(/\s/g, '')),
  birth: (t: string) => /(明治|大正|昭和|平成)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/.test(t),
  term: (t: string) => /(令和|平成).*年.*月.*日?.*(令和|平成).*年.*月/.test(t),
  care: (t: string) => /要\s*(支\s*援|介\s*護)\s*[1-5一二三四五]/.test(t),
  kana: (t: string) => t.replace(/[^ァ-ヺー]/g, '').length >= 2,
  name: (t: string) => t.replace(/[^々〆ぁ-ゖァ-ヺー一-鿿]/g, '').length >= 2,
  zip: (t: string) => /\d{3}\s*-\s*\d{4}/.test(t),
  insurer: (t: string) => t.replace(/\D/g, '').length >= 6,
  burden: (t: string) => /[123一二三]\s*割(?!合)/.test(t),
};

const labelWord = (text: string, r: Rect): OcrWord => ({text, ...r});
/** ラベルと値を1行に（値が何行かあれば、最初の行にラベル） */
const withLabel = (text: string, r: Rect, lines: OcrLine[]): OcrLine[] =>
  lines.length === 0 ? [] : [{words: [labelWord(text, r), ...lines[0].words], doubt: lines[0].doubt}, ...lines.slice(1)];

/** 読む画像の大きさ（長い辺）。これより大きい写真は縮める（読む時間がかかるだけで、よくならない） */
const MAX_SIDE = 2400;

/**
 * 保険証の画像1枚を読む。返すのは、切り出して読んだ行のページと、全体を読んだページ（parseCard にこの順で渡す）・回した角度・回した画像
 */
export async function readCardImage(src: Gray, recognize: Recognize, onStep: (step: string) => void = () => undefined): Promise<{pages: OcrPage[]; rotation: 0 | 90 | 180 | 270; image: Gray}> {
  const k = Math.min(1, MAX_SIDE / Math.max(src.w, src.h));
  const base = scaleGray(src, k);
  // 向き：字の行が縦なら 270・90°、横なら 0・180°から
  const ink0 = inkAdaptive(base);
  const cl0 = removeLines(base, ink0);
  const order: (0 | 90 | 180 | 270)[] = textIsVertical(inkOf255(cl0), cl0.w, cl0.h) ? [270, 90, 0, 180] : [0, 180, 270, 90];
  let best: {deg: 0 | 90 | 180 | 270; img: Gray; ink: Uint8Array; clean: Gray; whole: OcrPage; score: number} | null = null;
  for (const deg of order) {
    onStep(deg === order[0] ? '読んでいます' : '向きを変えて読んでいます');
    const img = rotateGray(base, deg);
    const ink = deg === 0 ? ink0 : inkAdaptive(img);
    const clean = deg === 0 ? cl0 : removeLines(img, ink);
    const whole = await recognize(clean, 'auto');
    const score = cardScore(pageText(whole));
    if (!best || score > best.score) best = {deg, img, ink, clean, whole, score};
    if (score >= 5) break;
  }
  const {deg, img, ink, clean, whole} = best!;
  // 罫線を消した画像の字の所（読めなかった字の画を探す。罫線は入れない）
  const cleanInk = inkOf255(clean);
  const doubt = (lines: OcrLine[]) => (lines.length && missedStroke(cleanInk, img.w, img.h, lines) ? lines.map((l) => ({...l, doubt: true})) : lines);
  onStep('読み直しています');
  // 全体を読んだ行にも（生年月日・有効期間の、読めなかった字がありそうな行）
  for (const l of whole.lines) if (/[年月]/.test(l.words.map((x) => x.text).join('')) && missedStroke(cleanInk, img.w, img.h, [l])) l.doubt = true;
  let labels = findLabels(whole);
  let pages: OcrPage[] = [whole];
  // 罫線を消すと段組みを読みちがえることがある（ラベルがほとんど読めない）ときは、罫線を残した白黒の画像でも読む
  if (Object.keys(labels).length < 4) {
    const raw = await recognize(despeckle(ink, img.w, img.h), 'auto');
    const rawLabels = findLabels(raw);
    if (Object.keys(rawLabels).length > Object.keys(labels).length) {
      labels = rawLabels;
      pages = [raw, whole];
    } else pages.push(raw);
  }
  const lines: OcrLine[] = [];
  const add = (ls: OcrLine[]) => lines.push(...ls);
  const lhOf = (r: Rect) => Math.max(10, r.y1 - r.y0);
  const band = (r: Rect, up: number, down: number) => ({y0: r.y0 - lhOf(r) * up, y1: r.y1 + lhOf(r) * down});
  const cell = (r: Rect, b: {y0: number; y1: number}, skip = 0, maxW?: number) => valueRect(ink, img.w, img.h, r, b, skip, maxW);

  // 位置から見つけた値の行（生年月日の行から上へ）を、その行だけ切り出して読み直す（ラベルが読めなくても）
  const loc = locateValues(pages[0]);
  const done = new Set<string>();
  if (loc) {
    const {lh, values: v} = loc;
    // 上下は、となりの行との間まで（となりの行の字を入れない）
    const box = (x: {box: Rect; room: {y0: number; y1: number}}, right = 1.5) => ({x0: x.box.x0 - lh * 0.4, y0: Math.max(x.room.y0, x.box.y0 - lh * 0.4), x1: x.box.x1 + lh * right, y1: Math.min(x.room.y1, x.box.y1 + lh * 0.4)});
    // 字の大きさは値ごと（氏名は大きく、フリガナは小さい）
    const hOf = (x: {box: Rect}) => Math.max(8, x.box.y1 - x.box.y0);
    // ラベルの代わり（値の左に置く。parseCard がラベルで項目を見分けるため）
    const tag = (b: Rect): Rect => ({x0: b.x0 - lh * 6, y0: b.y0, x1: b.x0 - lh * 4, y1: b.y1});
    if (v.number) {
      add(withLabel('番号', tag(v.number.box), await readRect(clean, box(v.number, 2.5), 'digits', recognize, hOf(v.number), OK.number)));
      done.add('number');
    }
    if (v.kana) {
      add(withLabel('フリガナ', tag(v.kana.box), await readRect(clean, box(v.kana, 3), 'kana', recognize, hOf(v.kana), OK.kana)));
      done.add('kana');
    }
    if (v.name) {
      add(withLabel('氏名', tag(v.name.box), await readRect(clean, box(v.name, 3), 'line', recognize, hOf(v.name), OK.name)));
      done.add('name');
    }
    if (v.birth) {
      const birth = doubt(await readRect(clean, box(v.birth, 0.6), 'date', recognize, hOf(v.birth), OK.birth));
      const gender = v.gender ? await readRect(clean, box(v.gender, 0.4), 'line', recognize, hOf(v.gender)) : [];
      const words = [...birth.flatMap((l) => l.words), ...gender.flatMap((l) => l.words).filter((w) => /[男女]/.test(w.text))];
      if (words.length) add([{words: [labelWord('生年月日', tag(v.birth.box)), ...words], doubt: birth.some((l) => l.doubt)}]);
      done.add('birth');
    }
  }

  // 値の字から（ラベルが読めなくても）：要介護度・負担の割合・居宅介護支援事業所（「〜センター」など）
  // 全体を読んだページ（罫線を消した・残した）のどちらかで見つかった所（同じ所は1つ）
  const findAll = (re: RegExp) => {
    const out: Rect[] = [];
    for (const r of pages.flatMap((p) => p.lines.map((l) => findIn(l, re)))) {
      if (r && !out.some((o) => Math.abs(o.x0 - r.x0) < (r.y1 - r.y0) && Math.abs(o.y0 - r.y0) < (r.y1 - r.y0))) out.push(r);
    }
    return out;
  };
  for (const r of findAll(/要(支援|介護)(?![状認])/).slice(0, 2)) {
    const lh = lhOf(r) / 1;
    add(withLabel('要介護状態区分等', {x0: r.x0 - lh * 8, y0: r.y0, x1: r.x0 - lh * 6, y1: r.y1}, await readRect(clean, {x0: r.x0 - lh * 0.3, y0: r.y0 - lh * 0.35, x1: r.x1 + lh * 3, y1: r.y1 + lh * 0.35}, 'care', recognize, lh, OK.care)));
  }
  for (const r0 of findAll(/[1-3123一二三lI|\]」]?\s*割(?!合)/).slice(0, 2)) {
    // 「割」の字の位置（前の数字の読み違いの字は入れない）
    const r = {...r0, x0: Math.max(r0.x0, r0.x1 - lhOf(r0) * 1.1)};
    const lh = lhOf(r);
    const tag = {x0: r.x0 - lh * 8, y0: r.y0, x1: r.x0 - lh * 6, y1: r.y1};
    let got = await readRect(clean, {x0: r.x0 - lh * 2.5, y0: r.y0 - lh * 0.4, x1: r.x1 + lh * 0.6, y1: r.y1 + lh * 0.4}, 'burden', recognize, lh, OK.burden);
    if (!OK.burden(fixOcr(got.map((l) => l.words.map((w) => w.text).join(' ')).join(' ')))) {
      // 細い「1」が読めないとき：「割」の左の1字だけを、数字1字として読む
      const digit = await readRect(clean, {x0: r.x0 - lh * 1.6, y0: r.y0 - lh * 0.3, x1: r.x0 - lh * 0.05, y1: r.y1 + lh * 0.3}, 'ratio', recognize, lh, (t) => /^[123]$/.test(t.trim()));
      const d = digit.flatMap((l) => l.words).find((w) => /^[123]$/.test(w.text.trim()));
      got = d ? [{words: [d, {text: '割', ...r}]}] : got;
    }
    add(withLabel('利用者負担の割合', tag, got));
  }
  // 認定の有効期間（と区分支給限度基準額の期間）：令和の日付が2つ並んだ行。日付の字だけで読み直す
  for (const r of findAll(/(令和|平成).{2,12}日.{0,3}(令和|平成)/).slice(0, 3)) {
    const lh = lhOf(r) / 1;
    add(withLabel('認定の有効期間', {x0: r.x0 - lh * 8, y0: r.y0, x1: r.x0 - lh * 6, y1: r.y1}, doubt(await readRect(clean, {x0: r.x0 - lh * 0.3, y0: r.y0 - lh * 0.3, x1: r.x1 + lh * 8, y1: r.y1 + lh * 0.3}, 'range', recognize, lh, OK.term))));
  }
  // 居宅介護支援事業者：届出年月日のちがう名前がいくつか読めたら、いちばん新しい届出のます（名前と届出年月日）だけを読み直す
  // （古い事業所の名前を読み直さない。ユーザーの指示「直近の…に担当している居宅介護支援事業者名を読む」）
  const offices = pages.flatMap((p) => officeEntries(p));
  const newest = latestOffice(offices);
  const several = !!newest?.date && offices.some((e) => e.date && e.date !== newest.date);
  if (newest && several) {
    const lh = lhOf(newest);
    const d = newest.dateBox ?? newest;
    const left = verticalLines(ink, img.w, img.h, newest.y0, newest.y1).filter((x) => x < newest.x0 - lh * 0.3 && x > newest.x0 - lh * 22).pop() ?? newest.x0 - lh * 0.5;
    const r = {x0: left + 3, y0: newest.y0 - lh * 0.35, x1: Math.max(newest.x1, d.x1) + lh * 0.5, y1: Math.max(newest.y1, d.y1) + lh * 0.35};
    add(withLabel('居宅介護支援事業者', {x0: left - lh * 6, y0: newest.y0, x1: left - lh * 4, y1: newest.y1}, await readRect(clean, r, 'block', recognize, lh)));
  } else {
    for (const r of findAll(/(センター|事業所|ステーション|ケアプラン|支援室)(?!の名称)/).slice(0, 2)) {
      const lh = lhOf(r);
      // 左は、事業所の名前のますの左の罫線まで（ラベルの字を入れない）
      const left = verticalLines(ink, img.w, img.h, r.y0, r.y1).filter((x) => x < r.x0 - lh && x > r.x0 - lh * 22).pop() ?? r.x0 - lh * 14;
      add(withLabel('居宅介護支援事業者', {x0: left - lh * 6, y0: r.y0, x1: left - lh * 4, y1: r.y1}, await readRect(clean, {x0: left + 3, y0: r.y0 - lh * 0.35, x1: r.x1 + lh * 0.5, y1: r.y1 + lh * 0.35}, 'line', recognize, lh)));
    }
  }

  const L = labels;
  if (L.number && !done.has('number')) add(withLabel('番号', L.number, await readRect(clean, cell(L.number, band(L.number, 0.5, 0.5)), 'digits', recognize, lhOf(L.number), OK.number)));
  if (L.kana && !done.has('kana')) add(withLabel('フリガナ', L.kana, await readRect(clean, cell(L.kana, band(L.kana, 0.6, 0.6)), 'kana', recognize, lhOf(L.kana), OK.kana)));
  if (L.name && !done.has('name')) add(withLabel('氏名', L.name, await readRect(clean, cell(L.name, band(L.name, 0.7, 0.7)), 'line', recognize, lhOf(L.name), OK.name)));
  if (L.birth && !done.has('birth')) {
    const b = band(L.birth, 0.5, 0.5);
    const birth = doubt(await readRect(clean, cell(L.birth, b), 'date', recognize, lhOf(L.birth), OK.birth));
    const gender = await readRect(clean, cell(L.birth, b, 1, lhOf(L.birth) * 4), 'line', recognize, lhOf(L.birth));
    const words = [...birth.flatMap((l) => l.words), ...gender.flatMap((l) => l.words).filter((w) => /[男女]/.test(w.text))];
    if (words.length) add([{words: [labelWord('生年月日', L.birth), ...words], doubt: birth.some((l) => l.doubt)}]);
  }
  if (L.address) {
    const cy = (L.address.y0 + L.address.y1) / 2;
    const lh = lhOf(L.address);
    add(withLabel('住所', L.address, await readRect(clean, cell(L.address, {y0: cy - lh * 1.9, y1: cy + lh * 1.9}), 'block', recognize, lh, OK.zip)));
  }
  if (L.care) add(withLabel('要介護状態区分等', L.care, await readRect(clean, cell(L.care, band(L.care, 0.8, 1.2)), 'block', recognize, lhOf(L.care), OK.care)));
  if (L.term) add(withLabel('認定の有効期間', L.term, await readRect(clean, cell(L.term, band(L.term, 0.7, 1.6)), 'block', recognize, lhOf(L.term), OK.term)));
  if (L.office && !several) add(withLabel('居宅介護支援事業者', L.office, await readRect(clean, cell(L.office, band(L.office, 0.8, 3.5)), 'block', recognize, lhOf(L.office))));
  if (L.insurer) {
    const lh = lhOf(L.insurer);
    const r = cell(L.insurer, band(L.insurer, 2.5, 1.0));
    add(withLabel('保険者番号', L.insurer, await readRect(clean, r, 'digitsBlock', recognize, lh, OK.insurer)));
    // 保険者の名称（番号のますの下。大きな字で「行 橋 市」）
    add(await readRect(clean, {x0: r.x0, y0: L.insurer.y0 - lh * 2.5, x1: r.x1, y1: L.insurer.y1 + lh * 6}, 'block', recognize, lh));
  }
  if (L.burden) {
    const lh = lhOf(L.burden);
    // 値（大きな字の「1割」）はラベルの下のます（ます1つ分の高さ＝字の高さ4つ分くらいまで）
    const r = {x0: L.burden.x0 - lh, y0: L.burden.y1 + lh * 0.2, x1: L.burden.x1 + lh, y1: L.burden.y1 + lh * 4.8};
    // ラベルの下のますの数字1つ（「割」が読めなくても、ここは負担の割合だけ）
    const got = await readRect(clean, r, 'burden', recognize, lh, (t) => OK.burden(t) || /^\s*[123]\s*$/.test(t));
    const words = got.flatMap((l) => l.words);
    const lone = words.length === 1 && /^[123]$/.test(words[0].text.trim());
    add(withLabel('利用者負担の割合', L.burden, lone ? [{words: [...words, {...words[0], text: '割', x0: words[0].x1, x1: words[0].x1 + 1}]}] : got));
  }
  return {pages: [{lines}, ...pages], rotation: deg, image: img};
}

/** 白黒の画像（0＝字・255＝地）の字の所 */
function inkOf255(img: Gray): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.g[i] < 128 ? 1 : 0;
  return m;
}
