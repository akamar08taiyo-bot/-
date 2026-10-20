import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from '../App.tsx';
import '../sasaoka.css';

// 太陽ポータルの jutaku-mitsumori/（もとの「住宅改修 見積書作成」）：「見積もりを作成する」から開く
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App start="estimate" />
  </StrictMode>,
);
