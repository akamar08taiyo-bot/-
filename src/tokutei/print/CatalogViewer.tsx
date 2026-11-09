// カタログの窓（ユーザーの指示「商品を入力する際、カタログから検索という欄を入力して、右のスペースにカタログを開くことができる。
// カタログを見ながら商品を入力できるようにする。カタログのポップは位置を移動したり、大きさを変更できるようにする」2026-10-26）。
// 画面の右に浮かぶ窓で、上の帯をつかむと動き、右下の角をつかむと大きさが変わる（マウスでも指でも）。置いた所・大きさはこの端末で覚える。
// 「カタログから検索」に商品名・品番（261-S1063 など）を打つと、その字のあるページだけを並べる。ページを押すとそのページを出す。
// ページの絵は、マウスのホイールで大きく・小さく（マウスのある所を中心に）、つかんで動かせる（ユーザーの指示「カタログではアップしたときにとぎれてしまうため、
// 画像内をうごかせるようにする。スクロールでアップと縮小をできるようにする」2026-10-27。前は −・＋ のボタンだけで、大きくすると窓の中で切れて見えた）。
// 絵にするのは出しているページだけ（ほかのページは検索に使う文字だけを1ページずつ読む）。前は開くと14ページを一度に絵にしていて、
// パソコンでも絵が出るまで十数秒、iPhone では開けなかった（ユーザーの話「携帯で特定福祉用具カタログを開こうとした場合に開けない」2026-10-30）。
// スマホ（幅 640px 未満）は、窓を画面（住宅改修のタブの中では枠）いっぱいに出し、枠が画面の上に来るように動かす。2本の指で広げる・つまむと大きく・小さく。
// ページの商品には「押せる枠」（点線の枠と「＋ 選ぶ」）を重ね、押すと色・品番を選んで商品の欄に商品名・メーカー・品番・TAIS・定価が入る
// （ユーザーの指示「カタログと商品をリンクさせて、自動的に商品名や金額などが全てはいるようにする。カタログでは、クリックできるよう認識できるようの工夫する」2026-11-02）。
// 枠はカタログの文字の位置から（catalogItems.ts の CatalogProduct.box）。入っている商品は「✓ 入っています」
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {CATALOG, catalogLabel, catalogMatches, catalogPicks} from '../catalog.ts';
import type {CatalogPagesFilter} from '../catalog.ts';
import {featureBadges} from '../catalogItems.ts';
import type {CatalogProduct, CatalogVariant} from '../catalogItems.ts';
import {FeatureBadges} from '../components/FeatureBadges.tsx';
import type {Sale} from '../types.ts';
import {DPI, loadCatalogPage, loadCatalogProducts, loadCatalogText} from './catalogPdf.ts';
import type {CatalogImage} from './catalogPdf.ts';

const KEY = 'taiyo-tokutei-catalog-window-v1'; // 窓の位置・大きさ（この端末だけ）
const MIN = {w: 320, h: 260};
const ZOOM = {min: 0.5, max: 4};
const clampZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(z * 100) / 100));

/** 絵にしたページ（窓を閉じても覚えておく。開くたびに読み直さない） */
const loaded = new Map<string, Promise<CatalogImage | null>>();
function page(file: string): Promise<CatalogImage | null> {
  let p = loaded.get(file);
  if (!p) {
    p = loadCatalogPage(file).catch(() => null);
    loaded.set(file, p);
  }
  return p;
}
/** ページの文字（検索に使う。絵にしたページはその文字） */
const textLoaded = new Map<string, Promise<string>>();
function pageText(file: string): Promise<string> {
  const img = loaded.get(file);
  if (img) return img.then((r) => r?.text ?? '');
  let p = textLoaded.get(file);
  if (!p) {
    p = loadCatalogText(file).catch(() => '');
    textLoaded.set(file, p);
  }
  return p;
}

