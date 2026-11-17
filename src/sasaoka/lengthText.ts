// 申請書の長さ・寸法の欄の読み方（「600」「60cm」「0.6m」「L=600」「600×1800」「60×85cm」「600mm×2本」）。
// 申請書に書く L= と、見積書の切って使う部材の本数（cutLink.ts の dimsLengths）で同じ読み方にする（前は見積書の側が cm・m・「L=」を読まず、
// 申請書は L=600mm と書くのに見積書の手すりは1本まるごとのまま、「60 cm」は 60mm になっていた。2026-11-17 のコードの読み直しで見つけた）

/**
 * 寸法（mm）の数：打ったまま（全角は半角、うしろの mm は外す）。長さ（many）は区切り（, 、 x * すき間）を「×」に。
 * ただし「1,600」のような3けた区切り（前が1〜2けた）は区切りにしない。
 * cm・m で打った数は mm にする（「60cm」→「600」・「0.6m」→「600」。単位が最後の数にだけあれば「60×85cm」の全部を cm と見る）。
 * 前に打った「L=」「H=」なども外す（書くときに「L=600mm」と付ける。そのままだと「L=L=600mm」「L=60cmmm」になっていた）
 */
const UNIT = /(mm|cm|m|ミリ(?:メートル)?|センチ(?:メートル)?|メートル)$/i;
export function mmText(v: string | undefined, many = false): string {
  const t = (v ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/^[LHWD]\s*=?\s*(?=\d)/i, '')
    .replace(/(\d)\s+(?=(?:mm|cm|m)(?![a-z])|ミリ|センチ|メートル)/gi, '$1');
  if (!many) return mmOf(t);
  const parts = t
    .replace(/(^|\D)(\d{1,2}),(\d{3})(?!\d)/g, '$1$2$3')
    .split(/\s*[,、xX*×+\s]+\s*/)
    .map((x) => x.replace(/本$/, '')) // 「600mm×2本」の「2本」は本数の 2（前は「L=600mm×2本mm」と書いていた）
    .filter(Boolean);
  const last = UNIT.exec(parts.at(-1) ?? '')?.[1];
  const unit = last && parts.slice(0, -1).every((x) => /^\d+(\.\d+)?$/.test(x)) ? last : undefined;
  return parts.map((x) => mmOf(x, unit)).join('×');
}

/**
 * 長さの欄の1本ずつの長さ（mm）。「600×2」の ×2 は本数（600mm を2本。見積書の本数の `dimsLengths` と同じ読み方。前は申請書に「L=600mm×2mm」と書いていた）
 */
export function lengthParts(v: string | undefined): string[] {
  const out: string[] = [];
  for (const x of mmText(v, true).split('×').filter(Boolean)) {
    const prev = out.at(-1);
    if (prev !== undefined && /^\d{1,2}$/.test(x) && Number(x) > 0) for (let k = 1; k < Number(x); k++) out.push(prev);
    else out.push(x);
  }
  return out;
}

/** 1つの寸法（「600」「600mm」「60cm」「0.6m」）→ mm の数。数でなければ打ったまま */
function mmOf(t: string, unit?: string): string {
  const m = /^(\d+(?:\.\d+)?)(mm|cm|m|ミリ(?:メートル)?|センチ(?:メートル)?|メートル)?$/i.exec(t);
  if (!m) return t.replace(/\s*mm$/i, '');
  const u = (m[2] ?? unit ?? 'mm').toLowerCase();
  const scale = u === 'cm' || u.startsWith('センチ') ? 10 : u === 'm' || u === 'メートル' ? 1000 : 1;
  return scale === 1 ? m[1] : String(Math.round(Number(m[1]) * scale));
}
