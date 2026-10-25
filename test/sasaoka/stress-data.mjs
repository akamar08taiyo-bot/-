// 文字のはみ出しを確かめるための「長い値」の様邸（4つの保険者）。すべて架空（見本）。overflow-check.mjs で使う
// usage: node stress-data.mjs <出力の json>
import fs from 'node:fs';

const out = process.argv[2];
let seq = 0;
const id = (p) => `${p}${++seq}`;
const mat = (name, o = {}) => ({
  id: id('r'), kind: 'material', refId: null, name, code: o.code ?? '', maker: o.maker ?? '', unit: o.unit ?? '', price: o.price ?? 0, qty: o.qty ?? 1,
  listPrice: o.listPrice ?? 0, lengthCm: o.lengthCm ?? 0, pieceLengthM: o.pieceLengthM ?? 0, estPrice: o.estPrice ?? null, excluded: o.excluded ?? false,
  estText: o.estText ?? null, estNote: o.estNote ?? null, estAmount: null,
});
const lab = (name, price, qty, estPrice = null) => ({
  id: id('r'), kind: 'labor', refId: null, name, code: '', maker: '', unit: '', price, qty, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice, excluded: false,
  estText: null, estNote: null, estAmount: null,
});

const longNote = '定価123,456円（税抜）×0.8　メーカーの見積書（2026年10月20日付）の金額で、運賃・梱包費を含む';
const places = () => [
  {
    name: '玄関から廊下にかけて（上がり框の横）', kind: 1, dims: {l: '600×1800', h: '800'}, shinseiText: '（既存の手すりを撤去して取替）',
    photoNote: 'ベースプレート　L=2400mm\n下地補強あり（構造用合板12mm）\n既存の手すりは撤去して処分',
    rows: [
      mat('BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 4m（屋内用・抗菌仕上げ）', {code: 'BD-134', maker: 'マツ六', unit: '本', listPrice: 18600, price: 9000, lengthCm: 240, pieceLengthM: 4, estNote: longNote}),
      mat('35エンドブラケットカバー付 ゴールド', {code: 'BD-08G', maker: 'マツ六', unit: '個', qty: 4, listPrice: 2100, price: 1100}),
      mat('35ブラケット横型カバー付 ゴールド', {code: 'BD-01G', maker: 'マツ六', unit: '個', qty: 2, listPrice: 1250, price: 700}),
      mat('木製ベースプレート 120mm幅 Mブラウン 2m（ビス別売・下地の位置に合わせて加工）', {code: 'BH-412', maker: 'マツ六', unit: '枚', listPrice: 15000, price: 8000, lengthCm: 240, pieceLengthM: 2}),
      lab('木', 1000, 2, 1500),
      lab('補強板 2m～3m', 3000, 1, 4000),
    ],
  },
  {
    name: '浴室（洗い場・浴槽まわり・出入口）', kind: 1, dims: {l: '800', h: '750'},
    rows: [
      mat('インテリア・バーF Lタイプ 600×800mm ホワイト 浴室用（ステンレス芯・樹脂被覆）', {code: 'EWT24KR68#NW1', maker: 'TOTO', unit: '本', qty: 2, listPrice: 31800, price: 19000, estNote: longNote}),
      mat('浴槽手すり 据置型 ステンレス 高さ調節付（工事不要・浴槽の縁に固定）', {code: 'YK-BA-SS-1234', maker: '矢崎化工', unit: '台', listPrice: 45000, price: 27000}),
      lab('タイル', 1500, 2, 2000),
      lab('コア抜き', 5000, 2, 6000),
    ],
  },
  {
    name: 'トイレ（1階・和式から洋式へ）', kind: 5,
    rows: [
      mat('ピュアレストQR 組み合わせ便器（床排水200mm）＋ウォシュレット一体形 オフホワイト 手洗いなし', {code: 'CS232B+SH232BA#SC1', maker: 'TOTO', unit: '台', listPrice: 168000, price: 99000, estNote: longNote}),
      mat('和式便器撤去・床下地調整・クッションフロア張替え（防汚・抗菌）一式', {unit: '式', listPrice: 0, price: 85000, estPrice: 120000}),
      lab('便器の取替（和式→洋式・給排水の付け替え含む）', 35000, 1, 52500),
    ],
  },
  {
    name: '寝室から居間への出入口（敷居の段差）', kind: 2, dims: {w: '780', d: '350', h: '45'},
    rows: [
      mat('段差解消スロープ ゴム製 幅780mm 高さ45mm 屋内用（両面テープ・ビス止め兼用）', {code: 'DS-780-45', maker: 'シンエイテクノ', unit: '個', listPrice: 9800, price: 6000}),
      lab('敷居撤去・床のかさ上げ（合板・フローリング張り）', 12000, 1, 18000),
    ],
  },
  {
    name: '階段（1階から2階まで・踊り場あり）', kind: 1, dims: {l: '3600', h: '780'},
    rows: [
      mat('BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 4m', {code: 'BD-134', maker: 'マツ六', unit: '本', listPrice: 18600, price: 9000, lengthCm: 360, pieceLengthM: 4}),
      mat('35自在ブラケットカバー付 ゴールド（階段の折れ曲がり部分用）', {code: 'BD-60G', maker: 'マツ六', unit: '個', qty: 3, listPrice: 3400, price: 1900}),
      lab('木', 1000, 4, 1500),
    ],
  },
  {
    name: '勝手口（屋外・コンクリートスロープ新設）', kind: 2, dims: {w: '900', d: '1800', h: '300'},
    rows: [mat('コンクリートスロープ新設工事（型枠・ワイヤーメッシュ・刷毛引き仕上げ）', {unit: '式', price: 120000, estPrice: 168000, estNote: '現地で寸法を測って見積もり（勾配1/12以下）'})],
  },
  {
    name: '居間（床材の変更・滑りにくいフローリング）', kind: 3,
    rows: [mat('防滑フローリング 12mm厚 ナチュラル色 15.5㎡（既存の畳を撤去して下地調整）', {unit: '㎡', qty: 15.5, price: 6800, estPrice: 9500})],
  },
  {
    name: '洗面所兼脱衣所（開き戸から引き戸へ）', kind: 4,
    rows: [
      mat('室内引戸 アウトセット方式 W1820×H2000 ソフトクローズ付 ホワイトオーク柄', {code: 'ASX-1820-WO', maker: 'パナソニック', unit: '式', listPrice: 98000, price: 59000}),
      lab('扉の取替（枠の撤去・壁の補修・クロス張替えを含む）', 28000, 1, 42000),
    ],
  },
];

