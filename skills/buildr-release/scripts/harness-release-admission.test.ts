import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {firstReleasePaths, parseAdmissions, verifyHarnessFirstReleasePR} from './harness-release-admission.ts';

const admissions = fs.readFileSync(path.join(import.meta.dirname,'harness-release-admissions.json'),'utf8');
const [original] = parseAdmissions(admissions);
const repo = 'BuildrAI/Buildr';
const base = '1'.repeat(40), head = '2'.repeat(40), dev = '3'.repeat(40);
const event = {pull_request:{base:{ref:'main',sha:base,repo:{full_name:repo}},head:{ref:'codex/release-harness-first-rc1',sha:head,repo:{full_name:repo}}}};
function evidence({paths = firstReleasePaths, tree = original!.sourceTree, liveMain = base, raw = admissions, ancestor = true} = {}) {
  return (args: string[]) => {
    if (args[0]==='diff') return paths.join('\0')+'\0';
    if (args[0]==='show') return raw;
    if (args[0]==='ls-tree') return `100644 blob ${head}\t${args.at(-1)}`;
    if (args[0]==='rev-list') return `${head} ${base}`;
    if (args[0]==='merge-base') {if(!ancestor) throw Error('source-not-retained');return '';}
    if (args.join(' ')==='rev-parse HEAD') return head;
    if (args.includes('refs/remotes/origin/main')) return liveMain;
    if (args.includes('refs/remotes/origin/dev')) return dev;
    if (args[1]===`${original!.sourceCommit}^{tree}`) return tree;
    throw Error('unexpected git invocation');
  };
}
test('RC PR admits only the exact pair, from retained dev data, and only the listed files',()=>{
  assert.equal(verifyHarnessFirstReleasePR(event,repo,'.',evidence()).status,'passed');
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({paths:[...firstReleasePaths.slice(1),'projects/product/services/buildr/package.json']})),/paths-invalid/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({tree:'4'.repeat(40)})),/source-tree-mismatch/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({liveMain:'4'.repeat(40)})),/pr-identity-invalid/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({ancestor:false})),/source-not-retained/);
  const fork = structuredClone(event);fork.pull_request.head.repo.full_name='other/Buildr';
  assert.throws(()=>verifyHarnessFirstReleasePR(fork,repo,'.',evidence()),/pr-identity-invalid/);
});
test('duplicate candidates and non-RC evidence cannot substitute for first release pair',()=>{
  const value=JSON.parse(admissions);value.admissions[1]=value.admissions[0];
  assert.throws(()=>parseAdmissions(JSON.stringify(value)),/admission-duplicate/);
  const next=JSON.parse(admissions);next.admissions[0].version='0.1.0-rc.2';
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({raw:JSON.stringify(next)})),/first-release-pair-invalid/);
});
