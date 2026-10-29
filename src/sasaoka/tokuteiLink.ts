// 様邸の画面の「🛁 特定福祉用具申請書」のタブ：特定福祉用具のアプリ（太陽ポータルの tokutei/）を、この様邸のお客様の情報を渡して中に出す
// （ユーザーの指示「上のタブのところに、住宅改修申請書、特定福祉用具申請書、工事見積書、理由書の順番で、並べてください」「特定福祉用具アプリを出す」、2026-10-22）。
//   localStorage の TOKUTEI_KEY にお客様の情報（特定福祉用具の案件の項目の名前で）を書いてから、../tokutei/index.html#jutaku=<様邸の id>&embed=1&view=shinsei（販売見積書のタブは view=quote）を開く。
//   特定福祉用具は、その様邸の案件を開く（なければ作る）。住宅改修で変わった値だけ入れ直し、特定福祉用具で手で直した値はそのまま。
//   2つのアプリはコードもデータも分けている（ユーザーの指示「全く別物として作成」）。受け渡しの形を変えるときは、
//   特定福祉用具（同じリポジトリのブランチ claude/care-insurance-auto-transfer-3z0c9n）の src/tokutei/jutaku.ts も直す

import {INSURER_IDS, INSURER_INFO, jobInsurer, NO_SHINSEI} from './estimateForms.ts';
import {birthIso} from './riyu.ts';
import type {Insurer, Job, ShinseiInfo} from './types.ts';

export const TOKUTEI_KEY = 'taiyo-tokutei-from-jutaku-v1';
/** 特定福祉用具のアプリ（ポータルでは jutaku-mitsumori/・sasaoka/ のとなりの tokutei/） */
export const TOKUTEI_URL = '../tokutei/index.html';

/** 特定福祉用具に渡すお客様の情報（特定福祉用具の案件の項目の名前。保険者・負担割合は入っていなければ渡さない） */
export type TokuteiFields = {
  customer: string;
  kana: string;
  insuredNo: string;
  birthDate: string; // 'YYYY-MM-DD'
  gender: '' | '男' | '女';
  zip: string;
  address: string;
  tel: string;
  careLevel: string; // 要支援1〜要介護5
  insurer?: string; // kanda・yukuhashi・miyako・kouiki・fukuoka（特定福祉用具も同じ名前）
  burdenRatio?: 1 | 2 | 3;
  careOffice: string; // 居宅介護支援事業所（理由書の作成者の事業所）
  careManager: string; // ケアマネジャー（理由書の作成者）
  // 介護保険証から（入っていなければ渡さない。特定福祉用具の支給申請書に書くとき用。2026-10-22）
  careFrom?: string; // 認定の有効期間のはじめ 'YYYY-MM-DD'
  careTo?: string; // 認定の有効期間のおわり
  insurerNo?: string; // 保険者番号（6けた）
  welfare?: boolean; // 生活保護（介護ソフトの画面の給付情報が「生保」。生活保護のときだけ渡す。特定福祉用具の Sale の welfare。2026-10-23）
  // 担当（入っていなければ渡さない。特定福祉用具の案件の担当も様邸と同じ人に＝受注残にその担当で入る。ユーザーの指示「受注残に入れるとき当然担当名のところ、
  // 紐付けて受注残に飛ばせるようにしてください」2026-10-26。特定福祉用具で直した担当も様邸に返る）
  staff?: string;
};

export function tokuteiFields(job: Job): TokuteiFields {
  const info = {...NO_SHINSEI, ...job.shinsei};
  const insurer = jobInsurer(job);
  return {
    customer: job.customer.trim(),
    kana: info.kana.trim(),
    insuredNo: job.insuredNo.trim(),
    birthDate: birthIso(info),
    gender: info.gender === '男' || info.gender === '女' ? info.gender : '',
    zip: info.zip.trim(),
    address: job.address.trim(),
    tel: info.phone.trim(),
    careLevel: info.care,
    ...(insurer ? {insurer} : {}),
    ...(info.burden ? {burdenRatio: Number(info.burden) as 1 | 2 | 3} : {}),
    careOffice: info.reasonOffice.trim(),
    careManager: info.reasonName.trim(),
    ...(info.careFrom ? {careFrom: info.careFrom} : {}),
    ...(info.careTo ? {careTo: info.careTo} : {}),
    ...(info.insurerNo.trim() ? {insurerNo: info.insurerNo.trim()} : {}),
    ...(info.welfare ? {welfare: true} : {}),
    ...(job.staff.trim() ? {staff: job.staff.trim()} : {}),
  };
}

