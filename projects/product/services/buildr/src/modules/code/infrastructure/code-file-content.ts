import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { CODE_LIMITS, codeFailure, codeGit, localPath, relativeCodePath, type CodeSource } from './code-file-reader.ts';

export type CodeFileOptions = { page?:number; line?:number; matchQuery?:string; expectedRevision?:string; indexBlob?:{hash:string;mode:string} };
export type CodeFilePage = { index:number; total:number; offset:number; endOffset:number; startLine:number; endLine:number; startsMidLine:boolean; endsMidLine:boolean; matchOffset?:number; matchEndOffset?:number };
const images:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
export const isCodeImagePath = (relative:string) => Boolean(images[path.extname(relative).toLowerCase()]);
const blockBytes=64*1024;

function validateOptions(options:CodeFileOptions) {
  if(options.page!==undefined&&(!Number.isSafeInteger(options.page)||options.page<0))throw codeFailure('code_file_page_invalid','文件段编号必须是非负整数。');
  if(options.line!==undefined&&(!Number.isSafeInteger(options.line)||options.line<1))throw codeFailure('code_file_line_invalid','文件行号必须是正整数。');
  if(options.page!==undefined&&options.line!==undefined)throw codeFailure('code_file_location_invalid','文件段编号和行号不能同时指定。');
  if(options.matchQuery!==undefined&&(options.line===undefined||typeof options.matchQuery!=='string'||!options.matchQuery.trim()||options.matchQuery.length>200||options.matchQuery.includes('\0')))throw codeFailure('code_file_match_invalid','匹配文字必须与行号一起提供，长度为 1–200 个字符。');
  if(options.expectedRevision!==undefined&&(typeof options.expectedRevision!=='string'||!options.expectedRevision||options.expectedRevision.length>200))throw codeFailure('code_file_revision_invalid','文件版本标识无效。');
  if(options.page!==undefined&&!options.expectedRevision)throw codeFailure('code_file_revision_required','继续读取文件段必须提供已观察的文件版本。');
}
function changed() {return codeFailure('code_file_changed','文件已变化，请重新打开后继续阅读。',409);}
function assertRevision(actual:string,expected?:string) {if(expected&&actual!==expected)throw changed();}
function checkDeadline(deadline:number) {if(Date.now()>deadline)throw codeFailure('code_file_read_limit','文件定位或读取超过时间上限，请缩小查看范围后重试。',503);}
function currentRevision(file:string,stat:fs.BigIntStats) {
  return 'current:'+crypto.createHash('sha256').update([file,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join('\0')).digest('hex');
}
function newlineCount(bytes:Buffer) {let count=0,offset=-1;while((offset=bytes.indexOf(10,offset+1))!==-1)count++;return count;}
function isContinuation(byte:number|undefined) {return byte!==undefined&&(byte&0xc0)===0x80;}

/** Scan a prefix with bounded memory; the returned offset belongs to the actual global line. */
async function locateLine(chunks:()=>AsyncIterable<Buffer>,line:number,deadline:number,query?:string) {
  if(line===1&&!query)return {offset:0};
  let observedLine=1,offset=0,lineStart=0,lineStarted=false,emittedBytes=0,tail='';
  const decoder=new StringDecoder('utf8'),literal=query?new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'iu'):null;
  function matchText(text:string) {
    const combined=tail+text,match=literal!.exec(combined),base=lineStart+emittedBytes-Buffer.byteLength(tail);emittedBytes+=Buffer.byteLength(text);
    if(match){const matchOffset=base+Buffer.byteLength(combined.slice(0,match.index));return {offset:matchOffset,matchOffset,matchEndOffset:matchOffset+Buffer.byteLength(match[0])};}
    tail=combined.slice(-Math.max(4,query!.length+2));if(tail.length&&/^[\uDC00-\uDFFF]/.test(tail))tail=tail.slice(1);
    return null;
  }
  for await(const bytes of chunks()) {
    checkDeadline(deadline);let start=0;
    while(observedLine<line){const next=bytes.indexOf(10,start);if(next<0){start=bytes.length;break;}observedLine++;start=next+1;}
    if(observedLine===line){
      if(!lineStarted){lineStart=offset+start;lineStarted=true;if(!query)return {offset:lineStart};}
      const next=bytes.indexOf(10,start),text=decoder.write(bytes.subarray(start,next<0?bytes.length:next));
      const match=matchText(text);if(match)return match;
      if(next>=0){const final=matchText(decoder.end());if(final)return final;throw codeFailure('code_file_match_missing','指定行的匹配文字已不存在，请重新搜索。',404);}
    }
    offset+=bytes.length;
  }
  if(lineStarted&&query){const final=matchText(decoder.end());if(final)return final;throw codeFailure('code_file_match_missing','指定行的匹配文字已不存在，请重新搜索。',404);}
  throw codeFailure('code_file_line_missing','指定行号不在当前文件版本中。',404);
}

