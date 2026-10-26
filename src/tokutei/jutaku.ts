// 住宅改修のアプリ（太陽ポータルの jutaku-mitsumori/・sasaoka/）の様邸の画面の「🛁 特定福祉用具申請書」のタブから、このアプリを開いたとき
// （ユーザーの指示「上のタブを 住宅改修申請書、特定福祉用具申請書、工事見積書、理由書 の順番で」「特定福祉用具アプリを出す」、2026-10-22）。
//   住宅改修は ../tokutei/index.html#jutaku=<様邸の id>&embed=1 を iframe で開き、その前にお客様の情報を localStorage の JUTAKU_KEY に書く。
//   このアプリは、その様邸の案件（Sale.jutakuJob）を開く（なければ作る）。住宅改修で変わった値だけ入れ直し、ここで手で直した値はそのまま。
//   2つのアプリはコードもデータも分けている（ユーザーの指示「全く別物として作成」）。受け渡しの形を変えるときは、
//   住宅改修（リポジトリ akamar08taiyo-bot/- のブランチ claude/sasaoka-shikiri-app）の src/sasaoka/tokuteiLink.ts も直す

import {CARE_LEVELS, INSURERS} from './defaults.ts';
import {newSale} from './sales.ts';
import type {BurdenRatio, Gender, JutakuFields, Sale, Settings} from './types.ts';

export const JUTAKU_KEY = 'taiyo-tokutei-from-jutaku-v1';

export type JutakuHandoff = {job: string; fields: JutakuFields};

// 担当（staff）も受け取る（住宅改修の様邸の担当＝受注残に入る担当。入っていなければ住宅改修は渡さない。2026-10-26）
const TEXT = ['customer', 'kana', 'insuredNo', 'zip', 'address', 'tel', 'careOffice', 'careManager', 'staff'] as const;
/** 住宅改修から受け取る項目（JutakuFields）の全部 */
const KEYS = [...TEXT, 'birthDate', 'gender', 'careLevel', 'insurer', 'burdenRatio', 'welfare'] as const;

/** 受け取った値を案件の値に直す（そのまま入れられない値は捨てる。保存してある jutakuSync を読み込むときも） */
export function cleanJutakuFields(raw: Record<string, unknown>): JutakuFields {
  const out: JutakuFields = {};
  for (const k of TEXT) if (typeof raw[k] === 'string') out[k] = raw[k];
  if (typeof raw.birthDate === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(raw.birthDate)) out.birthDate = raw.birthDate;
  if (raw.gender === '' || raw.gender === '男' || raw.gender === '女') out.gender = raw.gender as Gender;
  if (typeof raw.careLevel === 'string') {
    const level = raw.careLevel.normalize('NFKC').replace(/\s+/g, '');
    if (level === '' || CARE_LEVELS.includes(level)) out.careLevel = level;
  }
  if (typeof raw.insurer === 'string' && INSURERS.some((i) => i.key === raw.insurer && i.key !== 'other')) out.insurer = raw.insurer;
  if (raw.burdenRatio === 1 || raw.burdenRatio === 2 || raw.burdenRatio === 3) out.burdenRatio = raw.burdenRatio as BurdenRatio;
  // 生活保護（介護扶助）：住宅改修が渡すのは入っているときだけ（welfare?: boolean）。true・false のほかは捨てる
  if (typeof raw.welfare === 'boolean') out.welfare = raw.welfare;
  return out;
}

/** localStorage の受け渡しを読む。開いた様邸（URL の jutaku）のものでなければ・形がちがえば null */
export function readJutaku(raw: string | null, job: string): JutakuHandoff | null {
  if (!raw || !job) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (o.job !== job || !o.fields || typeof o.fields !== 'object') return null;
    return {job, fields: cleanJutakuFields(o.fields as Record<string, unknown>)};
  } catch {
    return null;
  }
}

const sameValue = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');

/** 案件の今の値（受け取る項目だけ）。作ったときに、受け取らなかった項目の初めの値（負担割合1割・保険者など）も「住宅改修から入れたまま」とみなすため */
export function syncedValues(sale: Sale): JutakuFields {
  const out: JutakuFields = {};
  for (const k of KEYS) Object.assign(out, {[k]: sale[k]});
  return out;
}

/**
 * その様邸の案件を開く。なければ、受け取った情報を入れた案件を作る（保険者も住宅改修と同じ）。
 * あれば、住宅改修で変わった値（前に受け取った値＝jutakuSync とちがう）を、ここでまだ直していない項目（前に受け取った値のまま・空）にだけ入れる。
 * jutakuSync は作ったときの値（受け取らなかった項目は初めの値）から始め、受け取るたびにその値で上書きする（あとで住宅改修で負担割合・保険者を入れても入るように）。
 * 同じ様邸の案件が2つ以上なら（「写す」で作った）いちばん新しいもの
 */
