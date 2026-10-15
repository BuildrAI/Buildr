import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from '/Users/chenjun/workspaces/BuildrAI/Buildr/projects/product/services/buildr-web/node_modules/vite/dist/node/index.js';
const root=import.meta.dirname,output=path.resolve(root,'..');
const work='/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance';
const web=work+'/projects/product/services/buildr-web';
const webInstalled='/Users/chenjun/workspaces/BuildrAI/Buildr/projects/product/services/buildr-web';
const dsh='/Users/chenjun/workspaces/BuildrAI/Buildr/projects/product/services/dsh-plugin/build/dsh-0.2.0-rc.1';
const fromWeb=createRequire(webInstalled+'/package.json');
const fromDsh=createRequire(dsh+'/packages/client/ui-primitives/package.json');
const sources=new Set();
async function bundle(entry,define={}) {
 const result=await build({root:webInstalled,configFile:false,plugins:[{name:'owned-offline-source',async resolveId(id,importer){
  if(id==='@deepseek-ai/dsh-util-code-language')return root+'/vendor/dsh-util-code-language.js';
  if(id==='@deepseek-ai/dsh-util-workspace-path')return root+'/vendor/dsh-util-workspace-path.js';
  if(id==='@deepseek-ai/dsh-client-store')return root+'/vendor/unused-client-store.js';
  if(importer?.startsWith(work+'/')&&!id.startsWith('.')&&!id.startsWith('/')&&!id.startsWith('\0')){
   const webResult=await this.resolve(id,webInstalled+'/src/main.tsx',{skipSelf:true});if(webResult)return webResult;
   const dshResult=await this.resolve(id,dsh+'/packages/client/ui-primitives/src/index.ts',{skipSelf:true});if(dshResult)return dshResult;
  }
 },transform(_code,id){if(id.startsWith(work+'/')||id.includes('/ui-prototype/assets/'))sources.add(id.split('?')[0]);}}],esbuild:{jsx:'automatic'},build:{write:false,minify:true,assetsInlineLimit:Infinity,target:'es2022',lib:{entry:root+'/'+entry,name:'BuildrSourcePrototype',formats:['iife']},rollupOptions:{onwarn(warning,warn){if(warning.code!=='MODULE_LEVEL_DIRECTIVE')warn(warning);},output:{inlineDynamicImports:true}}},define:{'process.env.NODE_ENV':'"production"',...define}});
 const assets=(Array.isArray(result)?result:[result]).flatMap(item=>item.output);
 await fs.writeFile(root+'/module-size-observation.json',JSON.stringify(assets.filter(item=>item.type==='chunk').flatMap(item=>Object.entries(item.modules).map(([id,info])=>({id,rendered:info.renderedLength}))).sort((a,b)=>b.rendered-a.rendered).slice(0,30),null,2)+'\n');
 return {js:assets.filter(item=>item.type==='chunk').map(item=>item.code).join('\n'),css:assets.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>item.source).join('\n')};
}
const metadata=JSON.parse(await fs.readFile(root+'/scenes.json','utf8'));
function html(title,assets,discoverable=true){return '<!doctype html>\n'+(discoverable?'<!-- buildr:ui-prototype -->\n':'<!-- Standalone reader only: deliberately not a discoverable task prototype. -->\n')+'<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+(discoverable?'<script id="buildr-prototype" type="application/json">'+JSON.stringify(metadata).replaceAll('<','\\u003c')+'</script>':'')+'<style>'+assets.css.replaceAll('</style','<\\/style')+'</style></head><body><div id="root"></div><script>'+assets.js.replaceAll('</script','<\\/script')+'</script></body></html>\n';}
const mainAssets=await bundle('Scene.tsx');console.log(JSON.stringify({mainJs:Buffer.byteLength(mainAssets.js),mainCss:Buffer.byteLength(mainAssets.css)}));
const scene=html('DSH 来源与 Buildr 内容对象',mainAssets);
if(Buffer.byteLength(scene)>2*1024*1024)throw Error('Task prototype exceeds 2 MiB; reduce safe dependencies, not the product limit.');
await fs.writeFile(output+'/buildr-source.html',scene);
const preview=html('DSH 来源原型 · 独立阅读器',await bundle('reader.tsx',{'__SCENE_HTML__':JSON.stringify(scene)}),false);
await fs.writeFile(root+'/reader-preview.htm',preview);
const audit={status:'generated',task:'dsh-buildr-provenance',change:'add-dsh-buildr-provenance',productCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:work,encoding:'utf8'}).trim(),productUncommittedSummary:execFileSync('git',['status','--short'],{cwd:work,encoding:'utf8'}).trim(),scope:'Only this change/prototypes; no product source/runtime/plugin changes.',dshVersion:'0.2.0-rc.2',prototypeOnlySeams:['Actual original TrajectoryTable colgroup/thead/td/colSpan source was extended in owned offline copy.','Original Inspector functions/tabs remain; a simulated content-object tab was appended.','Temporary factory prototype exports and primitive export pruning are not public production APIs.','Clipboard uses in-memory mock; no real backend, file navigation, activation or ownership query.','KaTeX font CSS excluded: math rendering appearance is outside these fixtures.','Lazy syntax grammar catalog omitted in the owned primitive copy; original boot grammars JSON/TS/shell and original plain-text fallback remain; other code languages not validated.','Current versus historical bodies and scope/source evidence are fixtures, not new live APIs.','Record index is the stable allRows fixture identity, not a persistent seq locator.'],legacy:JSON.parse(await fs.readFile(root+'/legacy-observation.json','utf8')).legacy,bytes:{taskPrototype:Buffer.byteLength(scene),standaloneReader:Buffer.byteLength(preview)},sources:await Promise.all([...sources].sort().map(async filename=>({path:filename,sha256:crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex')})))};
await fs.writeFile(output+'/build-observation.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({main:output+'/buildr-source.html',mainBytes:Buffer.byteLength(scene),reader:root+'/reader-preview.htm',readerBytes:Buffer.byteLength(preview),pages:metadata.pages.length}));
