// （株）イヤーズ デモアプリの保存場所を、今までのアプリと分ける。デモは今までのアプリと同じサイト（akamar08taiyo-bot.github.io）に置くので、
// そのままでは同じブラウザで今までのアプリのデータ（様邸・部材リスト・写真・ポータルの営業所）を読み書きしてしまう。
// アプリの本体より先に読み込み、IndexedDB・localStorage・sessionStorage・BroadcastChannel の名前の頭に「years-demo:」を付ける
// （アプリの本体はそのまま。名前がちがうので、今までのアプリのデータには届かない）
export const DEMO_PREFIX = 'years-demo:';

const P = DEMO_PREFIX;
const withP = (name: string) => (String(name).startsWith(P) ? String(name) : P + String(name));

if (typeof IDBFactory !== 'undefined') {
  const proto = IDBFactory.prototype;
  const open = proto.open;
  const del = proto.deleteDatabase;
  proto.open = function (this: IDBFactory, name: string, version?: number) {
    return version === undefined ? open.call(this, withP(name)) : open.call(this, withP(name), version);
  };
  proto.deleteDatabase = function (this: IDBFactory, name: string) {
    return del.call(this, withP(name));
  };
}

if (typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const get = proto.getItem;
  const set = proto.setItem;
  const remove = proto.removeItem;
  const key = proto.key;
  proto.getItem = function (this: Storage, k: string) {
    return get.call(this, withP(k));
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, withP(k), v);
  };
  proto.removeItem = function (this: Storage, k: string) {
    remove.call(this, withP(k));
  };
  // 全部消す：デモの分だけ（今までのアプリの分は残す）
  proto.clear = function (this: Storage) {
    const mine: string[] = [];
    for (let i = 0; i < this.length; i++) {
      const k = key.call(this, i);
      if (k?.startsWith(P)) mine.push(k);
    }
    for (const k of mine) remove.call(this, k);
  };
}

if (typeof BroadcastChannel !== 'undefined') {
  const Base = BroadcastChannel;
  window.BroadcastChannel = class extends Base {
    constructor(name: string) {
      super(withP(name));
    }
  } as typeof BroadcastChannel;
}
