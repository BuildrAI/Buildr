import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnCommandSync } from '../../src/infrastructure/process.ts';
import { readUpstreamOpenSpec, upstreamDelta, upstreamConvergencePlan } from '../../src/modules/openspec/application/upstream-openspec.ts';
import { runOpenSpecConvergence } from '../../src/modules/openspec/application/openspec-converge.ts';
import { createConvergenceReceipt } from '../../src/modules/openspec/application/convergence-model.ts';
import type { TestContext } from 'node:test';
export const executable = path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec');
export const executableIdentity = { sourceKind: 'external-declared', reference: 'external:openspec', version: '1.13.0', sha256: 'fixture-exact-installation' };
export const requirement = (name: string) => `### Requirement: ${name}\nThe system MUST provide ${name}.\n\n#### Scenario: ${name} works\n- **WHEN** requested\n- **THEN** the result is returned\n`;
export function fixture(t: TestContext, delta = `## ADDED Requirements\n\n${requirement('New')}`) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'buildr-upstream-openspec-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const changeRoot=path.join(root,'openspec/changes/change-a');
  const target=path.join(root,'openspec/specs/demo/spec.md');
  const write=(file:string,content:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
  write(target,`# demo Specification\n\n## Purpose\n\nThis fixture describes a public behavior with enough context for upstream strict validation.\n\n## Requirements\n\n${requirement('Existing')}`);
  write(path.join(changeRoot,'specs/demo/spec.md'),delta);
  write(path.join(changeRoot,'.openspec.yaml'),'schema: spec-driven\n');
  write(path.join(changeRoot,'proposal.md'),'## Why\n\nTest upstream integration.\n\n## What Changes\n\nAdd behavior.\n\n## Capabilities\n\n### Modified Capabilities\n\n- `demo`: Update behavior.\n');
  write(path.join(changeRoot,'tasks.md'),'## 1. Implementation\n\n- [x] 1.1 Implement behavior\n');
  const data=readUpstreamOpenSpec(executable,root,changeRoot);
  const context={change:'change-a',project:'demo',projectRoot:root,changeRoot,delta:upstreamDelta(data)};
  const plan=()=>upstreamConvergencePlan({executable,projectRoot:root,changeRoot,change:'change-a',project:'demo',executableIdentity});
  const resolveArchivedChangeRoot=()=>{
    const archives=path.join(root,'openspec/changes/archive');
    const match=fs.readdirSync(archives).find(name=>name.endsWith('change-a'));
    if(!match)throw new Error('not archived');
    return path.join(archives,match);
  };
  const writeReceipt=(file:string,value:unknown)=>write(file,JSON.stringify(value));
  const archive=(skipSpecs:boolean)=>{
    const result=spawnCommandSync(executable,['archive','change-a','--yes','--json',...(skipSpecs?['--skip-specs']:[])],{cwd:root,encoding:'utf8',env:{...process.env,OPENSPEC_TELEMETRY:'0'}});
    return {status:result.status===0?'passed':'blocked',code:result.status===0?null:'upstream-archive-failed',diagnostic:String(result.stderr||result.stdout),commandCount:1};
  };
  const input={context,executableIdentity,preparePlan:plan,archive,resolveArchivedChangeRoot,writeReceipt};
  return {root,changeRoot,target,write,context,plan,input,run:()=>runOpenSpecConvergence(input), receipt:()=>createConvergenceReceipt({plan:plan(),executableIdentity})};
}
