import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { precompressedAssets } from './tools/precompressed-assets.mjs';
export default defineConfig({
  // Harness and Development can mount editors on the same page. Share the
  // parsers and Tag identities as well as the EditorState and EditorView.
  resolve: {dedupe: ['react', 'react-dom', 'antd', '@ant-design/icons',
    '@codemirror/autocomplete', '@codemirror/commands', '@codemirror/lang-css',
    '@codemirror/lang-html', '@codemirror/lang-javascript', '@codemirror/lang-json',
    '@codemirror/lang-markdown', '@codemirror/lang-sql', '@codemirror/lang-yaml',
    '@codemirror/language', '@codemirror/lint', '@codemirror/merge',
    '@codemirror/search', '@codemirror/state', '@codemirror/streamparser',
    '@codemirror/view', '@lezer/common', '@lezer/css',
    '@lezer/highlight', '@lezer/html', '@lezer/javascript',
    '@lezer/json', '@lezer/lr', '@lezer/markdown',
    '@lezer/yaml', 'codemirror',
  ]},
  plugins: [
    react(),
    precompressedAssets(),
  ],
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