// ---------------------------------------------------------------- 特定福祉用具から住宅改修へ（⇔）
// ユーザーの指示「特定福祉用具の申請書を入力した場合であっても、住宅改修申請書、理由書、見積もりなどに、名前や住所なども転記されるようにする。⇔
// ただし、金額などを入れていない場合は、請求書や受注残にいれない」（2026-10-26）。
// 中の特定福祉用具のアプリが、お客様の情報を直したとき（直した項目だけ）と開いたとき（住宅改修で空の項目に、そこで入れてある値）に
// postMessage（TO_JUTAKU）で送ってくる（特定福祉用具の src/tokutei/jutaku.ts の jutakuChanges）。この様邸に入れる（申請書・理由書・見積書は同じ欄を読む）。
// 請求書に入れる（shikiri）・見積もり作成日は変えない＝見積書に行がなければ、請求書・売上見込み・受注残には入らない（hasEstimateRows）

export const TO_JUTAKU = 'taiyo-tokutei-to-jutaku';

/** 受け取った postMessage を読む（形がちがう・知らない値は捨てる） */
export function readFromTokutei(data: unknown): {job: string; fields: Partial<TokuteiFields>} | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.type !== TO_JUTAKU || typeof o.job !== 'string' || !o.job || !o.fields || typeof o.fields !== 'object') return null;
  const f = o.fields as Record<string, unknown>;
  const out: Partial<TokuteiFields> = {};
  for (const k of ['customer', 'kana', 'insuredNo', 'zip', 'address', 'tel', 'careOffice', 'careManager', 'careLevel'] as const) if (typeof f[k] === 'string') out[k] = f[k] as string;
  if (typeof f.staff === 'string' && f.staff.trim()) out.staff = f.staff.trim(); // 担当は空では消さない
  if (typeof f.birthDate === 'string' && /^(\d{4}-\d{2}-\d{2})?$/.test(f.birthDate)) out.birthDate = f.birthDate;
  if (f.gender === '' || f.gender === '男' || f.gender === '女') out.gender = f.gender;
  if (typeof f.insurer === 'string' && (INSURER_IDS as readonly string[]).includes(f.insurer)) out.insurer = f.insurer;
  if (f.burdenRatio === 1 || f.burdenRatio === 2 || f.burdenRatio === 3) out.burdenRatio = f.burdenRatio;
  if (typeof f.welfare === 'boolean') out.welfare = f.welfare;
  return {job: o.job, fields: out};
}

const ERA_FROM: [Exclude<ShinseiInfo['era'], ''>, string, number][] = [
  ['昭和', '1926-12-25', 1925],
  ['大正', '1912-07-30', 1911],
  ['明治', '1868-01-01', 1867],
];
/** 'YYYY-MM-DD' → 申請書の生年月日（元号・年・月・日）。空・平成からの日付・読めない日付は空 */
function birthParts(iso: string): Pick<ShinseiInfo, 'era' | 'birthY' | 'birthM' | 'birthD'> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const era = m && iso < '1989-01-08' ? ERA_FROM.find(([, from]) => iso >= from) : undefined;
  if (!m || !era) return {era: '', birthY: '', birthM: '', birthD: ''};
  return {era: era[0], birthY: String(Number(m[1]) - era[2]), birthM: String(Number(m[2])), birthD: String(Number(m[3]))};
}

