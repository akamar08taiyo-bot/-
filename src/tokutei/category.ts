// 種目（特定福祉用具の種類）の自動判定。商品名（と価格表の分類の列）から、申請書・見積書に書く種目と細目を決める。
// 決まらない商品は空のまま（取り込みの確認・商品マスタで選ぶ）。手で選んだ種目は、価格表を取り込み直しても変えない。
// 種目の範囲は自治体の資料（北九州市・和歌山市など）で確かめたもの。2024年4月から固定用スロープ・歩行器・歩行補助つえが加わった。

/** 種目と細目（画面で選ぶときの候補。名前は申請書に書く名前） */
export const CATEGORIES: {name: string; subs: string[]}[] = [
  {name: '腰掛便座', subs: ['和式便器を腰掛式にするもの', '洋式便器の高さを補うもの', '立ち上がりを補助するもの', '移動できる便器（ポータブルトイレ）']},
  {name: '自動排泄処理装置の交換可能部品', subs: []},
  {name: '排泄予測支援機器', subs: []},
  {name: '入浴補助用具', subs: ['入浴用いす', '浴槽用手すり', '浴槽内いす', '入浴台', '浴室内すのこ', '浴槽内すのこ', '入浴用介助ベルト']},
  {name: '簡易浴槽', subs: []},
  {name: '移動用リフトのつり具の部分', subs: []},
  {name: '固定用スロープ', subs: []},
  {name: '歩行器', subs: []},
  {name: '歩行補助つえ', subs: ['多点杖', 'ロフストランド・クラッチ', 'カナディアン・クラッチ', 'プラットホームクラッチ']},
];

/** category が空なら決まらなかった。warn は対象外と分かったときの理由（画面で知らせる） */
export type CategoryGuess = {category: string; sub: string; warn: string};

const none = (warn = ''): CategoryGuess => ({category: '', sub: '', warn});
const hit = (category: string, sub = ''): CategoryGuess => ({category, sub, warn: ''});

