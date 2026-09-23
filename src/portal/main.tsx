import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {PortalApp} from './PortalApp';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalApp />
  </StrictMode>,
);
