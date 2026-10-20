import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '../sasaoka.css';
import EstimateApp from './EstimateApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EstimateApp />
  </StrictMode>,
);
