// catalog-dump.ts の前と後の products.json のちがい（品番ごと）。金額は「変わった」とだけ出す（金額そのものは出さない）
// 使い方：node catalog-diff.mjs <前の products.json> <後の products.json>
import {readFileSync} from 'node:fs';
const [a, b] = process.argv.slice(2, 4).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const flat = (list) => new Map(list.flatMap((p) => p.variants.map((v, i) => [`${p.page}:${v.orderCode}:${v.code}:${i}`, {p, v}])));
const A = flat(a);
const B = flat(b);
let n = 0;
for (const [k, x] of A) {
  const y = B.get(k);
  if (!y) {
    console.log('消えた', k, x.p.name, x.v.label);
    n++;
    continue;
  }
  const d = [];
  for (const f of ['name', 'maker', 'category', 'sub', 'taxFree']) if (x.p[f] !== y.p[f]) d.push(`${f} ${x.p[f]}→${y.p[f]}`);
  if (x.v.label !== y.v.label) d.push(`種類「${x.v.label}」→「${y.v.label}」`);
  if (x.v.tais !== y.v.tais) d.push(`TAIS ${x.v.tais}→${y.v.tais}`);
  if (x.v.listPrice !== y.v.listPrice) d.push('金額が変わった');
  if (d.length) {
    console.log(`p.${x.p.page} ${x.v.code}: ${d.join(' / ')}`);
    n++;
  }
}
for (const [k, y] of B) if (!A.has(k)) (console.log('増えた', k, y.p.name, y.v.label), n++);
console.log('ちがい', n);
