import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');

// Production Local App hosts a single long-lived shell; avoid StrictMode double-mount
// races with imperative legacy page renderers under browser smoke.
createRoot(root).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
