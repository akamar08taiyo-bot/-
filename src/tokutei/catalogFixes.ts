// 介援隊カタログの読み取りの直し（ユーザーの指示「カタログと商品が違ったものがあった。そこは絶対に間違わないでほしいので、徹底的に検査、確認する」
// 2026-11-09）。全26ページ・246商品・845品番を、ページの絵と1つずつ見くらべて、ページの書き方が特殊で読み取り（catalogItems.ts）では
// 正しく読めなかった商品だけをここに書く（品番が写真の横にしかない・1つの品番に M と L がある・品番がなく S と M で TAIS が分かれている など）。
// 金額は書かない（リポジトリに定価を残さない。読み取った金額をそのまま使う：from は、読み取った何番目の品番の金額・TAIS・注文番号を使うか）。
// 読み取った品番の並びが expect と同じときだけ直す（読み取りが変わったら直さない。test/tokutei/catalogItems.test.ts が全部の直しが当たるかを見る）
import type {CatalogProduct, CatalogVariant} from './catalogItems.ts';

export type CatalogFix = {
  page: number;
  /** 注文番号（261-W1257 など） */
  order: string;
  /** 読み取った品番（この並びのときだけ直す） */
  expect: string[];
  /** 直したあとの品番。code・tais を書かなければ、from の品番のまま */
  variants: {from: number; code?: string; label: string; tais?: string}[];
};

