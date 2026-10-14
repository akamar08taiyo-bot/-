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
import type {Recipient, SavedRecipient, SenderInfo, SheetLayout} from './storage';
import {FAX_KINDS, RIYOUSHA, effectiveTemplate, fillParts, findKind, hasFillMark} from './templates';
import type {Audience, CustomTemplates, DetailField, DetailKey, FaxKindId, TextTemplate} from './templates';
import {formatWareki, todayIso} from './wareki';

type Details = Record<DetailKey, string>;

const EMPTY_DETAILS: Details = {riyousha: '', product: '', quantity: '', documents: ''};
const NO_TEMPLATES: CustomTemplates = {};
const NO_RECIPIENTS: SavedRecipient[] = [];
/** 種類を選ぶ前の送付枚数 */
const DEFAULT_PAGES = 2;

const LAYOUT_OPTIONS: {value: SheetLayout; label: string}[] = [
  {value: 'classic', label: '従来の送信票'},
  {value: 'table', label: '表形式の送付状'},
];

/** 宛名欄の見出し。ケアマネ宛ての書類は「居宅名・ケアマネ名」と出す */
const RECIPIENT_LABELS: Record<Audience, {org: string; orgPlaceholder: string; person: string}> = {
  caremanager: {org: '居宅名', orgPlaceholder: '例）〇〇居宅介護支援事業所', person: 'ケアマネ名'},
  business: {org: '宛先（会社・施設名）', orgPlaceholder: '例）〇〇株式会社', person: 'ご担当者名'},
};

