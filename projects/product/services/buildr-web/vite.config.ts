import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { precompressedAssets } from './tools/precompressed-assets.mjs';
import { developmentApiProxy, developmentSessionPlugin } from '../buildr/tools/development/dev-web-session.ts';

const environment = (globalThis as any).process?.env ?? {};
const developmentHostUrl = environment.BUILDR_DEV_HOST_URL;
const developmentHarnessUrl = environment.BUILDR_DEV_HARNESS_URL;

export default defineConfig(({ command }) => ({
  resolve:{dedupe:['react','react-dom','antd','@ant-design/icons']},
  plugins: [
    react(),
    precompressedAssets(),
    ...(command === 'serve' && developmentHostUrl ? [developmentSessionPlugin({ hostUrl: developmentHostUrl, profile: 'development', replacePlaceholders: true })] : []),
  ],
  ...(command === 'serve' && developmentHostUrl ? {
    server: {
      strictPort: true,
      proxy: {
        '/api': developmentApiProxy(developmentHostUrl),
        ...(developmentHarnessUrl ? {
          '/harness': { target: developmentHarnessUrl, changeOrigin: true, ws: true },
        } : {}),
      },
    },
  } : {}),
  build: {
    outDir: '../buildr/web-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        main: 'index.html',
        mermaid: 'mermaid-renderer.html',
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
}));