/** Retain only the requested window, boundary bytes and one preceding byte, never a full large blob. */
async function readWindow(chunks:()=>AsyncIterable<Buffer>,size:number,index:number,paged:boolean,deadline:number) {
  const nominalStart=paged?index*CODE_LIMITS.pageBytes:0,nominalEnd=paged?Math.min(size,nominalStart+CODE_LIMITS.pageBytes):size;
  const windowStart=Math.max(0,nominalStart-(paged?4:0)),windowEnd=Math.min(size,nominalEnd+(paged?1:0));
  const retained=Buffer.alloc(windowEnd-windowStart);let offset=0,filled=0,prefixLines=0,binary=false;
  for await(const bytes of chunks()) {
    checkDeadline(deadline);
    const used=bytes.subarray(0,Math.min(bytes.length,windowEnd-offset));
    if(used.includes(0))binary=true;
    if(offset<windowStart)prefixLines+=newlineCount(used.subarray(0,Math.min(used.length,windowStart-offset)));
    const from=Math.max(0,windowStart-offset),to=Math.min(bytes.length,windowEnd-offset);
    if(to>from){bytes.copy(retained,filled,from,to);filled+=to-from;}
    offset+=bytes.length;if(offset>=windowEnd)break;
  }
  if(filled!==retained.length)throw changed();
  let start=nominalStart-windowStart,end=nominalEnd-windowStart;
  if(paged){
    let moved=0;while(isContinuation(retained[start])&&moved++<3)start--;
    moved=0;while(isContinuation(retained[end])&&moved++<3)end--;
    if(isContinuation(retained[start])||isContinuation(retained[end]))throw codeFailure('code_file_encoding_unsupported','文件编码不支持安全分段阅读。');
  }
  const bytes=retained.subarray(start,end),startLine=1+prefixLines+newlineCount(retained.subarray(0,start));
  const page:CodeFilePage|null=paged?{index,total:Math.ceil(size/CODE_LIMITS.pageBytes),offset:windowStart+start,endOffset:windowStart+end,startLine,endLine:Math.max(startLine,startLine+newlineCount(bytes)-(bytes.at(-1)===10?1:0)),startsMidLine:windowStart+start>0&&retained[start-1]!==10,endsMidLine:windowStart+end<size&&bytes.at(-1)!==10}:null;
  return {bytes,page,binary};
}