const SENDER_FIELDS: {key: keyof SenderInfo; label: string}[] = [
  {key: 'company', label: '会社名'},
  {key: 'office', label: '営業所名'},
  {key: 'person', label: '担当者（送信者）'},
  {key: 'postal', label: '郵便番号'},
  {key: 'address', label: '住所'},
  {key: 'tel', label: 'TEL'},
  {key: 'fax', label: 'FAX'},
];

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
  const [drafts, setDrafts] = useState<Partial<Record<FaxKindId, TextTemplate>>>({});
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [recipient, setRecipient] = useState<Recipient>(EMPTY_RECIPIENT);
  const [pages, setPages] = useState(DEFAULT_PAGES);
  // 枚数を自分で変えたら、種類を選び直しても初期値で上書きしない
  const pagesTouched = useRef(false);
  const [date, setDate] = useState(todayIso);
  const [showErrors, setShowErrors] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const orgInputRef = useRef<HTMLInputElement>(null);
  const fillInputRef = useRef<HTMLInputElement>(null);
  const kindSectionRef = useRef<HTMLElement>(null);

  const kind = kindId ? findKind(kindId) : null;
  const template = kind ? effectiveTemplate(kind, customTemplates) : null;
  const draft = kind ? (drafts[kind.id] ?? template) : null;
  const edited = !!draft && !!template && (draft.subject !== template.subject || draft.body !== template.body);
  const usingCustom = !!kind && !!customTemplates[kind.id];

  const audience: Audience = kind?.audience ?? 'caremanager';
  const labels = RECIPIENT_LABELS[audience];
  // 種類を選ぶ前は、いちばん使う「ご利用者名」の欄を出しておく
  const inputFields: DetailField[] = kind ? [...(kind.fill ? [kind.fill] : []), ...kind.lines] : [RIYOUSHA];
  const fillValue = kind?.fill ? details[kind.fill.key] : '';

  const recipientMissing = !recipient.org.trim() && !recipient.person.trim();
  const fillMissing =
    !!kind?.fill && !!draft && (hasFillMark(draft.subject) || hasFillMark(draft.body)) && !fillValue.trim();

  const selectKind = (id: FaxKindId, byPointer: boolean) => {
    const next = findKind(id);
    setKindId(id);
    setDrafts((prev) => (prev[id] ? prev : {...prev, [id]: effectiveTemplate(next, customTemplates)}));
    if (!pagesTouched.current) setPages(next.pages);
    // パソコンでマウスで選んだら、すぐ宛名を打てるようにする
    // （スマホはキーボードが開いて邪魔、矢印キーで選び直している最中にフォーカスを奪うのも困るので、そのときはしない）
    if (byPointer && !recipient.org && window.matchMedia('(pointer: fine)').matches) {
      requestAnimationFrame(() => orgInputRef.current?.focus({preventScroll: true}));
    }
  };

  const updateDraft = (patch: Partial<TextTemplate>) => {
    if (!kind || !template) return;
    setDrafts((prev) => ({...prev, [kind.id]: {...(prev[kind.id] ?? template), ...patch}}));
  };

  const changePages = (n: number) => {
    pagesTouched.current = true;
    setPages(n);
  };

  const sheetData: SheetData = useMemo(
    () => ({
      dateText: formatWareki(date),
      to: describeRecipient(recipient),
      pages,
      subject: draft ? fillParts(draft.subject.trim(), fillValue) : [],
      body: draft ? fillParts(draft.body.replace(/\s+$/, ''), fillValue) : [],
      details: kind
        ? kind.lines.flatMap((f) => {
            const value = details[f.key].trim();
            return value ? [{label: f.label, value}] : [];
          })
        : [],
      sender,
    }),
    [date, recipient, pages, draft, fillValue, kind, details, sender],
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
    if (fillMissing) {
      setShowErrors(true);
      fillInputRef.current?.focus();
      return;
    }
    setSavedRecipients((list) => rememberRecipient(list, recipient, Date.now()));
    window.print();
  };

  const hasInput =
    kindId !== null || !!(recipient.org || recipient.person) || Object.values(details).some((v) => v.trim() !== '');

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
    setPages(DEFAULT_PAGES);
    pagesTouched.current = false;
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
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">FAX送付状 かんたん作成</h1>
              <p className="text-xs text-slate-600 sm:text-sm">
                送るFAXにチェックを入れると文章が自動で入ります。宛名を入れて印刷するだけ。
              </p>
            </div>
            {hasInput && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                新しいFAXを作る
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] lg:items-start xl:grid-cols-[minmax(0,1fr)_520px]">
          <StepCard step={1} title="送るFAXを選ぶ" sectionRef={kindSectionRef}>
            <KindPicker selected={kindId} onSelect={selectKind} customTemplates={customTemplates} />
            {showErrors && !kind && <ErrorText>送るFAXを選んでください。</ErrorText>}
          </StepCard>

          <StepCard step={2} title="宛名・ご利用者名・枚数">
            {savedRecipients.length > 0 && (
              <SavedRecipients
                saved={savedRecipients}
                query={recipient.org}
                onPick={(r) => setRecipient({org: r.org, person: r.person})}
                onForget={(id) => setSavedRecipients((list) => list.filter((r) => r.id !== id))}
              />
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)] gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
              <Labeled label={labels.org} required>
                {(id) => (
                  <input
                    id={id}
                    ref={orgInputRef}
                    type="text"
                    value={recipient.org}
                    onChange={(e) => setRecipient((prev) => ({...prev, org: e.target.value}))}
                    placeholder={labels.orgPlaceholder}
                    autoComplete="off"
                    aria-invalid={showErrors && recipientMissing}
                    className={`w-full ${showErrors && recipientMissing ? fieldErrorClass : fieldClass}`}
                  />
                )}
              </Labeled>
              <Labeled label={labels.person}>
                {(id) => (
                  <WithSuffix suffix="様">
                    <input
                      id={id}
                      type="text"
                      value={recipient.person}
                      onChange={(e) => setRecipient((prev) => ({...prev, person: e.target.value}))}
                      placeholder="例）佐藤"
                      autoComplete="off"
                      className={inputClass}
                    />
                  </WithSuffix>
                )}
              </Labeled>
            </div>
            {showErrors && recipientMissing && <ErrorText>{labels.org}を入力してください。</ErrorText>}

            <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2">
              {inputFields.map((f) => {
                const isFill = !!kind?.fill && f.key === kind.fill.key;
                const error = isFill && showErrors && fillMissing;
                return (
                  <div key={f.key} className={f.key === 'quantity' ? 'w-28' : 'min-w-[10rem] flex-1'}>
                    <Labeled label={f.label} required={isFill}>
                      {(id) => (
                        <WithSuffix suffix={f.suffix}>
                          <input
                            id={id}
                            ref={isFill ? fillInputRef : undefined}
                            type="text"
                            value={details[f.key]}
                            onChange={(e) => setDetails((prev) => ({...prev, [f.key]: e.target.value}))}
                            placeholder={f.placeholder}
                            autoComplete="off"
                            aria-invalid={error}
                            className={`w-full ${error ? fieldErrorClass : fieldClass}`}
                          />
                        </WithSuffix>
                      )}
                    </Labeled>
                    {error && <ErrorText>{f.label}を入力してください。</ErrorText>}
                  </div>
                );
              })}
              <Labeled label="枚数（本状含む）">
                {(id) => <PageCounter id={id} value={pages} onChange={changePages} />}
              </Labeled>
              <Labeled label="送信日">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value || todayIso())}
                      className={fieldClass}
                    />
                    <span className="whitespace-nowrap text-xs text-slate-500">{formatWareki(date)}</span>
                  </div>
                )}
              </Labeled>
            </div>
          </StepCard>

          <StepCard step={3} title="文章（自動で入ります・編集可）">
            {kind && draft && template ? (
              <div className="space-y-2">
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
                      rows={4}
                      className={`${inputClass} field-sizing-content min-h-28 leading-relaxed`}
                    />
                  )}
                </Labeled>
                {kind.fill && (
                  <p className="text-xs text-slate-500">
                    文章の「〇〇」の部分には、上で入力した{kind.fill.label}が自動で入ります。
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
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
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500">
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={handlePrint} className={`${primaryButtonClass} w-full sm:w-auto`}>
                <Printer className="h-5 w-5" aria-hidden />
                印刷する
              </button>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-600">
                印刷画面でプリンター（PC-FAXならFAX用、PDFにするなら「PDFに保存」）を選びます。用紙はA4・縦、倍率は100%のままで。
              </p>
            </div>
          </StepCard>

          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-start-1">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Settings2 className="h-5 w-5 text-slate-500" aria-hidden />
                差出人（自社）の設定
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {[sender.company, sender.office].filter(Boolean).join(' ')}
                {sender.person && `／担当 ${sender.person}`}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <div className="border-t border-slate-100 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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

        <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs leading-relaxed text-slate-500 sm:px-6">
          入力した内容はこのパソコン（ブラウザ）の中だけで使い、外部には送信しません。ご利用者名などの記入内容は保存されず、画面を閉じると消えます。
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
// 文字はスマホで16px（それより小さいとiPhoneが入力時に画面を拡大する）、パソコンでは14pxにして詰める
const fieldBase =
  'rounded-lg border bg-white px-2.5 py-1.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm';
const fieldClass = `${fieldBase} border-slate-300 focus:border-blue-500 focus:ring-blue-500/30`;
const fieldErrorClass = `${fieldBase} border-red-500 ring-2 ring-red-500/20 focus:ring-red-500/30`;
const inputClass = `w-full ${fieldClass}`;

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-base font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white';

function StepCard({
  step,
  title,
  children,
  sectionRef,
}: {
  step: number;
  title: string;
  children: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={sectionRef}
      className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-start-1"
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
          aria-hidden
        >
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorText({children}: {children: ReactNode}) {
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-red-600">
      {children}
    </p>
  );
}

/** ラベルと入力欄を useId で結びつける */
function Labeled({label, required, children}: {label: string; required?: boolean; children: (id: string) => ReactNode}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {label}
        {required && <span className="rounded bg-red-50 px-1 text-[10px] font-bold text-red-600">必須</span>}
      </label>
      {children(id)}
    </div>
  );
}

/** 入力欄の後ろに「様」を添える */
function WithSuffix({suffix, children}: {suffix?: string; children: ReactNode}) {
  if (!suffix) return children;
  return (
    <div className="flex items-center gap-1">
      {children}
      <span className="shrink-0 text-sm text-slate-600">{suffix}</span>
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
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
    >
      {FAX_KINDS.map((k) => {
        const checked = selected === k.id;
        return (
          <label
            key={k.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-2.5 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${
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
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
              }`}
              aria-hidden
            >
              {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 text-sm font-bold leading-snug text-slate-800 [word-break:auto-phrase]">
              {k.label}
              {customTemplates[k.id] && (
                <span className="ml-1 whitespace-nowrap text-[10px] font-medium text-amber-700">（保存した文面）</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** 印刷した宛先の一覧。押すと居宅名・ケアマネ名が入る。入力中の文字で絞り込む */
function SavedRecipients({
  saved,
  query,
  onPick,
  onForget,
}: {
  saved: SavedRecipient[];
  query: string;
  onPick: (r: SavedRecipient) => void;
  onForget: (id: string) => void;
}) {
  const matches = filterRecipients(saved, query);
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-slate-500">保存した宛先（押すと入ります）</p>
      {matches.length > 0 ? (
        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {matches.map((r) => {
            const line = describeRecipient(r).line;
            return (
              <li
                key={r.id}
                className="flex items-center rounded-full border border-slate-300 bg-white text-xs text-slate-700 hover:border-blue-400"
              >
                <button type="button" onClick={() => onPick(r)} className="rounded-l-full py-1 pl-2.5 pr-1 hover:text-blue-700">
                  {line}
                </button>
                <button
                  type="button"
                  onClick={() => onForget(r.id)}
                  aria-label={`${line} を宛先帳から消す`}
                  title="宛先帳から消す"
                  className="rounded-r-full py-1 pl-0.5 pr-2 text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">一致する保存済みの宛先はありません（印刷すると保存されます）。</p>
      )}
    </div>
  );
}

/** 送付枚数。打っている途中（空欄など）は親へ反映せず、正しい数になったときだけ反映する */
function PageCounter({id, value, onChange}: {id: string; value: number; onChange: (n: number) => void}) {
  const [text, setText] = useState<string | null>(null);
  const set = (n: number) => {
    setText(null);
    onChange(Math.min(99, Math.max(1, n)));
  };
  const stepButtonClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40';
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="1枚減らす" className={stepButtonClass}>
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
        className={`${fieldClass} w-12 text-center tabular-nums`}
      />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= 99} aria-label="1枚増やす" className={stepButtonClass}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <span className="text-sm text-slate-600">枚</span>
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
