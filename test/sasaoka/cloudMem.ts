// 常時同期のテスト用：メモリの中だけのクラウド（Remote）と、端末の保存場所（Source・PhotoStore・StateStore）。本物の Firebase にはつながない
import type {Base, Coll, PhotoMeta, PhotoStore, Remote, RemoteDoc, Source, StateStore} from '../../src/sasaoka/cloud/engine.ts';

/** 1つのクラウド（いくつもの端末が同じものを使う）。書くたびに時計を進め、聞いている端末に知らせる */
export class MemRemote implements Remote {
  docs = new Map<string, RemoteDoc>(); // 'jobs/id' → 1件
  photos = new Map<string, {meta: PhotoMeta; data: Uint8Array}>();
  private clock = 1000;
  private subs = new Set<{coll: Coll; since: number; on: (docs: RemoteDoc[]) => void}>();
  writes = 0;
  offline = false;

  listen(coll: Coll, since: number, on: (docs: RemoteDoc[]) => void): () => void {
    const s = {coll, since, on};
    this.subs.add(s);
    const now = [...this.docs.entries()].filter(([k, d]) => k.startsWith(`${coll}/`) && d.at > since).map(([, d]) => ({...d}));
    setTimeout(() => this.subs.has(s) && on(now), 0);
    return () => this.subs.delete(s);
  }

  async write(coll: Coll, id: string, build: (cur: RemoteDoc | null) => Promise<{ver: string; del?: boolean; v?: Uint8Array} | null>): Promise<RemoteDoc | null> {
    if (this.offline) throw Object.assign(new Error('network offline'), {code: 'unavailable'});
    const k = `${coll}/${id}`;
    for (;;) {
      const before = this.docs.get(k);
      const put = await build(before ? {...before} : null);
      // トランザクション：読んだあとにほかが書いていたらやり直す
      if (this.docs.get(k) !== before) continue;
      if (!put) return before ? {...before} : null;
      const doc: RemoteDoc = {id, ver: put.ver, at: ++this.clock, ...(put.del ? {del: true} : {v: put.v})};
      this.docs.set(k, doc);
      this.writes++;
      for (const s of this.subs) if (s.coll === coll) setTimeout(() => this.subs.has(s) && s.on([{...doc}]), 0);
      return {...doc};
    }
  }

  async count(coll: Coll): Promise<number> {
    return [...this.docs.entries()].filter(([k, d]) => k.startsWith(`${coll}/`) && !d.del).length;
  }
  async hasPhoto(id: string) {
    return this.photos.has(id);
  }
  async putPhoto(id: string, meta: PhotoMeta, data: Uint8Array) {
    this.photos.set(id, {meta, data});
  }
  async getPhoto(id: string) {
    return this.photos.get(id) ?? null;
  }
}

/** 端末の保存場所の1つ（id → 値の並び。並びの順は足した順） */
export class MemSource implements Source {
  coll: Coll;
  map = new Map<string, unknown>();
  writes: Map<string, unknown>[] = [];
  constructor(coll: Coll, items: Record<string, unknown> = {}) {
    this.coll = coll;
    for (const [k, v] of Object.entries(items)) this.map.set(k, structuredClone(v));
  }
  async read() {
    return new Map([...this.map].map(([k, v]) => [k, structuredClone(v)] as const));
  }
  async write(changes: Map<string, unknown>) {
    this.writes.push(changes);
    for (const [k, v] of changes) {
      if (v === undefined) this.map.delete(k);
      else this.map.set(k, structuredClone(v));
    }
  }
}

export class MemPhotos implements PhotoStore {
  map = new Map<string, {blob: Blob; w: number; h: number}>();
  async ids() {
    return new Set(this.map.keys());
  }
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async put(id: string, blob: Blob, w: number, h: number) {
    this.map.set(id, {blob, w, h});
  }
}

export class MemState implements StateStore {
  bases = new Map<string, Base>();
  since: Partial<Record<Coll, number>> = {};
  uploaded = new Set<string>();
  async load() {
    return {bases: new Map(this.bases), since: {...this.since}, uploaded: new Set(this.uploaded)};
  }
  async setBase(key: string, base: Base | undefined) {
    if (base) this.bases.set(key, structuredClone(base));
    else this.bases.delete(key);
  }
  async setSince(coll: Coll, at: number) {
    this.since[coll] = at;
  }
  async addUploaded(id: string) {
    this.uploaded.add(id);
  }
}
