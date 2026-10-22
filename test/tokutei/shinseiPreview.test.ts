// 申請書のプレビュー（shinseiPreview.ts）：原本に書き込んだシートを画面に描く材料・押すと入れる所へ行く欄・まだ入っていない所。
// 値はすべて架空（見本）
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {unzipSync} from 'fflate';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {SHINSEI, shinseiValues} from '../../src/tokutei/shinsei.ts';
import type {ShinseiKey} from '../../src/tokutei/shinsei.ts';
import {missingFields, SHINSEI_LINKS, shinseiPreview} from '../../src/tokutei/shinseiPreview.ts';
import type {Sale, SaleItem} from '../../src/tokutei/types.ts';
import type {Files} from '../../src/tokutei/xlsxEdit.ts';

// 見本の案件（架空の方。本当のお客様の情報は使わない）
const S = {...defaultSettings(), company: '太陽シルバーサービス株式会社'};

function item(over: Partial<SaleItem>): SaleItem {
  return {
    id: 'i',
    productId: null,
    name: '',
    maker: '',
    code: '',
    tais: '',
    category: '',
    sub: '',
    unit: '台',
    supplier: '',
    taxType: '10%',
    listPrice: 0,
    cost: 0,
    qty: 1,
    discountRate: 20,
    unitPrice: null,
    reason: '',
    ...over,
  };
}

