import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  ImagePlus,
  Music,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {decodeAudioFile, startBgm} from './audio';
import {ExportCancelled, canExport, downloadBlob, exportVideo, pickFormat} from './export';
import {drawFrame, formatTime, frameSize, totalDuration} from './render';
import {Button, Card, CardTitle, RangeField, SegmentedControl, TextField, Toggle} from './ui';
import type {Aspect, BgmSettings, CaptionPosition, Clip, Motion, ProjectSettings} from './types';
import {DEFAULT_CLIP_DURATION_SEC, DEFAULT_MOTION, DEFAULT_SETTINGS} from './types';

const MOTION_OPTIONS: {value: Motion; label: string}[] = [
  {value: 'none', label: '静止'},
  {value: 'zoomIn', label: '寄る'},
  {value: 'zoomOut', label: '引く'},
  {value: 'panLeft', label: '左へ'},
  {value: 'panRight', label: '右へ'},
];

const ASPECT_OPTIONS: {value: Aspect; label: string}[] = [
  {value: '16:9', label: '16:9 横'},
  {value: '9:16', label: '9:16 縦'},
  {value: '1:1', label: '1:1 正方形'},
];

const POSITION_OPTIONS: {value: CaptionPosition; label: string}[] = [
  {value: 'top', label: '上'},
  {value: 'center', label: '中央'},
  {value: 'bottom', label: '下'},
];

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 画像ファイルを1カットとして読み込む。読めない画像も枠だけ残して気付けるようにする */
function loadClip(file: File): Promise<Clip> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  const base: Omit<Clip, 'image'> = {
    id: newId(),
    name: file.name,
    objectUrl,
    durationSec: DEFAULT_CLIP_DURATION_SEC,
    title: '',
    subtitle: '',
    motion: DEFAULT_MOTION,
  };
  return new Promise((resolve) => {
    image.onload = () => resolve({...base, image});
    image.onerror = () => resolve({...base, image: null});
    image.src = objectUrl;
  });
}