const riyu = {
  checkDate: '2026-10-15', madeDate: '2026-10-20', qualification: '介護支援専門員（主任介護支援専門員）・福祉住環境コーディネーター2級', tel: '0930-00-0000（携帯 090-0000-0000）',
  housing: 'その他', housingOther: '長男夫婦の持ち家（二世帯住宅の1階部分を使用）',
  body: '令和5年に脳梗塞を発症し、右半身に軽いまひが残っている。歩行は伝い歩きで、屋内でも段差や敷居でつまずくことが多く、昨年は廊下で2回転倒している。立ち上がりの際にふらつきがあり、手すりや家具につかまらないと姿勢を保てない。',
  care: '日中は本人一人で過ごすことが多い。長男の妻が朝夕に見守りと入浴の介助をしている。週2回デイサービスを利用し、入浴はデイサービスでも行っている。夜間のトイレは一人で行くが、ふらつきがあり家族が心配している。',
  wish: '手すりと段差の解消で、家の中を一人で安全に移動できるようにしたい。トイレと浴室を自分で使えるようになり、家族の介助の負担を減らしたい。将来は近所の散歩にも出かけたい。',
  equipment: {}, equipmentOther: [{name: '入浴用いす（シャワーチェア・背もたれ付き）', before: true, after: true}, {name: 'ポータブルトイレ（夜間のみ）', before: true, after: false}, {name: '歩行器（屋外用・四輪タイプ）', before: false, after: true}],
  acts: {
    toilet: {items: [1, 2, 3], itemOther: '夜間の移動と便座からの立ち上がり', trouble: '和式便器でしゃがむことができず、立ち上がりの際に手をつく所がなくふらつく。夜間はトイレまでの廊下も暗く、つまずいて転倒しそうになる。', purposes: [1, 2], purposeOther: '家族の夜間の介助をなくす', policy: '和式便器を洋式便器に取り替え、便器の横に手すりを付ける。廊下にも手すりを付けて、寝室からトイレまで一人で移動できるようにする。'},
    bath: {items: [1, 2, 4], itemOther: '浴槽をまたぐ動作', trouble: '浴槽の縁が高く、またぐときにバランスを崩す。洗い場の床が滑りやすく、立ち上がりで転倒の危険がある。', purposes: [1, 3], purposeOther: '', policy: '浴槽の縁と洗い場の壁に手すりを付け、出入口の段差を解消する。'},
    out: {items: [1], itemOther: '', trouble: '勝手口の段差が大きく、一人では外に出られない。', purposes: [2], purposeOther: '', policy: 'コンクリートのスロープを新設し、手すりを付ける。'},
    home: {items: [0], itemOther: '寝室から居間・トイレへの移動（敷居の段差と廊下の伝い歩き）', trouble: '敷居の段差でつまずき、廊下には伝い歩きできる所がない。', purposes: [1], purposeOther: '', policy: '敷居の段差を解消し、廊下に手すりを付ける。'},
  },
};

