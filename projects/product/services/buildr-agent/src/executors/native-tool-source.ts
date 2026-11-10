import fs from 'node:fs';
import path from 'node:path';
import {zstdDecompressSync} from 'node:zlib';
import type {NativeContentContext,NativeToolContent} from '../native-content-contracts.ts';
import {maxNativeSourceBytes,nativeContentPath} from '../storage/native-content.ts';

export function nativeToolContext(root:string,reference:NativeToolContent,provider:'dsh'|'qoder'|'qoder-cn'):NativeContentContext|undefined {
  const session=reference.session;
  if(reference.version!==3||reference.provider!==provider||!session||!reference.nativeId||
    !new RegExp('^connections/'+provider+'(?:/model-bindings/[a-f0-9]{64})?$').test(session.config)||
    !(provider==='dsh'?/^session-[a-f0-9-]{36}$/:/^[a-f0-9-]{36}$/).test(reference.contextId))return;
  return {root,configRoot:path.join(root,session.config),contextId:reference.contextId,cwd:session.cwd};
}

/** Detail-only traversal of a fixed append-only snapshot. Never retain the whole session. */
export function* nativeToolRows(input:NativeContentContext,provider:string,source:string):Generator<any> {
  const file=nativeContentPath(input.root,provider,path.relative(input.root,source).split(path.sep).join('/'));
  const before=fs.lstatSync(file),fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
  let tail:Buffer[]=[],tailBytes=0,compressed=Buffer.alloc(0),position=0;
  function* lines(bytes:Buffer):Generator<any>{
    let start=0;
    while(start<bytes.length){
      const newline=bytes.indexOf(10,start),end=newline<0?bytes.length:newline;
      if(tailBytes+end-start>maxNativeSourceBytes)throw new Error('native_tool_line_budget');
      const segment=bytes.subarray(start,end);
      tail.push(Buffer.from(segment));tailBytes+=segment.length;
      if(newline<0)return;
      if(tailBytes)yield JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(tail,tailBytes)));
      tail=[];tailBytes=0;start=end+1;
    }
  }
  try{
    const opened=fs.fstatSync(fd);
    if(opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size||!opened.isFile()||opened.nlink!==1)throw new Error('native_tool_file_changed');
    const buffer=Buffer.alloc(1024*1024);
    while(position<before.size){
      const length=fs.readSync(fd,buffer,0,Math.min(buffer.length,Math.max(64*1024,compressed.length*2),before.size-position),position);
      if(!length)throw new Error('native_tool_file_truncated');
      position+=length;
      if(!file.endsWith('.zstd')){yield* lines(buffer.subarray(0,length));continue;}
      compressed=Buffer.concat([compressed,buffer.subarray(0,length)]);
      while(compressed.length){
        let frame:{buffer:Buffer;engine:{bytesWritten:number}};
        try{frame=zstdDecompressSync(compressed,{info:true,maxOutputLength:maxNativeSourceBytes}) as any;}
        catch(error){
          if((error as NodeJS.ErrnoException).code!=='Z_BUF_ERROR')throw error;
          if(compressed.length>maxNativeSourceBytes)throw new Error('native_tool_frame_budget');
          break; // An unfinished final frame is not a completed native record.
        }
        const consumed=frame.engine.bytesWritten;
        if(consumed<1||consumed>compressed.length)throw new Error('native_tool_frame_invalid');
        yield* lines(frame.buffer);compressed=Buffer.from(compressed.subarray(consumed));
      }
    }
    const after=fs.fstatSync(fd),current=fs.lstatSync(file);
    if(after.dev!==before.dev||after.ino!==before.ino||current.dev!==before.dev||current.ino!==before.ino||
      after.nlink!==1||after.size<before.size||after.size===before.size&&(after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs))throw new Error('native_tool_file_changed');
  }finally{fs.closeSync(fd);}
}
