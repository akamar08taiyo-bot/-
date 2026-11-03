import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {PhotoJumpButton} from '../components/PhotoJump.tsx';
import {Btn, useToast} from '../components/ui.tsx';
import type {Job, Settings} from '../types.ts';
import type {Update} from '../useStore.ts';
import {removeEstimate} from './EstimateList.tsx';


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
export function RemoveJobButton({job, settings, update, onBack, className}: {job: Job; settings: Settings; update: Update; onBack: () => void; className?: string}) {
  const toast = useToast();
  return (
    <Btn color="white" className={className} onClick={() => removeEstimate(job, settings, update, toast) && onBack()}>
      削除
    </Btn>
  );
}

/**
 * 様邸の画面（5つのタブ：住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書）の上の段。どのタブでも同じ形・同じ位置・同じ大きさ・同じ色
 * （ユーザーの指示「各タブでEXCEL印刷や保存など、表記の方法やタブの大きさ、順番を統一する…タブを切り替えても、位置や大きさ、色などは変えない、
 * 同じ機能であればボタンの名前も変えない」2026-10-28）。
 * 1段だけ：← 一覧へ戻る・様邸の名前（title）、すぐ右に「Excelで保存・〇〇を印刷・その他 ▼」（primary。名前が同じなので、タブを切り替えても同じ所）、
 * 右の端に extra（介護保険証の欄）。「その他 ▼」の中は、メールで送付とタブごとの機能（secondary）、最後に削除（remove）
 * （ユーザーの指示「ここの部分がごちゃごちゃしているので、プルダウンにする」2026-11-03。前は3段目に並べていた。並びはユーザーの指示「順番、Excel で保存、申請書…見積もりを印刷、
 * カタログを印刷、メールで送付、それから、販売受注簿を作成、売上伝票を作成、それから最後に、削除」2026-11-02 のまま）。tail（販売見積書の売上月の欄）は「その他 ▼」のうしろ。
 * 様邸のタブは画面の上の帯（App.tsx の JobTabs。ユーザーの指示「メインタブが二つある為、わかりづらい…入力欄の全体が下に下がっている為、その分上にずらす」2026-11-03）。
 * 狭い画面（lg 未満）は、名前の段・ボタンの段・extra をそれぞれ1行にしてまん中に。スマホ（sm 未満）のボタンは同じ幅の2列の格子
 * （ユーザーの指示「携帯で見た時のボタンの配置の位置…ガタガタして、若干ずれている」2026-10-29）
 */
export function JobHeader({
  onBack,
  extra,
  title,
  primary,
  secondary,
  remove,
  tail,
  fields,
}: {
  onBack: () => void;
  extra?: ReactNode;
  title: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  remove?: (className: string) => ReactNode;
  tail?: ReactNode; // 削除のうしろに置く、ボタンでないもの（販売見積書の売上月）
  fields?: ReactNode; // ボタンの段の右の空いた所に置く欄（住宅改修申請書の保険者・保険者番号）
}) {
  // ボタンの段：スマホは同じ幅の2列。長い名前は2行に折り返す（字を小さくしない。「申請書をExcelで保存」は「Excelで保存」を切らない span にしてあるので「を」のあとで。
  // 名前は1つの span に入れる：ボタンは inline-flex なので、2つに分かれると間があき、ボタンの名前にも空白が入る）。
  // 売上月の欄（label）は2列ぶん。奇数の最後のボタンは1列ぶんの幅でまん中
  const row =
    'flex flex-wrap items-center gap-2 lg:flex-nowrap lg:[&>*]:!text-base max-lg:w-full max-lg:justify-center ' +
    'max-sm:grid max-sm:grid-cols-2 max-sm:items-stretch max-sm:[&>*]:min-h-11 max-sm:[&>*]:w-full max-sm:[&>*]:whitespace-normal max-sm:[&>*]:px-2 max-sm:[&>*]:leading-tight ' +
    'max-sm:[&>label]:col-span-2 max-sm:[&>label]:justify-center max-sm:[&>*:last-child:nth-child(odd):not(label)]:col-span-2 max-sm:[&>*:last-child:nth-child(odd):not(label)]:mx-auto max-sm:[&>*:last-child:nth-child(odd):not(label)]:w-[calc(50%-0.25rem)]';
  // 1段：← 一覧へ戻る・様邸の名前、そのすぐ右に Excelで保存・〇〇を印刷・その他 ▼（・売上月）、右の端に extra（介護保険証の欄）。
  // 様邸のタブ（住宅改修申請書・工事見積書…）は画面の上の帯（App.tsx の JobTabs。ユーザーの指示「メインタブが二つある為、わかりづらい」2026-11-03。
  // 前はこの段の上に「← 一覧へ戻る」とタブの段があった）。狭い画面（lg 未満）は、名前の段・ボタンの段をそれぞれ1行にしてまん中に
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:w-full max-lg:justify-center">
        <BackButton onClick={onBack} />
        {title}
        {/* 携帯・タブレットの「📷 写真へ」（PhotoJump.tsx） */}
        <PhotoJumpButton className="hidden rounded-md bg-sky-50 px-3 py-1.5 text-base shadow-sm ring-2 ring-sky-300 md:inline-flex md:items-center" />
      </div>
      <div role="group" aria-label="保存・印刷" className={row}>
        {primary}
        {(secondary || remove) && (
          <MoreMenu>
            {secondary}
            {remove?.('')}
          </MoreMenu>
        )}
        {tail}
      </div>
      {fields && <div role="group" aria-label="保険者・保険者番号" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 max-lg:w-full max-lg:justify-center">{fields}</div>}
      {extra && <div className="min-w-0 max-lg:w-full max-lg:[&>*]:mx-auto lg:ml-auto">{extra}</div>}
    </div>
  );
}

/**
 * 上の段の「その他 ▼」：押すと下にボタンが縦に並ぶ（メールで送付・保存・売上伝票を作成・発注書を作成・複製・削除など。ユーザーの指示「ここの部分がごちゃごちゃしているので、
 * プルダウンにする」2026-11-03）。ボタンを押す・外を押す・Esc で閉じる。閉じても中は消さない（隠すだけ。メールで送付などの画面を開いたままにするため。画面は body に出す＝Modal）
 */
function MoreMenu({children}: {children: ReactNode}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    // スマホの2列の格子では、上の段の子（この div）に「px-2」が付く。div に余白があると中のボタンがほかのボタンより 16px 細くなるので、余白は中のボタンに付ける
    <div ref={ref} className="relative max-sm:!px-0">
      <Btn color="white" className="h-full w-full lg:!text-base max-sm:min-h-11 max-sm:px-2 max-sm:leading-tight" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        その他 {open ? '▲' : '▼'}
      </Btn>
      <div
        role="menu"
        aria-label="その他"
        className={`${open ? 'grid' : 'hidden'} absolute right-0 top-full z-30 mt-1 w-max min-w-full gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl max-sm:left-0 max-sm:right-auto [&>*]:w-full [&>*]:!justify-start [&_button]:w-full [&_button]:!justify-start`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) setOpen(false);
        }}
      >
        {children}
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
