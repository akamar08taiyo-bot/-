/*
  プレビュー用（build_all.py が、プレビューのフォルダにだけ gift-videos.js という名前で置く）。
  プレビューは1ファイル15MBまでしか置けないので、1章を3つに分けたファイル（guide_split.py で作り直さずに分けたもの）を順に続けて再生する。
  実際のサイトでは gift-videos.js（1章1ファイル）を使う。
*/
window.OKANE_GUIDE_VIDEOS = {
  title: 'ゼロからわかる NISA完全攻略ガイド',
  chapters: [
    { label: '第1章', name: 'しくみと準備', src: ['videos/nisa_ch1_720_1.mp4', 'videos/nisa_ch1_720_2.mp4', 'videos/nisa_ch1_720_3.mp4'], poster: 'videos/nisa_ch1.jpg', length: '10分17秒' },
    { label: '第2章', name: '何を、いくら買う？', src: ['videos/nisa_ch2_720_1.mp4', 'videos/nisa_ch2_720_2.mp4', 'videos/nisa_ch2_720_3.mp4'], poster: 'videos/nisa_ch2.jpg', length: '9分23秒' },
    { label: '第3章', name: '続け方・守り方・使い方', src: ['videos/nisa_ch3_720_1.mp4', 'videos/nisa_ch3_720_2.mp4', 'videos/nisa_ch3_720_3.mp4'], poster: 'videos/nisa_ch3.jpg', length: '12分42秒' }
  ]
};
