/** 動画メーカーのデータ構造。すべてブラウザ内で完結し、サーバーへは送らない。 */

/** カットに与えるゆっくりした動き（Ken Burns 効果） */
export type Motion = 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';

/** 画像をフレームへ収める方法 */
export type Fit = 'cover' | 'contain';

/** 出力の縦横比 */
export type Aspect = '16:9' | '9:16' | '1:1';

/** テロップの縦位置 */
export type CaptionPosition = 'top' | 'center' | 'bottom';

/** テロップの揃え */
export type CaptionAlign = 'left' | 'center';

/** 1カット分の素材と設定 */
export interface Clip {
  id: string;
  /** 元ファイル名（表示用） */
  name: string;
  /** 読み込み済みの画像。読み込み中・失敗時は null */
  image: HTMLImageElement | null;
  /** 解放が必要な object URL */
  objectUrl: string;
  /** このカットの表示秒数（クロスフェード時間を含む） */
  durationSec: number;
  /** 大きく出す文字。空なら描画しない */
  title: string;
  /** 小さく添える文字。空なら描画しない */
  subtitle: string;
  motion: Motion;
}

/** 作品全体の設定 */
export interface ProjectSettings {
  aspect: Aspect;
  /** 短辺の画素数（16:9 なら高さ、9:16 なら幅） */
  resolution: number;
  fps: number;
  /** カット間のクロスフェード秒数。0 なら切り替えのみ */
  transitionSec: number;
  fit: Fit;
  /** contain 時の余白色。cover でも読み込み前の背景に使う */
  backgroundColor: string;
  captionColor: string;
  /** テロップの基準サイズ倍率 */
  fontScale: number;
  captionPosition: CaptionPosition;
  captionAlign: CaptionAlign;
  /** テロップ背後の暗幕を敷くか（写真の上でも文字を読めるようにする） */
  captionScrim: boolean;
}

/** BGM の設定 */
export interface BgmSettings {
  name: string;
  buffer: AudioBuffer;
  /** 0〜1 */
  volume: number;
  /** 動画より短い場合に繰り返すか */
  loop: boolean;
  /** 終端のフェードアウト秒数 */
  fadeOutSec: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  aspect: '16:9',
  resolution: 1080,
  fps: 30,
  transitionSec: 0.6,
  fit: 'cover',
  backgroundColor: '#0f172a',
  captionColor: '#ffffff',
  fontScale: 1,
  captionPosition: 'bottom',
  captionAlign: 'center',
  captionScrim: true,
};

/** カット既定値（追加直後でもそのまま再生できる値にしておく） */
export const DEFAULT_CLIP_DURATION_SEC = 3;
export const DEFAULT_MOTION: Motion = 'zoomIn';
