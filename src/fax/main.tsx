import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FaxApp} from './FaxApp';
// 印刷用の書体。オリジナルデザインのBIZ UDPゴシックと、HG丸ゴシックM-PRO・ＭＳ 明朝が入っていない
// パソコン向けの代わりの書体。文字の範囲ごとに分かれていて、使った文字の分だけ読み込まれる
import '@fontsource/biz-udpgothic/400.css';
import '@fontsource/biz-udpgothic/700.css';
import '@fontsource/kosugi-maru/400.css';
import '@fontsource/biz-udmincho/400.css';
import '../index.css';
import './fax.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaxApp />
  </StrictMode>,
);
