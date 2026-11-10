// （株）イヤーズ デモアプリのビルドで、役所の原本（*.xltx）に書いてある社内の字（会社名・営業所・所在地・電話・所長・担当者・作成者）を消す
// （vite.years.config.ts から。アプリの中では使わない）。字は同じ長さの空白にする（ふりがな＝rPh の位置がずれないように）
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {COMPANY_NAME, DEFAULT_STAFF, OFFICES, ORIGINAL_OFFICE_TEXTS} from '../company.ts';

/** 原本から消す字（長いものから先に置きかえる） */
export const SECRETS: string[] = [
  ...new Set(
    [
      '太陽シルバーサービス株式会社',
      '太陽シルバーサービス㈱',
      '太陽シルバーサービス（株）',
      '太陽シルバーサービス',
      COMPANY_NAME,
      ...Object.values(ORIGINAL_OFFICE_TEXTS),
      ...OFFICES.flatMap((o) => [o.name, o.address, o.address.replace(/^(福岡|佐賀|長崎|熊本|大分)県/, ''), o.tel, o.fax, o.manager, o.manager.replace(' ', '　')]),
      ...DEFAULT_STAFF.flatMap((n) => [n, n.replace(' ', '　'), n.replace(' ', '')]),
    ].filter((t) => t && t.length >= 3),
  ),
].sort((a, b) => b.length - a.length);

/** 同じ長さの空白（半角の字は半角の空白、ほかは全角の空白） */
const blank = (t: string) => [...t].map((c) => (/[\x20-\x7e]/.test(c) ? ' ' : '　')).join('');
const escXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 原本の zip の中の XML から社内の字を消す。残っていたら止める（ビルドを失敗させる） */
export function scrubTemplate(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  for (const [name, data] of Object.entries(files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    let xml = strFromU8(data);
    for (const s of SECRETS) xml = xml.split(escXml(s)).join(blank(s));
    // 作った人・会社の名前（docProps）
    xml = xml.replace(/<(dc:creator|cp:lastModifiedBy|Company|Manager)>[^<]*<\/\1>/g, '<$1></$1>');
    if (/太陽|シルバーサービス/.test(xml)) throw new Error(`原本 ${name} に会社名が残っています`);
    files[name] = strToU8(xml);
  }
  return zipSync(files);
}
