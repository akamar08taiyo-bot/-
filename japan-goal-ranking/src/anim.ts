import { Easing, interpolate } from "remotion";

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** start から dur フレームかけて 0→1（スッと出て止まる） */
export const enter = (frame: number, start: number, dur = 14) =>
  interpolate(frame, [start, start + dur], [0, 1], { ...CLAMP, easing: EASE_OUT });

/** 大きく出てドンと収まる拡大率 */
export const slam = (frame: number, start: number, from = 2.4) =>
  interpolate(frame, [start, start + 6, start + 11], [from, 0.93, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.quad),
  });

/** 数字のカウントアップ */
export const countUp = (frame: number, start: number, end: number, value: number) =>
  Math.round(
    interpolate(frame, [start, end], [0, value], { ...CLAMP, easing: Easing.out(Easing.cubic) }),
  );

/** 着地の瞬間に一度だけふくらむ */
export const bump = (frame: number, at: number, amount = 0.14) =>
  1 + amount * interpolate(frame, [at, at + 3, at + 10], [0, 1, 0], CLAMP);

/** 衝撃の瞬間の画面ゆれ（px） */
export const shake = (frame: number, at: number, power = 18, length = 10) => {
  const t = frame - at;
  if (t < 0 || t > length) return { x: 0, y: 0 };
  const decay = 1 - t / length;
  return { x: Math.sin(t * 2.9) * power * decay, y: Math.cos(t * 3.7) * power * 0.6 * decay };
};

/** 白フラッシュの濃さ */
export const flash = (frame: number, at: number, peak = 0.9, length = 10) =>
  interpolate(frame, [at, at + 1, at + length], [0, peak, 0], CLAMP);
