// iPhone・iPad で欄を押したときに画面が拡大されないようにする
// （Safari は 16px より小さい字の欄に入ると拡大する。見積書の欄は原本と同じ小さい字なので、押すたびに拡大された。
//   ユーザーの指示「携帯で工事費見積書をタップした時だけ画面の全体がアップになる」、2026-10-22）。
// viewport に maximum-scale=1 を足す。iOS 10 からの Safari は、これがあっても指で広げる拡大はできる（止まるのは欄に入ったときの拡大だけ）。
// Android の Chrome は欄で拡大しないうえ、maximum-scale で指の拡大も止まるので足さない

/** iPhone・iPad（iPadOS 13 からは Mac と同じ名乗りなので、触れる画面かどうかで見分ける） */
export function isIos(ua: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

/** viewport の content に maximum-scale=1 を足す（もうあれば変えない） */
export function noZoomViewport(content: string): string {
  if (/maximum-scale/.test(content)) return content;
  return `${content.trim().replace(/,\s*$/, '')}, maximum-scale=1`;
}

if (typeof document !== 'undefined' && isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = noZoomViewport(meta.content);
}