type Box = {x: number; y: number; w: number; h: number};
/** スマホの幅（窓を画面いっぱいに出す） */
const narrow = () => window.innerWidth < 640;
/**
 * 初めは画面の右（プレビューの所）。前に置いた所があればそこ（画面からはみ出す分は戻す）。
 * スマホは画面いっぱい（前は画面の下の6割で、住宅改修のタブの中の枠では、絵の所が画面の外に出て見えなかった）
 */
function firstBox(): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (narrow()) return {x: 0, y: 0, w: vw, h: vh};
  const def = {x: vw - Math.min(620, Math.round(vw * 0.46)) - 16, y: 72, w: Math.min(620, Math.round(vw * 0.46)), h: vh - 100};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Box | null;
    if (v && [v.x, v.y, v.w, v.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return clampBox(v);
  } catch {
    /* 覚えていなければ初めの所 */
  }
  return def;
}
/** 窓は画面の中に収める（はみ出すと右下の角をつかめなくなる） */
function clampBox(b: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(Math.min(MIN.w, vw), Math.min(b.w, vw));
  const h = Math.max(Math.min(MIN.h, vh), Math.min(b.h, vh));
  return {w, h, x: Math.max(0, Math.min(b.x, vw - w)), y: Math.max(0, Math.min(b.y, vh - h))};
}

/**
 * filter：出すページを絞る（商品の欄の「🔍 商品検索」「📖 カタログから選ぶ」で絞った商品の載っているページだけ。「✕ 全部のページ」で外す）。
 * onPick：ページの商品を押して色・品番を選んだとき（商品の欄に入れる。pickTo は入れる先の名前「1つ目」）
 */
