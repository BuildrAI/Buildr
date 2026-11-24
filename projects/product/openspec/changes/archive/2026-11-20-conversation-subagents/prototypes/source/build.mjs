import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = import.meta.dirname;
let project = source;
while (path.basename(project) !== 'openspec') {
  const parent = path.dirname(project);
  if (parent === project) throw new Error('Preview source is not under a product OpenSpec directory');
  project = parent;
}
project = path.dirname(project);
const h = path.join(project,'services/buildr-harness-web');
const notes = path.join(project,'services/buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const root = path.resolve(project,'../..');
const outputPath = process.argv[2];
if (!outputPath || !path.isAbsolute(outputPath)) throw new Error('Specify an absolute output path for the preview');
const {build} = await import(pathToFileURL(path.join(h,'node_modules/vite/dist/node/index.js')).href);
const scenes = JSON.parse(await fs.readFile(path.join(source,'scenes.json'),'utf8'));
const sources = new Set();
const json = value=>JSON.stringify(value).replaceAll('<','\\u003c');
const result = await build({root:h,configFile:false,publicDir:false,logLevel:'warn',resolve:{alias:{'@h':path.join(h,'src'),'@notes':notes},dedupe:['react','react-dom','antd','@ant-design/icons']},esbuild:{jsx:'automatic'},define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'isolate-preview-host',enforce:'pre',transform(code,moduleId){
    const id=moduleId.split('?')[0];
    if (![path.join(h,'src'),notes,source].some(directory=>id.startsWith(directory+'/'))) return;
    sources.add(id);
    if (!/\.[mc]?[jt]sx?$/.test(id) || id===path.join(source,'memory-storage.ts')) return;
    // Mock data stays in the preview; the real panel may not post host actions.
    if(id.startsWith(h+'/src/'))code=code.replace(/\bwindow\.parent\b/g,'window');
    if(/\b(sessionStorage|localStorage)\b/.test(code)){
      code=code.replace(/\b(?:(?:window|globalThis)\.)?(sessionStorage|localStorage)\b/g,(_,kind)=>`demoMemory_${kind}`);
      code=`import {sessionStorage as demoMemory_sessionStorage,localStorage as demoMemory_localStorage} from ${JSON.stringify(path.join(source,'memory-storage.ts'))};\n`+code;
    }
    return {code,map:null};
  }}],build:{write:false,minify:true,assetsInlineLimit:Infinity,cssCodeSplit:false,lib:{entry:path.join(source,'main.tsx'),name:'BuildrSubagentPreview',formats:['iife']},rollupOptions:{onwarn(note,warn){if(note.code!=='MODULE_LEVEL_DIRECTIVE')warn(note);},output:{inlineDynamicImports:true}}}});
const assets=(Array.isArray(result)?result:[result]).flatMap(value=>value.output);
const script=assets.filter(value=>value.type==='chunk').map(value=>value.code).join('\n').replace(/<\/script/gi,'<\\/script');
const css=assets.filter(value=>value.type==='asset'&&value.fileName.endsWith('.css')).map(value=>value.source).join('\n').replace(/<\/style/gi,'<\\/style');
const meta={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),mode:'shared-production-components-with-mock-data',sources:await Promise.all([...sources].sort().map(async file=>({path:path.relative(root,file),sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')})))};
const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
const html=`<!doctype html>\n<!-- buildr:ui-prototype -->\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Buildr · 子智能体对话流</title><script id="buildr-prototype" type="application/json">${json(scenes)}</script><script id="buildr-prototype-source" type="application/json">${json(meta)}</script><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>\n`;
if(Buffer.byteLength(html)>2*1024*1024)throw new Error('Preview is larger than 2 MiB');
await fs.writeFile(outputPath,html.replace(/[ \t]+$/gm,''),{flag:'wx'});
console.log(`${Buffer.byteLength(html)} bytes: ${outputPath}`);
