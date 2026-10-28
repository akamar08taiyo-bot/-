import {useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {Btn, useToast} from '../components/ui.tsx';
import type {Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {removeEstimate} from './EstimateList.tsx';

/** 様邸の名前と、まん中のボタン（保存・Excel・印刷）のあいだに、少なくともあける幅（px） */
const MIN_GAP = 16;
/** 2段目の gap-2（px）。まん中のボタンの左の余白は、この分を引いて付ける */
const ROW_GAP = 8;

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
 * 様邸の画面（住宅改修申請書・工事見積書・理由書のタブ）の上の2段。どのタブでも同じ形・同じ位置にする。
 * 1段目：← 一覧へ戻る・様邸のタブ・介護保険証から入れる（extra。タブのすぐ右。ユーザーの指示「上のタブの近辺に」）。
 * 2段目：様邸の名前（title）・保存／Excel／印刷（center）・白紙に戻すなど（right。右に寄せる）。
 * center は上のタブのまん中にそろえる（ユーザーの指示「少し左にずらして、上のタブとあわせるか中央揃えにする」2026-10-27。
 * その前は画面のまん中「Excelの印刷、保存ボタンを中央にもってくる」2026-10-22）。名前が長くて重なるときは、名前のすぐ右。
 * タブ・名前・まん中のボタンは少し大きく（「このタブの部分をもう少し大きくする」2026-10-27。右のボタンは今までどおり）。
 * 狭い画面（lg 未満）は今までどおり：center だけの行にして、その行のまん中に。
 */
export function JobHeader({
  onBack,
  tabs,
  extra,
  title,
  center,
  right,
}: {
  onBack: () => void;
  tabs: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  // まん中のボタンの左の余白（px）。null は狭い画面（行のまん中に置く）
  const [shift, setShift] = useState<number | null>(null);
  useLayoutEffect(() => {
    const tablist = top.current?.querySelector<HTMLElement>('[role="tablist"]');
    const place = () => {
      if (!tablist || !name.current || !mid.current || !window.matchMedia('(min-width: 1024px)').matches) {
        setShift(null);
        return;
      }
      const t = tablist.getBoundingClientRect();
      const m = mid.current.getBoundingClientRect();
      const n = name.current.getBoundingClientRect();
      // ボタンのまん中をタブのまん中に。名前の右からの距離にして、MIN_GAP より近くしない
      setShift(Math.max(MIN_GAP, Math.round(t.left + t.width / 2 - m.width / 2 - n.right)) - ROW_GAP);
    };
    place();
    // 画面の幅・タブの大きさ・名前（打ち込むと変わる）・ボタンの数が変わったら置き直す
    const ro = new ResizeObserver(place);
    for (const el of [top.current, tablist, name.current, mid.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [!!center]);
  return (
    <div className="space-y-2">
      <div ref={top} className="flex flex-wrap items-center gap-2">
        <BackButton onClick={onBack} />
        {tabs}
        {extra}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div ref={name} className="flex flex-wrap items-center gap-2">
          {title}
        </div>
        {center && (
          // まとめて保存の確かめる画面（Modal）のボタンまで大きくしないよう、すぐ下のボタンだけ
          <div ref={mid} className="flex flex-wrap justify-center gap-2 max-lg:basis-full lg:[&>button]:!text-base" style={shift === null ? undefined : {marginLeft: shift}}>
            {center}
          </div>
        )}
        {right && <div className="flex flex-wrap justify-end gap-2 lg:ml-auto">{right}</div>}
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
