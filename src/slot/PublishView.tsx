import {useEffect, useMemo, useRef, useState} from 'react';
import {Card, CardTitle, StatTile} from '../mortgage/ui';
import {dayOfMonth} from './analyze';
import {diffClass, int, pct, shortDate, signed} from './format';
import {
  dayPostLong,
  dayPostX,
  DISCLAIMER,
  evaluatePrediction,
  monthlyArticle,
  PAYWALL_MARK,
  predictionPostX,
  resultPostX,
  sourceLine,
  trackRecord,
  X_LIMIT,
  xLength,
} from './publish';
import type {PostOptions, Prediction} from './publish';
import {drawDayImage} from './shareImage';
import {loadPublishSettings, savePublishSettings} from './storage';
import type {PublishSettings} from './storage';
import type {SlotRow} from './types';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // クリップボードAPIが使えない環境向け
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 生成した文章の表示・コピー・X投稿画面を開くボタン */
function TextOutput({text, x, filename}: {text: string; x?: boolean; filename?: string}) {
  const [copied, setCopied] = useState(false);
  const len = x ? xLength(text) : null;
  return (
    <div>
      <textarea readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-xs" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            setCopied(await copyText(text));
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800"
        >
          {copied ? 'コピーした' : 'コピー'}
        </button>
        {x && (
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Xの投稿画面を開く
          </a>
        )}
        {filename && (
          <button
            type="button"
            onClick={() => download(filename, new Blob([text], {type: 'text/markdown'}))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ファイルで保存
          </button>
        )}
        {len != null && (
          <span className={`text-xs tabular-nums ${len > X_LIMIT ? 'text-rose-700' : 'text-slate-500'}`}>
            {len}/{X_LIMIT}（Xの文字数）
          </span>
        )}
      </div>
    </div>
  );
}

export function PublishView({
  rows,
  dates,
  store,
  predictions,
  onDelete,
}: {
  rows: SlotRow[];
  dates: string[];
  store: string;
  predictions: Prediction[];
  onDelete: (id: string) => void;
}) {
  const [settings, setSettings] = useState<PublishSettings>(() => loadPublishSettings());
  useEffect(() => savePublishSettings(settings), [settings]);
  const opts: PostOptions = useMemo(
    () => ({store, source: settings.source.trim(), hashtags: settings.hashtags.split(/[\s,、]+/).filter(Boolean)}),
    [store, settings],
  );

  const [date, setDate] = useState(dates[dates.length - 1]);
  const d = dates.includes(date) ? date : dates[dates.length - 1];
  const months = useMemo(() => [...new Set(dates.map((x) => x.slice(0, 7)))].sort().reverse(), [dates]);
  const [month, setMonth] = useState(months[0]);
  const mo = months.includes(month) ? month : months[0];

  const results = useMemo(() => predictions.map((p) => evaluatePrediction(p, rows)), [predictions, rows]);
  const record = useMemo(() => trackRecord(results), [results]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const credit = [sourceLine(opts.source), '結果を保証するものではありません'].filter(Boolean).join('　');
  useEffect(() => {
    if (canvasRef.current) drawDayImage(canvasRef.current, rows, d, store, credit);
  }, [rows, d, store, credit]);

  const nextDay = (() => {
    const last = dates[dates.length - 1];
    const [y, m, dd] = last.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  })();

  return (
    <>
      <Card>
        <CardTitle note={`生成する文章・画像の末尾に入る表記。免責文「${DISCLAIMER}」は常に付く。`}>発信の設定</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            データ出典の表記
            <input
              value={settings.source}
              onChange={(e) => setSettings({...settings, source: e.target.value})}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-600">
            ハッシュタグ（空白区切り）
            <input
              value={settings.hashtags}
              onChange={(e) => setSettings({...settings, hashtags: e.target.value})}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
      </Card>

      <Card>
        <CardTitle note="毎日の無料発信用。全台一覧は載せず、店トータル・強い機種・末尾などの集計だけにしている。">日別まとめ</CardTitle>
        <select
          value={d}
          onChange={(e) => setDate(e.target.value)}
          aria-label="日付"
          className="mb-3 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {[...dates].reverse().map((x) => (
            <option key={x} value={x}>
              {shortDate(x)} {x.slice(0, 4)}
            </option>
          ))}
        </select>
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">X用（短文）</h3>
            <TextOutput text={dayPostX(rows, d, opts)} x />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">画像（X・note・インスタ用）</h3>
            <canvas ref={canvasRef} className="w-full rounded-lg border border-slate-200" aria-label={`${shortDate(d)} ${store} まとめ画像`} />
            <button
              type="button"
              onClick={() => canvasRef.current?.toBlob((b) => b && download(`${d}_${store}.png`, b), 'image/png')}
              className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              画像を保存
            </button>
          </div>
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">ブログ・note用（長文 Markdown）</h3>
        <TextOutput text={dayPostLong(rows, d, opts)} filename={`${d}_${store}.md`} />
      </Card>

      <Card>
        <CardTitle
          note={
            <>
              「狙い目」タブで記録した予想を、対象日のデータを取り込んだ時点で自動で答え合わせする。
              外れも含めた通算成績がそのまま信用になる（都合のいい日だけ載せない）。
            </>
          }
        >
          予想の実績
        </CardTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="答え合わせ済み" value={`${record.days}日`} sub={`予想中 ${results.filter((r) => !r.result).length}件`} />
          <StatTile label="予想台のプラス率" value={record.picks ? pct(record.hitRate, 0) : '−'} sub={`${record.hits}/${record.picks}台（店の勝率 ${record.picks ? pct(record.storeWinRate, 0) : '−'}）`} />
          <StatTile label="予想台の平均差枚" value={record.picks ? `${signed(record.pickAvgDiff)}枚` : '−'} sub={`同じ日の店平均 ${record.picks ? signed(record.storeAvgDiff) : '−'}枚`} />
          <StatTile label="店平均を上回った日" value={record.days ? `${record.beatDays}/${record.days}日` : '−'} />
        </div>
        {results.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            まだ予想がない。「狙い目」タブで {shortDate(nextDay)} の予想を記録してみてほしい。
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {results.map((r) => (
              <li key={r.prediction.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">
                    {shortDate(r.prediction.targetDate)} の予想
                    <span className="ml-2 text-xs font-normal text-slate-500">参考：{r.prediction.basis}</span>
                  </strong>
                  <span className="text-sm">
                    {r.result ? (
                      <>
                        {r.result.hits}/{r.result.evaluated}台プラス・平均
                        <span className={diffClass(r.result.pickAvgDiff)}> {signed(r.result.pickAvgDiff)}</span>
                        <span className="text-slate-500">（店平均 {signed(r.result.storeAvgDiff)}）</span>
                      </>
                    ) : (
                      <span className="text-slate-500">結果待ち</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {r.prediction.picks.map((pk, i) => {
                    const res = r.result?.picks[i];
                    return (
                      <span key={pk.unit} className="mr-3 inline-block">
                        {pk.unit}番 {pk.machine}
                        {res ? (
                          <span className={res.diff == null ? 'text-slate-400' : diffClass(res.diff)}> {res.diff == null ? '入替' : signed(res.diff)}</span>
                        ) : (
                          <span className="text-slate-400"> {pct(pk.pWin, 0)}</span>
                        )}
                      </span>
                    );
                  })}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-sky-700">投稿文を作る</summary>
                  <div className="mt-2 space-y-3">
                    <TextOutput text={predictionPostX(r.prediction, opts, record)} x />
                    {r.result && <TextOutput text={resultPostX(r, opts, record)!} x />}
                  </div>
                </details>
                <button
                  type="button"
                  onClick={() => confirm('この予想を削除する？（実績からも消える）') && onDelete(r.prediction.id)}
                  className="mt-2 text-xs text-rose-700 hover:underline"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle
          note={
            <>
              月1本の有料記事の下書き。前半（まとめ）は無料、<code className="rounded bg-slate-100 px-1">{PAYWALL_MARK}</code>
              から下が有料部分の想定。noteなら、この行の位置に有料ラインを置けばよい。
            </>
          }
        >
          月間レポート記事
        </CardTitle>
        <select
          value={mo}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="月"
          className="mb-3 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '年')}月（{int(dates.filter((x) => x.startsWith(m)).length)}日分）
            </option>
          ))}
        </select>
        <TextOutput
          text={monthlyArticle(rows, mo, {...opts, nextFilter: {kind: 'dateTail', value: dayOfMonth(nextDay) % 10}, record})}
          filename={`${mo}_${store}_月間レポート.md`}
        />
      </Card>
    </>
  );
}