function historicalChunks(source:CodeSource,object:string,deadline:number):AsyncIterable<Buffer> {
  return {async *[Symbol.asyncIterator]() {
    checkDeadline(deadline);
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
    const child=spawn('git',['--no-optional-locks','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-C',source.location,'cat-file','blob',object],{env:{...env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'},stdio:['ignore','pipe','ignore']});
    let failure:Error|null=null,timedOut=false,completed=false;
    const closed=new Promise<void>(resolve=>{child.once('error',error=>{failure=error;resolve();});child.once('close',code=>{completed=true;if(code!==0&&!timedOut)failure=codeFailure('code_git_unavailable','该历史文件当前不可读取。',404);resolve();});});
    const timer=setTimeout(()=>{timedOut=true;child.stdout.destroy(codeFailure('code_file_read_limit','文件定位或读取超过时间上限，请缩小查看范围后重试。',503));child.kill('SIGKILL');},Math.max(1,deadline-Date.now()));
    try {
      for await(const bytes of child.stdout) {checkDeadline(deadline);yield bytes as Buffer;}
      await closed;if(failure)throw failure;
    } finally {clearTimeout(timer);if(!completed)child.kill('SIGKILL');await closed;}
  }};
}

export async function readCodeFile(source:CodeSource,relative:string,options:CodeFileOptions={}) {
  relativeCodePath(relative);validateOptions(options);const deadline=Date.now()+CODE_LIMITS.readMs;
  const mediaType=images[path.extname(relative).toLowerCase()]||'',limitBytes=mediaType?CODE_LIMITS.imageBytes:CODE_LIMITS.textBytes;
  if(mediaType&&(options.page!==undefined||options.line!==undefined))throw codeFailure('code_file_location_invalid','图片不支持按文本段或行号读取。');
  let sizeBytes:number,revision:string,chunks:()=>AsyncIterable<Buffer>,verify:()=>Promise<void>=async()=>{},close:()=>Promise<void>=async()=>{};
  if(source.commitHash||options.indexBlob) {
    let object:string;
    if(options.indexBlob){
      if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(options.indexBlob.hash)||!['100644','100755'].includes(options.indexBlob.mode))throw codeFailure('code_index_file_invalid','暂存文件对象无效。');
      object=options.indexBlob.hash;revision='index:'+object+':'+options.indexBlob.mode;
    }else{
      const listing=codeGit(source.location,['ls-tree',source.commitHash!,'--',relative]).toString();
      if(!listing||!listing.startsWith('100'))throw codeFailure('code_file_missing','该历史版本不包含可读取的普通文件。',404);
      object=listing.split(/\s+/)[2];revision='git:'+source.commitHash+':'+object;
    }
    sizeBytes=Number(codeGit(source.location,['cat-file','-s',object]).toString().trim());
    chunks=()=>historicalChunks(source,object,deadline);
  } else {
    let file:string;
    try {file=localPath(source,relative);}catch(error){if(options.expectedRevision&&(error as {code?:string}).code==='code_file_missing')throw changed();throw error;}
    const handle=await fs.promises.open(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);close=()=>handle.close();
    try {
      const observed=await handle.stat({bigint:true});if(!observed.isFile())throw codeFailure('code_file_type_unsupported','所选路径不是普通文件。');
      sizeBytes=Number(observed.size);revision=currentRevision(file,observed);
      verify=async()=>{checkDeadline(deadline);let current:fs.BigIntStats;try {current=fs.statSync(localPath(source,relative),{bigint:true});}catch(error){if((error as {code?:string}).code==='code_file_missing'||(error as NodeJS.ErrnoException).code==='ENOENT')throw changed();throw error;}const descriptor=await handle.stat({bigint:true});if(!current.isFile()||currentRevision(file,current)!==revision||currentRevision(file,descriptor)!==revision)throw changed();};
      await verify();
      chunks=()=>({async *[Symbol.asyncIterator](){const buffer=Buffer.alloc(blockBytes);let offset=0;while(offset<sizeBytes){checkDeadline(deadline);const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);if(!bytesRead)break;offset+=bytesRead;yield buffer.subarray(0,bytesRead);}}});
    } catch(error){await close();throw error;}
  }
  try {
    assertRevision(revision,options.expectedRevision);
    const paged=!mediaType&&sizeBytes>limitBytes,total=paged?Math.ceil(sizeBytes/CODE_LIMITS.pageBytes):1;
    let index=options.page??0,location:{offset:number;matchOffset?:number;matchEndOffset?:number}|undefined;
    if(options.line!==undefined&&(paged||options.matchQuery!==undefined)){location=await locateLine(chunks,options.line,deadline,options.matchQuery);if(paged)index=Math.min(total-1,Math.floor(location.offset/CODE_LIMITS.pageBytes));}
    if(index>=total)throw codeFailure('code_file_page_invalid','文件段编号超出当前文件版本的范围。');
    let read={bytes:Buffer.alloc(0),page:null as CodeFilePage|null,binary:false};
    if(!mediaType||sizeBytes<=limitBytes)read=await readWindow(chunks,sizeBytes,index,paged,deadline);
    // A UTF-8 character moved behind a nominal boundary belongs to the next actual page.
    if(read.page&&location&&location.offset>=read.page.endOffset&&index+1<total)read=await readWindow(chunks,sizeBytes,++index,paged,deadline);
    if(read.page&&location?.matchOffset!==undefined){read.page.matchOffset=location.matchOffset;read.page.matchEndOffset=location.matchEndOffset;}
    if(options.line!==undefined&&!paged&&options.line>1+newlineCount(read.bytes))throw codeFailure('code_file_line_missing','指定行号不在当前文件版本中。',404);
    await verify();checkDeadline(deadline);
    const truncated=sizeBytes>limitBytes,kind=mediaType?(truncated?'unsupported':'image'):read.binary?'unsupported':relative.toLowerCase().endsWith('.md')?'markdown':'text';
    return {source,path:relative,kind,content:kind==='image'?'data:'+mediaType+';base64,'+read.bytes.toString('base64'):kind==='unsupported'?'':read.bytes.toString('utf8'),mediaType,sizeBytes,limitBytes,truncated,digest:'sha256-'+crypto.createHash('sha256').update(read.bytes).digest('hex'),revision,page:kind==='unsupported'?null:read.page,observedAt:new Date().toISOString(),message:truncated?(mediaType?'图片超过完整读取上限。':'文件超过 5 MiB，当前仅显示一个只读文本段。'):kind==='unsupported'?'此文件类型暂不支持阅读。':''};
  } catch(error){await verify();throw error;}finally {await close();}
}
