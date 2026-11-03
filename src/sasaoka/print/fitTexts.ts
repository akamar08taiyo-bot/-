// プレビュー・印刷の欄の文字を、ブラウザに実際に出た大きさで測って、欄に入りきらなければ必ず縮める（はみ出し・切れを出さない決まり）。
// ユーザーの指示「商品名などがはみ出ている。絶対にないようにルール化する。工事費見積もりなども同様に同じルール化として必ず守る」2026-11-03
// （特定福祉用具の苅田町の申請書のプレビューで、福祉用具名の「ミドルSPワンタッチ プレミアム」・製造事業者名の「パナソニックエイジフリー」「太陽シルバーサービス㈱」が欄の右で切れていた）。
// estimate/ShinseiPreview.tsx の fitScale は字の幅を canvas で見積もって字の大きさを決めるが、ブラウザの「最小フォントサイズ」の設定（小さい字を大きく出す）・
// 字体の置きかわり・行の高さの違いで、見積もりより大きく出ることがある。そこで描いたあとに欄（data-fit）の中身（data-fit-inner）の出た幅・高さを測り、
// 欄より大きければ transform で縮める（transform は最小フォントサイズの設定に左右されない）。入る欄はそのまま。見積書の print/shrinkCells.ts と同じ考え（特定福祉用具のアプリの src/tokutei/print/fitTexts.ts と同じもの）。
// 欄の幅は、となりの空いた欄へはみ出してよい分を足した幅（shinseiPreview.ts の rect）なので、その幅を超えたら必ず縮めてよい。

/** root の中の data-fit の欄の文字を、欄の中に収める。読み書きをまとめて、レイアウトの計算は2回だけ */
export function fitTexts(root: ParentNode | null | undefined): number {
  if (!root) return 0;
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('[data-fit]'));
  const inners = boxes.map((b) => b.querySelector<HTMLElement>(':scope > [data-fit-inner]'));
  // 1. 書く：前の縮めを外す
  for (const el of inners) {
    if (!el || !el.style.transform) continue;
    el.style.transform = '';
    el.style.transformOrigin = '';
  }
  // 2. 読む：欄の内側の大きさと、中身の出た大きさ（はみ出した分も）
  const sizes = boxes.map((b, i) => {
    const el = inners[i];
    if (!el) return null;
    const cs = getComputedStyle(b);
    const availW = b.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const availH = b.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    return {availW, availH, needW: Math.max(el.scrollWidth, el.offsetWidth), needH: Math.max(el.scrollHeight, el.offsetHeight)};
  });
  // 3. 書く：入りきらない欄だけ縮める。横にはみ出した行は欄の左から並ぶ（CSS の決まり）ので左を基点に、そうでなければ欄の揃え方の位置を基点に
  let n = 0;
  sizes.forEach((z, i) => {
    const el = inners[i];
    if (!z || !el || z.availW <= 0 || z.availH <= 0) return;
    const overW = z.needW > z.availW + 0.5;
    const overH = z.needH > z.availH + 0.5;
    if (!overW && !overH) return;
    const k = Math.floor(Math.min(1, z.availW / z.needW, z.availH / z.needH) * 1000) / 1000;
    const b = boxes[i];
    const h = overW ? 'left' : (b.dataset.fit ?? 'center');
    const v = b.dataset.fitV ?? 'center';
    el.style.transformOrigin = `${h} ${v}`;
    el.style.transform = `scale(${k})`;
    n++;
  });
  return n;
}

/** 字体を読み終わったら（字の幅が変わる）、もう一度収める。外すときの関数を返す */
export function refitOnFonts(fit: () => void): () => void {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return () => {};
  let live = true;
  const again = () => {
    if (live) fit();
  };
  void fonts.ready.then(again);
  fonts.addEventListener?.('loadingdone', again);
  return () => {
    live = false;
    fonts.removeEventListener?.('loadingdone', again);
  };
}
