import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base:'./',
  plugins:[react()],
  resolve:{dedupe:['react','react-dom','antd','@ant-design/icons']},
  build:{outDir:'dist',emptyOutDir:true,rollupOptions:{input:{main:'index.html',mermaid:'mermaid-renderer.html'}}},
});