/** 特定福祉用具で直したお客様の情報を様邸に入れる（変わらなければ同じ job を返す） */
export function withTokuteiFields(job: Job, f: Partial<TokuteiFields>): Job {
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const next: Job = {...job};
  const si: ShinseiInfo = {...info};
  if (f.customer !== undefined) next.customer = f.customer;
  if (f.insuredNo !== undefined) next.insuredNo = f.insuredNo;
  if (f.address !== undefined) next.address = f.address;
  if (f.staff) next.staff = f.staff;
  if (f.insurer && f.insurer !== jobInsurer(job)) {
    next.insurer = f.insurer as Insurer;
    next.form = INSURER_INFO[f.insurer as Insurer].form;
  }
  if (f.kana !== undefined) si.kana = f.kana;
  if (f.birthDate !== undefined && f.birthDate !== birthIso(info)) Object.assign(si, birthParts(f.birthDate));
  if (f.gender !== undefined) si.gender = f.gender;
  if (f.zip !== undefined) si.zip = f.zip;
  if (f.tel !== undefined) si.phone = f.tel;
  if (f.careLevel !== undefined && /^(要支援[12]|要介護[1-5])?$/.test(f.careLevel)) si.care = f.careLevel as ShinseiInfo['care'];
  if (f.burdenRatio !== undefined) si.burden = String(f.burdenRatio) as ShinseiInfo['burden'];
  if (f.careOffice !== undefined) si.reasonOffice = f.careOffice;
  if (f.careManager !== undefined) si.reasonName = f.careManager;
  if (f.welfare !== undefined) {
    if (f.welfare) si.welfare = true;
    else delete si.welfare;
  }
  const changedInfo = JSON.stringify(si) !== JSON.stringify(info);
  const same = !changedInfo && next.customer === job.customer && next.insuredNo === job.insuredNo && next.address === job.address && next.staff === job.staff && next.insurer === job.insurer && next.form === job.form;
  if (same) return job;
  return {...next, ...(changedInfo ? {shinsei: si} : {}), updatedAt: Date.now()};
}

// ---------------------------------------------------------------- カタログ（様邸の画面の左の「📖 カタログを表示」「🖨 カタログを印刷」）
// ユーザーの指示「赤枠の部分にカタログを表示とカタログを印刷という２つのボタンを設置する」（2026-10-26。🪪 介護保険証・介護ソフトの画面の枠の下）。
// 介援隊のカタログ（PDF と、それを読む部品）は特定福祉用具のアプリにあるので、🛁 のタブを開いて中のアプリに頼む
// （postMessage。特定福祉用具の src/tokutei/jutaku.ts の FROM_JUTAKU_CATALOG。中のアプリは見積もりの商品の載っているページを出す）

export const CATALOG_MSG = 'taiyo-tokutei-catalog';
export const CATALOG_EVENT = 'taiyo-sasaoka-catalog';
export type CatalogAction = 'show' | 'print';
let pendingCatalog: CatalogAction | null = null;

/** ボタンから：頼みを置いて知らせる（App.tsx が 🛁 のタブを開き、TokuteiEditor.tsx が中のアプリが出てから送る） */
export function askCatalog(action: CatalogAction) {
  pendingCatalog = action;
  window.dispatchEvent(new Event(CATALOG_EVENT));
}
/** 置いてある頼みを1回だけ取る */
export function takeCatalog(): CatalogAction | null {
  const a = pendingCatalog;
  pendingCatalog = null;
  return a;
}

/** タブの中に出す特定福祉用具のアプリの URL（その様邸の案件を開く。上の題名の段は出さない） */
/** 中に出す画面：申請書だけ（🛁 特定福祉用具申請書のタブ）・見積書だけ（🏷 販売見積書のタブ） */
export type TokuteiView = 'shinsei' | 'quote';
export const tokuteiUrl = (jobId: string, view: TokuteiView = 'shinsei') => `${TOKUTEI_URL}#jutaku=${encodeURIComponent(jobId)}&embed=1&view=${view}`;

/**
 * 特定福祉用具申請書のタブを離れる（タブを替える・一覧へ戻る）前に、中の特定福祉用具のアプリに、まだ保存していない変更を保存させて待つ。
 * 枠を消すと、中のアプリの保存が途中で止まって、直した値が消えるため（特定福祉用具の App.tsx の __taiyoTokuteiFlush）。待つのは長くても2秒
 */
export function flushTokutei(): Promise<void> {
  let saving: Promise<unknown> | undefined;
  try {
    const win = document.querySelector<HTMLIFrameElement>('iframe[data-tokutei]')?.contentWindow as (Window & {__taiyoTokuteiFlush?: () => Promise<unknown>}) | null | undefined;
    saving = win?.__taiyoTokuteiFlush?.();
  } catch {
    /* 中のアプリを読めなくても、タブは替える */
  }
  if (!saving) return Promise.resolve();
  return Promise.race([saving.then(() => undefined, () => undefined), new Promise<void>((done) => setTimeout(done, 2000))]);
}

