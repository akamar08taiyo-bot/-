// 携帯・タブレットで、様邸の画面の写真の欄（住宅改修申請書のタブの「📷 写真」）へすぐに飛ぶ
// （ユーザーの指示「携帯から見る場合とタブレットから見る場合のみ…一番メインのタブのところに…写真の欄に飛ぶ…機能をつけて、
// 写真の部分にスクロールしてもすぐに飛べるような機能をつけてください。…出先からタブレットや携帯などから…写真を貼り付けたりすることが多々ある」2026-10-29）。
// 入口は2つ：タブのところの「📷 写真へ」（PhotoJumpButton）と、タブの段が画面の上に隠れたら右下に出る浮かぶボタン（PhotoJumpFab）。
// 写真の欄が見えているときの浮かぶボタンは「↑ 上へ」（タブの段へ戻る）。マウスのパソコンには出さない（useTouchUi）。
// タブのところのボタンは、画面の幅で置き場所を変える（どれも、どのタブでも同じ所。タブを替えてもボタンの段が上下に動かないように）：
//   スマホ（md 未満）：タブの格子の理由書のとなり（App.tsx の JobTabs）
//   タブレットの縦（md〜lg）：「← 一覧へ戻る」の右（タブの段に6つは入らず、右が切れた。その段はほかに何もない）
//   タブレットの横（lg から）：様邸の名前の右（1段目は「← 一覧へ戻る」・タブ・介護保険証の枠でいっぱいで、入れると介護保険証の枠が次の段に落ちた。JobHeader.tsx）

import {createContext, useContext, useEffect, useState} from 'react';
import {useTouchUi} from './ui.tsx';

/** 写真の欄へ飛ぶ（App.tsx が様邸の画面に渡す。住宅改修申請書のタブでなければタブを替えてから） */
export const PhotoJumpCtx = createContext<(() => void) | null>(null);

/** タブのところの「📷 写真へ」（携帯・タブレットだけ）。className で置き場所の幅（md:hidden など）と形を決める */
export function PhotoJumpButton({className}: {className: string}) {
  const go = useContext(PhotoJumpCtx);
  const touch = useTouchUi();
  if (!go || !touch) return null;
  return (
    <button type="button" onClick={go} aria-label="写真の欄へ" className={`whitespace-nowrap font-bold text-sky-900 transition active:bg-sky-100 ${className}`}>
      📷 写真へ
    </button>
  );
}

/** 写真の欄（PhotoBoard.tsx の section） */
const PHOTO_BOARD = '[data-photo-board]';
/** 様邸の画面のタブの段（App.tsx の JobTabs） */
const JOB_TABS = '[data-job-tabs]';

/** 写真の欄の上の端を、画面の上から何 px に合わせるか（PhotoBoard.tsx の scroll-mt-2） */
const TOP_GAP = 8;

/**
 * 写真の欄を画面の上に合わせる。タブを替えた直後は欄が出るまで少し待つ（4秒で出なければやめる）。
 * 上の欄（入れる欄・プレビュー）が出そろうまでは写真の欄の位置が動くので、位置が止まってから動かす。
 * なめらかに動かしている途中で上の高さが変わると途中で止まる（iPad の縦で 600px 手前で止まった）ので、少ししてずれていればすぐに合わせる
 * （そのあいだに指で画面を動かしたら、合わせ直さない）
 */
export function scrollToPhotos() {
  const start = performance.now();
  let last = NaN;
  let still = 0;
  let touched = false;
  const stop = () => (touched = true);
  const tick = () => {
    const el = document.querySelector<HTMLElement>(PHOTO_BOARD);
    if (!el) {
      if (performance.now() - start < 4000) requestAnimationFrame(tick);
      return;
    }
    const top = el.getBoundingClientRect().top + window.scrollY;
    still = Math.abs(top - last) < 1 ? still + 1 : 0;
    last = top;
    if (still < 3 && performance.now() - start < 1500) {
      requestAnimationFrame(tick);
      return;
    }
    el.scrollIntoView({behavior: 'smooth', block: 'start'});
    window.addEventListener('touchstart', stop, {passive: true, once: true});
    window.addEventListener('wheel', stop, {passive: true, once: true});
    window.setTimeout(() => {
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('wheel', stop);
      if (!touched && el.isConnected && Math.abs(el.getBoundingClientRect().top - TOP_GAP) > 16) el.scrollIntoView({block: 'start'});
    }, 1200);
  };
  tick();
}

/** 右下の浮かぶボタン：タブの段が画面の上に隠れたら出す。写真の欄が見えていれば「↑ 上へ」、ほかは「📷 写真へ」 */
export function PhotoJumpFab({onPhotos}: {onPhotos: () => void}) {
  const [state, setState] = useState<'hide' | 'photos' | 'top'>('hide');
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const tabs = document.querySelector(JOB_TABS)?.getBoundingClientRect();
      if (!tabs || tabs.bottom > 0) return setState('hide');
      const board = document.querySelector(PHOTO_BOARD)?.getBoundingClientRect();
      setState(board && board.top < window.innerHeight * 0.5 && board.bottom > 0 ? 'top' : 'photos');
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', later, {passive: true});
    window.addEventListener('resize', later);
    // タブを替えた・写真を入れたなど、中身の高さが変わったときも見直す
    const ro = new ResizeObserver(later);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
      ro.disconnect();
    };
  }, []);
  if (state === 'hide') return null;
  return (
    // 書き込みの画面・確かめる画面（z-40 から上）の下にかくれる。iPhone の下の帯（ホームバー）にかからないように safe-area の分あける
    <button
      type="button"
      data-photo-fab
      onClick={() => (state === 'top' ? window.scrollTo({top: 0, behavior: 'smooth'}) : onPhotos())}
      className="no-print fixed right-3 z-30 flex h-12 touch-manipulation items-center gap-1 rounded-full bg-white px-4 text-base font-bold text-sky-900 shadow-lg ring-2 ring-sky-400 active:bg-sky-50"
      style={{bottom: 'calc(1rem + env(safe-area-inset-bottom))'}}
      aria-label={state === 'top' ? '上へ戻る' : '写真の欄へ'}
    >
      {state === 'top' ? '↑ 上へ' : '📷 写真へ'}
    </button>
  );
}
