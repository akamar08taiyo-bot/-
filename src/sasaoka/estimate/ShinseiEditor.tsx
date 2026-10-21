// 申請書の画面：保険者の申請書と同じ順番（フリガナ・被保険者氏名・被保険者番号・生年月日…）で入れる（ユーザーの指示「実際の申請書の順番に沿って入力」
// 「入力しやすいように」「入力されたものが見えるように見える化」）。申請書の形（左に申請書の項目名、右に入れる欄）で並べ、丸で囲む項目は押すと丸がつく。
// まだ入っていない欄は色を付け、上に一覧で出す。Enter で次の欄へ移る。
// 見積書と同じ様邸（Job）：氏名・住所・被保険者番号・改修の箇所は見積書と同じ欄なので、申請書から先に作っても、見積書から先に作ってもつながる。
// 申請書だけ・見積書だけでもよい（見積書がないときは、改修の内容を箇所ごとに書き、改修費用を手で入れる）

import {Fragment} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';
import {isBlankRow, jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {circled, INSURER_IDS, INSURER_INFO, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI, photoNumbers} from '../estimateForms.ts';
import {manualRow, newPlace} from '../rows.ts';
import {autoWorkText, insuredBoxes, shinseiCost, shinseiKinds, shinseiWorks} from '../shinsei.ts';
import type {AppData, Insurer, Job, Place, Settings, ShinseiInfo} from '../types.ts';
import type {Update} from '../useStore.ts';
import {yen} from '../util.ts';
import {canMakeShinsei, saveShinsei} from './shinseiFiles.ts';

type Field = 'kana' | 'name' | 'insuredNo' | 'birth' | 'gender' | 'zip' | 'address' | 'phone' | 'care' | 'owner' | 'reason' | 'works' | 'cost' | 'renovated' | 'dates';

/** 欄の順番：保険者ごとの申請書の上からの順番（原本を見て決めた。みやこ町・広域連合は承認の申請書の順番で、支給申請書だけの着工日・完成日は最後） */
const FIELDS: Record<Insurer, Field[]> = {
  kanda: ['kana', 'insuredNo', 'name', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'works', 'dates', 'cost'],
  yukuhashi: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'works', 'dates', 'cost'],
  miyako: ['kana', 'insuredNo', 'name', 'birth', 'gender', 'zip', 'address', 'phone', 'owner', 'reason', 'works', 'cost', 'renovated', 'dates'],
  kouiki: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'address', 'phone', 'owner', 'reason', 'works', 'cost', 'renovated', 'dates'],
};

/** みやこ町・広域連合：改修の内容は内訳明細書（別紙）、着工日・完成日は支給申請書（工事のあと）に書く */
const twoForms = (i: Insurer) => i === 'miyako' || i === 'kouiki';

/** 欄の名前（申請書の言葉） */
function label(f: Field, i: Insurer): string {
  if (f === 'cost') return twoForms(i) ? '改修費用（介護保険対象分）' : '改修予定費用';
  if (f === 'dates') return twoForms(i) ? '着工日・完成日' : i === 'kanda' ? '着工予定日・完了予定日' : '着工予定日・完成予定日';
  return {
    kana: 'フリガナ',
    name: '被保険者氏名',
    insuredNo: '被保険者番号',
    birth: '生年月日',
    gender: '性別',
    zip: '郵便番号',
    address: '住所',
    phone: '電話番号',
    care: '要介護状態区分',
    owner: '住宅の所有者',
    reason: '住宅改修が必要な理由書作成者',
    works: '改修の内容・箇所及び規模',
    renovated: '現在までの改修状況',
  }[f];
}

/** 申請書の名前（画面の上に出す） */
const FORM_TITLE: Record<Insurer, string> = {
  kanda: '住宅改修費支給事前申請書（受領委任払用）',
  yukuhashi: '住宅改修費受領委任払申請書',
  miyako: '住宅改修承認届出書・住宅改修費支給申請書（受領委任払用）',
  kouiki: '住宅改修承認申請書（様式第2号）・住宅改修費支給申請書（様式第7号）',
};

