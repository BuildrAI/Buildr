import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { App } from './App';
import { ConfirmModalHost } from './lib/ConfirmModalHost';
import { softProductTheme } from './theme';
import 'antd/dist/reset.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');

// Production Buildr Web hosts a single long-lived shell; avoid StrictMode double-mount
// races with imperative legacy page renderers under browser smoke.
createRoot(root).render(
  <ConfigProvider
    locale={zhCN}
    theme={{ ...softProductTheme, cssVar: true, hashed: false }}
    wave={{ disabled: true }}
  >
    <AntdApp>
      <ConfirmModalHost />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AntdApp>
  </ConfigProvider>,
);
