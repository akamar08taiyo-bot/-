import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode, Ref} from 'react';
import {AlertTriangle, Check, ChevronDown, Minus, Plus, Printer, RotateCcw, Save, Settings2, X} from 'lucide-react';
import {describeRecipient, filterRecipients, rememberRecipient} from './recipient';
import {FaxSheet} from './sheets';
import type {SheetData} from './sheets';
import {
  DEFAULT_SENDER,
  EMPTY_RECIPIENT,
  sanitizeLayout,
  sanitizeRecipients,
  sanitizeSender,
  sanitizeTemplates,
  usePersistentState,
} from './storage';
import type {Honorific, Recipient, SavedRecipient, SenderInfo, SheetLayout} from './storage';
import {FAX_KINDS, effectiveTemplate, findKind} from './templates';
import type {CustomTemplates, DetailKey, FaxKind, FaxKindId, TextTemplate} from './templates';
import {formatWareki, todayIso} from './wareki';

interface Draft extends TextTemplate {
  pages: number;
}

type Details = Record<DetailKey, string>;

const EMPTY_DETAILS: Details = {riyousha: '', product: '', quantity: '', deadline: '', note: '', documents: ''};
const NO_TEMPLATES: CustomTemplates = {};
const NO_RECIPIENTS: SavedRecipient[] = [];

const LAYOUT_OPTIONS: {value: SheetLayout; label: string}[] = [
  {value: 'classic', label: '従来の送信票'},
  {value: 'table', label: '表形式の送付状'},
];

const SENDER_FIELDS: {key: keyof SenderInfo; label: string}[] = [
  {key: 'company', label: '会社名'},
  {key: 'office', label: '営業所名'},
  {key: 'person', label: '担当者（送信者）'},
  {key: 'postal', label: '郵便番号'},
  {key: 'address', label: '住所'},
  {key: 'tel', label: 'TEL'},
  {key: 'fax', label: 'FAX'},
];

function initialDraft(kind: FaxKind, custom: CustomTemplates): Draft {
  return {...effectiveTemplate(kind, custom), pages: kind.pages};
}

