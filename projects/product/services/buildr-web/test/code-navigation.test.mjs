import assert from 'node:assert/strict';
import test from 'node:test';
import {codeFileKey,relativeCodeLink} from '../src/features/code/code-navigation.ts';
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
