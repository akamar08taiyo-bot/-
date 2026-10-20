/** 公開した版の印（ビルドした日時。vite.version.ts）。テストなど Vite を通さないときはない */
declare const __APP_BUILD__: string;

// pdf.js の legacy 版（型定義がないファイル）を読み込むための宣言。型は pdfjs-dist 本体のものを使う
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs';