function timestamp(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoApp() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [bgm, setBgm] = useState<BgmSettings | null>(null);
  const [playing, setPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{url: string; name: string; size: number; label: string; widelySupported: boolean} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [bulkSeconds, setBulkSeconds] = useState(DEFAULT_CLIP_DURATION_SEC);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef(0);
  const rafRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewBgmRef = useRef<{stop(): void} | null>(null);
  const cancelRef = useRef(false);
  const progressRef = useRef(0);
  // 描画は毎フレーム呼ばれるので、最新の状態は ref 経由で読む（再生中に古い値を掴まないため）
  const sceneRef = useRef<{clips: Clip[]; settings: ProjectSettings}>({clips, settings});

  const total = useMemo(() => totalDuration(clips), [clips]);
  const size = useMemo(() => frameSize(settings), [settings]);
  const exportSupported = useMemo(() => canExport(), []);
  const format = useMemo(() => pickFormat(), []);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, sceneRef.current.clips, sceneRef.current.settings, time);
  }, []);

  const setTime = useCallback(
    (time: number) => {
      timeRef.current = time;
      setDisplayTime(time);
      draw(time);
    },
    [draw],
  );

  // 状態が変わったら、キャンバスの寸法を合わせて描き直す
  useEffect(() => {
    sceneRef.current = {clips, settings};
    const canvas = canvasRef.current;
    if (canvas && (canvas.width !== size.width || canvas.height !== size.height)) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    if (exporting) return;
    const clamped = Math.min(timeRef.current, Math.max(0, total));
    timeRef.current = clamped;
    draw(clamped);
  }, [clips, settings, size.width, size.height, total, exporting, draw]);

  // 再生ループ。実時間を基準にするので、描画が重くても音とずれにくい
  useEffect(() => {
    if (!playing) return;
    if (total <= 0) {
      setPlaying(false);
      return;
    }
    const startWall = performance.now() - timeRef.current * 1000;
    let published = -1;

    if (bgm && audioContextRef.current) {
      previewBgmRef.current = startBgm(audioContextRef.current, bgm, audioContextRef.current.destination, total, timeRef.current);
    }

    const step = () => {
      const t = (performance.now() - startWall) / 1000;
      if (t >= total) {
        timeRef.current = total;
        setDisplayTime(total);
        draw(total);
        setPlaying(false);
        return;
      }
      timeRef.current = t;
      draw(t);
      // スクラバー表示のためだけに毎フレーム再描画させない
      if (Math.abs(t - published) >= 0.1) {
        published = t;
        setDisplayTime(t);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      previewBgmRef.current?.stop();
      previewBgmRef.current = null;
    };
  }, [playing, total, bgm, draw]);

  // 画面を離れるときに object URL を解放する
  useEffect(() => {
    return () => {
      for (const clip of sceneRef.current.clips) URL.revokeObjectURL(clip.objectUrl);
    };
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!Ctor) throw new Error('この環境では音声を扱えません');
      audioContextRef.current = new Ctor();
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const addImageFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      setError('画像ファイルが見つかりませんでした（JPEG・PNG・WebP など）');
      return;
    }
    setError(null);
    const loaded = await Promise.all(images.map(loadClip));
    setClips((prev) => [...prev, ...loaded]);
  }, []);

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? {...c, ...patch} : c)));
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const moveClip = useCallback((id: string, direction: -1 | 1) => {
    setClips((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }, []);

  const handleBgmFile = useCallback(
    async (file: File) => {
      try {
        const context = await ensureAudioContext();
        const buffer = await decodeAudioFile(context, file);
        setBgm({name: file.name, buffer, volume: 0.6, loop: true, fadeOutSec: 1.5});
        setError(null);
      } catch {
        setError('音声ファイルを読み込めませんでした（MP3・M4A・WAV などをお試しください）');
      }
    },
    [ensureAudioContext],
  );

  const togglePlay = useCallback(async () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (total <= 0) return;
    if (bgm) {
      try {
        await ensureAudioContext();
      } catch {
        // 音が出せなくても映像の確認は続けられるようにする
      }
    }
    if (timeRef.current >= total - 1e-3) setTime(0);
    setPlaying(true);
  }, [playing, total, bgm, ensureAudioContext, setTime]);

  const runExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || total <= 0) return;
    setPlaying(false);
    setError(null);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    cancelRef.current = false;
    progressRef.current = 0;
    setProgress(0);
    setExporting(true);
    try {
      let audio: {context: AudioContext; bgm: BgmSettings} | null = null;
      if (bgm) audio = {context: await ensureAudioContext(), bgm};

      const {blob, format: used} = await exportVideo({
        canvas,
        fps: settings.fps,
        totalSec: total,
        drawAt: draw,
        audio,
        onProgress: (ratio) => {
          // 書き出し中の再描画でコマ落ちしないよう、1%刻みでだけ画面へ反映する
          if (ratio - progressRef.current >= 0.01 || ratio === 1) {
            progressRef.current = ratio;
            setProgress(ratio);
          }
        },
        shouldCancel: () => cancelRef.current,
      });

      const name = `movie-${timestamp()}.${used.extension}`;
      downloadBlob(blob, name);
      setResult({url: URL.createObjectURL(blob), name, size: blob.size, label: used.label, widelySupported: used.widelySupported});
    } catch (e) {
      if (!(e instanceof ExportCancelled)) {
        setError(e instanceof Error ? e.message : '書き出しに失敗しました');
      }
    } finally {
      setExporting(false);
      setProgress(0);
      setTime(0);
    }
  }, [total, bgm, settings.fps, draw, ensureAudioContext, result, setTime]);

  const applyBulkDuration = useCallback(() => {
    setClips((prev) => prev.map((c) => ({...c, durationSec: bulkSeconds})));
  }, [bulkSeconds]);

  const busy = exporting;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-sky-700">
            <Film className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold tracking-wide">動画メーカー</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">写真とテロップから動画をつくる</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            画像を並べて秒数と文字を決めるだけで、スライドショー動画を書き出せます。
            画像・音声・書き出した動画はすべてブラウザの中だけで処理され、どこにも送信されません。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="leading-relaxed">{error}</span>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-amber-700 hover:text-amber-900" aria-label="閉じる">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* プレビューと書き出し */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardTitle note={`出力サイズ ${size.width} × ${size.height}px / ${settings.fps}fps / 全体 ${formatTime(total)}`}>
                プレビュー
              </CardTitle>
              <div className="overflow-hidden rounded-xl bg-slate-900">
                <canvas ref={canvasRef} className="block h-auto w-full" aria-label="動画のプレビュー" />
              </div>

              <div className="mt-3 flex items-center gap-3">
                <Button onClick={togglePlay} disabled={total <= 0 || busy} variant="primary" className="shrink-0">
                  {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                  {playing ? '一時停止' : '再生'}
                </Button>
                <input
                  type="range"
                  aria-label="再生位置"
                  min={0}
                  max={Math.max(0.1, total)}
                  step={0.05}
                  value={Math.min(displayTime, total)}
                  disabled={total <= 0 || busy}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(Number(e.target.value));
                  }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-sky-600 disabled:cursor-not-allowed"
                />
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {formatTime(displayTime)} / {formatTime(total)}
                </span>
              </div>
            </Card>

            <Card>
              <CardTitle
                note={
                  exportSupported
                    ? `録画方式のため、書き出しには動画の長さ（約${formatTime(total)}）と同じ時間がかかります。書き出し中はこのタブを表示したままにしてください。`
                    : undefined
                }
              >
                書き出し
              </CardTitle>

              {!exportSupported ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                  このブラウザは動画の書き出し（MediaRecorder）に対応していません。Chrome・Edge・Safari の最新版でお試しください。
                  プレビューと編集はこのままご利用いただけます。
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {exporting ? (
                      <Button onClick={() => (cancelRef.current = true)} variant="danger">
                        <X className="h-4 w-4" aria-hidden />
                        中止する
                      </Button>
                    ) : (
                      <Button onClick={runExport} disabled={clips.length === 0} variant="primary">
                        <Download className="h-4 w-4" aria-hidden />
                        動画を書き出す
                      </Button>
                    )}
                    <span className="text-xs text-slate-500">
                      形式：{format?.label ?? '不明'}
                      {format && !format.widelySupported && '（SNS へ投稿する場合は MP4 への変換が必要なことがあります）'}
                    </span>
                  </div>

                  {exporting && (
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-sky-600 transition-[width] duration-200" style={{width: `${Math.round(progress * 100)}%`}} />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                        {Math.round(progress * 100)}% ・ 残り約 {formatTime(Math.max(0, total - total * progress))}
                      </p>
                    </div>
                  )}

                  {result && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-800">
                        書き出しました：{result.name}（{formatBytes(result.size)} / {result.label}）
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">ダウンロードが始まらない場合は、下のプレーヤーから保存してください。</p>
                      <video src={result.url} controls className="mt-2 w-full rounded-lg bg-black" />
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          {/* 設定 */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardTitle>出力の設定</CardTitle>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">縦横比</span>
                  <SegmentedControl
                    ariaLabel="縦横比"
                    options={ASPECT_OPTIONS}
                    value={settings.aspect}
                    onChange={(aspect) => setSettings((s) => ({...s, aspect}))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">解像度（短辺）</span>
                  <SegmentedControl
                    ariaLabel="解像度"
                    size="sm"
                    options={[
                      {value: 540, label: '540p 軽い'},
                      {value: 720, label: '720p'},
                      {value: 1080, label: '1080p 高画質'},
                    ]}
                    value={settings.resolution}
                    onChange={(resolution) => setSettings((s) => ({...s, resolution}))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">フレームレート</span>
                  <SegmentedControl
                    ariaLabel="フレームレート"
                    size="sm"
                    options={[
                      {value: 24, label: '24fps'},
                      {value: 30, label: '30fps'},
                      {value: 60, label: '60fps'},
                    ]}
                    value={settings.fps}
                    onChange={(fps) => setSettings((s) => ({...s, fps}))}
                  />
                </div>
                <RangeField
                  label="カット間のフェード"
                  value={settings.transitionSec}
                  onChange={(transitionSec) => setSettings((s) => ({...s, transitionSec}))}
                  min={0}
                  max={2}
                  step={0.1}
                  display={(v) => (v === 0 ? 'なし' : `${v.toFixed(1)}秒`)}
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">画像の収め方</span>
                  <SegmentedControl
                    ariaLabel="画像の収め方"
                    size="sm"
                    options={[
                      {value: 'cover', label: '全面（端を切る）'},
                      {value: 'contain', label: '全体（余白あり）'},
                    ]}
                    value={settings.fit}
                    onChange={(fit) => setSettings((s) => ({...s, fit}))}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="bg-color">
                    余白・背景の色
                  </label>
                  <input
                    id="bg-color"
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(e) => setSettings((s) => ({...s, backgroundColor: e.target.value}))}
                    className="h-8 w-14 cursor-pointer rounded border border-slate-300"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle note="テロップは各カットごとに入力します。ここでは全カット共通の見た目を決めます。">テロップの見た目</CardTitle>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">位置</span>
                  <SegmentedControl
                    ariaLabel="テロップの位置"
                    size="sm"
                    options={POSITION_OPTIONS}
                    value={settings.captionPosition}
                    onChange={(captionPosition) => setSettings((s) => ({...s, captionPosition}))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">揃え</span>
                  <SegmentedControl
                    ariaLabel="テロップの揃え"
                    size="sm"
                    options={[
                      {value: 'center', label: '中央'},
                      {value: 'left', label: '左'},
                    ]}
                    value={settings.captionAlign}
                    onChange={(captionAlign) => setSettings((s) => ({...s, captionAlign}))}
                  />
                </div>
                <RangeField
                  label="文字の大きさ"
                  value={settings.fontScale}
                  onChange={(fontScale) => setSettings((s) => ({...s, fontScale}))}
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  display={(v) => `${Math.round(v * 100)}%`}
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="caption-color">
                    文字の色
                  </label>
                  <input
                    id="caption-color"
                    type="color"
                    value={settings.captionColor}
                    onChange={(e) => setSettings((s) => ({...s, captionColor: e.target.value}))}
                    className="h-8 w-14 cursor-pointer rounded border border-slate-300"
                  />
                </div>
                <Toggle
                  label="文字の背後を暗くする"
                  description="明るい写真の上でも文字が読めるよう、テロップ側にだけ影を敷きます。"
                  checked={settings.captionScrim}
                  onChange={(captionScrim) => setSettings((s) => ({...s, captionScrim}))}
                />
              </div>
            </Card>

            <Card>
              <CardTitle note="動画より短い音源は繰り返し、終わりに向けて音量を下げます。">BGM</CardTitle>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBgmFile(file);
                  e.target.value = '';
                }}
              />
              {bgm ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={bgm.name}>
                      {bgm.name}
                    </span>
                    <Button variant="ghost" onClick={() => setBgm(null)} title="BGM を外す">
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <RangeField
                    label="音量"
                    value={bgm.volume}
                    onChange={(volume) => setBgm((b) => (b ? {...b, volume} : b))}
                    min={0}
                    max={1}
                    step={0.05}
                    display={(v) => `${Math.round(v * 100)}%`}
                  />
                  <RangeField
                    label="終わりのフェードアウト"
                    value={bgm.fadeOutSec}
                    onChange={(fadeOutSec) => setBgm((b) => (b ? {...b, fadeOutSec} : b))}
                    min={0}
                    max={5}
                    step={0.5}
                    display={(v) => (v === 0 ? 'なし' : `${v.toFixed(1)}秒`)}
                  />
                  <Toggle
                    label="音源を繰り返す"
                    checked={bgm.loop}
                    onChange={(loop) => setBgm((b) => (b ? {...b, loop} : b))}
                  />
                </div>
              ) : (
                <Button onClick={() => audioInputRef.current?.click()} disabled={busy}>
                  <Music className="h-4 w-4" aria-hidden />
                  音声ファイルを選ぶ
                </Button>
              )}
            </Card>
          </div>
        </div>

        {/* カット一覧 */}
        <Card className="mt-4">
          <CardTitle note={clips.length > 0 ? `${clips.length}カット ・ 合計 ${formatTime(total)}` : undefined}>カット</CardTitle>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addImageFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addImageFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <ImagePlus className="h-6 w-6 text-slate-400" aria-hidden />
            <p className="text-sm text-slate-600">ここに画像をドラッグ＆ドロップ</p>
            <Button onClick={() => imageInputRef.current?.click()} disabled={busy}>
              画像を選ぶ
            </Button>
          </div>

          {clips.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-[180px] flex-1">
                <RangeField
                  label="すべてのカットの長さをそろえる"
                  value={bulkSeconds}
                  onChange={setBulkSeconds}
                  min={0.5}
                  max={15}
                  step={0.5}
                  display={(v) => `${v.toFixed(1)}秒`}
                />
              </div>
              <Button onClick={applyBulkDuration} disabled={busy}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                まとめて適用
              </Button>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-3">
            {clips.map((clip, index) => (
              <li key={clip.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex gap-3">
                  <div className="relative shrink-0">
                    <img
                      src={clip.objectUrl}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-100 object-cover sm:h-24 sm:w-24"
                    />
                    <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={clip.name}>
                        {clip.name}
                        {!clip.image && <span className="ml-1 text-rose-600">読み込めませんでした</span>}
                      </span>
                      <div className="flex shrink-0 gap-0.5">
                        <Button variant="ghost" onClick={() => moveClip(clip.id, -1)} disabled={index === 0 || busy} title="前へ">
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" onClick={() => moveClip(clip.id, 1)} disabled={index === clips.length - 1 || busy} title="後ろへ">
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" onClick={() => removeClip(clip.id)} disabled={busy} title="削除">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <TextField label="テロップ（大）" value={clip.title} onChange={(title) => updateClip(clip.id, {title})} placeholder="例：秋の京都へ" />
                      <TextField
                        label="テロップ（小）"
                        value={clip.subtitle}
                        onChange={(subtitle) => updateClip(clip.id, {subtitle})}
                        placeholder="例：2026年11月"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <RangeField
                        label="長さ"
                        value={clip.durationSec}
                        onChange={(durationSec) => updateClip(clip.id, {durationSec})}
                        min={0.5}
                        max={15}
                        step={0.5}
                        display={(v) => `${v.toFixed(1)}秒`}
                      />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-700">動き</span>
                        <SegmentedControl
                          ariaLabel="カットの動き"
                          size="sm"
                          options={MOTION_OPTIONS}
                          value={clip.motion}
                          onChange={(motion) => updateClip(clip.id, {motion})}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}
