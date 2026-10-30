// 様邸の画面の「✉ メールで送付」：チェックした書類の Excel を付けたメール（ユーザーの指示「メールで送付…基本的には一括で全てメールできるような形に…
// デフォルトは一つだけチェック。その開いている…住宅改修申請書であれば、住宅改修申請書のみ送付」2026-10-30。DocsDialog.tsx）。
// 販売受注簿作成ツール（taiyo-hacchu-scan の src/lib/mailDraft.mjs）・売上伝票発行依頼書と同じ作り（添付を何個でも付けられるようにした写し）：
// ・パソコンは、添付にする Excel を保存して、メールのソフト（mailto:）で件名・本文の入った新しいメールを開く。mailto: ではファイルを付けられないので、
//   保存したファイルはダウンロードの一覧からメールにドラッグして付ける（添付の .eml は Edge が「デバイスに問題を起こす可能性があります」と止めるのでやめた）。
// ・スマホ・タブレットは共有メニュー（navigator.share）で、メールのアプリにファイルと本文を渡す（添付も入る）。

/**
 * メールのソフトに渡せる mailto: の長さ。Chromium（Edge・Chrome）は Windows でほかのアプリに渡す URL を 2048 字までにしていて、
 * それより長いと何も開かない。日本語は1字が %XX×3 の9字になる
 */
export const MAILTO_MAX = 2000;

import type {Job, Settings} from './types.ts';

export type Mail = {to?: string[]; subject: string; body: string};
export type Attachment = {name: string; type: string; bytes: Uint8Array};

/** mailto: の URL（宛先・件名・本文。本文の改行は %0D%0A） */
export function buildMailto({to = [], subject, body}: Mail): string {
  const query = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`];
  return `mailto:${to.map(encodeURIComponent).join(',')}?${query.join('&')}`;
}

/** メールのソフトに渡せる長さに収まるか（長い本文は呼ぶ側で行を減らす） */
export function mailtoFits(mail: Mail): boolean {
  return buildMailto(mail).length <= MAILTO_MAX;
}

/**
 * スマホ・タブレット（共有メニューでメールのアプリに渡せる端末）か。iPad はパソコンの Mac と同じ名前（Macintosh）で、Android のタブレットは
 * 「PC版サイト」の表示だと Linux のパソコンの名前で来るので、指で触れる画面かどうかでも見分ける。
 * Windows のパソコンは共有メニューにメールのソフトが出ないことがあるので、指で触れる画面でもパソコンと同じ（保存＋メールのソフト）
 */
export function isMobileDevice(nav: (Navigator & {userAgentData?: {platform?: string}}) | null = typeof navigator === 'undefined' ? null : navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  const touch = (nav.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || nav.userAgentData?.platform === 'Android' || (/Macintosh|X11; Linux/.test(ua) && touch);
}

/**
 * iPhone・iPad か（iPad はパソコンの Mac と同じ名前で来るので、指で触れる画面かどうかでも見分ける）。Safari は続けて保存すると初めの1つしか保存しない
 * （ユーザーの報告「画面上は3つ選択されているが、メールにそのまま添付したら、一つ（住宅改修申請書）しか届いていない」2026-10-30）ので、2つ以上は共有メニューで渡す
 */
export function isAppleMobile(nav: Navigator | null = typeof navigator === 'undefined' ? null : navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

/** 共有メニューに渡すもの（ファイルを渡せない端末は null）。本文がなければ文は渡さない（「ファイルに保存」で文の .txt まで保存されないように） */
export function shareData(mail: Mail, files: Attachment[]): ShareData | null {
  if (typeof File !== 'function' || typeof navigator === 'undefined' || !navigator.canShare) return null;
  const data: ShareData = {files: files.map((f) => new File([f.bytes as BlobPart], f.name, {type: f.type})), title: mail.subject, ...(mail.body ? {text: mail.body} : {})};
  return navigator.canShare({files: data.files}) ? data : null;
}

/**
 * 共有メニューを開く。戻り値：'shared'・'cancelled'（やめた）・'tap'（ファイルを作っているあいだに、押した操作の続きと見なされなくなった。
 * iPad の Safari などは数秒で切れる → もう一度押してもらう）・'failed'
 */
export async function share(data: ShareData): Promise<'shared' | 'cancelled' | 'tap' | 'failed'> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    return name === 'AbortError' ? 'cancelled' : name === 'NotAllowedError' ? 'tap' : 'failed';
  }
}

/**
 * 押した操作の続きと見なされているか（mailto: でメールのソフトを開くのは、ブラウザが押した操作の続きのときだけ許す。数秒で切れる）。
 * 分からないブラウザは開けるものとする
 */
export function stillActive(): boolean {
  const ua = (typeof navigator === 'undefined' ? undefined : navigator) as (Navigator & {userActivation?: {isActive: boolean}}) | undefined;
  return ua?.userActivation ? ua.userActivation.isActive : true;
}

/** メールのソフトで新しいメールを開く（リンクを押したのと同じ） */
export function openMailto(mail: Mail): void {
  const a = document.createElement('a');
  a.href = buildMailto(mail);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * メールの件名・本文（宛先はメールのソフト・アプリで入れる）。labels は書類の名前（タブの順）、names は付けるファイルの名前（本文の「（添付）」に並べる。
 * パソコンは mailto: で添付できないので、どのファイルを付けるか分かるように）
 */
export function docsMail(job: Job, s: Settings, labels: string[], names: string[]): Mail {
  const who = job.customer.trim() ? `${job.customer.trim()}様` : '';
  const what = labels.join('・');
  const sign = [[s.company, s.officeName].filter(Boolean).join(' '), job.staff?.trim() ? `担当：${job.staff.trim()}` : '', s.tel ? `TEL ${s.tel}` : ''].filter(Boolean);
  const body = (list: string[]) =>
    [
      'お世話になっております。',
      `${who ? `${who}の` : ''}${what}をお送りします。`,
      'ご確認のほど、よろしくお願いいたします。',
      ...(list.length ? ['', '（添付）', ...list.map((n) => `・${n}`)] : []),
      ...(sign.length ? ['', ...sign] : []),
    ].join('\n');
  const subject = `${who ? `${who} ` : ''}${what}の送付`;
  // メールのソフトに渡せる長さを超えるときは、添付の名前の並びを外す
  return mailtoFits({subject, body: body(names)}) ? {subject, body: body(names)} : {subject, body: body([])};
}