export function applyJutaku(sales: Sale[], settings: Settings, h: JutakuHandoff, now = Date.now()): {sales: Sale[]; id: string} {
  // 担当は空では入れない（住宅改修で担当を選んでいなければ、この案件の担当のまま）
  if (h.fields.staff !== undefined && !h.fields.staff.trim()) {
    const {staff: _blank, ...rest} = h.fields;
    h = {...h, fields: rest};
  }
  const linked = sales.filter((s) => s.jutakuJob === h.job).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!linked) {
    const sale: Sale = {...newSale(sales, settings, h.fields.insurer ?? INSURERS[0].key, now), ...h.fields, jutakuJob: h.job};
    sale.jutakuSync = syncedValues(sale);
    return {sales: [sale, ...sales], id: sale.id};
  }
  // 生活保護は 2026-10-23 から受け取る。それより前に作った案件の jutakuSync には無いので、初めの値（なし）を受け取ったものとみなす
  // （ここでまだ選んでいなければ、住宅改修で入れた生活保護が入る。ここで選んだ値はそのまま）
  // 担当も 2026-10-26 から受け取る。それより前に作った案件は、作ったときの担当（担当者の候補の1人目）を受け取ったものとみなす（ここで選び直した担当はそのまま）
  const prev: JutakuFields = {welfare: false, staff: settings.staffList[0] ?? '', ...linked.jutakuSync};
  const patch: Partial<Sale> = {};
  for (const key of Object.keys(h.fields) as (keyof JutakuFields)[]) {
    const value = h.fields[key];
    const cur = linked[key];
    if (sameValue(cur, value)) continue;
    if (sameValue(cur, '') || sameValue(cur, prev[key])) Object.assign(patch, {[key]: value});
  }
  // 保険者を入れ直したら、個別切り上げも保険者に合わせる（案件の画面で保険者を選び直したときと同じ）
  if (patch.insurer) patch.perItem = INSURERS.find((i) => i.key === patch.insurer)?.perItem ?? false;
  const sync: JutakuFields = {...prev, ...h.fields};
  const synced = KEYS.every((k) => prev[k] === sync[k]);
  if (Object.keys(patch).length === 0 && synced) return {sales, id: linked.id};
  const next: Sale = {...linked, ...patch, jutakuSync: sync, updatedAt: Object.keys(patch).length ? now : linked.updatedAt};
  return {sales: sales.map((s) => (s.id === linked.id ? next : s)), id: linked.id};
}

/**
 * 住宅改修の様邸の画面の左（🪪 介護保険証の枠の下）の「📖 カタログを表示」「🖨 カタログを印刷」から届く（ユーザーの指示「赤枠の部分にカタログを表示と
 * カタログを印刷という２つのボタンを設置する」2026-10-26）。住宅改修は 🛁 のタブを開いてから送る（住宅改修の src/sasaoka/tokuteiLink.ts の CATALOG_MSG）
 */
export const FROM_JUTAKU_CATALOG = 'taiyo-tokutei-catalog';
export type CatalogAsk = {action: 'show' | 'print'; n: number};

// ---------------------------------------------------------------- このアプリから住宅改修へ（⇔）
// ユーザーの指示「特定福祉用具の申請書を入力した場合であっても、住宅改修申請書、理由書、見積もりなどに、名前や住所なども転記されるようにする。⇔
// ただし、金額などを入れていない場合は、請求書や受注残にいれない」（2026-10-26）。住宅改修のタブの中で開いたとき、
// お客様の情報を直したら、直した項目だけを住宅改修に送る（postMessage。住宅改修の src/sasaoka/tokuteiLink.ts の readFromTokutei・withTokuteiFields）。
// 開いたときは、住宅改修で空の項目に、ここで入れてある値を送る（住宅改修の値は上書きしない）。請求書・受注残に入れるかは住宅改修が決める（見積書の行）

export const TO_JUTAKU = 'taiyo-tokutei-to-jutaku';

const empty = (v: unknown) => v === undefined || v === null || v === '';

/**
 * 住宅改修に送る項目：sent（前に送った・開いたときの値）があれば、そこから変わった項目。なければ（開いたとき）、
 * 住宅改修から受け取った値（given）が空で、ここで入れてある項目
 */
export function jutakuChanges(sale: Sale, sent: JutakuFields | null, given: JutakuFields | null): JutakuFields {
  const now = syncedValues(sale);
  const out: JutakuFields = {};
  for (const k of KEYS) {
    if (sent) {
      if (!sameValue(now[k], sent[k])) Object.assign(out, {[k]: now[k] ?? ''});
    } else if (given && empty(given[k]) && !empty(now[k]) && k !== 'welfare' && k !== 'staff' && !sameValue(now[k], sale.jutakuSync?.[k])) {
      // 開いたときは担当を送らない（作ったときの担当＝担当者の候補の1人目を、住宅改修の担当にしてしまわないように。ここで選び直したら送る）
      Object.assign(out, {[k]: now[k]});
    }
  }
  return out;
}
