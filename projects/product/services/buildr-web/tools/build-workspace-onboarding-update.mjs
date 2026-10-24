import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root=path.resolve(import.meta.dirname,'..');
const outputDirectory=process.argv[2];
if(!outputDirectory)throw Error('Provide an isolated output directory');
const sources=new Set();
const base={root,configFile:false,build:{write:false,minify:true,assetsInlineLimit:Infinity,rollupOptions:{onwarn(warning,warn){if(warning.code!=='MODULE_LEVEL_DIRECTIVE')warn(warning);},output:{inlineDynamicImports:true}}}};
async function bundle(entry,define={}) {
  const result=await build({...base,plugins:[{name:'source-observation',transform(_code,id){const file=id.split('?')[0];if(file.startsWith(root+'/src/')||file.includes('/ui-prototype/assets/'))sources.add(file);}}],define:{'process.env.NODE_ENV':'"production"',...define},build:{...base.build,lib:{entry:path.join(root,entry),name:'BuildrLifecyclePrototype',formats:['iife']}}});
  const chunks=(Array.isArray(result)?result:[result]).flatMap(r=>r.output);
  return {script:chunks.filter(c=>c.type==='chunk').map(c=>c.code).join('\n'),css:chunks.filter(c=>c.type==='asset'&&c.fileName.endsWith('.css')).map(c=>c.source).join('\n')};
}
const metadata=JSON.parse(await fs.readFile(path.join(root,'src/prototypes/workspace-onboarding-update/scenes.json'),'utf8'));
const bodyBundle=await bundle('src/prototypes/workspace-onboarding-update/main.tsx');
const sourceObservation={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checkout:path.resolve(root,'../../../..'),branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),uncommittedSummary:'本轮候选仅为可交互原型：提取共用 WorkspacesCatalogView 并保留正式默认行为，为 UpdateDialog 增加可选展示插槽，为正式原型阅读器增加可选的临时来源标签和显式切页重置。原型复用产品顶部栏、导航框架、目录卡片、更新窗口、主题、组成视图及正式原型阅读器；全部数据与业务副作用由内存演示提供。未实现或调用真实初始化、安装、空间写入与模型调用。',sources:await Promise.all([...sources].sort().map(async file=>({path:path.relative(root,file),sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')})))};
function document(title,bundle,head='') {return '<!doctype html>\n<!-- buildr:ui-prototype -->\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+head+'<style>'+bundle.css.replaceAll('</style','<\\/style')+'</style></head><body><div id="root"></div><script>'+bundle.script.replaceAll('</script','<\\/script')+'</script></body></html>\n';}
const dataTag=(id,data)=>'<script id="'+id+'" type="application/json">'+JSON.stringify(data).replaceAll('<','\\u003c')+'</script>';
const body=document('Buildr 添加与更新 · 交互原型',bodyBundle,dataTag('buildr-prototype',metadata)+dataTag('buildr-prototype-source',sourceObservation));
if(Buffer.byteLength(body)>2*1024*1024)throw Error('Prototype body exceeds 2 MiB');
await fs.mkdir(outputDirectory,{recursive:true});
await fs.writeFile(path.join(outputDirectory,'workspace-onboarding-update.html'),body);
const readerBundle=await bundle('src/prototypes/workspace-onboarding-update/viewer.tsx',{__PROTOTYPE_DOCUMENT_GZIP__:JSON.stringify(gzipSync(body).toString('base64')),__PROTOTYPE_DOCUMENT_BYTES__:String(Buffer.byteLength(body)),__PROTOTYPE_OBSERVED_AT__:JSON.stringify(new Date().toISOString())});
const readerSources=await Promise.all([...sources].sort().map(async file=>({path:path.relative(root,file),sha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')})));
const reader=document('Buildr 添加与更新 · 原型评审',readerBundle,dataTag('buildr-prototype-source',{...sourceObservation,sources:readerSources}));
await fs.writeFile(path.join(outputDirectory,'index.html'),reader);
console.log(JSON.stringify({body:path.join(outputDirectory,'workspace-onboarding-update.html'),reader:path.join(outputDirectory,'index.html'),bodyBytes:Buffer.byteLength(body),readerBytes:Buffer.byteLength(reader),pages:metadata.pages.length,sources:sourceObservation.sources.length}));
