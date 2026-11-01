// 常時同期（ユーザーの指示「常時同期させる」「受注残管理アプリみたいに、常時同期させる」2026-11-01）の中身。
// 受注残・進捗管理と同じく Firestore に置き（cloud/firestore.ts）、ほかの端末が書いたらすぐ届く（onSnapshot）。この端末で保存したら少し待って送る。
// 送るものは、様邸（1件ずつ）・特定福祉用具の案件（1件ずつ）・部材リストなどのまとまり（keys）・写真（1枚ずつ。いちど送ったら変わらない）。
// どれも端末の中で暗号にしてから送る（cloud/crypto.ts）。
//
// まとめ方は、別のタブとのまとめ（sync.ts）と同じ3つくらべ：前にそろえた中身（base）・この端末の今・クラウドの今。
//   片方だけが変えた所はその方、両方が変えた様邸は項目ごとに（同じ項目を両方で変えていたら、あとから届いた方＝クラウドに先に入った方を残さずこちら）。
//   消した様邸は、もう片方がそのあいだに直していなければ消し、直していれば残す（消したことはクラウドに「消した印」で残す）。
// 書き込みは Firestore のトランザクションで、クラウドの版（ver）が前にそろえた版のときだけ書く（ちがえばその場でまとめ直してから書く）。2台が同時に書いても片方の変更が消えない。

import {mergeRecords, mergeValue} from '../sync.ts';
import {openJson, open, seal, sealJson} from './crypto.ts';

/** クラウドの置き場所：様邸・特定福祉用具の案件・まとまり（部材リスト・施工費・常用・設定、特定福祉用具の商品・設定） */
export type Coll = 'jobs' | 'sales' | 'keys';
export const COLLS: Coll[] = ['keys', 'jobs', 'sales'];

/** クラウドの1件。v は暗号（消した印のときはなし）、ver は書くたびに変わる版、at はクラウドの時計で書いた時刻（ミリ秒） */
export type RemoteDoc = {id: string; ver: string; at: number; del?: boolean; v?: Uint8Array};
export type RemotePut = {ver: string; del?: boolean; v?: Uint8Array};
export type PhotoMeta = {w: number; h: number; type: string};

/** クラウド（Firestore。テストでは手元のにせもの） */
export interface Remote {
  /** at が since より新しいものを、今あるぶん → 変わるたびに届ける */
  listen(coll: Coll, since: number, on: (docs: RemoteDoc[]) => void, onError: (e: unknown) => void): () => void;
  /** トランザクションで1件を書く：build に今の中身を渡し、返したものを書く（null なら書かない）。書いた（書かなかったら今の）中身を返す */
  write(coll: Coll, id: string, build: (cur: RemoteDoc | null) => Promise<RemotePut | null>): Promise<RemoteDoc | null>;
  /** 消した印をのぞいた件数（同期を始める前に見せる） */
  count(coll: Coll): Promise<number>;
  hasPhoto(id: string): Promise<boolean>;
  putPhoto(id: string, meta: PhotoMeta, data: Uint8Array): Promise<void>;
  getPhoto(id: string): Promise<{meta: PhotoMeta; data: Uint8Array} | null>;
}

/** 端末の中の保存場所の1つ（様邸の並び・特定福祉用具の案件の並び・まとまり）。値が undefined の id は消す */
export interface Source {
  coll: Coll;
  read(): Promise<Map<string, unknown>>;
  write(changes: Map<string, unknown>): Promise<void>;
}

export interface PhotoStore {
  ids(): Promise<Set<string>>;
  get(id: string): Promise<{blob: Blob; w: number; h: number} | null>;
  put(id: string, blob: Blob, w: number, h: number): Promise<void>;
}

/** 前にそろえた中身（クラウドの版と、そのときの中身） */
export type Base = {ver: string; value?: unknown; del?: boolean};

/** 同期のための覚え（この端末だけ）：前にそろえた中身・どこまで読んだか・送った写真 */
export interface StateStore {
  load(): Promise<{bases: Map<string, Base>; since: Partial<Record<Coll, number>>; uploaded: Set<string>}>;
  setBase(key: string, base: Base | undefined): Promise<void>;
  setSince(coll: Coll, at: number): Promise<void>;
  addUploaded(id: string): Promise<void>;
}

export type CloudState = 'starting' | 'syncing' | 'idle' | 'offline' | 'error';
export type CloudStatus = {state: CloudState; at: number | null; message: string};

