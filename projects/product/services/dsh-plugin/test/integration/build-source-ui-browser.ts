/** Build a network-free, single-file browser fixture using existing SDK dependencies and exact Client artifacts. */
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createSdkRequire} from '../../tools/sdk-require.ts';
const sdk=process.env.BUILDR_DSH_SOURCE_UI_SDK_ROOT,release=process.env.BUILDR_DSH_SOURCE_UI_RELEASE_CLIENT,dev=process.env.BUILDR_DSH_SOURCE_UI_DEV_CLIENT;
if(sdk===undefined||release===undefined||dev===undefined)throw Error('Exact SDK and both successful Client artifact paths are required');
for(const file of [release,dev])if(!(await fs.stat(file)).isFile())throw Error('Client artifact is not a regular file: '+file);
const require=createSdkRequire(sdk),hoisted=createRequire(path.join(sdk,'node_modules/.pnpm/node_modules/fixture.cjs'));
const {build}=await import(require.resolve('vite'));
const {standardDecoratorPlugin}=await import(path.join(sdk,'vitest.shared.ts'));
const ts=require('typescript');
const paths=ts.readConfigFile(path.join(sdk,'tsconfig.base.json'),ts.sys.readFile).config.compilerOptions.paths;
const escapes=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sdkAlias=Object.entries(paths).sort(([left],[right])=>right.length-left.length).map(([id,targets])=>({find:new RegExp('^'+escapes(id).replace('\\*','(.+)')+'$'),replacement:path.resolve(sdk,(targets as string[])[0]!).replace('*','$1')}));
const alias=[
 ...['ui-trajectory','ui-theme'].map(name=>({find:new RegExp('^@deepseek-ai/dsh-client-'+name+'/src/(.+)$'),replacement:path.join(sdk,'packages/client/'+name+'/src/$1')})),
 {find:/^@deepseek-ai\/dsh-client-test-runtime\/src\/(.+)$/,replacement:path.join(sdk,'packages/test-support/client-runtime/src/$1')},
 {find:'buildr-release-artifact?raw',replacement:release+'?raw'},{find:'buildr-dev-artifact?raw',replacement:dev+'?raw'},...sdkAlias,
 ...['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom','react-dom/client'].map(id=>({find:new RegExp('^'+escapes(id)+'$'),replacement:hoisted.resolve(id)})),
 {find:/^zod$/,replacement:createRequire(path.join(sdk,'packages/api/remotes/package.json')).resolve('zod')},
];
const out=path.resolve(import.meta.dirname,'../../build/source-ui-browser');await fs.mkdir(out,{recursive:true});
await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},root:import.meta.dirname,resolve:{alias,dedupe:['react','react-dom']},plugins:[standardDecoratorPlugin()],build:{outDir:out,emptyOutDir:false,minify:false,assetsInlineLimit:Infinity,lib:{entry:path.join(import.meta.dirname,'source-ui.browser.tsx'),name:'BuildrSourceCandidateFixture',formats:['iife'],fileName:()=> 'fixture.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
const outputs=await fs.readdir(out),css=outputs.filter(file=>file.endsWith('.css'));
const code=await fs.readFile(path.join(out,'fixture.js'),'utf8');
let html=await fs.readFile(path.join(import.meta.dirname,'source-ui.browser.html'),'utf8');
html=html.replace('<script type="module" src="./source-ui.browser.tsx"></script>',()=>'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
const inlineCss=(await Promise.all(css.map(file=>fs.readFile(path.join(out,file),'utf8')))).join('\n');
html=html.replace('</head>',()=>'<style>'+inlineCss+'</style></head>');
await fs.writeFile(path.join(out,'index.html'),html);
const inputFiles=[release,dev,...['SourceViews.tsx','source-reader.ts','styles.module.css'].map(file=>path.resolve(import.meta.dirname,'../../plugin/src',file))];
const inputs=await Promise.all(inputFiles.map(async file=>({path:file,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')})));
await fs.writeFile(path.join(out,'inputs.json'),JSON.stringify({sdk,clientArtifacts:inputs.slice(0,2),productionInputs:inputs.slice(2)},null,2)+'\n');
console.log('Offline real-framework fixture: '+path.join(out,'index.html'));
