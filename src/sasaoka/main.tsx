import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './noZoom.ts';
import App from './App.tsx';
import './sasaoka.css';
import {StartupGuard} from './components/StartupGuard.tsx';

// 太陽ポータルの sasaoka/（もとの「仕切り計算・請求書作成」）：「工務店請求書を確認する」から開く
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StartupGuard>
      <App start="invoice" />
    </StartupGuard>
  </StrictMode>,
);
