// 見積もりを作るときに開くメーカーのカタログ（外のサイト。新しいタブで開く）。
// ユーザーの指示「見積もり作成のとき、それぞれのカタログに飛べるようにして、検索しやすいようにする」（2026-11-04）。
// どのリンクがどのメーカーかはユーザーの答え（2026-11-04）：actibook＝マツ六、カタラボ＝TOTO、catalog.kaientai.cc＝介援隊。
// 外のサイトの中で押した商品はアプリで受け取れないので、「押すと商品名・型番・定価が入る」はカタログの PDF をいただいてから
// （特定福祉用具の介援隊カタログと同じ作り。マツ六は「添付しているカタログの商品のみリンクで飛べるように」）。

export type MakerCatalog = {
  id: 'matsuroku' | 'toto' | 'kaientai';
  name: string; // ボタンの名前
  maker: RegExp; // 部材リストのメーカー名
  /** カタログを開く URL。page はカタログのページ（分かるときだけ。今はマツ六＝actibook の pNo だけ） */
  url: (page?: number) => string;
};

const MATSUROKU_PAGE = 42; // いただいたリンクのページ（手すりのページ）

export const CATALOGS: MakerCatalog[] = [
  {
    id: 'matsuroku',
    name: 'マツ六',
    maker: /マツ六|matsu-?roku/i,
    url: (page) => `https://saas.actibookone.com/content/detail?param=eyJjb250ZW50TnVtIjoxODMyNH0=&detailFlg=1&pNo=${page && page > 0 ? Math.round(page) : MATSUROKU_PAGE}`,
  },
  {
    id: 'toto',
    name: 'TOTO',
    maker: /TOTO/i,
    url: () =>
      'https://www.catalabo.org/iportal/CatalogViewInterfaceStartUpAction.do?method=startUp&mode=PAGE&volumeID=CATALABO&catalogId=87283880000&pageGroupId=&designID=link&catalogCategoryId=&designConfirmFlg=',
  },
  {
    id: 'kaientai',
    name: '介援隊',
    maker: /介援隊/,
    url: () => 'https://catalog.kaientai.cc/iportal/CatalogViewInterfaceStartUpAction.do?method=startUp&mode=PAGE&volumeID=CMC00008&catalogId=3494140000&pageGroupId=59',
  },
];

/** 部材のメーカー名から、そのメーカーのカタログ（なければ null） */
export const catalogOf = (maker: string): MakerCatalog | null => CATALOGS.find((c) => c.maker.test(maker.normalize('NFKC'))) ?? null;