const DELETED = Symbol('deleted');
type Theirs = unknown | typeof DELETED;

/** 中身が同じか（項目の順番はくらべない） */
export function same(a: unknown, b: unknown): boolean {
  return a === b || canon(a) === canon(b);
}
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x,
  );
}

const hasIds = (v: unknown): v is {id: string}[] => Array.isArray(v) && v.every((x) => !!x && typeof x === 'object' && typeof (x as {id?: unknown}).id === 'string');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const updatedAt = (v: unknown): number | null => (isObj(v) && typeof v.updatedAt === 'number' ? v.updatedAt : null);

/**
 * 前にそろえた中身がないとき（はじめて同期する端末に、クラウドと同じ様邸があった）：直した時刻のある様邸・案件は新しい方。
 * 並び（部材リストなど）は両方を合わせ（同じ id はクラウド）、設定は両方の項目を合わせる（同じ項目はクラウド）
 */
function mergeNoBase(local: unknown, theirs: unknown): unknown {
  if (same(local, theirs)) return theirs;
  const [lu, tu] = [updatedAt(local), updatedAt(theirs)];
  if (lu !== null && tu !== null) return lu > tu ? local : theirs;
  if (hasIds(local) && hasIds(theirs)) return mergeRecords([], theirs, local);
  if (isObj(local) && isObj(theirs)) return mergeValue({}, theirs, local);
  return theirs;
}

/**
 * 3つくらべ。base：前にそろえた中身（なければ undefined）、local：この端末の今（なければ消した）、theirs：クラウドの今（DELETED は消した印・undefined はまだない）。
 * 返すのはまとめた中身（undefined＝消す）
 */
export function merge3(base: Base | undefined, local: unknown, theirs: Theirs): unknown {
  const b = base && !base.del ? base.value : undefined;
  if (theirs === DELETED || theirs === undefined) {
    // クラウドで消した（まだない）：この端末で前にそろえたあと直していなければ消す。直していれば残す
    if (local === undefined) return undefined;
    if (theirs === DELETED && b !== undefined && same(local, b)) return undefined;
    return local;
  }
  if (local === undefined) {
    // この端末で消した：クラウドで直していなければ消す。直していれば残す（前にそろえた中身がない＝ほかの端末で作ったものは入れる）
    return b !== undefined && same(theirs, b) ? undefined : theirs;
  }
  if (b === undefined) return mergeNoBase(local, theirs);
  return mergeValue(b, local, theirs);
}

const newVer = () => {
  const r = crypto.getRandomValues(new Uint8Array(9));
  return Date.now().toString(36) + [...r].map((x) => x.toString(36).padStart(2, '0')).join('');
};

/** 写真の番号（photos.ts の uid('ph')） */
export const PHOTO_ID = /^ph[0-9a-z]{12,24}$/;

/** 写真を探し直す間（クラウドにまだない写真を、毎回問い合わせない） */
const PHOTO_RETRY_MS = 5 * 60_000;
/** この端末で保存してからクラウドへ送るまで待つ時間（打っているあいだに何度も送らない） */
export const PUSH_DELAY_MS = 1500;

export type EngineOptions = {
  remote: Remote;
  key: CryptoKey;
  sources: Source[];
  state: StateStore;
  photos?: PhotoStore;
  /** 使っている写真の番号（様邸に書いてある番号） */
  photoRefs?: () => Promise<Set<string>>;
  onStatus?: (s: CloudStatus) => void;
  /** クラウドから写真が届いた（写真の欄・プレビューを出し直す） */
  onPhotos?: (ids: string[]) => void;
};

