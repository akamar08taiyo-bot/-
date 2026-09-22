import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {VideoApp} from './VideoApp';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VideoApp />
  </StrictMode>,
);