const shinsei = (o) => ({
  gender: '女', era: '昭和', care: '要介護2', renovated: '無',
  kana: 'ミホンハセガワラ　ミチヨコ', birthY: '13', birthM: '12', birthD: '25', zip: '800-0300', phone: '0930-00-0000',
  owner: '見本長谷川原　一郎太', relation: '長男（同居・二世帯住宅の所有者）', reasonOffice: '社会福祉法人見本福祉会　見本居宅介護支援事業所みやこ南', reasonName: '見本　介護支援専門員太郎',
  start: '2026-11-04', end: '2026-11-28', cost: null, careFrom: '2026-04-01', careTo: '2028-03-31', insurerNo: '409999', burden: '1', ...o,
});

const job = (n, insurer, form, address, extra = {}) => ({
  id: `stress-${insurer}`, month: '2026-10', customer: `見本長谷川原　美千代子${n}`, suffix: '様邸', staff: '久保 匠史', date: '2026-11-05', estDate: '2026-10-22',
  address, note: '玄関・浴室・トイレ・寝室・階段・勝手口・居間・洗面所の住宅改修（見本）', insuredNo: '0001234567', insurer, form,
  overhead: null, overheadTarget: null, shikiri: true,
  places: places().map((p, i) => ({id: `${insurer}-p${i + 1}`, photo: 0, ...p})),
  shinsei: shinsei(extra.shinsei ?? {}), riyu, createdAt: Date.UTC(2026, 9, 22), updatedAt: Date.UTC(2026, 9, 22),
});

const data = {
  kind: 'taiyo-sasaoka-shikiri-backup', version: 1, exportedAt: '2026-10-22T00:00:00.000Z',
  jobs: [
    job('A', 'kanda', 'yukuhashi', '福岡県京都郡苅田町大字与原1234番地56　見本ハイツ苅田南第二ビル301号室'),
    job('B', 'yukuhashi', 'yukuhashi', '福岡県行橋市大字流末1234番地56　見本マンション行橋駅前東館1203号室'),
    job('C', 'miyako', 'yukuhashi', '福岡県京都郡みやこ町犀川大坂1234番地5　見本コーポ犀川第三203号室'),
    job('D', 'kouiki', 'kouiki', '福岡県築上郡築上町大字椎田1234番地56　見本レジデンス椎田南第一101号'),
  ],
};
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log('wrote', out, data.jobs.length, 'jobs');