export const CATALOG_FIXES: CatalogFix[] = [
  // p.136 ミニフィット(超ミニ)：XS-0088 には種類の言葉がない（「後脚スタンド付」は XS-128S のもの）
  {page: 136, order: '261-W1356', expect: ['XS-0088', 'XS-128S', 'XS-148E'], variants: [{from: 0, label: ''}, {from: 1, label: '後脚スタンド付'}, {from: 2, label: 'キャスター付'}]},
  // p.137 Mg ウォーカー：品番はなく、S と M で TAIS が分かれている（各¥）
  {page: 137, order: '261-W2981', expect: ['261-W2981'], variants: [{from: 0, label: 'S', tais: '01105-000035'}, {from: 0, label: 'M', tais: '01105-000036'}]},
  {page: 137, order: '261-W1394', expect: ['261-W1394'], variants: [{from: 0, label: 'S', tais: '01105-000011'}, {from: 0, label: 'M', tais: '01105-000030'}]},
  {page: 137, order: '261-W1791', expect: ['261-W1791'], variants: [{from: 0, label: 'S', tais: '01105-000014'}, {from: 0, label: 'M', tais: '01105-000015'}]},
  // p.154 テイコブアルミ製 4点杖：品番は1つ（「EA4-」「102」の2行に割れている）。ブラックと、ほかの3色（各¥）で金額がちがう
  {
    page: 154,
    order: '261-W1257',
    expect: ['EA4-', '102'],
    variants: [
      {from: 0, code: 'EA4-102', label: 'ブラック'},
      {from: 1, code: 'EA4-102', label: 'チェックブラウン'},
      {from: 1, code: 'EA4-102', label: 'レッドフラワー'},
      {from: 1, code: 'EA4-102', label: 'ピンクフラワー'},
    ],
  },
  // p.154 品番が写真の横にしかない杖（各¥）。前は注文番号を品番にしていた
  {page: 154, order: '261-W2319', expect: ['261-W2319'], variants: [{from: 0, code: '77MC-S4', label: 'ストライプB'}, {from: 0, code: '77MC-C5', label: '桜エンジ'}]},
  {
    page: 154,
    order: '261-W1289',
    expect: ['261-W1289'],
    variants: [
      {from: 0, code: '70C-4', label: 'カーボン柄NB', tais: '00576-000031'},
      {from: 0, code: '70C-F4', label: '花柄NB', tais: '00576-000031'},
      {from: 0, code: '70C-C1', label: '格子BR', tais: '00576-000031'},
    ],
  },
  {page: 154, order: '261-W1867', expect: ['261-W1867'], variants: [{from: 0, code: 'WB3801', label: '花柄赤'}, {from: 0, code: 'WB3802', label: '木目ブラウン'}]},
  // p.154 テトラ・ケインα ミディ：品番はなく、S と M で TAIS が分かれている（各¥）。色は青墨
  {page: 154, order: '261-W2839', expect: ['261-W2839'], variants: [{from: 0, label: 'S 青墨', tais: '01105-000040'}, {from: 0, label: 'M 青墨', tais: '01105-000041'}]},
  // p.46 マスカット ポールタイプII：-300 と -310 はグリップボールの色（白・緑）がちがう。-800 はグリーン
  {
    page: 46,
    order: '261-S1093',
    expect: ['MP2000-800', 'MP2000-300', 'MP2000-310'],
    variants: [
      {from: 0, label: 'リングアーム付き グリーン'},
      {from: 1, label: '滑り止めグリップ ポール付き グリップボール白×2'},
      {from: 2, label: '滑り止めグリップ ポール付き グリップボール緑×2'},
    ],
  },
  // p.46 介護リフトつるべーF2Rセット：TAIS が「TAIS/」「00229-000016」の2行に割れている
  {page: 46, order: '261-B0327', expect: ['261-B0327'], variants: [{from: 0, label: '', tais: '00229-000016'}]},
  // p.51 たすけ帯：1つの品番に M と L がある（各¥）
  {page: 51, order: '261-S0535', expect: ['0973'], variants: [{from: 0, label: 'M ウエスト60～85cm'}, {from: 0, label: 'L ウエスト85～110cm'}]},
  {page: 51, order: '261-S0535', expect: ['0972'], variants: [{from: 0, label: 'M 腰回り70～85cm'}, {from: 0, label: 'L 腰回り85～100cm'}]},
  // p.175 きらく ミニでか：品番の左に「標準タイプ」「やわらか便座」「普通便座」と型（MS型・MY型）、片付け簡単
  {
    page: 175,
    order: '261-T0625',
    expect: ['45601', '45603', '45611', '45613', '40035', '40036'],
    variants: [
      {from: 0, label: '標準タイプ MS型 アイボリー'},
      {from: 1, label: '標準タイプ MS型 ダークブラウン'},
      {from: 2, label: 'やわらか便座 MY型 アイボリー'},
      {from: 3, label: 'やわらか便座 MY型 ダークブラウン'},
      {from: 4, label: '普通便座 片付け簡単 MS型 ダークブラウン'},
      {from: 5, label: 'やわらか便座 片付け簡単 MY型 ダークブラウン'},
    ],
  },
  // p.175 きらく P2シリーズ：型（PS2型・PY2型）
  {page: 175, order: '261-T0667', expect: ['47530', '47540'], variants: [{from: 0, label: '標準タイプ PS2型'}, {from: 1, label: 'やわらか便座 PY2型'}]},
  // p.175 ラップポン介護用 消耗品：写真の横の名前（フィルムと凝固剤）
  {page: 175, order: '261-T0989', expect: ['C0F1C460J', 'C0C0T3P1J'], variants: [{from: 0, label: 'フィルムカセットタイプ4 60回分'}, {from: 1, label: 'カタメルサーT3 6L'}]},
  // p.214 バリアフリーレール：表の上の見出し（フラットタイプ・への字タイプと長さ）。前は写真の「施工前」が付いていた
  {
    page: 214,
    order: '261-R0357',
    expect: ['BF120-1000-LO', 'BF120-1000-DO', 'BF120-2000-LO', 'BF120-2000-DO', 'BH120-1000-LO', 'BH120-1000-DO'],
    variants: [
      {from: 0, label: 'フラットタイプ(長さ100cm) ライトオーク'},
      {from: 1, label: 'フラットタイプ(長さ100cm) ダークオーク'},
      {from: 2, label: 'フラットタイプ(長さ200cm) ライトオーク'},
      {from: 3, label: 'フラットタイプ(長さ200cm) ダークオーク'},
      {from: 4, label: 'への字タイプ(長さ100cm) ライトオーク'},
      {from: 5, label: 'への字タイプ(長さ100cm) ダークオーク'},
    ],
  },
  // ---- 2026-11-09 の検品部隊（A班・B班が逆の順に、アプリの値を見ずに書き取り、2人の書き取りが一致したもの・審査で決めたもの）----
  // 表に色の欄がなく、色の名前が写真の横・色見本の下にしかない商品（前は読めず、色を選べなかった・色が名前に出なかった）。
  // 1つの品番（品番がなければ注文番号）に色が2つ以上ある商品は、色ごとに分けて選べるようにする（金額は同じ：「各¥」）。
  // p.44 安寿 ステンレス製浴槽台R ソフトクッションタイプ：色は写真の横の「レッド」だけ（表に色の欄がない）
  {page: 44, order: '261-S0340', expect: ['536-450', '536-452', '536-454', '536-458', '536-456'], variants: [{from: 0, label: '10cm レッド'}, {from: 1, label: '12～15cm レッド'}, {from: 2, label: '15～20cm レッド'}, {from: 3, label: '17.5～25cm レッド'}, {from: 4, label: '20～30cm レッド'}]},
  // p.45 ユニプラス 浴槽手すり UB兼用130：1つの品番に2色（写真の横の「レッド／オレンジ」は1つの色の名前・「ホワイト」）。各¥
  {page: 45, order: '261-S0993', expect: ['BSH01'], variants: [{from: 0, label: 'レッドオレンジ'}, {from: 0, label: 'ホワイト'}]},
  // p.47 バイオクッション P 2m幅：品番はなく、長さ1mあたりの金額。色は写真の横の2色
  {page: 47, order: '261-S0147', expect: ['261-S0147'], variants: [{from: 0, label: '長さ1mあたり ライトグリーン'}, {from: 0, label: '長さ1mあたり ライトブルー'}]},
  // p.47 すべり止めマット オーバルリンク：品番はなく、タイプごとの金額。マットタイプM・L は6色、ミディアムはライトグリーンのみ、ロングはグリーンとライトグリーンのみ（※の注記）
  {page: 47, order: '261-S0145', expect: ['261-S0145', '261-S0145', '261-S0145', '261-S0145', '261-S0145', '261-S0145'], variants: [{from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm レッド'}, {from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm グリーン'}, {from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm ブルー'}, {from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm ライトグリーン'}, {from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm ピンク'}, {from: 0, label: 'マットタイプM 幅38×長さ55×厚さ0.2cm ブラウン'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm レッド'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm グリーン'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm ブルー'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm ライトグリーン'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm ピンク'}, {from: 1, label: 'マットタイプL 幅38×長さ70×厚さ0.2cm ブラウン'}, {from: 2, label: 'ミディアムタイプ 幅38×長さ98×厚さ0.25cm ライトグリーン'}, {from: 3, label: 'ロングタイプL1 幅100×長さ100×厚さ0.25cm グリーン'}, {from: 3, label: 'ロングタイプL1 幅100×長さ100×厚さ0.25cm ライトグリーン'}, {from: 4, label: 'ロングタイプL2 幅100×長さ200×厚さ0.25cm グリーン'}, {from: 4, label: 'ロングタイプL2 幅100×長さ200×厚さ0.25cm ライトグリーン'}, {from: 5, label: 'ロングタイプL3 幅100×長さ300×厚さ0.25cm グリーン'}, {from: 5, label: 'ロングタイプL3 幅100×長さ300×厚さ0.25cm ライトグリーン'}]},
  // p.47 滑り止めバスマット：1つの品番にピンクとブルー（写真の横・色見本）。各¥
  {page: 47, order: '261-S0397', expect: ['BB2010', 'BC2020'], variants: [{from: 0, label: 'M ピンク'}, {from: 0, label: 'M ブルー'}, {from: 1, label: 'L ピンク'}, {from: 1, label: 'L ブルー'}]},
  // p.47 すべり止めマット V：品番はなく、3色（写真の横・色見本）。各¥
  {page: 47, order: '261-S0812', expect: ['261-S0812'], variants: [{from: 0, label: 'ライトグリーン'}, {from: 0, label: 'レッド'}, {from: 0, label: 'ブルー'}]},
  // p.47 バスらぎ シリコーンマット：色は写真の横の「薄手グリーン」だけ
  {page: 47, order: '261-S0848', expect: ['YM-116L-SI'], variants: [{from: 0, label: '薄手グリーン'}]},
  // p.48 浴室内バスマット：1つの品番にグリーンとピンク。各¥
  {page: 48, order: '261-S1045', expect: ['YM001'], variants: [{from: 0, label: 'グリーン'}, {from: 0, label: 'ピンク'}]},
  // p.48 ぐりーんまっと：1つの品番に4色（色の名前は2行に割れている）。各¥
  {page: 48, order: '261-S0228', expect: ['KS-90'], variants: [{from: 0, label: 'ライトグリーン'}, {from: 0, label: 'バナナイエロー'}, {from: 0, label: 'ピーチピンク'}, {from: 0, label: 'ネイビー'}]},
  // p.48 すべり止めバスマット楽湯：1つの品番にライトグリーンとパープル。各¥
  {page: 48, order: '261-S0706', expect: ['7542'], variants: [{from: 0, label: 'ライトグリーン'}, {from: 0, label: 'パープル'}]},
  // p.48 業務用バスマット 乾度良好Ag+：品番はなく、大きさごとの金額。4色（同じ行で色ちがい）
  {page: 48, order: '261-S0725', expect: ['261-S0725', '261-S0725', '261-S0725'], variants: [{from: 0, label: '50×80cm ブラウン'}, {from: 0, label: '50×80cm ベージュ'}, {from: 0, label: '50×80cm オレンジ'}, {from: 0, label: '50×80cm グリーン'}, {from: 1, label: '60×90cm ブラウン'}, {from: 1, label: '60×90cm ベージュ'}, {from: 1, label: '60×90cm オレンジ'}, {from: 1, label: '60×90cm グリーン'}, {from: 2, label: '90×120cm ブラウン'}, {from: 2, label: '90×120cm ベージュ'}, {from: 2, label: '90×120cm オレンジ'}, {from: 2, label: '90×120cm グリーン'}]},
  // p.48 お風呂ピタットシート：品番はなく、1号・2号ごとの金額。4色の色見本
  {page: 48, order: '261-S0146', expect: ['261-S0146', '261-S0146'], variants: [{from: 0, label: '1号 同色12枚入 幅5×長さ20cm×厚さ0.2cm ブルー'}, {from: 0, label: '1号 同色12枚入 幅5×長さ20cm×厚さ0.2cm ピンク'}, {from: 0, label: '1号 同色12枚入 幅5×長さ20cm×厚さ0.2cm グリーン'}, {from: 0, label: '1号 同色12枚入 幅5×長さ20cm×厚さ0.2cm オレンジ'}, {from: 1, label: '2号 同色4枚入 幅15×長さ30cm×厚さ0.2cm ブルー'}, {from: 1, label: '2号 同色4枚入 幅15×長さ30cm×厚さ0.2cm ピンク'}, {from: 1, label: '2号 同色4枚入 幅15×長さ30cm×厚さ0.2cm グリーン'}, {from: 1, label: '2号 同色4枚入 幅15×長さ30cm×厚さ0.2cm オレンジ'}]},
  // p.48 座・湯~マット：品番はなく、2色。各¥
  {page: 48, order: '261-S0877', expect: ['261-S0877'], variants: [{from: 0, label: 'イエロー'}, {from: 0, label: 'ライトブルー'}]},
  // p.49 入浴・シャワー用車いす：1つの品番にイエローとレッド。各¥
  {page: 49, order: '261-S0062', expect: ['KS2'], variants: [{from: 0, label: 'イエロー'}, {from: 0, label: 'レッド'}]},
  // p.49 シャワー用車いす：1つの品番にレッドとイエロー。各¥
  {page: 49, order: '261-S0059', expect: ['KS10'], variants: [{from: 0, label: 'レッド'}, {from: 0, label: 'イエロー'}]},
  // p.49 簡易シャワー用車いす：1つの品番にイエローとレッド。各¥
  {page: 49, order: '261-S0064', expect: ['KSC-2/ST'], variants: [{from: 0, label: 'イエロー'}, {from: 0, label: 'レッド'}]},
  // p.49 シャワー用車いす U型：色は写真の横の「イエロー」だけ
  {page: 49, order: '261-S0204', expect: ['KS11-PF/ST'], variants: [{from: 0, label: 'イエロー'}]},
  // p.49 シャワー用車いす：1つの品番（U型）にグリーンとイエロー。各¥
  {page: 49, order: '261-S0666', expect: ['KS12'], variants: [{from: 0, label: 'U型 グリーン'}, {from: 0, label: 'U型 イエロー'}]},
  // p.50 楽チル：「穴無しシート」（2行に割れているだけ）
  {page: 50, order: '261-S0732', expect: ['RT-005', 'RT-001', 'RT-003'], variants: [{from: 0, label: 'U型シート'}, {from: 1, label: 'O型シート'}, {from: 2, label: '穴無しシート'}]},
  // p.50 シャワーラク：「穴無しシート」（2行に割れているだけ）
  {page: 50, order: '261-S0366', expect: ['SWR-102', 'SWR-100', 'SWR-101'], variants: [{from: 0, label: 'U型シート'}, {from: 1, label: 'O型シート'}, {from: 2, label: '穴無しシート'}]},
  // p.50 シャワーラク4輪自在：「穴無しシート」（2行に割れているだけ）
  {page: 50, order: '261-S0598', expect: ['SWR-132', 'SWR-130', 'SWR-131'], variants: [{from: 0, label: 'U型シート'}, {from: 1, label: 'O型シート'}, {from: 2, label: '穴無しシート'}]},
  // p.51 新・入浴用キャリーベルト：ウエストは下のサイズ表（cm）
  {page: 51, order: '261-S0491', expect: ['000-7118', '000-7117', '000-7116'], variants: [{from: 0, label: 'S ウエスト50～70cm'}, {from: 1, label: 'M ウエスト60～100cm'}, {from: 2, label: 'L ウエスト80～120cm'}]},
  // p.51 入浴サポートクッションII：「ブルー」は 1126-A の写真の横だけ
  {page: 51, order: '261-S0854', expect: ['1126-A', '1126-B', '1126-C', '1126-E', '1126-F'], variants: [{from: 0, label: '枕型大 ブルー'}, {from: 1, label: '枕型小'}, {from: 2, label: '台形タイプ'}, {from: 3, label: 'マットタイプ'}, {from: 4, label: 'マットタイプ小'}]},
  // p.51 バスクッション ポコ：品番はなく、2色（ローズ・ブルー）。各¥
  {page: 51, order: '261-S1072', expect: ['261-S1072'], variants: [{from: 0, label: 'ローズ'}, {from: 0, label: 'ブルー'}]},
  // p.51 バスベーグルピロー：色は写真の横の「ピンク」だけ
  {page: 51, order: '261-S1196', expect: ['90656'], variants: [{from: 0, label: 'ピンク'}]},
  // p.137 スリムフレームウォーカー 固定型ハイモデル：色は写真の横の「シルバー」だけ
  {page: 137, order: '261-W2446', expect: ['WFS-4968HUL310'], variants: [{from: 0, label: 'シルバー'}]},
  // p.137 サニーウォーカーAW-RB：品番はなく、2つの柄。各¥
  {page: 137, order: '261-W2448', expect: ['261-W2448'], variants: [{from: 0, label: 'クラシックガーデン BK'}, {from: 0, label: 'チェック NB'}]},
  // p.137 サニーウォーカー SP(中)：品番はなく、4つの柄。各¥
  {page: 137, order: '261-W0476', expect: ['261-W0476'], variants: [{from: 0, label: 'フローラルBE'}, {from: 0, label: 'GCブルー'}, {from: 0, label: '格子NB'}, {from: 0, label: 'ダマスクピンク'}]},
  // p.137 サニーウォーカー AS-III：品番はなく、3つの柄。各¥
  {page: 137, order: '261-W1539', expect: ['261-W1539'], variants: [{from: 0, label: 'JB'}, {from: 0, label: '花柄ブラウン'}, {from: 0, label: '小花BK'}]},
  // p.137 サニーウォーカー AW-III：品番はなく、2つの柄。各¥
  {page: 137, order: '261-W0398', expect: ['261-W0398'], variants: [{from: 0, label: 'B ブラウン'}, {from: 0, label: 'CL ブラウン'}]},
  // p.153 SOFT-Gカーボン4点杖：色は写真の横の「ダークブルー」だけ
  {page: 153, order: '261-W2398', expect: ['640062'], variants: [{from: 0, label: 'ダークブルー'}]},
  // p.154 2ウェイステッキ：品番はなく、6つの色・柄（名前は2行に割れている）。各¥
  {page: 154, order: '261-W2280', expect: ['261-W2280'], variants: [{from: 0, label: 'ブラウン'}, {from: 0, label: 'ローズ赤'}, {from: 0, label: 'ダークグレー'}, {from: 0, label: 'すずらん'}, {from: 0, label: 'ツツジ青'}, {from: 0, label: 'コスモス青花'}]},
  // p.154 マグネシウム四点杖Neo：色は写真の横の「バーガンディ」だけ
  {page: 154, order: '261-W2917', expect: ['WB5324'], variants: [{from: 0, label: 'バーガンディ'}]},
  // p.174 さわやかチェア 泉II：「ブラウン」は 8253（肘掛け はね上げタイプ）の写真の横だけ（写真の横に色の名前のある品番だけに付ける。p.51・p.179 と同じ決まり）
  {page: 174, order: '261-T0666', expect: ['8252', '8253'], variants: [{from: 0, label: '標準 肘掛け 自在タイプ'}, {from: 1, label: '標準 肘掛け はね上げタイプ ブラウン'}]},
  // p.175 安寿 ポータブルトイレ ジャスピタ：色は写真の横の「ブラウン」だけ
  {page: 175, order: '261-T0818', expect: ['533-900', '533-901'], variants: [{from: 0, label: '標準タイプ ブラウン'}, {from: 1, label: 'ソフト便座タイプ ブラウン'}]},
  // p.179 安寿 ポータブルトイレ FX-CP“ちびくまくん”：色は写真の横の「ベージュ」だけ
  {page: 179, order: '261-T0043', expect: ['533-554', '533-550', '533-560'], variants: [{from: 0, label: '補高スペーサー無しタイプ ベージュ'}, {from: 1, label: '標準タイプ ベージュ'}, {from: 2, label: 'ソフト便座タイプ ベージュ'}]},
  // p.179 安寿 サニタリエース OD 両用式：表に色のないソフト便座・暖房便座は、写真の横に色の名前のある 533-323・871-025 だけ「アイボリー」
  {page: 179, order: '261-T0262', expect: ['533-304', '533-303', '871-031', '871-032', '533-323', '871-015', '871-018', '533-316', '871-025', '871-028'], variants: [{from: 0, label: '標準タイプ ライトブルー'}, {from: 1, label: '標準タイプ アイボリー'}, {from: 2, label: '標準タイプ 補高#5 アイボリー'}, {from: 3, label: '標準タイプ 補高#8 アイボリー'}, {from: 4, label: 'ソフト便座タイプ ノーマル アイボリー'}, {from: 5, label: 'ソフト便座タイプ 補高#5'}, {from: 6, label: 'ソフト便座タイプ 補高#8'}, {from: 7, label: '暖房便座タイプ ノーマル'}, {from: 8, label: '暖房便座タイプ 補高#5 アイボリー'}, {from: 9, label: '暖房便座タイプ 補高#8'}]},
  // p.214 ダンスロープミニ：色は写真の横の「ブラウン」だけ
  {page: 214, order: '261-R1043', expect: ['04740', '04741', '04742', '04743', '04744', '04745', '04746', '04747', '04748', '04802', '04803'], variants: [{from: 0, label: 'R-7610M 奥行4.1×高さ1.0cm ブラウン'}, {from: 1, label: 'R-7615M 奥行6.1×高さ1.5cm ブラウン'}, {from: 2, label: 'R-7620M 奥行8.1×高さ2.0cm ブラウン'}, {from: 3, label: 'R-7625M 奥行10.1×高さ2.5cm ブラウン'}, {from: 4, label: 'R-7630M 奥行12.1×高さ3.0cm ブラウン'}, {from: 5, label: 'R-7635M 奥行14.1×高さ3.5cm ブラウン'}, {from: 6, label: 'R-7640M 奥行16.1×高さ4.0cm ブラウン'}, {from: 7, label: 'R-7645M 奥行18.1×高さ4.5cm ブラウン'}, {from: 8, label: 'R-7650M 奥行20.6×高さ5.0cm ブラウン'}, {from: 9, label: 'R-7655M 奥行20.0×高さ5.5cm ブラウン'}, {from: 10, label: 'R-7660M 奥行20.0×高さ6.0cm ブラウン'}]},
  // p.214 木製 滑りにくいスロープ：1つの品番に3色（ライトオーク・クリアー・ダーク）。各¥
  {page: 214, order: '261-R0356', expect: ['S-14', 'S-19', 'S-24', 'S-29', 'S-34', 'S-39', 'S-44', 'S-49', 'S-54', 'S-59'], variants: [{from: 0, label: '奥行6×高さ1.4cm ライトオーク'}, {from: 0, label: '奥行6×高さ1.4cm クリアー'}, {from: 0, label: '奥行6×高さ1.4cm ダーク'}, {from: 1, label: '奥行7.5×高さ1.9cm ライトオーク'}, {from: 1, label: '奥行7.5×高さ1.9cm クリアー'}, {from: 1, label: '奥行7.5×高さ1.9cm ダーク'}, {from: 2, label: '奥行10×高さ2.4cm ライトオーク'}, {from: 2, label: '奥行10×高さ2.4cm クリアー'}, {from: 2, label: '奥行10×高さ2.4cm ダーク'}, {from: 3, label: '奥行12×高さ2.9cm ライトオーク'}, {from: 3, label: '奥行12×高さ2.9cm クリアー'}, {from: 3, label: '奥行12×高さ2.9cm ダーク'}, {from: 4, label: '奥行13×高さ3.4cm ライトオーク'}, {from: 4, label: '奥行13×高さ3.4cm クリアー'}, {from: 4, label: '奥行13×高さ3.4cm ダーク'}, {from: 5, label: '奥行14.5×高さ3.9cm ライトオーク'}, {from: 5, label: '奥行14.5×高さ3.9cm クリアー'}, {from: 5, label: '奥行14.5×高さ3.9cm ダーク'}, {from: 6, label: '奥行16×高さ4.4cm ライトオーク'}, {from: 6, label: '奥行16×高さ4.4cm クリアー'}, {from: 6, label: '奥行16×高さ4.4cm ダーク'}, {from: 7, label: '奥行17.5×高さ4.9cm ライトオーク'}, {from: 7, label: '奥行17.5×高さ4.9cm クリアー'}, {from: 7, label: '奥行17.5×高さ4.9cm ダーク'}, {from: 8, label: '奥行19×高さ5.4cm ライトオーク'}, {from: 8, label: '奥行19×高さ5.4cm クリアー'}, {from: 8, label: '奥行19×高さ5.4cm ダーク'}, {from: 9, label: '奥行21×高さ5.9cm ライトオーク'}, {from: 9, label: '奥行21×高さ5.9cm クリアー'}, {from: 9, label: '奥行21×高さ5.9cm ダーク'}]},
];

/** 商品に当たる直し（ページ・注文番号・読み取った品番の並びが同じもの） */
export const fixFor = (p: Pick<CatalogProduct, 'page' | 'variants'>): CatalogFix | undefined =>
  CATALOG_FIXES.find(
    (f) => f.page === p.page && p.variants.some((v) => v.orderCode === f.order) && f.expect.length === p.variants.length && f.expect.every((c, i) => p.variants[i].code === c),
  );

/** 直しを当てた品番の並び（当たらなければそのまま） */
export function applyFix(p: CatalogProduct): CatalogVariant[] {
  const f = fixFor(p);
  if (!f) return p.variants;
  return f.variants.map((v) => {
    const base = p.variants[v.from];
    return {...base, code: v.code ?? base.code, label: v.label, tais: v.tais ?? base.tais};
  });
}