export class CloudEngine {
  private o: EngineOptions;
  private bases = new Map<string, Base>();
  private since: Partial<Record<Coll, number>> = {};
  private uploaded = new Set<string>();
  private photoTried = new Map<string, number>();
  private stops: (() => void)[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = 0;
  private status: CloudStatus = {state: 'starting', at: null, message: ''};
  private firstSnap = new Set<Coll>();
  private stopped = false;

  constructor(o: EngineOptions) {
    this.o = o;
  }

  private setStatus(s: Partial<CloudStatus>) {
    this.status = {...this.status, ...s};
    this.o.onStatus?.(this.status);
  }

  /** 順番に1つずつ（クラウドから届いたものと、この端末の保存を、同じ様邸で同時にまとめない） */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      this.busy++;
      this.setStatus({state: 'syncing'});
      try {
        return await fn();
      } finally {
        this.busy--;
        if (this.busy === 0 && !this.stopped && this.status.state === 'syncing') this.setStatus({state: 'idle', at: Date.now(), message: ''});
      }
    });
    this.chain = p.catch((e) => {
      if (!this.stopped) this.setStatus({state: isOffline(e) ? 'offline' : 'error', message: errorText(e)});
    });
    return p;
  }

  private sourceOf(coll: Coll): Source | undefined {
    return this.o.sources.find((s) => s.coll === coll);
  }

  /** 始める：前の覚えを読み、3つの置き場所の変わったものを待つ。どれも初めの分が届いたら、この端末の変更を送る */
  async start(): Promise<void> {
    const st = await this.o.state.load();
    this.bases = st.bases;
    this.since = st.since;
    this.uploaded = st.uploaded;
    for (const coll of COLLS) {
      if (!this.sourceOf(coll)) {
        this.firstSnap.add(coll);
        continue;
      }
      // 少し前から読み直す（クラウドの時計で書いた時刻の、書き終わる前後のずれのため）
      const from = Math.max(0, (this.since[coll] ?? 0) - 5 * 60_000);
      const stop = this.o.remote.listen(
        coll,
        from,
        (docs) =>
          void this.run(() => this.onRemote(coll, docs))
            .catch(() => undefined)
            .finally(() => {
              if (this.firstSnap.has(coll)) return;
              this.firstSnap.add(coll);
              if (this.firstSnap.size === COLLS.length) this.kick(0);
            }),
        (e) => this.setStatus({state: isOffline(e) ? 'offline' : 'error', message: errorText(e)}),
      );
      this.stops.push(stop);
    }
  }

  /** 今している同期が終わるまで待つ（あとから足された分も） */
  async idle(): Promise<void> {
    let c: Promise<unknown>;
    do {
      c = this.chain;
      await c;
    } while (c !== this.chain);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const s of this.stops) s();
    this.stops = [];
  }

  /** この端末で保存した：少し待ってから送る */
  kick(delay = PUSH_DELAY_MS) {
    if (this.stopped || this.firstSnap.size < COLLS.length) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow().catch(() => undefined);
    }, delay);
  }

  /** 今すぐ：この端末の変更を送り、写真をそろえる */
  syncNow(): Promise<void> {
    return this.run(async () => {
      for (const src of this.o.sources) await this.pushChanged(src);
      await this.syncPhotos();
    });
  }

  private keyOf = (coll: Coll, id: string) => `${coll}/${id}`;

  private async setBase(coll: Coll, id: string, base: Base | undefined) {
    const k = this.keyOf(coll, id);
    if (base) this.bases.set(k, base);
    else this.bases.delete(k);
    await this.o.state.setBase(k, base);
  }

  private async decode(coll: Coll, doc: RemoteDoc): Promise<Theirs> {
    if (doc.del) return DELETED;
    if (!doc.v) return DELETED;
    return openJson(this.o.key, this.keyOf(coll, doc.id), doc.v);
  }

  /** クラウドから届いた：この端末の今とまとめて入れる。まとめた中身がクラウドとちがえば（この端末にも変更があった）送る */
  private async onRemote(coll: Coll, docs: RemoteDoc[]): Promise<void> {
    const src = this.sourceOf(coll);
    if (!src || docs.length === 0) return;
    const local = await src.read();
    const changes = new Map<string, unknown>();
    const again: string[] = [];
    let maxAt = this.since[coll] ?? 0;
    for (const doc of docs) {
      maxAt = Math.max(maxAt, doc.at || 0);
      const base = this.bases.get(this.keyOf(coll, doc.id));
      if (base && base.ver === doc.ver) continue; // そろえたまま（自分で書いたものも）
      let theirs: Theirs;
      try {
        theirs = await this.decode(coll, doc);
      } catch {
        continue; // 開けない（こわれている）ものは飛ばす
      }
      const mine = local.get(doc.id);
      const merged = merge3(base, mine, theirs);
      if (!same(merged, mine)) changes.set(doc.id, merged);
      const asTheirs = theirs === DELETED ? merged === undefined : merged !== undefined && same(merged, theirs);
      if (asTheirs) await this.setBase(coll, doc.id, theirs === DELETED ? {ver: doc.ver, del: true} : {ver: doc.ver, value: theirs});
      else again.push(doc.id);
    }
    if (changes.size) await src.write(changes);
    for (const id of again) await this.push(src, id);
    if (maxAt > (this.since[coll] ?? 0)) {
      this.since[coll] = maxAt;
      await this.o.state.setSince(coll, maxAt);
    }
    if (changes.size && coll === 'jobs') await this.syncPhotos();
  }

  /** この端末で、前にそろえた中身から変わったもの・消したものを送る */
  private async pushChanged(src: Source): Promise<void> {
    const local = await src.read();
    const prefix = `${src.coll}/`;
    for (const [id, value] of local) {
      if (value === undefined) continue;
      const base = this.bases.get(this.keyOf(src.coll, id));
      if (!base || base.del || !same(base.value, value)) await this.push(src, id);
    }
    for (const [k, base] of [...this.bases]) {
      if (!k.startsWith(prefix) || base.del) continue;
      const id = k.slice(prefix.length);
      if (!local.has(id)) await this.push(src, id);
    }
  }

  /** 1件を送る（トランザクション。クラウドが前にそろえた版から変わっていれば、まとめ直してから書く） */
  private async push(src: Source, id: string): Promise<void> {
    const coll = src.coll;
    let merged: unknown;
    let mine: unknown;
    const doc = await this.o.remote.write(coll, id, async (cur) => {
      const base = this.bases.get(this.keyOf(coll, id));
      mine = (await src.read()).get(id);
      let theirs: Theirs = undefined;
      if (cur) theirs = base && cur.ver === base.ver ? (base.del ? DELETED : base.value) : await this.decode(coll, cur);
      const changedRemote = !!cur && !(base && cur.ver === base.ver);
      merged = changedRemote ? merge3(base, mine, theirs) : mine;
      if (merged === undefined) return cur && !cur.del ? {ver: newVer(), del: true} : null;
      if (cur && !cur.del && theirs !== DELETED && same(merged, theirs)) return null; // クラウドと同じ（書かない）
      return {ver: newVer(), v: await sealJson(this.o.key, this.keyOf(coll, id), merged)};
    });
    if (doc) await this.setBase(coll, id, doc.del ? {ver: doc.ver, del: true} : {ver: doc.ver, value: merged});
    else await this.setBase(coll, id, undefined);
    if (!same(merged, mine)) await src.write(new Map([[id, merged]]));
  }

  /** 写真：使っている写真のうち、この端末にあってまだ送っていないものを送り、この端末にないものをクラウドから取ってくる */
  private async syncPhotos(): Promise<void> {
    const {photos, photoRefs} = this.o;
    if (!photos || !photoRefs) return;
    const refs = [...(await photoRefs())].filter((id) => PHOTO_ID.test(id));
    if (refs.length === 0) return;
    const have = await photos.ids();
    for (const id of refs) {
      if (!have.has(id) || this.uploaded.has(id)) continue;
      if (!(await this.o.remote.hasPhoto(id))) {
        const p = await photos.get(id);
        if (!p) continue;
        const data = await seal(this.o.key, `photos/${id}`, new Uint8Array(await p.blob.arrayBuffer()));
        await this.o.remote.putPhoto(id, {w: p.w, h: p.h, type: p.blob.type || 'image/jpeg'}, data);
      }
      this.uploaded.add(id);
      await this.o.state.addUploaded(id);
    }
    const got: string[] = [];
    const now = Date.now();
    for (const id of refs) {
      if (have.has(id) || now - (this.photoTried.get(id) ?? 0) < PHOTO_RETRY_MS) continue;
      this.photoTried.set(id, now);
      const r = await this.o.remote.getPhoto(id);
      if (!r) continue;
      const bytes = await open(this.o.key, `photos/${id}`, r.data);
      await photos.put(id, new Blob([bytes as BlobPart], {type: r.meta.type}), r.meta.w, r.meta.h);
      this.uploaded.add(id);
      await this.o.state.addUploaded(id);
      got.push(id);
    }
    if (got.length) this.o.onPhotos?.(got);
  }
}

/** 電波がない・クラウドにつながらない */
export function isOffline(e: unknown): boolean {
  const code = (e as {code?: string} | null)?.code ?? '';
  return code === 'unavailable' || code === 'deadline-exceeded' || (typeof navigator !== 'undefined' && navigator.onLine === false) || /network|fetch|offline/i.test(errorText(e));
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? '');
}
