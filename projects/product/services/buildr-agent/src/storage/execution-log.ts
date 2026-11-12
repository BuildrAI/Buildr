import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ExecutionDiagnosticSink } from '../contracts.ts';

/** Private, bounded metadata only. Never serialize errors, request bodies, argv or environment. */
export function executionLog(root:string,generation:string,limit=2*1024*1024):ExecutionDiagnosticSink {
 const safeGeneration=/^[a-zA-Z0-9-]{1,100}$/.test(generation)?generation:createHash('sha256').update(generation).digest('hex');
 const directory=path.join(root,'diagnostics'),name=`lifecycle-${process.pid}-${safeGeneration}.jsonl`,file=path.join(directory,name);
 let ready=false,reported=false;
 const token=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value)?value:undefined;
 function prepare(){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const info=fs.lstatSync(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('unsafe_diagnostic_directory');
  fs.chmodSync(directory,0o700);
  // Each live producer owns its own ring. Retain at most 64 inactive files.
  const inactive=fs.readdirSync(directory).flatMap(name=>{
   const match=/^lifecycle-(\d+)-[a-zA-Z0-9-]+\.jsonl(?:\.[12])?$/.exec(name);if(!match)return [];
   try{process.kill(Number(match[1]),0);return [];}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')return [];}
   const filename=path.join(directory,name),stat=fs.lstatSync(filename);return stat.isFile()&&!stat.isSymbolicLink()?[{filename,modified:stat.mtimeMs}]:[];
  }).sort((a,b)=>b.modified-a.modified);
  for(const old of inactive.slice(64))fs.unlinkSync(old.filename);
  ready=true;
 }
 return event=>{
  try{
   if(!ready)prepare();
   const row:Record<string,unknown>={schemaVersion:1,time:new Date().toISOString(),pid:process.pid,generation:token(generation),event:token(event.event)};
   if(!row.event)return;
   for(const key of ['provider','conversationId','workspaceId','runId','participantId','contextId','executionId','controlId','ownerGeneration','reason','phase','lockName','code','signal','status','runtimeDigest','previousGeneration'] as const){const value=token(event[key]);if(value!==undefined)row[key]=value;}
   for(const key of ['childPid','exitCode','attempt','previousPid','lockHolderPid','lockHolderThreadId','runningTools','unknownTools','durationMs','persistenceMs','prepareMs','lockWaitMs','sqliteWriteMs','snapshotMs','publicationMs','entryCount'] as const){const value=event[key];if(typeof value==='number'&&Number.isSafeInteger(value))row[key]=value;}
   for(const key of ['accepted','stopRequested','resourcesReleased','confirmed','expected'] as const)if(typeof event[key]==='boolean')row[key]=event[key];
   const line=JSON.stringify(row)+'\n',stat=fs.lstatSync(file,{throwIfNoEntry:false});
   if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw Error('unsafe_diagnostic_file');
   if(stat&&stat.size+Buffer.byteLength(line)>limit){
    for(const suffix of ['.2','.1']){const target=file+suffix,entry=fs.lstatSync(target,{throwIfNoEntry:false});if(entry&&(entry.isSymbolicLink()||!entry.isFile()))throw Error('unsafe_diagnostic_file');}
    fs.rmSync(file+'.2',{force:true});if(fs.existsSync(file+'.1'))fs.renameSync(file+'.1',file+'.2');fs.renameSync(file,file+'.1');
   }
   const fd=fs.openSync(file,fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
   try{fs.fchmodSync(fd,0o600);fs.writeSync(fd,line);}finally{fs.closeSync(fd);}
  }catch{
   // Diagnosis must never fail an execution. One bounded notice makes a broken sink visible.
   if(!reported){reported=true;process.stderr.write('[buildr] execution_diagnostic_write_failed\n');}
  }
 };
}
export function diagnosticCode(error:unknown):string|undefined {
 const value=error as {code?:unknown;message?:unknown};
 if(typeof value?.code==='string'&&/^(?:[A-Z][A-Z0-9_]{1,79}|(?:agent_|dsh_|qoder_|codex_|model_)[a-z0-9_]{1,100})$/.test(value.code))return value.code;
 if(typeof value?.message==='string'&&/^(?:agent_|dsh_|qoder_|codex_)[a-z0-9_]{1,100}$/.test(value.message))return value.message;
 return undefined;
}
