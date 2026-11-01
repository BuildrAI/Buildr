import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { connectAgentProcess as connect, prepareAgentRuntime as prepare, stopAgentProcess as stop } from '../../src/index.ts';
import type { AgentProcessConnection, AgentRuntimeUnit } from '../../src/index.ts';
import { readProcessInstances } from '../../src/process/ownership.ts';
import { request } from '../../src/process/transport.ts';

import { phase } from './process-timing.ts';
import { shareFixtureNode } from './immutable-process-inputs.ts';

export const prepareAgentRuntime: typeof prepare = input => phase('prepare-runtime', () => shareFixtureNode(prepare(input)));
export const connectAgentProcess: typeof connect = input => phase('connect', () => connect(input));
export const stopAgentProcess: typeof stop = input => phase('stop', () => stop(input));
export const copyPackage = (source: string, target: string) => phase('copy-package', () => fs.cpSync(source,target,{recursive:true,mode:fs.constants.COPYFILE_FICLONE}));
export const cleanup = (root: string) => phase('cleanup', () => fs.rmSync(root,{recursive:true,force:true}));

export const prepared=path.resolve(import.meta.dirname,'../../../buildr/node_modules/@buildr-ai/buildr-agent');
export const isLive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
export async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean):Promise<T>{let last:unknown;for(let n=0;n<200;n++){try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,50));}let startup='';const observed=last as {identity?:{dataRoot?:string}};if(observed?.identity?.dataRoot?.startsWith(os.tmpdir())){try{startup='\nstartup log: '+fs.readFileSync(path.join(observed.identity.dataRoot,'agent-service/process/startup.log'),'utf8').slice(-8192);}catch{}}assert.fail('state did not settle: '+JSON.stringify(last)+startup);}
export async function actor(options:{dataRoot:string;profileId:string;runtime:AgentRuntimeUnit;workspace:string;autoContinueInterrupted?:boolean;legacySourceId?:string}){
  const child=fork(path.join(import.meta.dirname,'../integration/fixtures/agent-host-process.mjs'),[path.join(options.runtime.directory,'build/index.js'),JSON.stringify(options)],{execPath:options.runtime.node,stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stderr?.on('data',value=>{output+=value;});
  const waiting=new Map<string,{resolve(value:any):void;reject(error:Error):void}>();
  let readyResolve:(value:any)=>void,readyReject:(error:Error)=>void;
  const ready=new Promise<any>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  child.on('message',(message:any)=>{if(message.ready){readyResolve(message);return;}const pending=waiting.get(message.id);if(pending){waiting.delete(message.id);if(message.error)pending.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else pending.resolve(message.result);}});
  child.once('exit',()=>{readyReject(new Error('host exited: '+output));for(const pending of waiting.values())pending.reject(new Error('host exited: '+output));});
  const timer=setTimeout(()=>{child.kill('SIGTERM');readyReject(new Error('host start timeout: '+output));},20000);let info:any;try{info=await phase('start-host', () => ready);}finally{clearTimeout(timer);}
  const call=(operation:string,args:unknown[]=[])=>phase('interaction', () => new Promise<any>((resolve,reject)=>{const id=randomUUID();waiting.set(id,{resolve,reject});child.send({id,operation,args});}));
  return{child,info,call,async close(){if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');const id=randomUUID();child.send({id,action:'close'});await phase('exit-host', () => exited);}};
}


/** A lost shutdown response is settled by the exact previously observed PID exiting. */
export async function shutdownFixtureProcess(record: ReturnType<typeof readProcessInstances>[number]) {
  try { await request(record.origin,record.token,'/shutdown',{expectedGeneration:record.identity.generation,mode:'stop-owned'},AbortSignal.timeout(5000)); }
  catch (error) {
    try { await until(async () => isLive(record.identity.pid), live => !live); }
    catch (exitError) { throw new AggregateError([error,exitError],'Owned shutdown and exit are unconfirmed'); }
    process.stderr.write(`[agent-test-cleanup] ${JSON.stringify({pid:record.identity.pid,shutdownReceipt:'unavailable',exit:'confirmed'})}\n`);
  }
}

/** Release only this case's native fixtures before asking the real process owner to stop. */
export async function cleanupProcessFixture({ root, dataRoot, profileId, host, observer }: {
  root: string; dataRoot: string; profileId: string;
  host?: Awaited<ReturnType<typeof actor>>; observer?: AgentProcessConnection;
}) {
  const owned = new Map<number, ReturnType<typeof readProcessInstances>[number]>();
  const observe = () => {
    for (const record of readProcessInstances(dataRoot)) {
      assert.equal(record.identity.dataRoot, dataRoot);
      assert.ok(record.identity.runtime.entry.startsWith(root + path.sep));
      owned.set(record.identity.pid, record);
    }
  };
  observe();
  let connection = observer;
  const errors: unknown[] = [];
  let uncertainReleases=0;
  try {
    await phase('release-fixture', async () => {
      // These are the native fixture's explicit release controls, after every assertion.
      for (const marker of ['release', 'release-other', 'release-second', 'finish-stop', 'release-uncertain-resource']) {
        fs.writeFileSync(path.join(dataRoot, marker), 'yes');
      }
      const current = [...owned.values()].find(record => !record.stopped && isLive(record.identity.pid));
      if (!connection && current) connection = await connectAgentProcess({dataRoot,profileId,runtime:current.identity.runtime,sourceId:'minimal'});
      if (connection) {
        // Revocation stops native question/command loops as well as the visible current round.
        for (const id of ['first', 'second']) {
          const view = await connection.operations.connections.read(id);
          if (view.enabled) {
            try { await connection.operations.connections.disconnect(id,{expectedRevision:view.revision}); }
            catch (error) {
              if ((error as {code?: string}).code!=='agent_connection_release_unconfirmed') throw error;
              // A retiring fixture can exit between revocation and its response.
              // Only the later exact process-exit proof settles this cleanup uncertainty.
              uncertainReleases++;
            }
          }
        }
      }
      observe();
    });
  } catch (error) { errors.push(error); }
  try { await host?.close(); } catch (error) { errors.push(error); host?.child.kill('SIGTERM'); }
  try { await connection?.disconnect(); } catch (error) { errors.push(error); }
  try {
    observe();
    // Deliberate crash/restart scenarios retain unconfirmed historical receipts.
    // Cleanup proves live owned process exit; it does not rewrite those receipts as recovery success.
    await phase('stop', async () => {
      const results = await Promise.allSettled([...owned.values()].filter(record => isLive(record.identity.pid)).map(async record => {
        await shutdownFixtureProcess(record);
      }));
      const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
      if (failures.length) throw new AggregateError(failures,'Owned process shutdown failed');
    });
  } catch (error) { errors.push(error); }
  try {
    await phase('exit-processes', () => until(async () => [...owned.keys()].filter(isLive), live => live.length === 0));
  } catch (error) {
    errors.push(error);
    // A failing case still owns cleanup. Check exact private runtime command before signalling.
    const { execFileSync } = await import('node:child_process');
    for (const [pid, record] of owned) if (isLive(pid)) {
      const command = execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});
      if (command.includes(record.identity.runtime.entry)) process.kill(pid,'SIGKILL');
    }
    await until(async () => [...owned.keys()].filter(isLive), live => live.length === 0);
  }
  if (uncertainReleases) process.stderr.write(`[agent-test-cleanup] ${JSON.stringify({releaseReceipts:'unconfirmed',count:uncertainReleases,exit:'confirmed'})}\n`);
  cleanup(root);
  if (errors.length) throw new AggregateError(errors, 'Process fixture cleanup failed; owned processes were reaped.');
}
