// 見積書の欄の文字を、ブラウザに実際に出た大きさで測って、欄に入りきらなければ縮める（画面・印刷）。
// fit.ts は字の幅を見積もって字の大きさと行を決めるが、ブラウザの「最小フォントサイズ」の設定（小さい字を大きく出す）や、
// 字体の違いで、見積もりより大きく出て欄の右で切れていた（ユーザーの指摘「文字がはみ出ている部分が多すぎる」2026-11-03。
// 6.4pt と決めた品名が 9pt ほどで出て「マツ六 BD-132 BAUHAUS 35ア」で切れ、2行の欄で行も高くなっていた）。
// そこで欄の文字（EstimateForms.tsx の .fitbox）の出た幅・高さを測り、欄より大きければ欄の中に浮かせて（行の高さを変えない）transform で縮める。入る欄はそのまま。
// transform は最小フォントサイズの設定に左右されない。Excel（estimateXlsx.ts）は fit.ts の大きさのまま（Excel に最小フォントサイズはない）。

/** root の中の .fitbox を、親の欄（td・th）の中に収める。読み書きをまとめて、レイアウトの計算は2回だけ */
export function shrinkCells(root: ParentNode | null | undefined): void {
  if (!root) return;
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('.fitbox')).filter((b) => b.parentElement?.tagName === 'TD' || b.parentElement?.tagName === 'TH');
  if (boxes.length === 0) return;
  // 1. 書く：前の縮めを外す（ふつうに置く）
  for (const b of boxes) {
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.transform = '';
    b.style.transformOrigin = '';
  }
  // 2. 読む：欄の内側の大きさ（高さは行の決まった高さ。文字で行が高くなっていても）・揃え方と、文字の大きさ
  const sizes = boxes.map((b) => {
    const cell = b.parentElement!;
    const cs = getComputedStyle(cell);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const rowH = /^([\d.]+)mm$/.exec((cell.parentElement as HTMLElement | null)?.style.height ?? '');
    const h = (rowH ? (Number(rowH[1]) * 96) / 25.4 : cell.clientHeight) - padT - padB;
    return {
      align: cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left',
      padL,
      padR,
      w: cell.clientWidth - padL - padR,
      h,
      bw: b.offsetWidth,
      bh: b.offsetHeight,
    };
  });
  // 3. 書く：入りきらない欄だけ、欄の中に浮かせて（行の高さを変えない）揃え方の位置に置き、縮める。入る欄は今までどおり
  boxes.forEach((b, i) => {
    const z = sizes[i];
    if (!(z.bw > 0 && z.bh > 0 && z.w > 0) || (z.bw <= z.w + 0.5 && (z.h <= 0 || z.bh <= z.h + 0.5))) return;
    const cell = b.parentElement!;
    if (cell.style.position !== 'relative') cell.style.position = 'relative';
    const k = Math.min(1, z.w / z.bw, z.h > 0 ? z.h / z.bh : 1);
    const scale = ` scale(${Math.floor(k * 1000) / 1000})`;
    b.style.position = 'absolute';
    b.style.top = '50%';
    if (z.align === 'right') {
      b.style.right = `${z.padR}px`;
      b.style.transformOrigin = 'right center';
      b.style.transform = `translateY(-50%)${scale}`;
    } else if (z.align === 'center') {
      b.style.left = '50%';
      b.style.transformOrigin = 'center center';
      b.style.transform = `translate(-50%, -50%)${scale}`;
    } else {
      b.style.left = `${z.padL}px`;
      b.style.transformOrigin = 'left center';
      b.style.transform = `translateY(-50%)${scale}`;
    }
  });
}
