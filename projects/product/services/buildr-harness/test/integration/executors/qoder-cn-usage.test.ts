import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,renameSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readQoderCnUsage } from '../../../src/executors/qoder-cn/usage.ts';

test('native context usage follows the exact active primary chain and never sums billing usage',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'qoder-cn-usage-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const config=path.join(root,'qoder-cn-config'),contextId=randomUUID(),cwd='/exact/workspace',user=randomUUID(),assistant=randomUUID();
  const dir=path.join(config,'projects','bucket'),file=path.join(dir,contextId+'.jsonl');mkdirSync(dir,{recursive:true});
  const meta={sessionId:contextId,cwd,isSidechain:false};
  let rows:any[]=[{...meta,type:'user',uuid:user},{...meta,type:'assistant',uuid:assistant,parentUuid:user,message:{usage:{input_tokens:42000,output_tokens:90000,total_tokens:5000000}}},{type:'active-leaf',sessionId:contextId,leafUuid:assistant}];
  const write=()=>writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  write();assert.equal(readQoderCnUsage(config,contextId,cwd)?.usedTokens,42000);
  assert.equal(readQoderCnUsage(config,contextId,'/wrong'),undefined);
  rows.push({...meta,type:'assistant',uuid:randomUUID(),parentUuid:user,message:{usage:{input_tokens:999999}}});
  write();assert.equal(readQoderCnUsage(config,contextId,cwd)?.usedTokens,42000,'an abandoned branch cannot override active-leaf');
  const compact=randomUUID();rows.push({...meta,type:'system',subtype:'compact_boundary',uuid:compact,parentUuid:assistant},{type:'active-leaf',sessionId:contextId,leafUuid:compact});
  write();assert.equal(readQoderCnUsage(config,contextId,cwd),undefined);
  const after=randomUUID();rows.push({...meta,type:'assistant',uuid:after,parentUuid:compact,message:{usage:{input_tokens:2000}}},{type:'active-leaf',sessionId:contextId,leafUuid:after});
  write();assert.equal(readQoderCnUsage(config,contextId,cwd)?.usedTokens,2000);
  rows[rows.length-2].message.usage={input_tokens:0,output_tokens:0,context_usage_ratio:0.25};
  write();const masked=readQoderCnUsage(config,contextId,cwd);
  assert.equal(masked?.usedTokens,undefined,'hidden token counts must not become a fake zero');
  assert.equal(masked?.usedRatio,0.25);
  const backup=file+'.original';renameSync(file,backup);symlinkSync(backup,file);
  assert.equal(readQoderCnUsage(config,contextId,cwd),undefined);
});

test('oversized native rows are not loaded as a full conversation or treated as a partial observation',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'qoder-cn-usage-bound-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const contextId=randomUUID(),cwd='/cwd',config=path.join(root,'qoder-cn-config'),dir=path.join(config,'projects','bucket');mkdirSync(dir,{recursive:true});
  const id=randomUUID();
  writeFileSync(path.join(dir,contextId+'.jsonl'),JSON.stringify({sessionId:contextId,cwd,isSidechain:false,type:'assistant',uuid:id,message:{content:'x'.repeat(3*1024*1024),usage:{input_tokens:100}}})+'\n'+JSON.stringify({sessionId:contextId,type:'active-leaf',leafUuid:id})+'\n');
  assert.equal(readQoderCnUsage(config,contextId,cwd),undefined);
});
