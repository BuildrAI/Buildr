import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { precompressedAssets } from './tools/precompressed-assets.mjs';

export default defineConfig({
  plugins: [react(), precompressedAssets()],
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
});
