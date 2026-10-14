import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode, Ref} from 'react';
import {AlertTriangle, Check, ChevronDown, Minus, Plus, Printer, RotateCcw, Save, Settings2, Trash2} from 'lucide-react';
import {SHEET_FONTS, fontPreviewStyle, sanitizeFont} from './fonts';
import type {SheetFont} from './fonts';
import {describeRecipient, rememberRecipient} from './recipient';
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

/*
 * 画面の大きさは、13インチのノートパソコン（フルHDを150%表示。ブラウザで使える広さは横1280×縦600前後）を基準にしている。
 * この広さで、①種類・②宛名など・③文章・印刷イメージ・印刷ボタンがスクロールなしで見えるように詰めてある。
 */

type Details = Record<DetailKey, string>;

const EMPTY_DETAILS: Details = {riyousha: '', product: '', quantity: '', documents: ''};
const NO_TEMPLATES: CustomTemplates = {};
const NO_RECIPIENTS: SavedRecipient[] = [];
/** 種類を選ぶ前の送付枚数 */
const DEFAULT_PAGES = 2;

const LAYOUT_OPTIONS: {value: SheetLayout; label: string}[] = [
  {value: 'classic', label: '従来の送信票'},
  {value: 'table', label: '表形式'},
  {value: 'letter', label: '文書形式'},
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
  const [font, setFont] = usePersistentState<SheetFont>('font', 'original', sanitizeFont);
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
  const savedListId = useId();

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
    // マウスで選んだら、すぐ宛名を打てるようにする
    // （矢印キーで選び直している最中にフォーカスを奪うと困るので、キーボードのときはしない）
    if (byPointer && !recipient.org) {
      requestAnimationFrame(() => orgInputRef.current?.focus({preventScroll: true}));
    }
  };

  /** 居宅名の欄。保存した宛先の候補を選んだときは、ケアマネ名まで入れる */
  const changeOrg = (value: string) => {
    const picked = savedRecipients.find((r) => describeRecipient(r).line === value);
    setRecipient(picked ? {org: picked.org, person: picked.person} : (prev) => ({...prev, org: value}));
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
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <h1 className="text-lg font-bold tracking-tight">FAX送付状 かんたん作成</h1>
              <p className="text-xs text-slate-500">送るFAXにチェックを入れ、宛名とご利用者名を入れて印刷するだけ</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              {hasInput && (
                <button type="button" onClick={handleReset} className={secondaryButtonClass}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  新しいFAXを作る
                </button>
              )}
              <FontPicker value={font} onChange={setFont} />
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-[1440px] gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0 space-y-3">
            <StepCard step={1} title="送るFAXを選ぶ" sectionRef={kindSectionRef}>
              <KindPicker selected={kindId} onSelect={selectKind} customTemplates={customTemplates} />
              {showErrors && !kind && <ErrorText>送るFAXを選んでください。</ErrorText>}
            </StepCard>

            <StepCard step={2} title={`宛名・${(kind?.fill ?? RIYOUSHA).label}・枚数`}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-[13rem] flex-[1.6]">
                  <Labeled label={labels.org} required>
                    {(id) => (
                      <input
                        id={id}
                        ref={orgInputRef}
                        type="text"
                        list={savedRecipients.length > 0 ? savedListId : undefined}
                        value={recipient.org}
                        onChange={(e) => changeOrg(e.target.value)}
                        placeholder={
                          savedRecipients.length > 0 ? '入力すると保存した宛先が候補に出ます' : labels.orgPlaceholder
                        }
                        autoComplete="off"
                        aria-invalid={showErrors && recipientMissing}
                        className={`w-full ${showErrors && recipientMissing ? fieldErrorClass : fieldClass}`}
                      />
                    )}
                  </Labeled>
                  <datalist id={savedListId}>
                    {savedRecipients.map((r) => (
                      <option key={r.id} value={describeRecipient(r).line} />
                    ))}
                  </datalist>
                  {showErrors && recipientMissing && <ErrorText>{labels.org}を入力してください。</ErrorText>}
                </div>
                <div className="w-40">
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
                {inputFields.map((f) => {
                  const isFill = !!kind?.fill && f.key === kind.fill.key;
                  const error = isFill && showErrors && fillMissing;
                  return (
                    <div key={f.key} className={f.key === 'quantity' ? 'w-24' : 'min-w-[11rem] flex-1'}>
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
              </div>
            </StepCard>

            <StepCard step={3} title="文章（自動で入ります・編集可）">
              {kind && draft && template ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    {/* 従来の送信票には件名の欄がない（元の様式どおり）ので、表形式のときだけ出す */}
                    {layout === 'table' && (
                      <div className="min-w-[16rem] flex-1">
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
                      </div>
                    )}
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
                  <BodyEditor
                    value={draft.body}
                    onChange={(body) => updateDraft({body})}
                    actions={
                      <>
                        <button
                          type="button"
                          disabled={!edited}
                          onClick={() => updateDraft({subject: template.subject, body: template.body})}
                          className={secondaryButtonClass}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          元の文面に戻す
                        </button>
                        <button type="button" disabled={!edited} onClick={saveTemplate} className={secondaryButtonClass}>
                          <Save className="h-3.5 w-3.5" aria-hidden />
                          この文面を次回も使う
                        </button>
                      </>
                    }
                  />
                  {(kind.fill || usingCustom) && (
                    <p className="text-xs text-slate-500">
                      {kind.fill && `文章の「〇〇」の部分には、上で入力した${kind.fill.label}が自動で入ります。`}
                      {usingCustom && (
                        <>
                          保存した文面を使用中（
                          <button
                            type="button"
                            onClick={restoreBuiltinTemplate}
                            className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                          >
                            最初の文面に戻す
                          </button>
                          ）
                        </>
                      )}
                    </p>
                  )}
                  {notice && (
                    <p role="status" className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
                      {notice}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-500">
                  ① で送るFAXを選ぶと、ここに件名と文章が入ります。
                </p>
              )}
            </StepCard>
          </div>

          <aside className="lg:sticky lg:top-3" aria-label="印刷イメージ">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800">印刷イメージ</h2>
                <SegmentedControl<SheetLayout>
                  ariaLabel="印刷デザイン"
                  options={LAYOUT_OPTIONS}
                  value={layout}
                  onChange={(v) => setLayout(v)}
                />
              </div>
              <div className="fx-preview-size">
                {overflowing && (
                  <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    文章が長く、枠に収まっていません。文章を短くしてください。
                  </p>
                )}
                <ScaledPreview>
                  <FaxSheet data={sheetData} layout={layout} font={font} preview onOverflowChange={setOverflowing} />
                </ScaledPreview>
                <button
                  type="button"
                  onClick={handlePrint}
                  title="印刷画面でプリンター（PC-FAXならFAX用、PDFにするなら「PDFに保存」）を選びます。用紙はA4・縦、倍率は100%のままで。"
                  className={`${primaryButtonClass} mt-3 w-full`}
                >
                  <Printer className="h-5 w-5" aria-hidden />
                  印刷する
                </button>
              </div>
            </div>
          </aside>
        </main>

        <div className="mx-auto max-w-[1440px] space-y-3 px-4 pb-8">
          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Settings2 className="h-4 w-4 text-slate-500" aria-hidden />
                設定（差出人・保存した宛先）
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {[sender.company, sender.office].filter(Boolean).join(' ')}
                {sender.person && `／担当 ${sender.person}`}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section>
                <h3 className="mb-2 text-xs font-bold text-slate-700">差出人（自社）</h3>
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
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    最初の内容に戻す
                  </button>
                </div>
              </section>
              <SavedRecipientList
                saved={savedRecipients}
                onForget={(id) => setSavedRecipients((list) => list.filter((r) => r.id !== id))}
              />
            </div>
          </details>
          <p className="text-xs leading-relaxed text-slate-500">
            入力した内容はこのパソコン（ブラウザ）の中だけで使い、外部には送信しません。ご利用者名などの記入内容は保存されず、画面を閉じると消えます。
          </p>
        </div>
      </div>

      {/* 印刷するのはこの1枚だけ（画面の部品は印刷時に隠す） */}
      <div className="fx-print-root">
        <FaxSheet data={sheetData} layout={layout} font={font} />
      </div>
    </>
  );
}

// ---- 部品 ----

// 幅や枠線の色は呼び出し側で足す（同じ種類のクラスを重ねると、どちらが効くかが不定になるため）
const fieldCore =
  'rounded-md border bg-white px-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2';
const fieldBase = `h-8 ${fieldCore}`;
const fieldClass = `${fieldBase} border-slate-300 focus:border-blue-500 focus:ring-blue-500/30`;
const fieldErrorClass = `${fieldBase} border-red-500 ring-2 ring-red-500/20 focus:ring-red-500/30`;
const inputClass = `w-full ${fieldClass}`;

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-base font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

const secondaryButtonClass =
  'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white';

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
    <section ref={sectionRef} className="scroll-mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white"
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

/** 文章の入力欄。見出しの横に「元の文面に戻す」などのボタンを並べて、縦の場所を取らないようにする */
function BodyEditor({value, onChange, actions}: {value: string; onChange: (v: string) => void; actions: ReactNode}) {
  const id = useId();
  return (
    <div>
      <div className="mb-0.5 flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-600">
          文章
        </label>
        <div className="flex flex-wrap gap-1.5">{actions}</div>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`${fieldCore} block min-h-20 w-full border-slate-300 py-1.5 leading-relaxed field-sizing-content focus:border-blue-500 focus:ring-blue-500/30`}
      />
    </div>
  );
}

/** 画面右上の「印刷の書体」。各項目はその書体で表示する（入っていない書体は普通の文字で出る） */
function FontPicker({value, onChange}: {value: SheetFont; onChange: (v: SheetFont) => void}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="whitespace-nowrap text-xs font-medium text-slate-600">
        印刷の書体
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(sanitizeFont(e.target.value))}
        style={fontPreviewStyle(value)}
        className={`${fieldClass} min-w-[11rem] cursor-pointer pr-1`}
      >
        {SHEET_FONTS.map((f) => (
          <option key={f.id} value={f.id} style={fontPreviewStyle(f.id)}>
            {f.label}
          </option>
        ))}
      </select>
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
  // マウスで選んだのか、キーボードで選んだのかを覚えておく
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
      className="grid grid-cols-2 gap-1.5 md:grid-cols-4"
    >
      {FAX_KINDS.map((k) => {
        const checked = selected === k.id;
        return (
          <label
            key={k.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1 ${
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
            <span className="min-w-0 text-sm font-bold leading-snug text-slate-800">
              <LabelText text={k.label} />
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

/** 見出しを「・」「へ」の後ろでだけ折り返す（「見積依／頼」のような言葉の途中での改行を防ぐ） */
function LabelText({text}: {text: string}) {
  const phrases = text.match(/[^・へ]+[・へ]?/g) ?? [text];
  return phrases.map((phrase, i) => (
    <span key={i} className="inline-block">
      {phrase}
    </span>
  ));
}

/** 設定の中の、保存した宛先の一覧（消すときだけ使う。選ぶのは居宅名の候補から） */
function SavedRecipientList({saved, onForget}: {saved: SavedRecipient[]; onForget: (id: string) => void}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold text-slate-700">保存した宛先（{saved.length}件）</h3>
      {saved.length > 0 ? (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {saved.map((r) => {
            const line = describeRecipient(r).line;
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-slate-700">
                <span className="min-w-0 truncate">{line}</span>
                <button
                  type="button"
                  onClick={() => onForget(r.id)}
                  aria-label={`${line} を宛先帳から消す`}
                  title="宛先帳から消す"
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">まだありません。印刷した宛先（居宅名・ケアマネ名）が自動で保存されます。</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        居宅名の欄に文字を入れると、保存した宛先が候補に出ます。選ぶとケアマネ名まで入ります。
      </p>
    </section>
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
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40';
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
        className={`${fieldClass} w-11 text-center tabular-nums`}
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
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex shrink-0 rounded-md bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
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
  );
}