const norm = (s: string) => (s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();

// 本体ではなく、消耗品・付属品（申請の対象にならない）
const ACCESSORY = /(消臭|脱臭|防臭)(剤|液)|処理袋|凝固剤|杖先ゴム|替えゴム|交換用(ゴム|キャップ|座面)|(専用|用)(バケツ|処理袋|カバー|消臭剤)|(バケツ|カバー)のみ/;

/**
 * 種目と細目を推測する。name は商品名、hint は価格表の「種目」「分類」の列の文字（なければ空）。
 * 分類の列に種目の名前が入っていればそれを先に使う（細目は商品名からも探す）
 */
export function guessCategory(name: string, hint = ''): CategoryGuess {
  const h = norm(hint);
  if (h) {
    const c = CATEGORIES.find((x) => h.includes(x.name));
    if (c) {
      const sub = c.subs.find((x) => h.includes(x)) ?? (byName(norm(name)).category === c.name ? byName(norm(name)).sub : '');
      return hit(c.name, sub);
    }
    const g = byName(h); // 分類の列が「シャワーチェア」「浴槽台」のような細目の名前のとき
    if (g.category) return g;
  }
  return byName(norm(name));
}

function byName(s: string): CategoryGuess {
  if (!s) return none();
  if (ACCESSORY.test(s)) return none('消耗品・付属品は申請の対象になりません');

  // 入浴補助用具の細目の名前がそのまま入っているとき
  const bath = CATEGORIES.find((c) => c.name === '入浴補助用具')!;
  const literal = bath.subs.find((x) => s.includes(x));
  if (literal) return hit('入浴補助用具', literal);

  // 自動排泄処理装置：交換できる部品（尿や便の通り道）だけが対象。本体は貸与
  if (/自動排泄|排泄処理装置|ヒューマニー|スカットクリーン|マインレット/.test(s)) {
    return /レシーバー|チューブ|タンク|カップ|部品/.test(s) ? hit('自動排泄処理装置の交換可能部品') : none('自動排泄処理装置の本体は貸与の品目です');
  }
  if (/排泄予測|排尿予測|dfree/i.test(s)) return hit('排泄予測支援機器');
  if (/簡易浴槽|ポータブル浴槽|空気式浴槽|折りたたみ浴槽/.test(s)) return hit('簡易浴槽');
  if (/つり具|吊り具|吊具|スリング/.test(s)) return hit('移動用リフトのつり具の部分');

  // 入浴補助用具（見分けやすい順に見る）
  if (/入浴.*介助ベルト|介助ベルト.*入浴/.test(s)) return hit('入浴補助用具', '入浴用介助ベルト');
  if (/浴槽(内|用)すのこ/.test(s)) return hit('入浴補助用具', '浴槽内すのこ');
  if (/すのこ/.test(s)) return hit('入浴補助用具', '浴室内すのこ');
  if (/浴槽(用)?(手すり|手摺|グリップ)|バスグリップ|バスタブグリップ/.test(s)) return hit('入浴補助用具', '浴槽用手すり');
  if (/浴槽台|浴槽内(いす|イス|椅子|チェア)|バスステップ/.test(s)) return hit('入浴補助用具', '浴槽内いす');
  if (/バスボード|移乗台/.test(s)) return hit('入浴補助用具', '入浴台');
  if (/シャワー(チェア|ベンチ|いす|イス|椅子)|入浴用(いす|イス|椅子|チェア)|バスチェア|風呂(いす|イス|椅子)/.test(s)) return hit('入浴補助用具', '入浴用いす');

  // 腰掛便座
  if (/補高便座|便座(を)?補高/.test(s)) return hit('腰掛便座', '洋式便器の高さを補うもの');
  if (/昇降便座|便座昇降|立ち上がり補助便座/.test(s)) return hit('腰掛便座', '立ち上がりを補助するもの');
  if (/据置(式)?便座|和式(便器)?.*(腰掛|洋式)/.test(s)) return hit('腰掛便座', '和式便器を腰掛式にするもの');
  if (/ポータブルトイレ|家具調トイレ|水洗(式)?ポータブル|ベッドサイド(水洗)?トイレ|トイレチェア/.test(s)) {
    return hit('腰掛便座', '移動できる便器（ポータブルトイレ）');
  }
  if (/腰掛便座/.test(s)) return hit('腰掛便座');

  // 2024年4月からの3つ（貸与と販売を選べる）。対象外のもの（持ち運ぶスロープ・歩行車・T字杖）は理由を返す
  if (/スロープ/.test(s)) {
    return /携帯|ポータブル|可搬|折りたたみ|折り畳み|車載|伸縮/.test(s) ? none('持ち運ぶスロープは対象外（固定用スロープだけ）') : hit('固定用スロープ');
  }
  if (/歩行器|ウォーカー/.test(s)) {
    return /歩行車|キャスター|車輪|輪付|ロレータ|シルバーカー/.test(s) ? none('車輪のある歩行車は対象外') : hit('歩行器');
  }
  if (/杖|つえ|ステッキ|クラッチ/.test(s)) {
    if (/ロフストランド/.test(s)) return hit('歩行補助つえ', 'ロフストランド・クラッチ');
    if (/カナディアン/.test(s)) return hit('歩行補助つえ', 'カナディアン・クラッチ');
    if (/プラットホーム|プラットフォーム/.test(s)) return hit('歩行補助つえ', 'プラットホームクラッチ');
    if (/多点|[34３４三四]点/.test(s)) return hit('歩行補助つえ', '多点杖');
    if (/松葉/.test(s)) return none('松葉づえは対象外');
    return none('T字杖など1本の杖は対象外（多点杖・ロフストランドなどだけ）');
  }
  return none();
}

/** 種目と細目を1つの文字にする（画面で選ぶとき）：「入浴補助用具（入浴用いす）」 */
export function categoryLabel(category: string, sub: string): string {
  if (!category) return '';
  return sub ? `${category}（${sub}）` : category;
}

/**
 * 書類（見積書・申請書）に書く種目：細目の名前が長い腰掛便座は、ふだんの呼び名にする
 * （「腰掛便座（移動できる便器（ポータブルトイレ））」は申請書の欄に入りきらない → 「腰掛便座（ポータブルトイレ）」）
 */
const DOC_SUB: Record<string, string> = {
  和式便器を腰掛式にするもの: '据置式便座',
  洋式便器の高さを補うもの: '補高便座',
  立ち上がりを補助するもの: '昇降便座',
  '移動できる便器（ポータブルトイレ）': 'ポータブルトイレ',
};

export function docLabel(category: string, sub: string): string {
  return categoryLabel(category, DOC_SUB[sub] ?? sub);
}

/** 種目の短い呼び名（商品を選ぶ画面のタブ） */
export function categoryTab(category: string): string {
  const map: Record<string, string> = {
    入浴補助用具: '入浴',
    腰掛便座: 'トイレ',
    歩行器: '歩行器',
    歩行補助つえ: 'つえ',
    固定用スロープ: 'スロープ',
    簡易浴槽: '簡易浴槽',
    移動用リフトのつり具の部分: 'つり具',
    自動排泄処理装置の交換可能部品: '自動排泄',
    排泄予測支援機器: '排泄予測',
  };
  return map[category] ?? 'そのほか';
}
