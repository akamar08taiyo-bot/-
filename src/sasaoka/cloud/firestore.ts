// 常時同期のクラウド：受注残・進捗管理（solar-silver-progress-app）と同じ Firebase の Firestore（ユーザーの指示「受注残管理アプリみたいに、常時同期させる」2026-11-01）。
// 部品（Firebase の JavaScript）は受注残・進捗管理と同じ版を、同期を始めたときだけ gstatic から読む（アプリの大きさを増やさない。テストでは手元のにせものに差しかえる）。
// ログインは受注残・進捗管理と同じく匿名。置き場所は artifacts/<合言葉から作った名前>/public/data/ の下（受注残・進捗管理と同じ形）で、中身はみな暗号（cloud/crypto.ts）。
//   jobs/<様邸の id>・sales/<特定福祉用具の案件の id>・keys/<まとまり>：{ver, at（クラウドの時計）, del, v（暗号）}
//   photos/<写真の番号>：{w, h, type, parts, at}（写真の大きさだけ）、photoParts/<写真の番号>~<0,1,…>：{v（暗号の一部。1件の上限 1MiB に入るよう 700KB ずつ）}

import type {Coll, PhotoMeta, Remote, RemoteDoc, RemotePut} from './engine.ts';

export const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

/** 受注残・進捗管理と同じ Firebase（公開しているアプリの設定。鍵ではない） */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCpONyN6JE1_Xa08vjb2YJ_vwYQhKFQTng',
  authDomain: 'jyutyu-fc9f9.firebaseapp.com',
  projectId: 'jyutyu-fc9f9',
  storageBucket: 'jyutyu-fc9f9.firebasestorage.app',
  messagingSenderId: '1021858690729',
  appId: '1:1021858690729:web:eb0e263f8f27fe7aaf5bb8',
};
/** このアプリの Firebase の名前（同じページのほかの Firebase とまぎれないように） */
const APP_NAME = 'taiyo-jutaku-cloud';
const PART = 700_000;

/* eslint-disable @typescript-eslint/no-explicit-any -- gstatic から読む部品には型がない */
type Any = any;

let libs: Promise<{app: Any; auth: Any; fs: Any}> | null = null;
function loadLibs() {
  libs ??= Promise.all([import(/* @vite-ignore */ `${CDN}/firebase-app.js`), import(/* @vite-ignore */ `${CDN}/firebase-auth.js`), import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`)])
    .then(([app, auth, fs]) => ({app, auth, fs}))
    .catch((e) => {
      libs = null;
      throw e;
    });
  return libs;
}

const millis = (v: Any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);

/** Firestore につなぐ（匿名でログイン）。space は合言葉から作った置き場所の名前 */
export async function connectFirestore(space: string): Promise<Remote> {
  const {app: A, auth: Au, fs: F} = await loadLibs();
  const app = A.getApps().find((x: Any) => x.name === APP_NAME) ?? A.initializeApp(FIREBASE_CONFIG, APP_NAME);
  const auth = Au.getAuth(app);
  // 前に匿名でログインしていれば、そのまま使う（開くたびに新しい匿名の人を作らない）
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  if (!auth.currentUser) await Au.signInAnonymously(auth);
  const db = F.getFirestore(app);
  const base = ['artifacts', space, 'public', 'data'];
  const col = (c: string) => F.collection(db, ...base, c);
  const ref = (c: string, id: string) => F.doc(db, ...base, c, id);
  const toDoc = (snap: Any): RemoteDoc => {
    const d = snap.data({serverTimestamps: 'estimate'}) ?? {};
    return {id: snap.id, ver: String(d.ver ?? ''), at: millis(d.at), ...(d.del ? {del: true} : {}), ...(d.v ? {v: d.v.toUint8Array()} : {})};
  };

  return {
    listen(coll: Coll, since: number, on: (docs: RemoteDoc[]) => void, onError: (e: unknown) => void) {
      const q = F.query(col(coll), F.where('at', '>', F.Timestamp.fromMillis(Math.max(0, since))));
      return F.onSnapshot(
        q,
        (snap: Any) =>
          on(
            snap
              .docChanges()
              .filter((c: Any) => c.type !== 'removed')
              .map((c: Any) => toDoc(c.doc)),
          ),
        onError,
      );
    },
    async write(coll: Coll, id: string, build: (cur: RemoteDoc | null) => Promise<RemotePut | null>) {
      const r = ref(coll, id);
      return F.runTransaction(db, async (tx: Any) => {
        const snap = await tx.get(r);
        const cur = snap.exists() ? toDoc(snap) : null;
        const put = await build(cur);
        if (!put) return cur;
        tx.set(r, {ver: put.ver, at: F.serverTimestamp(), del: !!put.del, ...(put.v ? {v: F.Bytes.fromUint8Array(put.v)} : {})});
        return {id, ver: put.ver, at: Date.now(), ...(put.del ? {del: true} : {})} satisfies RemoteDoc;
      });
    },
    async count(coll: Coll) {
      const snap = await F.getCountFromServer(F.query(col(coll), F.where('del', '==', false)));
      return Number(snap.data().count) || 0;
    },
    async hasPhoto(id: string) {
      return (await F.getDoc(ref('photos', id))).exists();
    },
    async putPhoto(id: string, meta: PhotoMeta, data: Uint8Array) {
      const parts = Math.max(1, Math.ceil(data.length / PART));
      // 中身を先に、大きさの記録をあとに（記録があれば中身はそろっている）
      for (let i = 0; i < parts; i++) await F.setDoc(ref('photoParts', `${id}~${i}`), {v: F.Bytes.fromUint8Array(data.slice(i * PART, (i + 1) * PART))});
      await F.setDoc(ref('photos', id), {w: meta.w, h: meta.h, type: meta.type, parts, size: data.length, at: F.serverTimestamp()});
    },
    async getPhoto(id: string) {
      const m = await F.getDoc(ref('photos', id));
      if (!m.exists()) return null;
      const d = m.data();
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < (Number(d.parts) || 1); i++) {
        const p = await F.getDoc(ref('photoParts', `${id}~${i}`));
        if (!p.exists()) return null;
        chunks.push(p.data().v.toUint8Array());
      }
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      return {meta: {w: Number(d.w) || 0, h: Number(d.h) || 0, type: String(d.type || 'image/jpeg')}, data: out};
    },
  };
}
