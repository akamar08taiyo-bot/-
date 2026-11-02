// このアプリでまだ申請書を作れない市（久留米市・飯塚市・大分市）と、福岡県介護保険広域連合の田川市の、申請書のページ（市・広域連合の公式サイト）。
// 見積もり・申請書を作成するの「新規作成」から、新しいタブで開く（ユーザーの指示「久留米、飯塚、大分、田川の申請書に飛べるページを用意して」2026-11-02。
// 音声入力で「食べる」と入っていた）。この市の申請書をアプリで作るのは保留（ユーザーの指示「一旦保留で」2026-10-29）。
// どのページも 2026-11-02 に検索で見つけた公式のページ（作業環境からは市のサイトを開けないので、検索の結果の題名で確かめた）。
// 市がページを移したら、ここを直す（tests: test/sasaoka/otherForms.test.ts）。

export type OtherFormLink = {label: string; url: string};
export type OtherForm = {
  id: 'kurume' | 'iizuka' | 'oita' | 'tagawa';
  city: string;
  /** 保険者のこと（田川市は福岡県介護保険広域連合の田川・桂川支部。申請書はこのアプリの広域連合の書式で作れる） */
  note?: string;
  kouiki?: boolean;
  links: OtherFormLink[];
};

export const OTHER_FORMS: OtherForm[] = [
  {
    id: 'kurume',
    city: '久留米市',
    links: [
      // 「3-4.介護保険居宅介護（介護予防）住宅改修関係申請書等」
      {label: '🏠 住宅改修の申請書', url: 'https://www.city.kurume.fukuoka.jp/1500soshiki/9045kaigo/3020shinsei/2007-1218-1654-94.html'},
      // 「3-2.介護保険居宅介護（介護予防）福祉用具購入費支給申請書」
      {label: '🛁 福祉用具購入の申請書', url: 'https://www.city.kurume.fukuoka.jp/1500soshiki/9045kaigo/3020shinsei/2007-1218-1644-94.html'},
      // 「健康福祉部介護保険課 申請書」
      {label: '📂 介護保険の申請書の一覧', url: 'https://www.city.kurume.fukuoka.jp/1500soshiki/9045kaigo/3020shinsei/'},
    ],
  },
  {
    id: 'iizuka',
    city: '飯塚市',
    links: [
      // 「介護保険住宅改修費関係 - 申請・手続案内」
      {label: '🏠 住宅改修の申請書', url: 'https://www.city.iizuka.lg.jp/koresido/jyuutakukaishuu.html'},
      // 「介護保険福祉用具購入費関係 - 申請・手続案内」（検索ではこの URL だけが出た）
      {label: '🛁 福祉用具購入の申請書', url: 'https://city.iizuka.lg.jp/koresido/hukushiyougukounyuu.html'},
      // 「介護保険関係の各種申請書・届出書の様式集」
      {label: '📂 介護保険の様式集', url: 'https://www.city.iizuka.lg.jp/korehoken/youshikishu.html'},
    ],
  },
  {
    id: 'oita',
    city: '大分市',
    links: [
      // 「住宅改修費支給申請」（支給兼施工承認申請書・委任状・理由書）
      {label: '🏠 住宅改修の申請書', url: 'https://www.city.oita.oita.jp/o081/kenko/fukushi/1202970711034.html'},
      // 「福祉用具購入費支給申請」
      {label: '🛁 福祉用具購入の申請書', url: 'https://www.city.oita.oita.jp/o081/kenko/fukushi/1202969764268.html'},
    ],
  },
  {
    id: 'tagawa',
    city: '田川市',
    note: '福岡県介護保険広域連合（田川・桂川支部）',
    kouiki: true,
    links: [
      // 「住宅改修・福祉用具購入等関係申請様式ダウンロード」
      {label: '🏠🛁 住宅改修・福祉用具購入の申請書', url: 'https://www.fukuoka-kaigo.jp/application/benefit02.html'},
      // 「田川・桂川支部」（窓口）
      {label: '🏢 田川・桂川支部', url: 'https://www.fukuoka-kaigo.jp/inquiry/union/tagawa/'},
    ],
  },
];
