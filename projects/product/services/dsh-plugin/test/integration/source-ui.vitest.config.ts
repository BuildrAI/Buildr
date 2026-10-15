/** Run only the plugin-owned native composition fixture against an explicit prepared SDK. */
import path from 'node:path';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const sdk=process.env.BUILDR_DSH_SOURCE_UI_SDK_ROOT;
const consumer=process.env.BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT;
if(sdk===undefined||consumer===undefined)throw Error('Exact prepared SDK and generated consumer paths are required.');
const require=createRequire(path.join(sdk,'node_modules/.pnpm/node_modules/toolchain.cjs'));
const {defineConfig}=await import(require.resolve('vitest/config'));
const tsconfigPaths=(await import(require.resolve('vite-tsconfig-paths'))).default;
const {standardDecoratorPlugin}=await import(path.join(sdk,'vitest.shared.ts'));
const sharedAlias=['@testing-library/react','react','react/jsx-runtime','react/jsx-dev-runtime','react-dom','react-dom/client'].map(id=>({find:new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),replacement:require.resolve(id)}));
const ts=require('typescript');
const paths=ts.readConfigFile(path.join(sdk,'tsconfig.base.json'),file=>fs.readFileSync(file,'utf8')).config.compilerOptions.paths;
const sdkAlias=Object.entries(paths).sort(([left],[right])=>right.length-left.length).map(([id,targets])=>({find:new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace('\\*','(.+)')+'$'),replacement:path.resolve(sdk,(targets as string[])[0]!).replace('*','$1')}));
export default defineConfig({root:sdk,resolve:{alias:[{find:/^@deepseek-ai\/dsh-client-ui-trajectory\/src\/(.+)$/,replacement:path.join(sdk,'packages/client/ui-trajectory/src/$1')},...sdkAlias,...sharedAlias,{find:/^zod$/,replacement:createRequire(path.join(sdk,'packages/api/remotes/package.json')).resolve('zod')}],dedupe:['react','react-dom']},plugins:[tsconfigPaths({projects:[path.join(sdk,'tsconfig.base.json')]}),standardDecoratorPlugin(),{name:'buildr-generated-remote',resolveId(id,importer){if(id==='../lib/typert.remote-client.js'&&importer?.endsWith('/plugin/src/client.tsx'))return path.join(consumer,'lib/typert.remote-client.js');}}],test:{include:[path.resolve(import.meta.dirname,'source-ui.client.spec.tsx')],environment:'jsdom',setupFiles:[path.join(sdk,'scripts/test-dom-environment.ts')],testTimeout:15000,hookTimeout:15000,maxWorkers:1,execArgv:['--max-old-space-size=2048']}});
