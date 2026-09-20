import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MortgageApp} from './MortgageApp';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MortgageApp />
  </StrictMode>,
);
