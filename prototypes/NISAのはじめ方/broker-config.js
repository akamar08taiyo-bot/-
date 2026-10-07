/*
  証券会社の設定ファイル
  ここを書き換えるだけで、「証券会社診断」と「申し込みサポート」の両方に反映されます。

  ・active   … 紹介する会社だけ true にします（ASPで提携が承認された会社）。
  ・applyUrl … ASPで発行された広告リンクを、そのまま貼ります（短縮・改変しない）。
               空のときは officialUrl（公式サイト）に飛び、「PR」の表示も出ません。
  ・並び順    … 入口の「おすすめの証券会社」の順番です（上から3社を出し、残りは「ほかの◯社」にまとめます）。
               証券会社診断で点数が同じときも、上にある会社を表示します。決め方は README にあります。
  ・cards / points / styles … 下の一覧の id から選びます。
  ・notes    … 申し込みサポートの「この会社のポイント」に出す短いメモ（任意）。公式の案内を見て書いてください。
  ・video    … 口座の作り方（申し込み方法）の動画。入れると、入口の一覧・診断の結果・申し込みサポートに
               「口座の作り方を動画で見る」が出ます。空のあいだは出ません。videoLength は「6分15秒」のような長さ（なくてもよい）。
               サイトに置いた動画ファイル（例：videos/sbi.mp4）なら、ページの中で再生します（診断の結果ではその場で、
               入口と申し込みサポートでは押すと再生画面が開く）。videoPoster は再生前に見せる表紙の画像。
               YouTube の URL を入れたときは、YouTube が新しいタブで開きます（サイトの決まりで、ページの中には埋め込めないため）。
               今の videos/ の3本は、ショート動画作成のセッションで作った 楽天証券編・SBI証券編・三菱UFJ eスマート証券編 です。
               サイト用に、YouTube向けの「口座を開くページは、概要欄のリンクから」の場面（3〜4秒）だけを抜いてあります。
  ・videoSoon … 動画はできているが、まだ video を入れていない会社は true。診断の結果に「動画は準備中」と出ます。

  クレカ積立の組み合わせは 2026年10月5日時点の解説記事で確認したものです。
  公開する前に、各社の公式サイトで最新の条件を確かめてください。
*/
window.OKANE_CHOOSER = {
  checkedAt: '2026年10月5日',
  cards: [
    { id: 'smbc', label: '三井住友カード（Oliveを含む）' },
    { id: 'rakuten', label: '楽天カード' },
    { id: 'd', label: 'dカード' },
    { id: 'aupay', label: 'au PAYカード' },
    { id: 'paypay', label: 'PayPayカード' },
    { id: 'epos', label: 'エポスカード' },
    { id: 'jcb', label: 'JCBカード' },
    { id: 'none', label: 'その他・持っていない' }
  ],
  points: [
    { id: 'rakuten', label: '楽天市場（楽天ポイント）' },
    { id: 'v', label: 'コンビニや飲食店（Vポイント）' },
    { id: 'd', label: 'ドコモ（dポイント）' },
    { id: 'ponta', label: 'au（Pontaポイント）' },
    { id: 'paypay', label: 'PayPay・Yahoo!ショッピング' },
    { id: 'epos', label: 'マルイ（エポスポイント）' },
    { id: 'none', label: 'Amazon・特にない' }
  ],
  styles: [
    { id: 'points', label: 'ポイントをためたい' },
    { id: 'lineup', label: '商品をたくさん比べて選びたい' },
    { id: 'simple', label: 'とにかくシンプルに始めたい' }
  ],
  brokers: [
    {
      id: 'esmart', name: '三菱UFJ eスマート証券', active: true,
      applyUrl: '', officialUrl: 'https://kabu.com/',
      cards: ['aupay'], points: ['ponta'], styles: [],
      cardText: 'au PAYカード・三菱UFJカード', pointText: 'Pontaポイントなど',
      notes: [],
      video: 'videos/esmart.mp4', videoPoster: 'videos/esmart.jpg', videoLength: '6分'
    },
    {
      id: 'matsui', name: '松井証券', active: true,
      applyUrl: '', officialUrl: 'https://www.matsui.co.jp/',
      cards: ['jcb'], points: [], styles: [],
      cardText: 'JCBカード', pointText: '',
      notes: [],
      video: '', videoLength: ''
    },
    {
      id: 'rakuten', name: '楽天証券', active: true,
      applyUrl: '', officialUrl: 'https://www.rakuten-sec.co.jp/',
      cards: ['rakuten'], points: ['rakuten'], styles: ['lineup'],
      cardText: '楽天カード', pointText: '楽天ポイント',
      notes: [],
      video: 'videos/rakuten.mp4', videoPoster: 'videos/rakuten.jpg', videoLength: '6分23秒'
    },
    {
      id: 'sbi', name: 'SBI証券', active: true,
      applyUrl: '', officialUrl: 'https://www.sbisec.co.jp/',
      cards: ['smbc', 'jcb'], points: ['v'], styles: ['lineup'],
      cardText: '三井住友カード・JCBカードなど', pointText: 'Vポイントなど',
      notes: [],
      video: 'videos/sbi.mp4', videoPoster: 'videos/sbi.jpg', videoLength: '6分15秒'
    },
    {
      id: 'monex', name: 'マネックス証券', active: true,
      applyUrl: '', officialUrl: 'https://www.monex.co.jp/',
      cards: ['d', 'jcb'], points: ['d'], styles: ['lineup'],
      cardText: 'dカード・マネックスカード・JCBカードなど', pointText: 'dポイントなど',
      notes: [],
      video: '', videoLength: ''
    },
    {
      id: 'paypay', name: 'PayPay証券', active: true,
      applyUrl: '', officialUrl: 'https://www.paypay-sec.co.jp/',
      cards: ['paypay'], points: ['paypay'], styles: ['simple'],
      cardText: 'PayPayカード', pointText: 'PayPayポイント',
      notes: [],
      video: '', videoLength: ''
    },
    {
      id: 'tsumiki', name: 'tsumiki証券', active: true,
      applyUrl: '', officialUrl: 'https://www.tsumiki-sec.com/',
      cards: ['epos'], points: ['epos'], styles: ['simple'],
      cardText: 'エポスカード', pointText: 'エポスポイント',
      notes: [],
      video: '', videoLength: ''
    }
  ]
};
