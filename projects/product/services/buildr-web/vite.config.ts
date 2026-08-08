import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../buildr/src/interfaces/local-app/web-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
