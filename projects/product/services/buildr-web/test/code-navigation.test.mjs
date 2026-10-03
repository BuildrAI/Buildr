import assert from 'node:assert/strict';
import test from 'node:test';
import {codeFileKey,canonicalCodeLocation,matchesCodeLocation,isTaskReturnPath,relativeCodeLink} from '../src/features/code/code-navigation.ts';
import {navigationState} from '../src/app/navigation.ts';
import {tabForPath} from '../src/app/workspace-pages.ts';
test('code is a retained independent area and existing areas keep their routes',()=>{
  for(const action of ['explorer','source-control']){assert.equal(navigationState('/workspaces/w/code/'+action,'','w').area,'code');assert.ok(tabForPath('w','/workspaces/w/code/'+action));}
  assert.equal(navigationState('/workspaces/w/tasks/t','','w').area,'workbench');
  assert.equal(navigationState('/workspaces/w/repositories','','w').area,'workspace');
  assert.equal(tabForPath('other','/workspaces/w/code/explorer'),null);
});
test('same path in different repositories, task locations and historical commits has distinct file identity',()=>{
  const ids=[{repositoryId:'r1'},{repositoryId:'r2'},{repositoryId:'r1',taskId:'t1'},{repositoryId:'r1',taskId:'t1',commitHash:'a'.repeat(40)},{repositoryId:'r1',checkoutId:'checkout-1'},{repositoryId:'r1',checkoutId:'checkout-2'}].map(source=>codeFileKey(source,'src/main.ts'));
  assert.equal(new Set(ids).size,6);
  assert.equal(codeFileKey({repositoryId:'r1',checkoutId:'checkout-1',taskId:'t1'},'src/main.ts'),ids[4]);
});
test('document relative links resolve within repository and refuse escape, metadata and external targets',()=>{
  assert.equal(relativeCodeLink('docs/guide/readme.md','../../src/main.ts#x'),'src/main.ts');
  assert.equal(relativeCodeLink('docs/readme.md','./images/a%20b.png'),'docs/images/a b.png');
  for(const href of ['../../secret','../.git/config','/etc/passwd','https://example.com/a','file:///etc/passwd','..%2f..%2fsecret','..\\secret'])assert.equal(relativeCodeLink('docs/readme.md',href),null,href);
});

test('explicit checkout identity takes priority and navigation fields cannot leak into code reads',()=>{
  const source=canonicalCodeLocation({repositoryId:'r',checkoutId:'linked',taskId:'task',commitHash:'a'.repeat(40),key:'tab',path:'same.ts',line:10});
  assert.deepEqual(source,{repositoryId:'r',checkoutId:'linked',taskId:undefined,commitHash:'a'.repeat(40)});
  assert.equal(codeFileKey(source,'same.ts'),codeFileKey({...source,taskId:'other'},'same.ts'));
});

test('observed default checkout identity does not change implicit explorer selection or masquerade as a different explicit checkout',()=>{
  assert.equal(matchesCodeLocation({repositoryId:'r'},{repositoryId:'r',checkoutId:'main'}),true);
  assert.equal(matchesCodeLocation({repositoryId:'r',taskId:'t'},{repositoryId:'r',taskId:'t',checkoutId:'linked'}),true);
  assert.equal(matchesCodeLocation({repositoryId:'r'},{repositoryId:'r',checkoutId:'linked',kind:'worktree'}),false);
  assert.equal(matchesCodeLocation({repositoryId:'r',checkoutId:'linked'},{repositoryId:'r',checkoutId:'main'}),false);
  assert.equal(matchesCodeLocation({repositoryId:'r',checkoutId:'linked',commitHash:'a'},{repositoryId:'r',checkoutId:'linked',commitHash:'b'}),false);
});

test('task return recognizes retained task root and deep links without accepting other owners',()=>{
  const root='/workspaces/owner/tasks';
  assert.equal(isTaskReturnPath(root,root),true);
  assert.equal(isTaskReturnPath(root+'/task-id',root),true);
  for(const path of ['/workspaces/other/tasks',root+'-other','/workspaces/owner/code/source-control'])assert.equal(isTaskReturnPath(path,root),false,path);
});
