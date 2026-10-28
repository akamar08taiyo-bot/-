import {useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Btn, useToast} from '../components/ui.tsx';
import type {Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {removeEstimate} from './EstimateList.tsx';

/** 様邸の名前と、2段目のボタン（Excelで保存・印刷・削除）のあいだに、少なくともあける幅（px） */
const MIN_GAP = 16;

/** 様邸の画面の「← 一覧へ戻る」。どのタブでも同じ大きさにする（大きさが違うと、すぐ右のタブの位置がタブごとにずれる） */
export function BackButton({onClick}: {onClick: () => void}) {
  return (
    <Btn color="white" onClick={onClick} className="lg:!text-base">
      ← 一覧へ戻る
    </Btn>
  );
}

/**
 * 様邸の「削除」（ゴミ箱に移す。確かめてから。完全に消すのはゴミ箱のタブから）。住宅改修申請書・工事見積書・理由書のどのタブでも同じボタン・同じ色（白）
 * （ユーザーの指示「住宅改修申請書、販売申請書、理由書、工事見積書全てに削除ボタンを設置する。ボタンの色は統一する」2026-10-28。前は工事見積書のタブだけ）
 */
export function RemoveJobButton({job, settings, update, onBack}: {job: Job; settings: Settings; update: Update; onBack: () => void}) {
  const toast = useToast();
  return (
    <Btn color="white" onClick={() => removeEstimate(job, settings, update, toast) && onBack()}>
      削除
    </Btn>
  );
}

/**
 * 様邸の画面（5つのタブ：住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書）の上の段。どのタブでも同じ形・同じ位置・同じ大きさ・同じ色
 * （ユーザーの指示「各タブでEXCEL印刷や保存など、表記の方法やタブの大きさ、順番を統一する。…基本的な並びは、申請書をEXCELで保存、申請書（見積書を印刷）、削除（白紙に戻すは不要）
 * それ以外の独自の機能（例えば、売上伝票発行依頼書や発注書を作成、カタログを印刷など）は行を変えて、真下に統一して設置する。タブを切り替えても、位置や大きさ、色などは変えない、
 * 同じ機能であればボタンの名前も変えない）行の位置も変えない（基本的に中央揃え）」2026-10-28）。
 * 1段目：← 一覧へ戻る・様邸のタブ・介護保険証から入れる（extra。タブのすぐ右）。
 * 2段目：様邸の名前（title。左）と、上のタブのまん中にそろえた「〇〇をExcelで保存・〇〇を印刷・削除」（primary。どのタブも同じ幅＝書類の名前はどれも3字）。
 * 3段目：その真下に、まとめて保存とタブごとの機能（secondary。同じまん中にそろえる）。名前は2段目の高さだけを使うので、3段目は名前の下まで広げてよい。
 * 名前が長くて2段目に重なるときは、2段目・3段目とも名前の右へずらす（まん中は2段目・3段目で同じ）。
 * 狭い画面（lg 未満）は、名前・2段目・3段目をそれぞれ1行にして、行のまん中に。extra はその下（どのタブでもボタンの段の高さを変えない）。
 */
export function JobHeader({
  onBack,
  tabs,
  extra,
  title,
  primary,
  secondary,
}: {
  onBack: () => void;
  tabs: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const row1 = useRef<HTMLDivElement>(null);
  const row2 = useRef<HTMLDivElement>(null);
  // 2段目・3段目の左の余白（px）。null は狭い画面（行のまん中に置く）
  const [shift, setShift] = useState<{a: number; b: number} | null>(null);
  useLayoutEffect(() => {
    const tablist = top.current?.querySelector<HTMLElement>('[role="tablist"]');
    const place = () => {
      if (!tablist || !box.current || !name.current || !row1.current || !window.matchMedia('(min-width: 1024px)').matches) {
        setShift(null);
        return;
      }
      const left = box.current.getBoundingClientRect().left;
      const t = tablist.getBoundingClientRect();
      const n = name.current.getBoundingClientRect();
      const w1 = row1.current.getBoundingClientRect().width;
      const w2 = row2.current?.getBoundingClientRect().width ?? 0;
      // まん中はタブのまん中。2段目が名前に MIN_GAP より近づくなら右へ
      const center = Math.max(t.left + t.width / 2, n.right + MIN_GAP + w1 / 2) - left;
      setShift({a: Math.round(center - w1 / 2), b: Math.max(0, Math.round(center - w2 / 2))});
    };
    place();
    // 画面の幅（box の幅）・タブの大きさ・名前（打ち込むと変わる）・ボタンの数が変わったら置き直す
    const ro = new ResizeObserver(place);
    for (const el of [box.current, tablist, name.current, row1.current, row2.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [!!secondary]);
  // まとめて保存の確かめる画面（Modal）のボタンまで大きくしないよう、すぐ下のボタンだけ
  const row = 'flex flex-wrap items-center gap-2 lg:w-max lg:flex-nowrap lg:[&>*]:!text-base max-lg:justify-center';
  // 1つの折り返す箱に、1段目（← 一覧へ戻る・タブ・extra）と、2段目より下（box。いつも1行まるごと）を入れる。
  // 狭い画面は extra（介護保険証の欄。タブによって出したり出さなかったりする）を最後に回す：前はタブの下に入って、その分だけボタンの段が
  // タブごとに上下にずれた（「タブを切り替えても、位置や大きさ、色などは変えない」）
  return (
    <div ref={top} className="flex flex-wrap items-center gap-2">
      <BackButton onClick={onBack} />
      {tabs}
      {extra && <div className="max-lg:order-last">{extra}</div>}
      <div ref={box} className="relative w-full space-y-2">
        <div ref={name} className="flex flex-wrap items-center gap-2 max-lg:justify-center lg:absolute lg:left-0 lg:top-0 lg:h-[2.625rem] lg:w-max">
          {title}
        </div>
        <div ref={row1} role="group" aria-label="保存・印刷・削除" className={row} style={shift ? {marginLeft: shift.a} : undefined}>
          {primary}
        </div>
        {secondary && (
          <div ref={row2} role="group" aria-label="そのほかの機能" className={row} style={shift ? {marginLeft: shift.b} : undefined}>
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}

/** 様邸の名前と保険者（2段目の左）。名前は少し大きく */
export function JobTitle({name, badge}: {name: string; badge?: string}) {
  return (
    <>
      <h1 className="text-lg font-bold text-[#14532d] lg:text-xl">{name}</h1>
      {badge && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 lg:text-sm">{badge}</span>}
    </>
  );
}
