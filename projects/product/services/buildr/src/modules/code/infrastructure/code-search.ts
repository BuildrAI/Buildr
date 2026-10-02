import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';
import { insideFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { CODE_LIMITS, codeFailure, codeGit, fallbackIgnored, gitCommonDirectory, localPath, relativeCodePath, type CodeSource } from './code-file-reader.ts';

type Occurrence = { line:number; excerpt:string };
type Match = { path:string; line:number|null; excerpt:string; occurrences:Occurrence[] };
type Diagnostic = { code:string; message:string; repositoryId:string|null };

/** The exact packaged binary also serves CLI and read workers; never discover a tool through PATH. */
export function codeRipgrepPath() {
  const binary=process.platform==='win32'?'rg.exe':'rg';
  const target=process.platform+'-'+process.arch+'/'+binary;
  return resolveProductResource('runtime/ripgrep/'+target,{developmentFallback:'node_modules/@vscode/ripgrep-universal/bin/'+target});
}

function searchProcess(source:CodeSource,command:string,args:string[]) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')&&key!=='RIPGREP_CONFIG_PATH'));
  const result=spawnSync(command,args,{cwd:source.location,env:{...env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'},timeout:CODE_LIMITS.searchMs,killSignal:'SIGKILL',maxBuffer:CODE_LIMITS.searchOutputBytes,stdio:['ignore','pipe','pipe']});
  if(result.error&&['ENOENT','EACCES','ENOEXEC'].includes((result.error as NodeJS.ErrnoException).code||''))throw codeFailure('code_search_engine_unavailable','产品搜索引擎当前不可用，请修复产品安装后重试。',503);
  const diagnostics:Diagnostic[]=[];
  if(result.error||result.signal)diagnostics.push({code:'code_search_limit',message:'搜索超过执行时间或输出上限，仅保留已取得结果。',repositoryId:source.repositoryId});
  else if(result.status!==0&&result.status!==1)diagnostics.push({code:'code_search_incomplete',message:'部分文件未能完成搜索，已取得结果仍保留。',repositoryId:source.repositoryId});
  return {stdout:result.stdout?.toString('utf8')||'',diagnostics,truncated:diagnostics.length>0};
}
function gitArgs(root:string,args:string[]) {return ['--literal-pathspecs','--no-optional-locks','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-C',root,...args];}
function decoded(value:{text?:string;bytes?:string}) {return value.text??(value.bytes?Buffer.from(value.bytes,'base64').toString('utf8'):'');}
function relative(value:string) {return value.split(path.sep).join('/').replace(/^\.\//,'');}

/** Keep one file row with all observed matching lines, within separate file and line budgets. */
function matchCollector(query:string) {
  const matches:Match[]=[],byPath=new Map<string,Match>(),linesByPath=new Map<string,Set<number>>();
  const literalQuery=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu');
  let matchLines=0,truncated=false;
  function excerptFor(value:string) {
    const text=value.replace(/[\r\n]+$/,'');if(text.length<=240)return text;
    const match=literalQuery.exec(text),matchStart=match?.index??0,matchLength=match?.[0].length??0;
    // Reserve one character for each possible ellipsis and keep the whole literal match.
    const contentLength=238,before=Math.min(48,contentLength-matchLength);
    const start=Math.max(0,Math.min(matchStart-before,text.length-contentLength)),end=Math.min(text.length,start+contentLength);
    return (start>0?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
  }
  function add(file:string,line:number|null,excerpt:string) {
    let match=byPath.get(file);
    if(line!==null&&(!Number.isSafeInteger(line)||line<1)){truncated=true;return;}
    if(line!==null&&linesByPath.get(file)?.has(line))return;
    if(!match&&matches.length>=CODE_LIMITS.matches){truncated=true;return;}
    if(line!==null&&matchLines>=CODE_LIMITS.matchLines){truncated=true;return;}
    const text=excerptFor(excerpt);
    if(!match){match={path:file,line,excerpt:text,occurrences:[]};byPath.set(file,match);matches.push(match);}
    if(line!==null){
      match.occurrences.push({line,excerpt:text});matchLines++;
      let lines=linesByPath.get(file);if(!lines){lines=new Set();linesByPath.set(file,lines);}lines.add(line);
    }
  }
  return {add,matches,get truncated(){return truncated;}};
}

function currentSearch(source:CodeSource,query:string,mode:'name'|'content',showIgnored:boolean) {
  const args=['--no-config','--hidden','--no-follow','--no-ignore-parent','--no-ignore-global','--iglob','!**/.git','--iglob','!**/.git/**'];
  if(showIgnored)args.push('--no-ignore');
  else for(const directory of fallbackIgnored)args.push('--glob','!**/'+directory+'/**');
  const metadata=gitCommonDirectory(source.location);
  if(insideFilesystemPath(source.location,metadata)) {
    // Escape literal registered metadata names before using a glob; never search the object store.
    const excluded=path.relative(source.location,metadata).split(path.sep).join('/').replace(/[\[\]*?{}]/g,'[$&]');
    args.push('--glob','!/'+excluded+'/**');
  }
  args.push(...(mode==='name'?['--files','--null']:['--json','--stats','--fixed-strings','--ignore-case','-e',query]),'--','.');
  const result=searchProcess(source,codeRipgrepPath(),args),collector=matchCollector(query);
  let scannedFiles=0,truncated=result.truncated;
  const seen=new Set<string>();
  function add(value:string,line:number|null,excerpt:string) {
    const file=relative(value);
    if(!seen.has(file)) {
      try {relativeCodePath(file);if(!fs.statSync(localPath(source,file)).isFile())return;} catch {result.diagnostics.push({code:'code_search_file_changed',message:'一个匹配文件的位置已变化或不可读取。',repositoryId:source.repositoryId});truncated=true;return;}
      seen.add(file);
    }
    collector.add(file,line,excerpt);
  }
  if(mode==='name') {
    const paths=result.stdout.split('\0');if(paths.at(-1)!==''){paths.pop();truncated=true;}
    scannedFiles=paths.filter(Boolean).length;
    for(const file of paths)if(file.toLowerCase().includes(query.toLowerCase()))add(file,null,'');
  } else {
    for(const record of result.stdout.split('\n').filter(Boolean)) {
      let event;try{event=JSON.parse(record);}catch{truncated=true;continue;}
      if(event.type==='match')add(decoded(event.data.path),event.data.line_number,decoded(event.data.lines));
      if(event.type==='summary')scannedFiles=event.data.stats.searches??event.data.stats.files_searched??seen.size;
    }
  }
  return {matches:collector.matches,scannedFiles:Math.max(scannedFiles,seen.size),truncated:truncated||collector.truncated,diagnostics:result.diagnostics};
}

function historicalSearch(source:CodeSource,query:string,mode:'name'|'content') {
  const tree=codeGit(source.location,['ls-tree','-r','-z',source.commitHash!],CODE_LIMITS.searchOutputBytes);
  const paths=new Set(tree.toString().split('\0').filter(record=>record.startsWith('100')).map(record=>record.slice(record.indexOf('\t')+1)).filter(file=>{try{relativeCodePath(file);return true;}catch{return false;}}));
  const collector=matchCollector(query);let truncated=false,diagnostics:Diagnostic[]=[];
  if(mode==='name') {
    for(const file of paths)if(file.toLowerCase().includes(query.toLowerCase()))collector.add(file,null,'');
  } else {
    const result=searchProcess(source,'git',gitArgs(source.location,['grep','--full-name','-z','-n','-i','-I','-F','--no-textconv','--no-ext-grep','-e',query,source.commitHash!,'--']));
    truncated=result.truncated;diagnostics=result.diagnostics;
    let offset=0;
    while(offset<result.stdout.length) {
      const nameEnd=result.stdout.indexOf('\0',offset),lineEnd=result.stdout.indexOf('\0',nameEnd+1),textEnd=result.stdout.indexOf('\n',lineEnd+1);
      if(nameEnd<0||lineEnd<0||textEnd<0){truncated=true;break;}
      const file=result.stdout.slice(offset,nameEnd).slice(source.commitHash!.length+1);
      if(paths.has(file))collector.add(file,Number(result.stdout.slice(nameEnd+1,lineEnd)),result.stdout.slice(lineEnd+1,textEnd).replace(/\r$/,''));
      offset=textEnd+1;
    }
  }
  return {matches:collector.matches,scannedFiles:paths.size,truncated:truncated||collector.truncated,diagnostics};
}

export function searchCode(source:CodeSource,query:string,mode:'name'|'content',showIgnored=false) {
  if(!query.trim()||query.length>200||query.includes('\0'))throw codeFailure('code_search_invalid','请提供 1–200 个字符的搜索内容。');
  const result=source.commitHash?historicalSearch(source,query,mode):currentSearch(source,query,mode,showIgnored);
  return {source,...result,limit:CODE_LIMITS.matches,observedAt:new Date().toISOString()};
}
