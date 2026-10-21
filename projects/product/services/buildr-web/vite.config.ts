import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DEVELOPMENT_TARGET = process.env.BUILDR_WEB_DEV_TARGET || 'http://127.0.0.1:4458';

function readMeta(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<meta\\b[^>]*\\bname=["']${escaped}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i').exec(html)?.[1]
    ?? new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bname=["']${escaped}["']`, 'i').exec(html)?.[1]
    ?? null;
}

/** 开发服务器从运行中的 Buildr Web 读取会话元数据，使页面与接口代理使用同一实例。 */
function buildrDevelopmentSession(): Plugin {
  let warn: ((message: string) => void) | null = null;
  const emptySession = (html: string) => html
    .replace('__BUILDR_SESSION_TOKEN__', '')
    .replace('__BUILDR_PREVIEW_IDENTITY__', '')
    .replace('__BUILDR_WEB_PROFILE__', 'development');
  return {
    name: 'buildr-development-session',
    apply: 'serve',
    configureServer(server) {
      warn = message => server.config.logger.warn(message);
      server.config.logger.info(`Buildr Web 开发服务器：接口代理与会话来源 ${DEVELOPMENT_TARGET}。`);
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        let source: string;
        try {
          const response = await fetch(DEVELOPMENT_TARGET, { cache: 'no-store' });
          if (!response.ok) {
            warn?.(`无法从 ${DEVELOPMENT_TARGET} 读取会话（HTTP ${response.status}），页面将以空会话启动。`);
            return emptySession(html);
          }
          source = await response.text();
        } catch {
          warn?.(`无法连接 ${DEVELOPMENT_TARGET}，页面将以空会话启动；请先运行 buildr web。`);
          return emptySession(html);
        }
        const session = readMeta(source, 'buildr-session');
        if (!session) {
          warn?.(`${DEVELOPMENT_TARGET} 未返回会话令牌，页面将以空会话启动。`);
          return emptySession(html);
        }
        return html
          .replace('__BUILDR_SESSION_TOKEN__', session)
          .replace('__BUILDR_PREVIEW_IDENTITY__', readMeta(source, 'buildr-preview') ?? '')
          .replace('__BUILDR_WEB_PROFILE__', readMeta(source, 'buildr-web-profile') || 'development');
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), buildrDevelopmentSession()],
  server: {
    proxy: {
      '/api': { target: DEVELOPMENT_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: '../buildr/web-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
});