export function FaxApp() {
  const [sender, setSender] = usePersistentState<SenderInfo>('sender', DEFAULT_SENDER, sanitizeSender);
  const [layout, setLayout] = usePersistentState<SheetLayout>('layout', 'classic', sanitizeLayout);
  const [customTemplates, setCustomTemplates] = usePersistentState<CustomTemplates>(
    'templates',
    NO_TEMPLATES,
    sanitizeTemplates,
  );
  const [savedRecipients, setSavedRecipients] = usePersistentState<SavedRecipient[]>(
    'recipients',
    NO_RECIPIENTS,
    sanitizeRecipients,
  );

  const [kindId, setKindId] = useState<FaxKindId | null>(null);
  // 種類ごとの編集中の文面。種類を切り替えて戻っても、書き換えた内容は残る
  const [drafts, setDrafts] = useState<Partial<Record<FaxKindId, Draft>>>({});
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [recipient, setRecipient] = useState<Recipient>(EMPTY_RECIPIENT);
  const [date, setDate] = useState(todayIso);
  const [showErrors, setShowErrors] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orgInputRef = useRef<HTMLInputElement>(null);
  const kindSectionRef = useRef<HTMLElement>(null);

  const kind = kindId ? findKind(kindId) : null;
  const template = kind ? effectiveTemplate(kind, customTemplates) : null;
  const draft = kind ? (drafts[kind.id] ?? initialDraft(kind, customTemplates)) : null;
  const edited = !!draft && !!template && (draft.subject !== template.subject || draft.body !== template.body);
  const usingCustom = !!kind && !!customTemplates[kind.id];
  const recipientMissing = !recipient.org.trim() && !recipient.person.trim();

  const selectKind = (id: FaxKindId, byPointer: boolean) => {
    setKindId(id);
    setDrafts((prev) => (prev[id] ? prev : {...prev, [id]: initialDraft(findKind(id), customTemplates)}));
    // パソコンでマウスで選んだら、すぐ宛名を打てるようにする
    // （スマホはキーボードが開いて邪魔、矢印キーで選び直している最中にフォーカスを奪うのも困るので、そのときはしない）
    if (byPointer && !recipient.org && window.matchMedia('(pointer: fine)').matches) {
      requestAnimationFrame(() => orgInputRef.current?.focus({preventScroll: true}));
    }
  };

  const updateDraft = (patch: Partial<Draft>) => {
    if (!kind) return;
    setDrafts((prev) => ({...prev, [kind.id]: {...(prev[kind.id] ?? initialDraft(kind, customTemplates)), ...patch}}));
  };

  const updateRecipient = (patch: Partial<Recipient>) => setRecipient((prev) => ({...prev, ...patch}));

  const sheetData: SheetData = useMemo(
    () => ({
      dateText: formatWareki(date),
      to: describeRecipient(recipient),
      toFax: recipient.fax.trim(),
      pages: draft?.pages ?? 1,
      subject: draft?.subject.trim() ?? '',
      body: draft?.body.replace(/\s+$/, '') ?? '',
      details: kind
        ? kind.fields.flatMap((f) => {
            const value = details[f.key].trim();
            if (!value) return [];
            const withSuffix = f.suffix && !value.endsWith(f.suffix) ? `${value}　${f.suffix}` : value;
            return [{label: f.label, value: withSuffix}];
          })
        : [],
      sender,
    }),
    [date, recipient, draft, kind, details, sender],
  );

  // Ctrl+P で印刷したときも、宛先を宛先帳に残す
  useEffect(() => {
    const onBeforePrint = () => {
      if (!recipientMissing) setSavedRecipients((list) => rememberRecipient(list, recipient, Date.now()));
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, [recipient, recipientMissing, setSavedRecipients]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handlePrint = () => {
    if (!kind) {
      setShowErrors(true);
      kindSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
      return;
    }
    if (recipientMissing) {
      setShowErrors(true);
      orgInputRef.current?.focus();
      return;
    }
    setSavedRecipients((list) => rememberRecipient(list, recipient, Date.now()));
    window.print();
  };

  const hasInput =
    kindId !== null ||
    !!(recipient.org || recipient.person || recipient.fax) ||
    Object.values(details).some((v) => v.trim() !== '');

  const handleReset = () => {
    if (
      hasInput &&
      !window.confirm('入力した内容を消して、新しいFAXを作りますか？\n（保存した宛先・文面・差出人の設定は消えません）')
    ) {
      return;
    }
    setKindId(null);
    setDrafts({});
    setDetails(EMPTY_DETAILS);
    setRecipient(EMPTY_RECIPIENT);
    setDate(todayIso());
    setShowErrors(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const saveTemplate = () => {
    if (!kind || !draft) return;
    const isBuiltin = draft.subject === kind.subject && draft.body === kind.body;
    setCustomTemplates((prev) => {
      const next = {...prev};
      if (isBuiltin) delete next[kind.id];
      else next[kind.id] = {subject: draft.subject, body: draft.body};
      return next;
    });
    setNotice(`「${kind.label}」の文面を保存しました。次回からこの文面が入ります。`);
  };

  const restoreBuiltinTemplate = () => {
    if (!kind) return;
    if (!window.confirm(`「${kind.label}」の保存した文面を消して、最初の文面に戻しますか？`)) return;
    setCustomTemplates((prev) => {
      const next = {...prev};
      delete next[kind.id];
      return next;
    });
    updateDraft({subject: kind.subject, body: kind.body});
  };

  return (
    <>
      <div className="fx-screen min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-4 py-5 sm:px-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">FAX送付状 かんたん作成</h1>
              <p className="mt-1 text-sm text-slate-600">
                送るFAXにチェックを入れると文章が自動で入ります。宛名を入れて印刷するだけ。
              </p>
            </div>
            {hasInput && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                新しいFAXを作る
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-start xl:grid-cols-[minmax(0,1fr)_520px]">
          <StepCard
            step={1}
            title="送るFAXを選ぶ"
            note="チェックを入れると、件名と文章が自動で入ります。"
            sectionRef={kindSectionRef}
          >
            <KindPicker selected={kindId} onSelect={selectKind} customTemplates={customTemplates} />
            {showErrors && !kind && <ErrorText>送るFAXを選んでください。</ErrorText>}
          </StepCard>

          <StepCard step={2} title="宛名を入れる" note="ここだけは毎回入力します。印刷した宛先は次回から選べます。">
            <RecipientForm
              recipient={recipient}
              onChange={updateRecipient}
              saved={savedRecipients}
              onPick={(r) =>
                setRecipient({org: r.org, person: r.person, honorific: r.honorific, fax: r.fax})
              }
              onForget={(id) => setSavedRecipients((list) => list.filter((r) => r.id !== id))}
              orgInputRef={orgInputRef}
              error={showErrors && recipientMissing ? '宛先（事業所名・会社名）を入力してください。' : undefined}
            />
          </StepCard>

          <StepCard step={3} title="内容を確認する" note="自動で入った文章は自由に書き換えられます。">
            {kind && draft && template ? (
              <div className="space-y-5">
                {kind.fields.length > 0 && (
                  <div className="space-y-3">
                    {kind.fields.map((f) => (
                      <DetailInput
                        key={f.key}
                        label={f.label}
                        placeholder={f.placeholder}
                        suffix={f.suffix}
                        multiline={f.multiline}
                        value={details[f.key]}
                        onChange={(v) => setDetails((prev) => ({...prev, [f.key]: v}))}
                      />
                    ))}
                    <p className="text-xs text-slate-500">空欄の項目は用紙に印字されません。</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="送付枚数">
                    {(id) => <PageCounter id={id} value={draft.pages} onChange={(pages) => updateDraft({pages})} />}
                  </Labeled>
                  <Labeled label="送信日">
                    {(id) => (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id={id}
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value || todayIso())}
                          className={fieldClass}
                        />
                        <span className="text-sm text-slate-600">{formatWareki(date)}</span>
                      </div>
                    )}
                  </Labeled>
                </div>

                <Labeled label="件名">
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      value={draft.subject}
                      onChange={(e) => updateDraft({subject: e.target.value})}
                      className={inputClass}
                    />
                  )}
                </Labeled>

                <Labeled label="文章">
                  {(id) => (
                    <textarea
                      id={id}
                      value={draft.body}
                      onChange={(e) => updateDraft({body: e.target.value})}
                      rows={6}
                      className={`${inputClass} field-sizing-content min-h-40 leading-relaxed`}
                    />
                  )}
                </Labeled>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!edited}
                    onClick={() => updateDraft({subject: template.subject, body: template.body})}
                    className={secondaryButtonClass}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    元の文面に戻す
                  </button>
                  <button type="button" disabled={!edited} onClick={saveTemplate} className={secondaryButtonClass}>
                    <Save className="h-4 w-4" aria-hidden />
                    この文面を次回も使う
                  </button>
                  {usingCustom && (
                    <span className="text-xs text-slate-500">
                      保存した文面を使用中（
                      <button
                        type="button"
                        onClick={restoreBuiltinTemplate}
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                      >
                        最初の文面に戻す
                      </button>
                      ）
                    </span>
                  )}
                </div>
                {notice && (
                  <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {notice}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                ① で送るFAXを選ぶと、ここに件名と文章が入ります。
              </p>
            )}
          </StepCard>

          <aside className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-5 lg:row-start-1" aria-label="印刷イメージ">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">印刷イメージ（A4）</h2>
                <SegmentedControl<SheetLayout>
                  ariaLabel="印刷デザイン"
                  options={LAYOUT_OPTIONS}
                  value={layout}
                  onChange={(v) => setLayout(v)}
                />
              </div>
              {overflowing && (
                <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  文章が長く、枠に収まりきっていません。文章を短くしてください。
                </p>
              )}
              <ScaledPreview>
                <FaxSheet data={sheetData} layout={layout} preview onOverflowChange={setOverflowing} />
              </ScaledPreview>
              {/* スマホでは直下の ④ に同じボタンがあるので、横並びの画面でだけ出す */}
              <div className="mt-4 hidden lg:block">
                <button type="button" onClick={handlePrint} className={`${primaryButtonClass} w-full`}>
                  <Printer className="h-5 w-5" aria-hidden />
                  印刷する
                </button>
              </div>
            </div>
          </aside>

          <StepCard step={4} title="印刷して送る">
            <button type="button" onClick={handlePrint} className={`${primaryButtonClass} w-full sm:w-auto`}>
              <Printer className="h-5 w-5" aria-hidden />
              印刷する
            </button>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
              <li>印刷画面でプリンターを選んで印刷し、FAX機で送信してください。</li>
              <li>PC-FAXのときはFAXのプリンターを、PDFにしたいときは「PDFに保存」を選びます。</li>
              <li>用紙はA4・縦、倍率は既定（100%）のままにしてください。</li>
            </ul>
          </StepCard>

          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-start-1">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-2xl p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-base font-bold text-slate-800">
                <Settings2 className="h-5 w-5 text-slate-500" aria-hidden />
                差出人（自社）の設定
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {[sender.company, sender.office].filter(Boolean).join(' ')}
                {sender.person && `／担当 ${sender.person}`}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <div className="border-t border-slate-100 p-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {SENDER_FIELDS.map((f) => (
                  <Labeled key={f.key} label={f.label}>
                    {(id) => (
                      <input
                        id={id}
                        type="text"
                        value={sender[f.key]}
                        onChange={(e) => setSender((prev) => ({...prev, [f.key]: e.target.value}))}
                        className={inputClass}
                      />
                    )}
                  </Labeled>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">変更はこのパソコン（ブラウザ）に自動で保存されます。</p>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('差出人の設定を最初の内容に戻しますか？')) setSender(DEFAULT_SENDER);
                  }}
                  className={secondaryButtonClass}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  最初の内容に戻す
                </button>
              </div>
            </div>
          </details>
        </main>

        <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs leading-relaxed text-slate-500 sm:px-6">
          入力した内容はこのパソコン（ブラウザ）の中だけで使い、外部には送信しません。ご利用者様名などの記入内容は保存されず、画面を閉じると消えます。
        </footer>
      </div>

      {/* 印刷するのはこの1枚だけ（画面の部品は印刷時に隠す） */}
      <div className="fx-print-root">
        <FaxSheet data={sheetData} layout={layout} />
      </div>
    </>
  );
}

// ---- 部品 ----

// 幅や枠線の色は呼び出し側で足す（同じ種類のクラスを重ねると、どちらが効くかが不定になるため）
const fieldBase =
  'rounded-lg border bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2';
const fieldClass = `${fieldBase} border-slate-300 focus:border-blue-500 focus:ring-blue-500/30`;
const fieldErrorClass = `${fieldBase} border-red-500 ring-2 ring-red-500/20 focus:ring-red-500/30`;
const inputClass = `w-full ${fieldClass}`;

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white';

function StepCard({
  step,
  title,
  note,
  children,
  sectionRef,
}: {
  step: number;
  title: string;
  note?: string;
  children: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={sectionRef}
      className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-start-1"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
          aria-hidden
        >
          {step}
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {note && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ErrorText({children}: {children: ReactNode}) {
  return (
    <p role="alert" className="mt-2 text-sm font-medium text-red-600">
      {children}
    </p>
  );
}

/** ラベルと入力欄を useId で結びつける */
function Labeled({label, children}: {label: string; children: (id: string) => ReactNode}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function KindPicker({
  selected,
  onSelect,
  customTemplates,
}: {
  selected: FaxKindId | null;
  onSelect: (id: FaxKindId, byPointer: boolean) => void;
  customTemplates: CustomTemplates;
}) {
  // マウス・タッチで選んだのか、キーボードで選んだのかを覚えておく
  const byPointer = useRef(false);
  return (
    <div
      role="radiogroup"
      aria-label="送るFAXの種類"
      onPointerDown={() => {
        byPointer.current = true;
      }}
      onKeyDown={() => {
        byPointer.current = false;
      }}
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
    >
      {FAX_KINDS.map((k) => {
        const checked = selected === k.id;
        return (
          <label
            key={k.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${
              checked ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="fax-kind"
              value={k.id}
              checked={checked}
              onChange={() => onSelect(k.id, byPointer.current)}
              className="sr-only"
            />
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
              }`}
              aria-hidden
            >
              {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-snug text-slate-800">{k.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{k.hint}</span>
              {customTemplates[k.id] && (
                <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                  保存した文面
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function RecipientForm({
  recipient,
  onChange,
  saved,
  onPick,
  onForget,
  orgInputRef,
  error,
}: {
  recipient: Recipient;
  onChange: (patch: Partial<Recipient>) => void;
  saved: SavedRecipient[];
  onPick: (r: SavedRecipient) => void;
  onForget: (id: string) => void;
  orgInputRef: Ref<HTMLInputElement>;
  error?: string;
}) {
  const orgId = useId();
  const personId = useId();
  const faxId = useId();
  const matches = filterRecipients(saved, recipient.org);
  const hasPerson = recipient.person.trim() !== '';

  return (
    <div className="space-y-4">
      {saved.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">
            保存した宛先（押すと入力されます{recipient.org && '・入力中の文字で絞り込み中'}）
          </p>
          {matches.length > 0 ? (
            <ul className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
              {matches.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center rounded-full border border-slate-300 bg-white text-sm text-slate-700 hover:border-blue-400"
                >
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="rounded-l-full py-1.5 pl-3 pr-1 hover:text-blue-700"
                  >
                    {describeRecipient(r).line}
                  </button>
                  <button
                    type="button"
                    onClick={() => onForget(r.id)}
                    aria-label={`${describeRecipient(r).line} を宛先帳から消す`}
                    title="宛先帳から消す"
                    className="rounded-r-full py-1.5 pl-1 pr-2.5 text-slate-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">一致する保存済みの宛先はありません（印刷すると保存されます）。</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor={orgId} className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
          宛先（事業所名・会社名）
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-600">必須</span>
        </label>
        <input
          id={orgId}
          ref={orgInputRef}
          type="text"
          value={recipient.org}
          onChange={(e) => onChange({org: e.target.value})}
          placeholder="例）〇〇居宅介護支援事業所"
          autoComplete="off"
          aria-invalid={!!error}
          className={`w-full ${error ? fieldErrorClass : fieldClass}`}
        />
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label htmlFor={personId} className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
            ご担当者名
            <span className="text-[11px] font-normal text-slate-400">任意</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id={personId}
              type="text"
              value={recipient.person}
              onChange={(e) => onChange({person: e.target.value})}
              placeholder="例）佐藤"
              autoComplete="off"
              className={inputClass}
            />
            {hasPerson && <span className="shrink-0 text-sm text-slate-600">様</span>}
          </div>
        </div>
        {!hasPerson && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">敬称</span>
            <SegmentedControl<Honorific>
              ariaLabel="敬称"
              options={[
                {value: '様', label: '様'},
                {value: '御中', label: '御中'},
              ]}
              value={recipient.honorific}
              onChange={(honorific) => onChange({honorific})}
            />
          </div>
        )}
      </div>

      <div>
        <label htmlFor={faxId} className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
          相手のFAX番号
          <span className="text-[11px] font-normal text-slate-400">任意・入れると用紙に印字</span>
        </label>
        <input
          id={faxId}
          type="text"
          inputMode="tel"
          value={recipient.fax}
          onChange={(e) => onChange({fax: e.target.value})}
          placeholder="例）0930-00-0000"
          autoComplete="off"
          className={`${inputClass} sm:max-w-xs`}
        />
      </div>
    </div>
  );
}

function DetailInput({
  label,
  placeholder,
  suffix,
  multiline,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  suffix?: string;
  multiline?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Labeled label={`【${label}】`}>
      {(id) => (
        <div className="flex items-center gap-2">
          {multiline ? (
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={2}
              className={`${inputClass} field-sizing-content min-h-16`}
            />
          ) : (
            <input
              id={id}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className={inputClass}
            />
          )}
          {suffix && <span className="shrink-0 text-sm text-slate-600">{suffix}</span>}
        </div>
      )}
    </Labeled>
  );
}

/** 送付枚数。打っている途中（空欄など）は親へ反映せず、正しい数になったときだけ反映する */
function PageCounter({id, value, onChange}: {id: string; value: number; onChange: (n: number) => void}) {
  const [text, setText] = useState<string | null>(null);
  const set = (n: number) => {
    setText(null);
    onChange(Math.min(99, Math.max(1, n)));
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= 1}
        aria-label="1枚減らす"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={text ?? String(value)}
        onChange={(e) => {
          const digits = e.target.value.normalize('NFKC').replace(/\D/g, '');
          setText(digits);
          const n = Number(digits);
          if (digits && n >= 1 && n <= 99) onChange(n);
        }}
        onBlur={() => setText(null)}
        className={`${fieldClass} w-16 text-center tabular-nums`}
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= 99}
        aria-label="1枚増やす"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <span className="whitespace-nowrap text-sm text-slate-600">枚（本状を含む）</span>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: {value: T; label: string}[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 用紙（210×297mm）をCSSピクセルに直した大きさ。プレビューはこれを枠の幅に合わせて縮小する
const SHEET_WIDTH_PX = (210 * 96) / 25.4;
const SHEET_HEIGHT_PX = (297 * 96) / 25.4;

function ScaledPreview({children}: {children: ReactNode}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / SHEET_WIDTH_PX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto lg:max-w-[calc((100vh-12rem)*0.7071)]">
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.08)]"
        style={{aspectRatio: '210 / 297'}}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{width: SHEET_WIDTH_PX, height: SHEET_HEIGHT_PX, transform: `scale(${scale})`}}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
