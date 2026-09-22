import type {BgmSettings} from './types';

/** BGM の読み込みと再生。プレビューでも書き出しでも同じ音の作り方を使う。 */

/** 音声ファイルを AudioBuffer へ展開する。対応外の形式はここで例外になる */
export async function decodeAudioFile(context: AudioContext, file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  return await context.decodeAudioData(data);
}

export interface BgmPlayback {
  stop(): void;
}

/** 頭の小さなノイズを避けるためのフェードイン秒数 */
const FADE_IN_SEC = 0.25;

/**
 * BGM を再生し、指定の出力先（スピーカー or 録音用ノード）へ流す。
 *
 * 動画の長さに合わせて末尾をフェードアウトし、途中で切れた印象にならないようにする。
 * offsetSec を渡すと、その位置から再生する（プレビューのシークに追従させるため）。
 */
export function startBgm(
  context: AudioContext,
  bgm: BgmSettings,
  target: AudioNode,
  totalSec: number,
  offsetSec = 0,
): BgmPlayback {
  const source = context.createBufferSource();
  source.buffer = bgm.buffer;
  source.loop = bgm.loop;

  const gain = context.createGain();
  source.connect(gain);
  gain.connect(target);

  const now = context.currentTime;
  const remaining = Math.max(0, totalSec - offsetSec);
  const volume = Math.max(0, Math.min(1, bgm.volume));
  const fadeOut = Math.max(0, Math.min(bgm.fadeOutSec, remaining));

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + Math.min(FADE_IN_SEC, Math.max(0.01, remaining)));
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(volume, now + Math.max(0, remaining - fadeOut));
    gain.gain.linearRampToValueAtTime(0, now + remaining);
  }

  // ループ再生時は素材の長さを超えた位置を指定できないため、剰余で読み替える
  const duration = bgm.buffer.duration;
  const startOffset = bgm.loop && duration > 0 ? offsetSec % duration : Math.min(offsetSec, duration);
  source.start(now, Math.max(0, startOffset));

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
      } catch {
        // 既に終了している場合は無視する
      }
      source.disconnect();
      gain.disconnect();
    },
  };
}
