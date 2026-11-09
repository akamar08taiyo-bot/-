// 介援隊カタログの全商品の読み取り（アプリと同じ catalog/text.json と、PDF の横の罫線）を一覧にする。読み取りを直す前と後で比べる・目で見る点検に使う。
// 使い方（リポジトリで npm run -s build:tokutei のあと）：
//   node <このフォルダ>/catalog-dump.ts <リポジトリ> <出力フォルダ>             → <出力>/products.json（金額も入る。リポジトリ・メモに入れない）
//   node <このフォルダ>/catalog-dump.ts <リポジトリ> <出力フォルダ> --snapshot  → 上と、test/tokutei/fixtures/catalog-snapshot.json（金額なし。ページごとの金額の並びは sha256 のしるしだけ）
// --snapshot は、読み取りの直しを目で確かめ終わってから使う（catalogItems.test.ts の「全商品の読み取りが前と同じ」が見るもの）
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repo, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!repo || !out) throw new Error('使い方：catalog-dump.ts <リポジトリ> <出力フォルダ> [--snapshot]');
mkdirSync(out, {recursive: true});
const load = (p: string) => import(pathToFileURL(path.join(repo, p)).href);
const {CATALOG} = await load('src/tokutei/catalog.ts');
const {parseCatalogPage} = await load('src/tokutei/catalogItems.ts');
const rulesJson = JSON.parse(readFileSync(path.join(repo, 'dist-tokutei/catalog/rules.json'), 'utf8')) as Record<string, [number, number, number][]>;
const text = JSON.parse(readFileSync(path.join(repo, 'dist-tokutei/catalog/text.json'), 'utf8')) as Record<string, [string, number, number, number, number][]>;
type V = {code: string; label: string; tais: string; orderCode: string; listPrice: number};
type P = {page: number; name: string; maker: string; category: string; sub: string; taxFree: boolean; variants: V[]};
const list: P[] = [];
for (const c of CATALOG) {
  const raw = text[c.file].map(([s, x, y, w, h]) => ({s, x, y, w, h}));
  const rules = (rulesJson[c.file] ?? []).map(([x, y, w]) => ({x, y, w}));
  list.push(...parseCatalogPage(raw, c, rules));
}
writeFileSync(path.join(out, 'products.json'), JSON.stringify(list, null, 1));
console.log('ページ', CATALOG.length, '商品', list.length, '品番', list.reduce((a, p) => a + p.variants.length, 0));
if (process.argv.includes('--snapshot')) {
  const pages: Record<string, {products: unknown[]; prices: string}> = {};
  for (const p of list) {
    const e = (pages[p.page] ??= {products: [], prices: ''});
    e.products.push({name: p.name, maker: p.maker, category: p.category, sub: p.sub, taxFree: p.taxFree, variants: p.variants.map((v) => [v.code, v.label, v.tais, v.orderCode])});
  }
  for (const pg of Object.keys(pages)) {
    const prices = list.filter((p) => String(p.page) === pg).flatMap((p) => p.variants.map((v) => v.listPrice));
    pages[pg].prices = createHash('sha256').update(prices.join(',')).digest('hex').slice(0, 16);
  }
  const file = path.join(repo, 'test/tokutei/fixtures/catalog-snapshot.json');
  writeFileSync(file, JSON.stringify(pages, null, 0).replace(/\],"/g, '],\n"') + '\n');
  console.log('書いた', file);
}