function sale(over: Partial<Sale> = {}): Sale {
  return {
    id: 's',
    customer: '見本 花子',
    kana: 'ミホン ハナコ',
    insuredNo: '1234567',
    birthDate: '1940-03-15',
    gender: '女',
    zip: '8240005',
    address: '行橋市中央1丁目2-3',
    tel: '0930-00-0000',
    careLevel: '要介護2',
    insurer: 'yukuhashi',
    insurerName: '',
    burdenRatio: 1,
    payMethod: '受領委任払い',
    remaining: null,
    perItem: false,
    welfare: false,
    staff: '土居 翔太',
    careOffice: '見本居宅介護支援事業所',
    careManager: '見本 太郎',
    carePlan: '',
    quoteNo: '20261022-1',
    estimateDate: '2026-10-22',
    applyDate: '2026-10-22',
    approveDate: '',
    deliveryDate: '2026-10-30',
    claimDate: '2026-11-02',
    collectDate: '',
    status: '申請',
    note: '',
    items: [
      item({id: 'a', name: 'シャワーチェア 見本A', maker: '見本工業', code: 'SC-01', tais: '00001-000001', category: '入浴補助用具', sub: '入浴用いす', listPrice: 32000, reason: '浴室の床からの立ち座りが困難なため。'}),
      item({id: 'b', name: '浴槽手すり 見本B', maker: '見本製作所', category: '入浴補助用具', sub: '浴槽用手すり', listPrice: 15800, qty: 2, unit: '個', reason: '浴槽の出入りでふらつくため。'}),
    ],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const TEMPLATE_FILES: Record<ShinseiKey, string> = {yukuhashi: 'yukuhashi.xltx', kanda: 'kanda.xltx', miyako: 'miyako.xlsx'};
const template = (key: ShinseiKey): Files => unzipSync(new Uint8Array(readFileSync(new URL(`../../src/tokutei/shinsei/${TEMPLATE_FILES[key]}`, import.meta.url))));
const KEYS: ShinseiKey[] = ['yukuhashi', 'kanda', 'miyako'];
const textOf = (p: ReturnType<typeof shinseiPreview>[number]) => p.texts.map((t) => t.runs.map((r) => r.text).join('')).join('\n');

test('プレビュー：書き込むシートごとに1枚（行橋市・苅田町・みやこ町）。書いた値が出る', () => {
  const sheets: Record<ShinseiKey, string[]> = {
    yukuhashi: ['用具・受領委任払', '委任状', '完了写真'],
    kanda: ['用具・受領委任払', '用具・支給申請　受領委任払 (2)', '委任状', '完了写真'],
    miyako: ['福祉用具購入受領委任払申請書', '福祉用具支給申請(受領委任）', '納品確認写真用紙', '納品確認写真用紙 (2)'],
  };
  for (const key of KEYS) {
    const pages = shinseiPreview(template(key), SHINSEI[key], shinseiValues(sale({insurer: key}), S));
    assert.deepEqual(
      pages.map((p) => p.sheet),
      sheets[key],
      key,
    );
    for (const p of pages) assert.ok(p.width > 400 && p.height > 600 && p.texts.length > 5 && p.lines.length > 5, `${key} ${p.sheet}`);
    const first = textOf(pages[0]);
    assert.ok(first.includes('見本 花子') && first.includes('ミホン ハナコ'), key);
    assert.ok(first.includes('シャワーチェア 見本A'), key);
  }
  // 丸で囲む欄（性別・元号）は、丸と同じ位置に1文字ずつ。丸の図形もある
  const yk = shinseiPreview(template('yukuhashi'), SHINSEI.yukuhashi, shinseiValues(sale(), S))[0];
  assert.ok(yk.texts.some((t) => t.marked && t.marked.chars.some((c) => c.ch === '女')));
  assert.ok(yk.shapes.filter((s) => s.kind === 'ellipse').length >= 3);
  // 原本はそのまま（プレビューを作っても書き込まれない）
  const t = template('yukuhashi');
  const before = Object.keys(t).length;
  shinseiPreview(t, SHINSEI.yukuhashi, shinseiValues(sale(), S));
  assert.equal(Object.keys(t).length, before);
});

test('プレビュー：書き込む欄はどれも、押すと入れる所へ行く（SHINSEI_LINKS にもれがない）', () => {
  for (const key of KEYS) {
    const v = shinseiValues(sale({insurer: key, carePlan: '有'}), S);
    const linked = new Set(SHINSEI_LINKS[key].flatMap((s) => s.links.flatMap(([, refs]) => refs.map((r) => `${s.sheet}!${r}`))));
    const missed: string[] = [];
    for (const w of SHINSEI[key].sheets(v)) {
      for (const [ref, val] of w.cells ?? []) if (val !== '' && !linked.has(`${w.sheet}!${ref}`)) missed.push(`${w.sheet}!${ref}`);
      for (const m of w.marks ?? []) if (!linked.has(`${w.sheet}!${m.cell}`)) missed.push(`${w.sheet}!${m.cell}`);
      if (w.block && !linked.has(`${w.sheet}!${w.block.cell}`)) missed.push(`${w.sheet}!${w.block.cell}`);
    }
    assert.deepEqual(missed, [], key);
  }
});

test('プレビュー：式で事前申請書の値を出している欄（苅田町の支給申請書の氏名・番号など）も押せる', () => {
  const pages = shinseiPreview(template('kanda'), SHINSEI.kanda, shinseiValues(sale({insurer: 'kanda'}), S));
  const claim = pages.find((p) => p.sheet === '用具・支給申請　受領委任払 (2)')!;
  const fields = new Set(claim.fields.map((f) => f.field));
  for (const f of ['customer', 'kana', 'insuredNo', 'address', 'items', 'claimDate'] as const) assert.ok(fields.has(f), f);
  // 式の値も出る（事前申請書の氏名）
  assert.ok(textOf(claim).includes('見本 花子'));
  // 欄の位置はページの中
  for (const f of claim.fields) assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= claim.width + 1 && f.y + f.h <= claim.height + 1, f.ref);
});

test('まだ入っていない所（プレビューの欄を薄い黄色に）：みやこ町は居宅サービス計画の届出・担当も', () => {
  const blank = sale({customer: '', kana: '', insuredNo: '', birthDate: '', gender: '', zip: '', address: '', tel: '', careLevel: '', careOffice: '', careManager: '', applyDate: '', deliveryDate: '', staff: '', items: []});
  const all = ['customer', 'kana', 'insuredNo', 'birthDate', 'gender', 'zip', 'address', 'tel', 'careLevel', 'items', 'reason', 'recorder', 'applyDate', 'deliveryDate'];
  assert.deepEqual([...missingFields(shinseiValues(blank, S), 'yukuhashi')].sort(), [...all].sort());
  assert.deepEqual([...missingFields(shinseiValues({...blank, insurer: 'miyako'}, S), 'miyako')].sort(), [...all, 'carePlan', 'staff'].sort());
  assert.deepEqual([...missingFields(shinseiValues(sale({carePlan: '有'}), S), 'miyako')], []);
  // 理由は商品のどれかに理由がなければ
  const noReason = sale({items: [item({id: 'a', name: '見本の杖', reason: ''})]});
  assert.deepEqual([...missingFields(shinseiValues(noReason, S), 'yukuhashi')], ['reason']);
});
