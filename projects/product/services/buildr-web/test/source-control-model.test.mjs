import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceControlRepository,sourceControlFileCount,sourceControlFileKey,sourceControlVisibleWorktrees,sourceControlWorktreeKey,sourceControlFilePathHints,sourceControlAbsolutePath,sourceControlFileTooltip} from '../src/features/code/source-control-model.ts';
const change=(worktreeId,area='unstaged')=>({repositoryId:'repo',worktreeId,path:'same.ts',area,previousPath:null,kind:'tracked',status:'modified',additions:null,deletions:null,preview:null,previewTruncated:false});
const worktree=(worktreeId,name,isMain=false)=>({worktreeId,name,location:'/actual/'+worktreeId,isMain,isRegistered:isMain,status:'complete',branch:isMain?'main':'feature',head:'a'.repeat(40),upstream:null,ahead:null,behind:null,taskId:null,taskTitle:null,taskDiagnostic:null,fileCount:1,changes:[change(worktreeId)],observedRevision:'scm:'+worktreeId,readAt:'now',coverage:{fileLimit:1000,truncated:false},diagnostics:[]});
const catalog=(id='repo')=>({id,name:id,code:id,location:'/registered',source:null,status:'complete',branch:'compatibility-only',ahead:99,behind:99,fileCount:2,changes:[],head:null,observedRevision:'scm:registered',diagnostics:[],worktrees:[worktree(id+'-main','main',true),worktree(id+'-linked','same-task-name')],worktreeCount:2});
test('catalog uses all checkout observations and keeps unknown synchronization distinct from zero',()=>{
  const repository=sourceControlRepository(catalog());
  assert.deepEqual(repository.worktrees.map(item=>item.branch),['main','feature']);
  assert.equal(repository.worktrees[1].ahead,null);assert.equal(repository.worktrees[1].behind,null);
  assert.equal(repository.worktrees[1].upstream,null);assert.equal(repository.worktrees[1].taskId,null);
  const associated=sourceControlRepository({...catalog(),worktrees:[{...worktree('linked','topic'),upstream:'origin/topic',ahead:2,behind:3,taskId:'task-one',taskTitle:'明确任务',taskDiagnostic:null}]});
  assert.deepEqual([associated.worktrees[0].upstream,associated.worktrees[0].taskId,associated.worktrees[0].taskTitle],['origin/topic','task-one','明确任务']);
  assert.equal(repository.fileCount,2);assert.equal(repository.worktrees[1].location,'/actual/repo-linked');
  const unread=sourceControlRepository({...catalog(),status:'unavailable',worktrees:[],worktreeCount:null,fileCount:null});
  assert.equal(unread.worktreeCount,null);assert.equal(unread.fileCount,null);assert.equal(unread.status,'offline');
  const files=[...repository.worktrees[0].changes,...repository.worktrees[1].changes,{...repository.worktrees[1].changes[0],area:'staged'}];
  assert.equal(sourceControlFileCount(files),2,'same path across checkouts counts twice but comparison layers count once');
  assert.equal(new Set(files.map(sourceControlFileKey)).size,3,'same path comparison layers remain separate selection identities');
});
test('same-name filtering spans repositories without guessing tasks and exact task hints remain independent',()=>{
  const repositories=[sourceControlRepository(catalog('a')),sourceControlRepository(catalog('b'))];
  const sameName=repositories.flatMap(repository=>sourceControlVisibleWorktrees(repository,['same-task-name']));
  assert.deepEqual(sameName.map(item=>item.worktreeId),['a-linked','b-linked']);
  assert.ok(sameName.every(item=>item.taskId===null));
  const exact=[sourceControlWorktreeKey('a','a-linked')];
  assert.equal(sourceControlVisibleWorktrees(repositories[0],[],exact).length,1);
  assert.equal(sourceControlVisibleWorktrees(repositories[1],[],exact).length,0);
  assert.equal(repositories.flatMap(repository=>sourceControlVisibleWorktrees(repository,[],[])).length,4,'clear restores all observed checkouts');
});

test('narrow file lists reveal a shortest directory only for duplicate names without changing file identities',()=>{
  const files=['only.ts','unique/path.ts','index.ts','alpha/src/index.ts','beta/src/index.ts','gamma/index.ts'].map(path=>({...change('linked'),path}));
  const before=structuredClone(files),keys=files.map(sourceControlFileKey);
  const hints=sourceControlFilePathHints(files);
  assert.equal(hints.has('only.ts'),false);assert.equal(hints.has('unique/path.ts'),false);
  assert.deepEqual([...hints],[['index.ts','./'],['alpha/src/index.ts','alpha/src'],['beta/src/index.ts','beta/src'],['gamma/index.ts','gamma']]);
  assert.deepEqual(files,before);assert.deepEqual(files.map(sourceControlFileKey),keys);
  assert.equal(sourceControlFilePathHints([{path:'src/index.ts'},{path:'nested/src/index.ts'}]).get('nested/src/index.ts'),'nested/src');
});
test('absolute display paths stay on the selected source and preserve both sides of a rename',()=>{
  assert.equal(sourceControlAbsolutePath('/actual/main/','src/file.ts'),'/actual/main/src/file.ts');
  assert.equal(sourceControlAbsolutePath('/actual/linked','src/file.ts'),'/actual/linked/src/file.ts');
  assert.equal(sourceControlAbsolutePath('/actual/literal\\','src/file.ts'),'/actual/literal\\/src/file.ts');
  assert.equal(sourceControlAbsolutePath('C:\\actual\\linked\\','src/file.ts'),'C:\\actual\\linked\\src\\file.ts');
  assert.equal(sourceControlAbsolutePath(undefined,'file.ts'),undefined);
  assert.equal(sourceControlFileTooltip('/actual/linked',{path:'new/file.ts',previousPath:'old/file.ts'}),'/actual/linked/old/file.ts → /actual/linked/new/file.ts');
});