export function ShinseiEditor({
  job,
  data,
  update,
  onBack,
  onOpenEstimate,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  onOpenEstimate: () => void; // この様邸の見積書を開く（まだなければ作る）
}) {
  const toast = useToast();
  const s = data.settings;
  const insurer = jobInsurer(job);
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setInsurer = (i: Insurer) => setJob((j) => ({...j, insurer: i, form: INSURER_INFO[i].form}));
  // 見積書を作ってあるか（見積もり作成日がある、または見積書に行がある）
  const hasEstimate = !!job.estDate || job.places.some((p) => p.rows.some((r) => !isBlankRow(r)));
  const cost = shinseiCost(job, s);
  const lines = shinseiWorks(job, s);

  // まだ入っていない欄（色を付けて、上に一覧で出す）。みやこ町・広域連合の着工日・完成日は工事のあとに入れるので数えない
  const missing: Record<Field, boolean> = {
    kana: !info.kana.trim(),
    name: !job.customer.trim(),
    insuredNo: insuredBoxes(job.insuredNo).join('').length !== 10,
    birth: !info.era || !info.birthY.trim() || !info.birthM.trim() || !info.birthD.trim(),
    gender: !info.gender,
    zip: !info.zip.trim(),
    address: !job.address.trim(),
    phone: !info.phone.trim(),
    care: !info.care,
    owner: !info.owner.trim() || !info.relation.trim(),
    reason: !info.reasonOffice.trim() || !info.reasonName.trim(),
    works: lines.length === 0,
    cost: cost === null,
    renovated: !info.renovated,
    dates: !!insurer && !twoForms(insurer) && (!info.start || !info.end),
  };
  const fields = insurer ? FIELDS[insurer] : [];
  const todo = fields.filter((f) => missing[f]);

  const save = () => {
    if (!insurer) return;
    void saveShinsei(job, insurer, s).then(
      (fileName) => toast(`「${fileName}」を保存しました`),
      () => toast('申請書を作れませんでした', 'error'),
    );
  };
  // Enter で次の欄へ（日本語の変換中は動かさない）
  const nextOnEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (!el.matches('input')) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-nav], select[data-nav]')];
    const next = all[all.indexOf(el) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const row = (f: Field, i: Insurer): ReactNode => {
    switch (f) {
      case 'kana':
        return <TextInput value={info.kana} onChange={(kana) => setInfo({kana})} placeholder="ヤマダ　タロウ" className="w-full max-w-md" aria-label="フリガナ" data-nav autoFocus={!job.customer && !info.kana} />;
      case 'name':
        return <TextInput value={job.customer} onChange={(customer) => setJob((j) => ({...j, customer}))} placeholder="山田　太郎" className="w-full max-w-md text-base font-bold" aria-label="被保険者氏名" data-nav />;
      case 'insuredNo':
        return (
          <>
            <TextInput value={job.insuredNo} onChange={(insuredNo) => setJob((j) => ({...j, insuredNo}))} inputMode="numeric" placeholder="10けた" className="w-36 font-mono" aria-label="被保険者番号" data-nav />
            {/* 申請書の10マスと同じ形で見せる（右に寄せる） */}
            <span className="flex" aria-hidden="true">
              {insuredBoxes(job.insuredNo).map((d, k) => (
                <span key={k} className="grid h-8 w-5 place-items-center border border-l-0 border-slate-400 font-mono text-base first:border-l sm:w-6">
                  {d}
                </span>
              ))}
            </span>
          </>
        );
      case 'birth':
        return (
          <>
            <Circles label="元号" options={MARK_INFO.era.options} value={info.era} onPick={(era) => setInfo({era: era as ShinseiInfo['era']})} />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <TextInput value={info.birthY} onChange={(birthY) => setInfo({birthY})} inputMode="numeric" className="w-14 text-right" aria-label="生年月日の年" data-nav />年
              <TextInput value={info.birthM} onChange={(birthM) => setInfo({birthM})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の月" data-nav />月
              <TextInput value={info.birthD} onChange={(birthD) => setInfo({birthD})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の日" data-nav />日生
            </span>
          </>
        );
      case 'gender':
        return <Circles label="性別" options={MARK_INFO.gender.options} value={info.gender} onPick={(gender) => setInfo({gender: gender as ShinseiInfo['gender']})} />;
      case 'zip':
        return (
          <span className="inline-flex items-center gap-1">
            〒<TextInput value={info.zip} onChange={(zip) => setInfo({zip})} inputMode="numeric" placeholder="824-0000" className="w-32" aria-label="郵便番号" data-nav />
          </span>
        );
      case 'address':
        return <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} placeholder="福岡県…" className="w-full" aria-label="住所" data-nav />;
      case 'phone':
        return (
          <>
            <TextInput type="tel" value={info.phone} onChange={(phone) => setInfo({phone})} placeholder="0930-00-0000" className="w-48" aria-label="電話番号" data-nav />
            {i === 'kouiki' && <Note>支給申請書（様式第7号）に書きます</Note>}
          </>
        );
      case 'care':
        return <Circles label="要介護状態区分" options={MARK_INFO.care.options} value={info.care} onPick={(care) => setInfo({care: care as ShinseiInfo['care']})} />;
      case 'owner':
        return (
          <>
            <TextInput value={info.owner} onChange={(owner) => setInfo({owner})} className="w-48" aria-label="住宅の所有者" data-nav />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              本人との関係（
              <TextInput value={info.relation} onChange={(relation) => setInfo({relation})} className="w-24" aria-label="本人との関係" data-nav />）
            </span>
            <Btn small color="white" onClick={() => setInfo({owner: job.customer.trim(), relation: '本人'})}>
              本人の家
            </Btn>
          </>
        );
      case 'reason':
        return (
          <>
            <span className="inline-flex items-center gap-1">
              事業所名
              <TextInput value={info.reasonOffice} onChange={(reasonOffice) => setInfo({reasonOffice})} className="w-56" aria-label="理由書作成者の事業所名" data-nav />
            </span>
            <span className="inline-flex items-center gap-1">
              氏名
              <TextInput value={info.reasonName} onChange={(reasonName) => setInfo({reasonName})} className="w-40" aria-label="理由書作成者の氏名" data-nav />
            </span>
          </>
        );
      case 'works':
        return <WorksEditor job={job} setJob={setJob} s={s} insurer={i} lines={lines} />;
      case 'cost':
        return (
          <>
            <TextInput
              value={info.cost !== null ? String(info.cost) : cost !== null ? yen(cost) : ''}
              onChange={(t) => {
                const n = Number(t.normalize('NFKC').replace(/[,，\s¥円]/g, ''));
                setInfo({cost: t.trim() === '' || !Number.isFinite(n) ? null : n});
              }}
              inputMode="numeric"
              className="w-36 text-right tabular-nums"
              aria-label={label('cost', i)}
              data-nav
            />
            円
            <Note>{info.cost !== null ? '手で入れた金額' : cost !== null ? '見積書の介護保険対象分の合計（税込）' : '見積書がないときは手で入れます'}</Note>
            {info.cost !== null && (
              <Btn small color="white" onClick={() => setInfo({cost: null})}>
                見積書の金額にもどす
              </Btn>
            )}
          </>
        );
      case 'renovated':
        return <Circles label="現在までの改修状況" options={MARK_INFO.renovated.options} value={info.renovated} onPick={(renovated) => setInfo({renovated: renovated as ShinseiInfo['renovated']})} />;
      case 'dates':
        return (
          <>
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {twoForms(i) ? '着工日' : '着工予定日'}
              <input type="date" value={info.start} onChange={(e) => setInfo({start: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={twoForms(i) ? '着工日' : '着工予定日'} data-nav />
            </label>
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {twoForms(i) ? '完成日' : i === 'kanda' ? '完了予定日' : '完成予定日'}
              <input type="date" value={info.end} onChange={(e) => setInfo({end: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={twoForms(i) ? '完成日' : '完了予定日'} data-nav />
            </label>
            {twoForms(i) && <Note>支給申請書に書きます（工事のあと）</Note>}
          </>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? `${jobName(job)}の申請書` : '新しい申請書'}</h1>
        {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {canMakeShinsei(insurer) && (
            <Btn color="softGreen" onClick={save}>
              📗 申請書をExcelで保存
            </Btn>
          )}
          <Btn color="white" onClick={onOpenEstimate}>
            {hasEstimate ? '→ 見積書へ' : '→ 見積書を作る'}
          </Btn>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="grid min-w-[10rem] gap-1 text-xs font-bold text-slate-600">
          保険者
          <select
            value={insurer}
            onChange={(e) => e.target.value && setInsurer(e.target.value as Insurer)}
            className={`h-9 rounded-md border px-2 text-sm ${insurer ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
            aria-label="保険者"
          >
            {!insurer && <option value="">（選ぶ）</option>}
            {INSURER_IDS.map((x) => (
              <option key={x} value={x}>
                {INSURER_INFO[x].name}
              </option>
            ))}
          </select>
        </label>
        {insurer && (
          <div role="status" aria-label="入っていない欄" className="text-sm">
            {todo.length === 0 ? (
              <span className="font-bold text-emerald-800">✓ 申請書の欄はすべて入っています</span>
            ) : (
              <span className="text-slate-700">
                まだ入っていない欄：<b className="text-amber-800">{todo.map((f) => (f === 'reason' ? '理由書作成者' : f === 'works' ? '改修の内容' : label(f, insurer))).join('・')}</b>
              </span>
            )}
          </div>
        )}
      </section>

      {insurer ? (
        <div role="form" aria-label="申請書" onKeyDown={nextOnEnter} className="mx-auto max-w-5xl overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm">
          <div className="border-b-2 border-slate-700 px-4 py-2.5 text-center text-base font-bold text-slate-800">
            {INSURER_INFO[insurer].name}　{FORM_TITLE[insurer]}
          </div>
          {/* 左に申請書の項目名、右に入れる欄（スマホは項目名を上に） */}
          {fields.map((f) => (
            <div key={f} className="border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[11rem_1fr]">
              <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label(f, insurer)}</div>
              <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${missing[f] ? 'bg-amber-50' : ''}`}>{row(f, insurer)}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">保険者を選ぶと、その申請書の欄が出ます。</p>
      )}
    </div>
  );
}

function Note({children}: {children: ReactNode}) {
  return <span className="text-xs text-slate-500">{children}</span>;
}

/** 丸で囲む項目（申請書と同じ「男　・　女」の形。押すと丸がつき、もう一度押すと外れる） */
function Circles({label, options, value, onPick}: {label: string; options: readonly string[]; value: string; onPick: (v: string) => void}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((o, k) => (
        <Fragment key={o}>
          {k > 0 && <span className="text-slate-400">・</span>}
          <button
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(value === o ? '' : o)}
            className={`min-w-[2.75rem] rounded-full px-3 py-1 text-sm font-bold transition ${
              value === o ? 'border-2 border-slate-800 bg-amber-50 text-slate-900' : 'border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * 改修の内容：箇所ごとに 写真番号・改修場所・改修の種類・申請書に書く文。見積書の箇所と同じもの（ここで足した箇所は見積書にも出る）。
 * 申請書に書く文は、見積書の部材から作った文（薄い字）。手で書いたらそちら（高さ H= を足すなど）。下に、申請書に書く行をそのまま出す
 */
function WorksEditor({job, setJob, s, insurer, lines}: {job: Job; setJob: (fn: (j: Job) => Job) => void; s: Settings; insurer: Insurer; lines: string[]}) {
  const photos = photoNumbers(job, s);
  const setPlace = (id: string, fn: (p: Place) => Place) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === id ? fn(p) : p))}));
  // 見積書に箇所が出るように、空白の行を1つ入れておく（見積書で部材・施工費を入れていける）
  const add = (name: string) => setJob((j) => ({...j, places: [...j.places, newPlace(name, [manualRow('material')])]}));
  const remove = (id: string) => setJob((j) => ({...j, places: j.places.filter((p) => p.id !== id)}));
  return (
    <div className="w-full space-y-2">
      {job.places.length > 0 && (
        <div className="text-sm" role="list" aria-label="改修の箇所">
          <div className="hidden gap-2 pb-1 text-xs text-slate-500 sm:flex">
            <span className="w-7 text-center">写真</span>
            <span className="w-28">改修場所</span>
            <span className="w-40">改修の種類</span>
            <span>申請書に書く文（薄い字は見積書から作った文。直すときは書く）</span>
          </div>
          {job.places.map((p) => {
            const n = photos.get(p.id);
            const used = p.rows.some((r) => !isBlankRow(r)); // 見積書に行のある箇所は、見積書で消す
            return (
              <div key={p.id} role="listitem" className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-1.5">
                <span className="w-7 text-center text-base">{n ? circled(n) : '—'}</span>
                <TextInput value={p.name} onChange={(name) => setPlace(p.id, (x) => ({...x, name}))} placeholder="改修場所" className="w-28" aria-label="改修場所" data-nav />
                <select value={p.kind} onChange={(e) => setPlace(p.id, (x) => ({...x, kind: Number(e.target.value)}))} className="h-9 w-40 rounded-md border border-slate-300 px-1 text-sm" aria-label="改修の種類" data-nav>
                  {KINDS.map((k, i) => (
                    <option key={k} value={i + 1}>
                      {circled(i + 1)} {k}
                    </option>
                  ))}
                </select>
                <TextInput value={p.shinseiText ?? ''} onChange={(t) => setPlace(p.id, (x) => ({...x, shinseiText: t}))} placeholder={autoWorkText(p)} className="min-w-[12rem] flex-1" aria-label="申請書に書く文" data-nav />
                {used ? (
                  <span className="w-7" />
                ) : (
                  <button type="button" onClick={() => remove(p.id)} className="w-7 rounded py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`${p.name || '箇所'}を消す`}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-slate-600">箇所を足す：</span>
        {s.placePresets.map((name) => (
          <Btn key={name} small color="white" onClick={() => add(name)}>
            ＋ {name}
          </Btn>
        ))}
        <Btn small color="white" onClick={() => add('')}>
          ＋ そのほか
        </Btn>
      </div>
      {/* 申請書に書く内容をそのまま見せる（みやこ町・広域連合は内訳明細書の改修の種類の行） */}
      {lines.length > 0 &&
        (twoForms(insurer) ? (
          <table className="w-full border border-slate-300 text-sm" aria-label="住宅改修内訳明細書に書く内容">
            <caption className="bg-slate-50 px-2 py-1 text-left text-xs font-bold text-slate-600">住宅改修内訳明細書（様式第2号別紙）に書く内容</caption>
            <tbody>
              {shinseiKinds(job, s).map((k, i) =>
                k.works.length === 0 ? null : (
                  <tr key={i} className="border-t border-slate-200 align-top">
                    <td className="w-36 border-r border-slate-200 px-2 py-1 font-bold">
                      {circled(i + 1)} {KINDS[i]}
                      <div className="text-xs font-normal text-slate-600">{k.places}</div>
                    </td>
                    <td className="whitespace-pre-line px-2 py-1">{k.works.join('\n')}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <div className="rounded border border-slate-300 text-sm" aria-label="申請書に書く内容">
            <div className="bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">申請書に書く内容</div>
            <div className="whitespace-pre-line px-2 py-1">{lines.join('\n')}</div>
          </div>
        ))}
    </div>
  );
}
