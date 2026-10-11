import assert from 'node:assert/strict';
import test from 'node:test';
import {codeFileKey,canonicalCodeLocation,matchesCodeLocation,isTaskReturnPath,relativeCodeLink,codeReturnTarget} from '../src/features/code/code-navigation.ts';
import {navigationState} from '../src/app/navigation.ts';
import {tabForPath} from '../src/app/workspace-pages.ts';
import {workspaceHref} from '../src/lib/labels.ts';
import {resolveProjectMarkdownHref} from '../src/lib/workspaceMarkdownReferences.ts';
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
  for(const href of ['../../secret','../.git/config','/etc/passwd','https://example.com/a','file:///etc/passwd','..%2f..%2fsecret','..\\secret','%2FAGENTS.md','https%3A%2F%2Fexample.com%2Fa.md'])assert.equal(relativeCodeLink('docs/readme.md',href),null,href);
});

test('project document links keep parent navigation inside their actual source rather than clamping escapes',()=>{
  assert.equal(resolveProjectMarkdownHref('knowledge/docs/guides/start.md','../README.md'),'knowledge/docs/README.md');
  assert.equal(resolveProjectMarkdownHref('knowledge/docs/guides/start.md','../../../README.md'),'README.md');
  assert.equal(resolveProjectMarkdownHref('README.md','@project/docs/guide.md'),'docs/guide.md');
  for(const href of ['../secret.md','../../CONTRIBUTING.md','%2e%2e/secret.md','docs/../../secret.md','/.md','%2fsecret.md','https://example.com/a.md','file:///a.md','docs\\a.md','.git/README.md'])assert.equal(resolveProjectMarkdownHref('README.md',href),null,href);
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

test('file return labels follow the actual source while retaining the complete return location',()=>{
  const root='/workspaces/w';
  for(const [origin,path,label] of [['project','/projects/product','返回项目'],['task','/tasks/t','返回任务'],['source-control','/code/source-control','返回源代码管理']]){
    const from={pathname:root+path,search:'?filter=active',hash:'#details',state:{selection:'retained'}};
    const target=codeReturnTarget({origin,taskId:'t',from},root);
    assert.equal(target.label,label);assert.equal(target.from,from);
    assert.equal(codeReturnTarget({taskId:'t',from},root).label,label);
  }
  assert.equal(codeReturnTarget(null,root),null);
  assert.equal(codeReturnTarget({origin:'project',from:{pathname:'/workspaces/other/projects/p'}},root),null);
  assert.equal(codeReturnTarget({origin:'task',from:{pathname:root+'-other/tasks/t'}},root),null);
  assert.equal(codeReturnTarget({from:{pathname:root+'/code/explorer'}},root),null);
});

test('embedded task and project sources use semantic origin rather than their host route or taskId',()=>{
  const root='/workspaces/w';
  const taskPane={pathname:root+'/projects/product',search:'?tab=overview',hash:'#reading',state:{resourceViews:{active:'task',items:[{kind:'task',id:'t'}]}}};
  assert.equal(codeReturnTarget({origin:'task',from:taskPane},root).label,'返回任务');
  assert.equal(codeReturnTarget({from:taskPane},root).label,'返回任务');
  assert.equal(codeReturnTarget({origin:'task',from:taskPane},root).from,taskPane);
  const projectPane={pathname:root+'/tasks',state:{resourceViews:{active:'project',items:[{kind:'project',id:'p'}]}}};
  assert.equal(codeReturnTarget({origin:'project',from:projectPane},root).label,'返回项目');
  assert.equal(codeReturnTarget({from:projectPane},root).label,'返回项目');
  const sourceControl={pathname:root+'/code/source-control',state:{sourceControlEntry:{taskId:'t',from:taskPane}}};
  assert.equal(codeReturnTarget({origin:'source-control',taskId:'t',from:sourceControl},root).label,'返回源代码管理');
});

test('file return accepts the workspace root supplied by real navigation links',()=>{
  const root=workspaceHref('w','');
  for(const [origin,path,label] of [['project','/projects/product','返回项目'],['task','/tasks/t','返回任务'],['source-control','/code/source-control','返回源代码管理']]){
    const from={pathname:workspaceHref('w',path),search:'',hash:'',state:null};
    assert.equal(codeReturnTarget({origin,from},root).label,label);
    assert.equal(codeReturnTarget({from},root).label,label);
  }
});
