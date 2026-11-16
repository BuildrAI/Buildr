import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {developmentApiProxy, developmentSessionPlugin} from '../buildr/tools/development/dev-web-session.ts';

const environment=(globalThis as any).process?.env??{};
const developmentHostUrl=environment.BUILDR_DEV_HOST_URL;
const developmentWebPort=Number(environment.BUILDR_DEV_HARNESS_WEB_PORT||5174);

export default defineConfig(({command})=>({
  base:command==='serve'?'/harness/':'./',
  plugins:[react(),...(command==='serve'&&developmentHostUrl?[developmentSessionPlugin({hostUrl:developmentHostUrl,profile:'development-harness'})]:[])],
  resolve:{dedupe:['react','react-dom','antd','@ant-design/icons']},
  ...(command==='serve'&&developmentHostUrl?{server:{
    strictPort:true,
    hmr:{host:'127.0.0.1',clientPort:developmentWebPort,protocol:'ws'},
    proxy:{'/api':developmentApiProxy(developmentHostUrl)},
  }}:{}),
  build:{outDir:'dist',emptyOutDir:true,rollupOptions:{input:{main:'index.html',mermaid:'mermaid-renderer.html'}}},
}));
