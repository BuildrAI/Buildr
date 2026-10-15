import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';
import {captureVerificationSource,gitTreeSourceIdentity} from '../../tools/verification-source.ts';
test('dirty feedback binds only its exact eventual Git tree and preserves observed baseline',t=>{
 const root=realpathSync(mkdtempSync(path.join(tmpdir(),'buildr-verified-source-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.com');writeFileSync(path.join(root,'source.ts'),'original\n');git('add','.');git('commit','-qm','original');
 const oldTree=git('rev-parse','HEAD^{tree}');writeFileSync(path.join(root,'source.ts'),'tested change\n');writeFileSync(path.join(root,'new.ts'),'new tested source\n');
 const tested=captureVerificationSource(root);assert.equal(tested.dirty,true);assert.notEqual(tested.contentSha256,gitTreeSourceIdentity(oldTree,root));
 git('add','.');git('commit','-qm','freeze tested content');const newTree=git('rev-parse','HEAD^{tree}');assert.equal(tested.contentSha256,gitTreeSourceIdentity(newTree,root));assert.notEqual(tested.observedCommit,git('rev-parse','HEAD'));
 writeFileSync(path.join(root,'source.ts'),'different content\n');assert.notEqual(captureVerificationSource(root).contentSha256,tested.contentSha256);
});
test('service-relative source identity handles deletions and dangling links without following targets',t=>{
 const repo=realpathSync(mkdtempSync(path.join(tmpdir(),'buildr-source-subtree-')));t.after(()=>rmSync(repo,{recursive:true,force:true}));const root=path.join(repo,'service');mkdirSync(root);
 const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.com');writeFileSync(path.join(root,'deleted.ts'),'remove me');writeFileSync(path.join(repo,'outside.txt'),'unrelated');git('add','.');git('commit','-qm','baseline');rmSync(path.join(root,'deleted.ts'));symlinkSync('missing-local-file',path.join(root,'link'));
 const tested=captureVerificationSource(root);git('add','.');git('commit','-qm','freeze deletion and link');assert.equal(tested.contentSha256,gitTreeSourceIdentity(git('rev-parse','HEAD:service'),root));writeFileSync(path.join(repo,'outside.txt'),'other scope changed');assert.equal(captureVerificationSource(root).contentSha256,tested.contentSha256);
});