/** お客様の情報を特定福祉用具に渡す（localStorage に書く。書けなければ false＝特定福祉用具は一覧から） */
export function writeTokutei(job: Job): boolean {
  try {
    localStorage.setItem(TOKUTEI_KEY, JSON.stringify({job: job.id, fields: tokuteiFields(job)}));
    return true;
  } catch {
    return false;
  }
}

/** 特定福祉用具が書いた案件ごとの金額のまとめ（売上見込み用。salesPlan.ts と同じ localStorage）に、この様邸の商品のある案件があるか */
export function tokuteiHasItems(jobId: string): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem('taiyo-tokutei-sales-v1') ?? 'null') as {rows?: {jutakuJob?: string}[]} | null;
    return !!raw?.rows?.some((r) => r.jutakuJob === jobId);
  } catch {
    return false;
  }
}

/**
 * 特定福祉用具の案件に商品の入っている様邸（id の集まり）。一覧の「特福」の印（tokuteiHasItems をまとめて。行ごとに localStorage を読まないように）
 */
export function tokuteiItemJobs(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem('taiyo-tokutei-sales-v1') ?? 'null') as {rows?: {jutakuJob?: string}[]} | null;
    return new Set((raw?.rows ?? []).map((r) => r.jutakuJob ?? '').filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * 特定福祉用具が書いた、様邸から開いた案件のお客様名（様邸の id → お客様名。商品のない作りかけもふくむ。salesSummary.ts の linked）。
 * 特定福祉用具申請書だけを作っている様邸（住宅改修の方にお客様名がない）も、一覧に名前を出す
 * （ユーザーの指示「特定福祉用具の申請書を作成途中の場合も、こちらの一覧には表示されるようにする」2026-10-26）
 */
export function tokuteiNames(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const raw = JSON.parse(localStorage.getItem('taiyo-tokutei-sales-v1') ?? 'null') as {rows?: {jutakuJob?: string; customer?: string}[]; linked?: {job?: string; customer?: string}[]} | null;
    for (const r of raw?.rows ?? []) if (r.jutakuJob && r.customer?.trim()) out.set(r.jutakuJob, r.customer.trim());
    for (const r of raw?.linked ?? []) if (r.job && r.customer?.trim()) out.set(r.job, r.customer.trim());
  } catch {
    /* 読めなければ名前なし */
  }
  return out;
}

export type TokuteiBook = {name: string; bytes: Uint8Array};
type FilesWindow = Window & {__taiyoTokuteiFiles?: (kinds: TokuteiView[]) => Promise<TokuteiBook[]>};
const filesOf = (frame: HTMLIFrameElement | null) => {
  try {
    return (frame?.contentWindow as FilesWindow | null | undefined)?.__taiyoTokuteiFiles;
  } catch {
    return undefined;
  }
};

/**
 * この様邸の特定福祉用具の申請書（shinsei）・販売見積書（quote）の Excel を、特定福祉用具のアプリに作ってもらう（「まとめて保存」。
 * ユーザーの指示「住宅改修申請書・特定福祉用具申請書・住宅改修見積もり・特定福祉用具販売見積もりを一括で保存できる機能をつける」2026-10-26）。
 * 特定福祉用具のタブを開いていればその枠に、なければ見えない枠でその様邸の案件を開いて頼む（特定福祉用具の App.tsx の __taiyoTokuteiFiles）。
 * 開くまで長くても20秒待つ。作れなければ例外
 */
export async function tokuteiFiles(job: Job, kinds: TokuteiView[]): Promise<TokuteiBook[]> {
  const open = document.querySelector<HTMLIFrameElement>('iframe[data-tokutei]');
  if (open && filesOf(open)) return filesOf(open)!(kinds);
  writeTokutei(job);
  const frame = document.createElement('iframe');
  frame.src = tokuteiUrl(job.id, 'shinsei');
  frame.title = '特定福祉用具（まとめて保存）';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const started = Date.now();
    while (!filesOf(frame)) {
      if (Date.now() - started > 20000) throw new Error('特定福祉用具のアプリを開けませんでした');
      await new Promise((r) => setTimeout(r, 200));
    }
    return await filesOf(frame)!(kinds);
  } finally {
    frame.remove();
  }
}
