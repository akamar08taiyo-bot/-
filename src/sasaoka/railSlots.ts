// 申請書で箇所を入れたときに、見積書にその箇所の空きの行（手すり・ブラケット・施工費など）を作る。
// ユーザーの指示（2026-11-03「申請書を作成した際の、見積もりへの転記のルール」）：
//   ・マツ六の木手すりは、手すりで1行・ブラケットで1行・施工費で1行。木手すり＋ベースプレート、600×800（L字）なども同じ
//   ・TOTO は手すりが既製品なので、材料費で1行・施工費で1行
//   ・屋外の手すりで高さがある（支柱＋手すり）ときは、支柱・手すり・ブラケット・施工費の分
//   ・施工費は基本的に1か所につき1行（特例は自分で挿入して足す）
// 空きの行は空白の部材の行（`isBlankRow`）に名前（`Row.slot`）を付けたもの。見積書の画面では内容の欄に薄い字で「（手すり）」と出し、
// その行を選んで「部材リストから入れる」「施工費から入れる」を押すと、その行に入る（`insertRowsAt`・`laborSpot` は空白の行を置きかえる）。
// 印刷・Excel には、入れなかった空きの行は出さない（`estimateForms.ts` の `shownLines`）。
// 見積書にまだ何も入れていない箇所だけ作り直す（何か入れたら、そのあとは手で。足りない行は「挿入」で足す）。
// ベースプレートの長さを入れた木手すりは、ベースプレートの行も1つ作る（ベースプレートの長さ・金額が見積書に入るように。cutLink.ts）

import {isBlankRow} from './calc.ts';
import {manualRow} from './rows.ts';
import type {Place, RailType, Row} from './types.ts';

/** 手すりの種類の選び方（申請書の手すりの取り付けの箇所） */
export const RAIL_TYPES: {value: RailType; label: string}[] = [
  {value: 'wood', label: '木手すり'},
  {value: 'ready', label: '既製品（TOTO など）'},
  {value: 'post', label: '屋外（支柱）'},
];

/** 屋外の箇所の名前（「玄関～道路」「屋外・アプローチ」など） */
export const OUTDOOR = /屋外|道路|アプローチ|庭|門|外構|駐車|ポーチ|外部/;

/** 箇所の手すりの種類：選んであればそれ、なければ屋外で高さを入れてあれば屋外（支柱）、ほかは木手すり */
export function railType(p: Pick<Place, 'rail' | 'name' | 'dims'>): RailType {
  if (p.rail) return p.rail;
  return OUTDOOR.test(p.name) && !!p.dims?.h?.trim() ? 'post' : 'wood';
}

/** 箇所の空きの行の名前（上から順に） */
export function slotNames(p: Pick<Place, 'kind' | 'rail' | 'name' | 'dims' | 'plateLength'>): string[] {
  if (p.kind !== 1) return ['材料費', '施工費'];
  const plate = p.plateLength?.trim() ? ['ベースプレート'] : [];
  switch (railType(p)) {
    case 'ready':
      return ['材料費', '施工費'];
    case 'post':
      return ['支柱', '手すり', ...plate, 'ブラケット', '施工費'];
    default:
      return ['手すり', ...plate, 'ブラケット', '施工費'];
  }
}

/**
 * 見積書にまだ何も入れていない箇所（空白の行だけ）の行を、その箇所の空きの行にする。何か入れてある箇所・同じ空きの行の箇所はそのまま。
 * 前からある空白の行は id を残して名前だけ付ける（見積書で選んでいる行が消えないように）
 */
export function withSlots(p: Place): Place {
  if (p.rows.some((r) => !isBlankRow(r))) return p;
  const names = slotNames(p);
  if (p.rows.length === names.length && p.rows.every((r, i) => r.slot === names[i])) return p;
  const rows: Row[] = names.map((slot, i) => (p.rows[i] ? {...p.rows[i], slot} : manualRow('material', {qty: 1, slot})));
  return {...p, rows};
}

/** 空きの行（名前の付いた空白の行。まだ何も入れていない） */
export const isOpenSlot = (r: Row) => !!r.slot && isBlankRow(r);

/** 空きの行を選んで「部材リストから入れる」を押したときに、部材を選ぶ画面の検索の欄に入れておく言葉（なければ ''） */
export function slotQuery(slot: string | undefined): string {
  return slot === 'ブラケット' || slot === '支柱' || slot === 'ベースプレート' ? slot : '';
}

// ---------------------------------------------------------------- 既製品の手すりの長さ（見積書 → 申請書）
// ユーザーの指示（2026-11-03）「見積もりから先に作成する場合も、申請書に逆添付するようにする。手すり部材の長さから、手すりの長さを予測して入力する／
// TOTOなど（マツ六、やざきもある）、既製品については、既製品の長さから読み取って長さを入力する」。
// 切って使う手すり（使う長さを入れた行）は前から申請書の長さの薄い字・申請書に書く長さになる（shinsei.ts の `estimateLength`）。
// 既製品（長さの決まった手すり。切らずに使う）は、商品名の長さ（「I型 600mm」「L=800」。部材の1本の長さ `pieceLengthM`）を取り付ける長さにする。
// L型（「L型 600×800」）は2本（600×800）

/** 手すりの本体（部品・ベースプレート・補強板・支柱はのぞく） */
const RAIL_NAME = /手すり|手摺|ハンドレール|グリップ|バー/;
const NOT_RAIL = /ブラケット|キャップ|ジョイント|金具|受け|ベース|カバー|エンド|スタンド|支柱|アダプター|スペーサー|ソケット|ホルダー|チーズ|エルボ|プレート|補強板|取付板|ビス|ネジ|ねじ|自在|コーナー/;

/** 既製品の手すりの行の、取り付ける長さ（mm。1本ずつ）。既製品の手すりでない・長さが読めなければ [] */
export function readyLengths(r: Row): number[] {
  if (r.kind !== 'material' || isBlankRow(r) || r.lengthCm > 0 || !(r.qty > 0)) return [];
  const text = `${r.estText ?? ''} ${r.name}`.normalize('NFKC');
  if (!RAIL_NAME.test(text) || NOT_RAIL.test(text)) return [];
  // 4m・2m の材（切って使う手すりの1本まるごと）は、取り付ける長さが分からないので数えない（cutLink.ts の `railRuns` と同じ）
  if (!(r.pieceLengthM > 0) || r.pieceLengthM >= 1.5) return [];
  const count = Math.max(1, Math.round(r.qty));
  const l = /L\s*[型字]/i.test(text) ? /(\d{3,4})\s*(?:mm)?\s*[×xX*]\s*(\d{3,4})\s*(?:mm)?/.exec(text) : null;
  const one = l ? [Number(l[1]), Number(l[2])] : [Math.round(r.pieceLengthM * 1000)];
  return Array.from({length: count}, () => one).flat();
}
