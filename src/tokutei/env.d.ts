/** 公開した版の印（ビルドした日時。vite.tokutei.config.ts）。テストなど Vite を通さないときはない */
declare const __APP_BUILD__: string;

// pdf.js の legacy 版（型定義がないファイル）を読み込むための宣言。型は pdfjs-dist 本体のものを使う
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs';

// 申請書の原本（src/tokutei/shinsei/）。?inline で中身をアプリの中に入れる（1つの HTML で動くように）
declare module '*.xltx?inline' {
  const src: string;
  export default src;
}
declare module '*.xlsx?inline' {
  const src: string;
  export default src;
}