export function CatalogViewer({
  sale,
  query: initial,
  filter,
  onClose,
  onPrint,
  onPick,
  pickTo,
}: {
  sale: Sale;
  query: string;
  filter?: CatalogPagesFilter;
  onClose: () => void;
  onPrint: (only?: CatalogPagesFilter) => void;
  onPick?: (p: CatalogProduct, v: CatalogVariant) => void;
  pickTo?: string;
}) {
  const [box, setBox] = useState<Box>(firstBox);
  // 「⛶ 拡大」で開いているあいだは、前の窓の位置・大きさと絵の大きさを持つ（「拡大を閉じる」で戻す）
  const [big, setBig] = useState<{box: Box; zoom: number} | null>(null);
  const [query, setQuery] = useState(initial);
  const [only, setOnly] = useState<CatalogPagesFilter | null>(filter ?? null);
  const [texts, setTexts] = useState<(string | null)[]>(() => CATALOG.map(() => null));
  const [images, setImages] = useState<(CatalogImage | null | undefined)[]>(() => CATALOG.map(() => undefined));
  const [zoom, setZoom] = useState(1);
  // ページの絵の枠（ホイールで拡大・縮小、つかんで動かす）
  const viewRef = useRef<HTMLDivElement>(null);
  // 開いたら、窓が見える所まで画面を動かす（住宅改修のタブの中の枠では、枠の上の方が画面の外に出ていると、開いた窓が見えないことがある。
  // ユーザーの話「タブレットで開くとパンフレットが開かない」2026-11-02。見えていれば何もしない）
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }, []);
  const zoomRef = useRef(1);
  // 拡大・縮小したあと、マウスのあった所（px, py）の絵が同じ所に残るように動かす（cx, cy は前の大きさでの絵の上の位置）
  const anchor = useRef<{px: number; py: number; cx: number; cy: number; ratio: number} | null>(null);
  const [panning, setPanning] = useState(false);
  // 絵のまわりの余白（px）と窓の幅。つかんで横・上下のどちらへも自由に動かせるように、絵のまわりに窓の4割ずつの余白を置く
  // （ユーザーの指示「つまみながら、横にずらすと、カタログ全体を動かすことが自由自在に動かすことができる」2026-11-03。前は絵が窓の幅いっぱいで、横には動かなかった）
  const [pane, setPane] = useState({w: 0, padX: 0, padY: 0});
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const next = {w, padX: Math.round(w * 0.4), padY: Math.round(el.clientHeight * 0.4)};
      setPane((b) => (b.w === next.w && b.padX === next.padX && b.padY === next.padY ? b : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const paneRef = useRef(pane);
  paneRef.current = pane;
  // カタログの商品（押せる枠に使う。ビルドで作った文字の一覧から読むので軽い）・出しているページの絵の大きさ（画素）・色を選んでいる商品
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [natural, setNatural] = useState<{w: number; h: number} | null>(null);
  const [choose, setChoose] = useState<CatalogProduct | null>(null);
  /** factor 倍にする。clientX・clientY（マウスの所）を中心に。なければ枠のまん中 */
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const el = viewRef.current;
    const old = zoomRef.current;
    const next = clampZoom(old * factor);
    if (!el || next === old) return;
    const r = el.getBoundingClientRect();
    const px = clientX === undefined ? r.width / 2 : clientX - r.left;
    const py = clientY === undefined ? r.height / 2 : clientY - r.top;
    anchor.current = {px, py, cx: el.scrollLeft + px - paneRef.current.padX, cy: el.scrollTop + py - paneRef.current.padY, ratio: next / old};
    zoomRef.current = next;
    setZoom(next);
  };
  const resetZoom = () => zoomBy(1 / zoomRef.current);
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = viewRef.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollLeft = paneRef.current.padX + a.cx * a.ratio - a.px;
    el.scrollTop = paneRef.current.padY + a.cy * a.ratio - a.py;
  }, [zoom]);
  // ホイールはふつうのスクロール（下へ・上へ）。大きく・小さくは上の －／＋（ユーザーの指示「スクロールでズームなどの機能がついているが、スクロールは下にずらす。
  // ズームは＋－で調整する」2026-11-03。前はホイールで拡大・縮小）。Ctrl＋ホイールだけ拡大・縮小（画面ごと大きくしないように。見積書のプレビューと同じ）
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = e.deltaMode === 1 ? e.deltaY * 0.05 : e.deltaY * 0.0015;
      zoomBy(Math.min(1.25, Math.max(0.8, Math.exp(-step))), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // 2本の指で広げる・つまむ（スマホ・iPad）。1本の指はそのまま絵を動かす（画面ごと大きくしないように、2本のときだけ止める）
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    let start: {d: number; zoom: number} | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = {d: dist(e.touches), zoom: zoomRef.current};
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start || start.d <= 0) return;
      e.preventDefault();
      const target = clampZoom((start.zoom * dist(e.touches)) / start.d);
      zoomBy(target / zoomRef.current, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener('touchstart', onStart, {passive: true});
    el.addEventListener('touchmove', onMove, {passive: false});
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
  /**
   * ページの絵をつかんで動かす（マウス。指は今までどおりの指で動かす）。押せる枠の上で押して、ほとんど動かさずに離したら、その枠を押したことにする
   * （つかんで動かすために押さえたまま離すので、そのままだと枠のボタンが押されない）
   */
  const pan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = e.currentTarget;
    const hot = (e.target as HTMLElement).closest<HTMLElement>('[data-hotspot]');
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const start = {x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop};
    setPanning(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start.left - (ev.clientX - start.x);
      el.scrollTop = start.top - (ev.clientY - start.y);
    };
    const up = (ev: PointerEvent) => {
      if (hot && ev.type === 'pointerup' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) hot.click();
      setPanning(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  // 初めに出すページ：絞ったページの1つ目、なければ見積もりの商品が載っているページ（なければ1ページ目）
  const firstOf = (f: CatalogPagesFilter | null | undefined) => (f ? CATALOG.findIndex((c) => f.pages.includes(c.page)) : -1);
  const [current, setCurrent] = useState(() => (firstOf(filter) >= 0 ? firstOf(filter) : ([...catalogPicks(sale.items)][0] ?? 0)));
  useEffect(() => setQuery(initial), [initial]);
  // 商品検索をし直したら（「✕ 全部のページ」のあとに同じ条件でも）、そのページだけにして1つ目を出す
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    setOnly(filter ?? null);
    if (firstOf(filter) >= 0) setCurrent(firstOf(filter));
  }, [filter]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // カタログの商品（押せる枠）。読めなくても絵は見られる
  const picking = !!onPick;
  useEffect(() => {
    if (!picking) return;
    loadCatalogProducts().then(
      (list) => alive.current && setProducts(list),
      () => {},
    );
  }, [picking]);
  const pageProducts = useMemo(() => (products ?? []).filter((p) => p.page === CATALOG[current].page && p.box && p.variants.length), [products, current]);
  // 見積もりに入っている品番（その商品の枠は「✓ 入っています」）
  const inSale = new Set(sale.items.map((i) => i.code).filter(Boolean));
  // 見積もりに入っている品番か：同じ品番で色・大きさのちがうもの（p.154 EA4-102 の4色、p.137 の S と M など）は、商品名まで見る（2026-11-09）
  const inSaleName = new Set(sale.items.filter((i) => i.code).map((i) => `${i.code}|${i.name.trim()}`));
  const isInSale = (p: CatalogProduct, v: CatalogVariant) => inSaleName.has(`${v.code}|${[p.name, v.label].filter(Boolean).join(' ')}`);
  /** 商品の枠を押した：色・品番が1つならすぐ入れる。2つ以上なら選ぶ */
  const pickProduct = (p: CatalogProduct) => (p.variants.length === 1 ? pickVariant(p, p.variants[0]) : setChoose(p));
  const pickVariant = (p: CatalogProduct, v: CatalogVariant) => {
    setChoose(null);
    onPick?.(p, v);
    // スマホは窓が画面いっぱいなので、入れたら閉じて商品の欄を見せる
    if (narrow()) onClose();
  };
  useEffect(() => {
    setNatural(null);
    setChoose(null);
  }, [current]);
  // 色を選ぶ欄が開いたら（絵の所が狭くなる）、押した商品の枠が見えるように絵だけを動かす（うしろの画面は動かさない）
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!choose || !el) return;
    const hot = [...el.querySelectorAll<HTMLElement>('[data-hotspot]')].find((b) => b.dataset.key === choose.key);
    if (!hot) return;
    const r = hot.getBoundingClientRect();
    const v = el.getBoundingClientRect();
    if (r.top < v.top) el.scrollTop -= v.top - r.top + 8;
    else if (r.bottom > v.bottom) el.scrollTop += Math.min(r.bottom - v.bottom + 8, r.top - v.top - 8);
  }, [choose]);
  // 出しているページを絵にする（初めて出すときだけ。読んだ絵は覚えておく）
  useEffect(() => {
    const i = current;
    void page(CATALOG[i].file).then((r) => {
      if (!alive.current) return;
      setImages((c) => c.map((x, j) => (j === i ? r : x)));
      if (r) setTexts((c) => c.map((x, j) => (j === i ? r.text : x)));
    });
  }, [current]);
  // 検索に使う文字は、初めのページの絵が出てから1ページずつ読む（一度に読むと重い）
  useEffect(() => {
    void (async () => {
      await page(CATALOG[current].file);
      for (const [i, p] of CATALOG.entries()) {
        const text = await pageText(p.file);
        if (!alive.current) return;
        setTexts((c) => c.map((x, j) => (j === i ? text : x)));
      }
    })();
  }, []);
  const matches = useMemo(() => catalogMatches(query, texts).filter((i) => !only || only.pages.includes(CATALOG[i].page)), [query, texts, only]);
  // 検索したら、見つかった最初のページを出す（打つたびに。見つかったページの中を押して選び直せる）
  useEffect(() => {
    if (!query.trim()) return;
    if (matches.length && !matches.includes(current)) setCurrent(matches[0]);
  }, [query, matches]);
  useEffect(() => {
    if (big) return; // 拡大した大きさは覚えない（次に開いたときは、ふつうの窓）
    try {
      localStorage.setItem(KEY, JSON.stringify(box));
    } catch {
      /* 覚えられなくても使える */
    }
  }, [box, big]);
  // スマホで住宅改修のタブの中（枠）にいるときは、枠が画面の上に来るように動かす（窓が枠の下のほうにあって、絵の所が画面の外になっていた）。
  // 枠に印を付けて、住宅改修の画面の右下の「📷 写真へ」を窓の上に重ねない（住宅改修の sasaoka.css）
  useEffect(() => {
    let frame: HTMLElement | null = null;
    try {
      frame = window.frameElement as HTMLElement | null;
    } catch {
      frame = null;
    }
    if (!frame) return;
    frame.setAttribute('data-catalog-open', '');
    if (narrow()) frame.scrollIntoView({block: 'start', behavior: 'smooth'});
    return () => frame?.removeAttribute('data-catalog-open');
  }, []);
  useEffect(() => {
    const onResize = () => setBox((b) => clampBox(b));
    const onKey = (e: KeyboardEvent) => {
      // 印刷の画面（カタログの印刷）を開いているときの Esc は、印刷の画面だけを閉じる
      if (e.key === 'Escape' && !document.querySelector('.print-overlay')) onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /** つかんで動かす（kind=move）・右下の角で大きさを変える（kind=size） */
  const drag = (e: ReactPointerEvent<HTMLElement>, kind: 'move' | 'size') => {
    if ((e.target as HTMLElement).closest('button, input') && kind === 'move') return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = {x: e.clientX, y: e.clientY, box};
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const b = start.box;
      // 大きさを変えるときは、左上は動かさず画面の右下まで
      setBox(clampBox(kind === 'move' ? {...b, x: b.x + dx, y: b.y + dy} : {...b, w: Math.min(b.w + dx, window.innerWidth - b.x), h: Math.min(b.h + dy, window.innerHeight - b.y)}));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const img = images[current];
  // ページを替えたら・窓の大きさが変わったら、絵の左上を窓の左上に（まわりの余白の分だけ動かしておく）
  // 絵がまだ読めていない（高さ 0）ときは、上下の余白の所までしか動かせない（灰色の所が上に大きく出た）→ 絵が読めたときにもう一度動かす（toOrigin）
  const imgUrl = img?.url ?? '';
  const toOrigin = useRef(false);
  const goOrigin = () => {
    const el = viewRef.current;
    if (!el) return;
    el.scrollLeft = paneRef.current.padX;
    el.scrollTop = paneRef.current.padY;
    toOrigin.current = Math.abs(el.scrollTop - paneRef.current.padY) > 1 || Math.abs(el.scrollLeft - paneRef.current.padX) > 1;
  };
  useLayoutEffect(() => {
    if (!imgUrl) return;
    goOrigin();
  }, [current, imgUrl, pane.padX, pane.padY]);
  /**
   * 「⛶ 拡大」：ページ1枚をまるごと A4 の形で見る（ユーザーの指示「拡大ボタンをおすと開く、開くと、A４サイズに開く、閉じることもできるようにする」2026-11-04）。
   * 絵の所を A4（210×297mm＝画面で 794×1123px）にする。画面に入らなければ、画面の高さに入る大きさの A4 の形（縦横の比は同じ）。
   * 窓の上の段・ページの段の高さ（窓の幅で折り返しが変わる）は、大きさを変えたあとにも測り直して合わせる（a4Box・fitTries）。
   * 絵の大きさは窓の幅いっぱい（100%）にして、ページの上の端を見せる
   */
  const a4Box = (): Box | null => {
    const view = viewRef.current;
    const root = rootRef.current;
    if (!view || !root) return null;
    const chromeH = root.offsetHeight - view.clientHeight; // 上の段・ページの段・よこのスクロールバー・枠
    const chromeW = root.offsetWidth - view.clientWidth; // たてのスクロールバー・枠
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const imgH = Math.min(1123, vh - 16 - chromeH, ((vw - 16 - chromeW) * 297) / 210);
    const w = Math.round((imgH * 210) / 297 + chromeW);
    const h = Math.round(imgH + chromeH);
    return {w, h, x: Math.round((vw - w) / 2), y: Math.max(8, Math.round((vh - h) / 2))};
  };
  const fitTries = useRef(0);
  useLayoutEffect(() => {
    if (!big || fitTries.current <= 0) return;
    fitTries.current -= 1;
    const next = a4Box();
    if (!next || (Math.abs(next.w - box.w) <= 1 && Math.abs(next.h - box.h) <= 1)) {
      fitTries.current = 0;
      return;
    }
    setBox(next);
  }, [big, box]);
  const openBig = () => {
    const next = a4Box();
    if (!next) return;
    fitTries.current = 4;
    setBig({box, zoom: zoomRef.current});
    setBox(next);
    resetZoom();
  };
  const closeBig = () => {
    if (!big) return;
    setBox(clampBox(big.box));
    zoomBy(big.zoom / zoomRef.current);
    setBig(null);
  };
  const tool = 'h-8 min-w-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50';
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="カタログ"
      aria-modal="false"
      className="no-print fixed z-40 flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      style={{left: box.x, top: box.y, width: box.w, height: box.h}}
    >
      <div onPointerDown={(e) => drag(e, 'move')} className="flex cursor-move touch-none flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-2 py-1.5" title="つかんで動かす">
        <span className="text-sm font-bold text-slate-700">📖 カタログ</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カタログから検索（商品名・品番）"
          aria-label="カタログから検索"
          // スマホは1段まるごと（ボタンの段の下。前は幅が詰まって字が1字も見えなかった）
          className="order-last h-8 min-w-0 basis-full rounded-md border border-slate-300 bg-white px-2 text-base sm:order-none sm:min-w-40 sm:flex-1 sm:basis-0 sm:text-sm"
        />
        <button type="button" className={tool} onClick={() => zoomBy(1 / 1.2)} aria-label="小さく">
          −
        </button>
        {/* 今の大きさ。押すともとの大きさ（窓の幅いっぱい） */}
        <button type="button" className={`${tool} tabular-nums`} onClick={resetZoom} aria-label="もとの大きさ" title="もとの大きさに戻す">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={tool} onClick={() => zoomBy(1.2)} aria-label="大きく">
          ＋
        </button>
        {/* 印刷：商品検索・カタログから検索で絞っていれば、そのページだけで印刷の画面を開く（ユーザーの指示「該当の項目で絞ったら絞ったものだけを表示する」2026-11-01） */}
        {/* ⛶ 拡大（ページ1枚を A4 の形で）／拡大を閉じる（前の窓に戻す）。スマホは窓が画面いっぱいなので出さない */}
        {big ? (
          <button type="button" className={`${tool} hidden sm:inline-flex sm:items-center`} onClick={closeBig} aria-pressed="true">
            ↙ 拡大を閉じる
          </button>
        ) : (
          <button type="button" className={`${tool} hidden sm:inline-flex sm:items-center`} onClick={openBig} title="ページ1枚を A4 の大きさで見る">
            ⛶ 拡大
          </button>
        )}
        <button
          type="button"
          className={`${tool} !border-sky-300 !bg-sky-50 !text-sky-900`}
          onClick={() => onPrint(only || query.trim() ? {pages: matches.map((i) => CATALOG[i].page), label: [only?.label, query.trim()].filter(Boolean).join('・')} : undefined)}
        >
          🖨 印刷
        </button>
        <button type="button" className={tool} onClick={onClose} aria-label="カタログを閉じる">
          ✕
        </button>
      </div>
      <div role="group" aria-label="カタログのページ" className="flex max-h-20 flex-wrap gap-1 overflow-y-auto border-b border-slate-200 px-2 py-1.5">
        {only && (
          <span className="flex flex-wrap items-center gap-1 text-xs text-slate-700">
            🔍 <b className="font-bold text-sky-900">{only.label || '商品検索'}</b>
            <button type="button" onClick={() => setOnly(null)} className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">
              ✕ 全部のページ
            </button>
          </span>
        )}
        {/* 押せることが分かるように（ユーザーの指示「カタログでは、クリックできるよう認識できるようの工夫する」） */}
        {onPick && pageProducts.length > 0 && (
          <span className="flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-xs font-bold text-sky-900">
            👆 商品を押すと{pickTo ? `「${pickTo}」に` : ''}入ります
          </span>
        )}
        {matches.length === 0 && <span className="text-xs text-slate-500">{texts.includes(null) ? 'さがしています…' : '見つかりません'}</span>}
        {matches.map((i) => (
          <button
            key={CATALOG[i].file}
            type="button"
            aria-pressed={i === current}
            onClick={() => setCurrent(i)}
            className={`rounded-md border px-2 py-0.5 text-xs ${i === current ? 'border-sky-400 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {/* そのページの品目（シャワーキャリーのページも「シャワーチェア」。ユーザーの指示 2026-11-01） */}
            <span className={`mr-1 rounded px-1 text-[10px] ${CATALOG[i].kind === '介護保険の対象外' ? 'bg-slate-200 text-slate-600' : 'bg-teal-100 text-teal-800'}`}>{CATALOG[i].kind}</span>
            {catalogLabel(CATALOG[i])}
          </button>
        ))}
      </div>
      <div
        ref={viewRef}
        onPointerDown={pan}
        // overscroll-contain：絵の端まで動かしても、うしろの画面（住宅改修の画面など）まで動かさない（ユーザーの指示「写真だけスクロールで移動できるようにする」2026-11-02）
        className={`relative min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-200 ${img ? (panning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''}`}
        aria-label="カタログのページの絵"
        title="つかんで動かす（ホイールで上下。大きさは － ＋）"
      >
        {img ? (
          // 絵のまわりに余白（窓の4割ずつ）を置いて、つかんでどの向きにも動かせるように。絵の幅は窓の幅×倍率（px）
          <div className="w-max" style={{padding: `${pane.padY}px ${pane.padX}px`}}>
          {/* 押せる枠の札の字は、ページの絵の幅に合わせる（cqw。スマホの小さいページで札が商品名を隠さないように） */}
          <div className="relative" style={{width: pane.w ? `${Math.round(zoom * pane.w)}px` : `${zoom * 100}%`, containerType: 'inline-size'}}>
            <img
              src={img.url}
              alt={catalogLabel(CATALOG[current])}
              className="block w-full max-w-none"
              draggable={false}
              onLoad={(e) => {
                setNatural({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight});
                if (toOrigin.current) goOrigin();
              }}
            />
            {/* 商品の押せる枠：点線の枠と「＋ 選ぶ」。マウスを乗せると色が濃くなる。入っている商品は実線と「✓ 入っています」 */}
            {onPick &&
              natural &&
              pageProducts.map((p) => {
                const b = p.box!;
                const k = DPI / 72;
                const has = p.variants.some((v) => inSale.has(v.code));
                const pct = (v: number, all: number) => `${((v * k) / all) * 100}%`;
                return (
                  <button
                    key={p.key}
                    type="button"
                    data-hotspot
                    data-key={p.key}
                    onClick={() => pickProduct(p)}
                    aria-label={`${p.name}を選ぶ`}
                    title={`${[p.name, featureBadges(p).map((b) => b.text).join('・')].filter(Boolean).join('　')}（押すと商品の欄に入ります）`}
                    className={`absolute cursor-pointer rounded-md border-2 transition-colors ${
                      has ? 'border-teal-600 bg-teal-400/15 hover:bg-teal-400/25' : 'border-dashed border-sky-500/80 bg-sky-300/[0.07] hover:border-solid hover:bg-sky-300/25'
                    } ${choose?.key === p.key ? '!border-solid !bg-sky-300/30' : ''}`}
                    style={{left: pct(b.x, natural.w), top: pct(b.y, natural.h), width: pct(b.w, natural.w), height: pct(b.h, natural.h)}}
                  >
                    {/* 札は枠の上の線にまたがる右上（見出しの商品名にかぶらないように） */}
                    <span
                      style={{fontSize: 'clamp(9px, 1.7cqw, 13px)'}}
                      className={`absolute right-1 top-0 -translate-y-1/2 whitespace-nowrap rounded-full border px-[0.6em] py-[0.15em] font-bold leading-tight shadow-sm ${
                        has ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-sky-500 bg-white text-sky-800'
                      }`}
                    >
                      {has ? '✓ 入っています' : '＋ 選ぶ'}
                    </span>
                  </button>
                );
              })}
          </div>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">{img === null ? `${catalogLabel(CATALOG[current])} を読めませんでした` : 'カタログを読み込んでいます…'}</p>
        )}
      </div>
      {/* 色・品番を選ぶ（押した商品に色・大きさが2つ以上あるとき）。押すと商品の欄に入る。
          ページの絵の下に並べる（前は絵の上に重ねていて、絵の下の方が隠れたまま動かせなかった。ユーザーの指示「この状態で、写真だけスクロールで移動できるようにする」2026-11-02）。
          開いているあいだも、絵は上の残りの所でスクロール・拡大できる */}
      {choose && (
        <div role="dialog" aria-label="色・品番を選ぶ" className="max-h-[45%] shrink-0 overflow-auto overscroll-contain border-t-2 border-sky-300 bg-white p-2 pb-3 shadow-[0_-4px_12px_rgba(15,23,42,0.12)]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="min-w-0 text-sm font-bold text-slate-800">{choose.name}</span>
            {/* ひじ掛けあり／なし など（2026-11-09。肘付きと肘なしを取りちがえないように） */}
            <FeatureBadges product={choose} />
            <button type="button" onClick={() => setChoose(null)} className="ml-auto shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-sm text-slate-600 hover:bg-slate-50" aria-label="選ぶのをやめる">
              ✕
            </button>
          </div>
          <div className="grid gap-1">
            {choose.variants.map((v, i) => (
              <button
                key={`${i}:${v.code}`}
                type="button"
                onClick={() => pickVariant(choose, v)}
                className={`flex min-h-10 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-sky-50 ${isInSale(choose, v) ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-white'}`}
              >
                <span className="font-bold text-slate-800">{v.label || choose.name}</span>
                <span className="text-xs text-slate-500">{v.code}</span>
                {v.listPrice > 0 && <span className="ml-auto whitespace-nowrap tabular-nums text-slate-700">定価 ¥{v.listPrice.toLocaleString('ja-JP')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 右下の角：つかんで大きさを変える */}
      <div
        onPointerDown={(e) => drag(e, 'size')}
        className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize touch-none"
        role="button"
        aria-label="カタログの窓の大きさ"
        title="つかんで大きさを変える"
        style={{background: 'linear-gradient(135deg, transparent 50%, rgb(148 163 184) 50%, rgb(148 163 184) 60%, transparent 60%, transparent 70%, rgb(148 163 184) 70%, rgb(148 163 184) 80%, transparent 80%)'}}
      />
    </div>
  );
}
