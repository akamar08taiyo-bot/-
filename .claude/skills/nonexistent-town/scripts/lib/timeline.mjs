// episode.json の場面から、時間軸（各場面の開始・終了・「場面の頭」・つなぎ）を計算する。
// render-town.mjs（書き出し）と make-publish-kit.mjs（投稿セット）が同じ計算を使う。

export const TRANS = {
  fade: 'fade', // なめらかに重ねる（ディゾルブ）
  dissolve: 'fade',
  fadeblack: 'fadeblack', // いったん黒へ
  fadewhite: 'fadewhite', // いったん白へ（光・夏・回想）
  fadegrays: 'fadegrays', // 色が抜けながら変わる（記憶が薄れる感じ）
  blur: 'hblur', // にじみながら変わる
  slideleft: 'smoothleft',
  slideright: 'smoothright',
  circle: 'circleopen',
  cut: 'fade', // 1 コマで切り替え（ふつうのカット）
};

const AUTO = ['in', 'right', 'out', 'left', 'in', 'down', 'out', 'up'];

/**
 * @returns {{ shots: object[], TOTAL: number, FPS: number, defaults: object }}
 *   shots[i] に start（開始秒）・end・head（場面の頭＝前とのつなぎの真ん中）・tIn（つなぎの長さ）・tName を足して返す
 */
export function buildTimeline(ep) {
  const FPS = ep.format?.fps || 30;
  const defaults = { dur: 7, move: 'auto', zoom: 0.1, transition: 'fade', transitionDur: 1.5, fit: 'cover', ...(ep.defaults || {}) };
  const shots = (ep.shots || []).map((s, i) => ({ ...defaults, ...s, i }));
  if (!shots.length) throw new Error('shots が空です');
  let tline = 0;
  shots.forEach((s, i) => {
    s.dur = Number(s.dur);
    if (!(s.dur > 0)) throw new Error(`場面 ${i + 1} の dur（秒）がありません`);
    if (s.move === 'auto') s.move = s.card ? 'still' : AUTO[i % AUTO.length];
    const tname = i === 0 ? null : s.transition || defaults.transition;
    if (tname && !TRANS[tname]) throw new Error(`場面 ${i + 1} の transition「${tname}」は使えません（${Object.keys(TRANS).join(' / ')}）`);
    let td = i === 0 ? 0 : tname === 'cut' ? 1 / FPS : Number(s.transitionDur ?? defaults.transitionDur);
    if (i > 0) td = Math.min(td, shots[i - 1].dur * 0.45, s.dur * 0.45);
    s.tIn = td;
    s.tName = tname;
    s.start = i === 0 ? 0 : tline - td;
    s.end = s.start + s.dur;
    s.head = s.start + td / 2; // 「場面の頭」＝前の場面とのつなぎの真ん中（テロップも音もここを基準にする）
    tline = s.end;
  });
  return { shots, TOTAL: tline, FPS, defaults };
}
