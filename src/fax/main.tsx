import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FaxApp} from './FaxApp';
// 印刷用の代わりの書体（HG丸ゴシックM-PRO・ＭＳ 明朝が入っていないパソコン向け）。
// 文字の範囲ごとに分かれていて、使った文字の分だけ読み込まれる
import '@fontsource/kosugi-maru/400.css';
import '@fontsource/biz-udmincho/400.css';
import '../index.css';
import './fax.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaxApp />
  </StrictMode>,
);
