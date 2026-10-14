import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FaxApp} from './FaxApp';
import '../index.css';
import './fax.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FaxApp />
  </StrictMode>,
);
