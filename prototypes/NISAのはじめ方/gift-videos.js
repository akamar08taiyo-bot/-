/*
  特典2「ゼロからわかる NISA完全攻略ガイド」の動画（3章）
  入口の特典2と、特典の一覧の「動画で見る」から開く再生画面（video.js）で使う。下の章ボタンで切り替え、1章が終わると次の章へ進む。
  ・src    … サイトに置いた動画ファイル（videos/ に、届いた3本をそのままの名前で置く）
  ・poster … 再生前に見せる表紙の画像
  動画を外すときは chapters を空にして、build_pages.py の GUIDE_VIDEO を False にする（「動画で見る」が「準備中」に戻る）。
  プレビューでは、置ける大きさの上限のため、1章を3つに分けたファイル（gift-videos.preview.js）を使う。
*/
window.OKANE_GUIDE_VIDEOS = {
  title: 'ゼロからわかる NISA完全攻略ガイド',
  chapters: [
    { label: '第1章', name: 'しくみと準備', src: 'videos/nisa_ch1_720.mp4', poster: 'videos/nisa_ch1.jpg', length: '10分17秒' },
    { label: '第2章', name: '何を、いくら買う？', src: 'videos/nisa_ch2_720.mp4', poster: 'videos/nisa_ch2.jpg', length: '9分23秒' },
    { label: '第3章', name: '続け方・守り方・使い方', src: 'videos/nisa_ch3_720.mp4', poster: 'videos/nisa_ch3.jpg', length: '12分42秒' }
  ]
};
