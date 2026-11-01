// ブラウザのテスト用のにせの Firebase（常時同期。cloud/firestore.ts）：gstatic の firebase-app.js・firebase-auth.js・firebase-firestore.js を、
// テストの中だけのもの（下の APP・AUTH・FIRESTORE）に差しかえる。中身はこのテストの Node の中のメモリ（store）で、いくつもの端末（ブラウザのコンテキスト）が同じものを使う。
// 本物の Firebase にはつながない（受注残・進捗管理のテストの fake-firebase-*.js と同じ考え）。
// ページの中のにせの Firestore は、https://fake-firestore.invalid/rpc に fetch で頼み、テストが route で受ける。onSnapshot は 0.25 秒ごとに問い合わせる。

const APP = `
const apps = [];
export const getApps = () => apps;
export const initializeApp = (options, name = '[DEFAULT]') => { const a = {name, options}; apps.push(a); return a; };
`;

const AUTH = `
let user = null;
export const getAuth = () => ({ get currentUser() { return user; }, authStateReady: async () => {} });
export const signInAnonymously = async () => { user = {uid: 'anon-' + Math.random().toString(36).slice(2), isAnonymous: true}; return {user}; };
`;

const FIRESTORE = `
const RPC = 'https://fake-firestore.invalid/rpc';
async function call(body) {
  const r = await fetch(RPC, {method: 'POST', body: JSON.stringify(body)});
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error), {code: j.code});
  return j.result;
}
export class Bytes {
  constructor(u8) { this.u8 = u8; }
  static fromUint8Array(u) { return new Bytes(new Uint8Array(u)); }
  toUint8Array() { return this.u8; }
}
export class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  toMillis() { return this.ms; }
}
const SERVER_TS = {__serverTs: true};
export const serverTimestamp = () => SERVER_TS;
export const getFirestore = () => ({});
export const collection = (_db, ...segs) => ({type: 'col', path: segs.join('/')});
export const doc = (_db, ...segs) => ({type: 'doc', path: segs.join('/'), id: segs[segs.length - 1]});
export const where = (field, op, value) => ({field, op, value});
export const query = (col, ...conds) => ({...col, conds});
const b64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function enc(v) {
  if (v === SERVER_TS) return {__serverTs: 1};
  if (v instanceof Bytes) return {__b: b64(v.u8)};
  if (v instanceof Timestamp) return {__t: v.ms};
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]));
  return v;
}
function dec(v) {
  if (v && typeof v === 'object' && '__b' in v) return new Bytes(unb64(v.__b));
  if (v && typeof v === 'object' && '__t' in v) return new Timestamp(v.__t);
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]));
  return v;
}
const snapOf = (path, data) => ({id: path.split('/').pop(), exists: () => data != null, data: () => (data == null ? undefined : dec(data))});
export const getDoc = async (ref) => snapOf(ref.path, (await call({op: 'get', path: ref.path})).data);
export const setDoc = async (ref, data) => { await call({op: 'set', path: ref.path, data: enc(data)}); };
export const getCountFromServer = async (q) => { const n = await call({op: 'count', path: q.path, conds: enc(q.conds || [])}); return {data: () => ({count: n})}; };
export async function runTransaction(_db, fn) {
  for (let i = 0; i < 20; i++) {
    const reads = [];
    const writes = [];
    const tx = {
      get: async (ref) => { const r = await call({op: 'get', path: ref.path}); reads.push([ref.path, r.rev]); return snapOf(ref.path, r.data); },
      set: (ref, data) => { writes.push({path: ref.path, data: enc(data)}); },
    };
    const result = await fn(tx);
    if (await call({op: 'commit', reads, writes})) return result;
  }
  throw Object.assign(new Error('transaction aborted'), {code: 'aborted'});
}
export function onSnapshot(q, next, error) {
  let stopped = false;
  let after = -1;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await call({op: 'query', path: q.path, conds: enc(q.conds || []), after});
      if (after < 0 || r.docs.length) {
        const changes = r.docs.map((d) => ({type: d.created > after || after < 0 ? 'added' : 'modified', doc: snapOf(d.path, d.data)}));
        if (!stopped) next({docChanges: () => changes, size: changes.length});
      }
      after = Math.max(after, r.rev);
    } catch (e) {
      if (!stopped) error && error(e);
    }
    if (!stopped) setTimeout(tick, 250);
  };
  tick();
  return () => { stopped = true; };
}
`;

/** テストの中のクラウド（いくつもの端末で共有）。docs：'artifacts/…/jobs/id' → {rev, created, data（ブラウザから届いた形）} */
export function fakeCloud() {
  const docs = new Map();
  let rev = 0;
  let clock = Date.now();
  const stamp = (v) => {
    if (v && typeof v === 'object' && v.__serverTs) return {__t: (clock = Math.max(Date.now(), clock + 1))};
    if (Array.isArray(v)) return v.map(stamp);
    if (v && typeof v === 'object' && !('__b' in v) && !('__t' in v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stamp(x)]));
    return v;
  };
  const inColl = (path, coll) => path.startsWith(`${coll}/`) && !path.slice(coll.length + 1).includes('/');
  const val = (v) => (v && typeof v === 'object' && '__t' in v ? v.__t : v);
  const match = (data, conds) =>
    conds.every(({field, op, value}) => {
      const [a, b] = [val(data[field]), val(value)];
      return op === '>' ? a > b : op === '==' ? a === b : true;
    });
  const put = (path, data) => {
    const old = docs.get(path);
    rev++;
    docs.set(path, {rev, created: old ? old.created : rev, data: stamp(data)});
  };
  const state = {docs, offline: false, writes: 0};
  state.handle = (body) => {
    if (state.offline) return {error: 'network offline', code: 'unavailable'};
    switch (body.op) {
      case 'get': {
        const d = docs.get(body.path);
        return {result: {rev: d ? d.rev : 0, data: d ? d.data : null}};
      }
      case 'set':
        put(body.path, body.data);
        state.writes++;
        return {result: true};
      case 'count':
        return {result: [...docs].filter(([p, d]) => inColl(p, body.path) && match(d.data, body.conds)).length};
      case 'commit': {
        for (const [p, r] of body.reads) if ((docs.get(p)?.rev ?? 0) !== r) return {result: false};
        for (const w of body.writes) put(w.path, w.data);
        state.writes += body.writes.length;
        return {result: true};
      }
      case 'query': {
        const found = [...docs].filter(([p, d]) => inColl(p, body.path) && d.rev > body.after && match(d.data, body.conds)).map(([p, d]) => ({path: p, created: d.created, data: d.data}));
        return {result: {rev, docs: found}};
      }
    }
    return {error: `unknown op ${body.op}`};
  };
  return state;
}

/** コンテキストの gstatic の Firebase と RPC を、テストの中のクラウドへ */
export async function useFakeFirebase(ctx, cloud) {
  const js = {'firebase-app.js': APP, 'firebase-auth.js': AUTH, 'firebase-firestore.js': FIRESTORE};
  await ctx.route(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/, (route) => {
    const name = /(firebase-[a-z]+\.js)$/.exec(route.request().url())[1];
    return route.fulfill({status: 200, contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: js[name] ?? ''});
  });
  await ctx.route('https://fake-firestore.invalid/rpc', (route) => {
    const out = cloud.handle(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(out)});
  });
}
