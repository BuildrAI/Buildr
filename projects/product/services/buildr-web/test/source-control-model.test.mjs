import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceControlDefaultSource,sourceControlRepository,sourceControlFileCount,sourceControlFileKey,sourceControlVisibleWorktrees,sourceControlWorktreeKey,sourceControlFilePathHints,sourceControlAbsolutePath,sourceControlFileTooltip,sourceControlRepositoryHasChanges} from '../src/features/code/source-control-model.ts';
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
test('任一工作树的已确认改动都会让代码库进入改动组，未知读取不冒充改动',()=>{
  const clean=sourceControlRepository({...catalog(),worktrees:[{...worktree('main','main',true),fileCount:0,changes:[]}],fileCount:0});
  assert.equal(sourceControlRepositoryHasChanges(clean),false);
  const taskChanged=sourceControlRepository({...catalog(),worktrees:[{...worktree('main','main',true),fileCount:0,changes:[]},worktree('task','task')]});
  assert.equal(sourceControlRepositoryHasChanges(taskChanged),true);
  const pending=sourceControlRepository({...catalog(),status:'unavailable',fileCount:null,worktreeCount:null,worktrees:[]});
  assert.equal(sourceControlRepositoryHasChanges(pending),false);
  assert.equal(sourceControlRepositoryHasChanges(sourceControlRepository({...catalog(),worktrees:[],fileCount:2})),true);
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

test('首登记库尚未读取时不因后库先完成而默认选择后库，首库完成后确定默认来源',()=>{
  const first=sourceControlRepository(catalog('first')),fast=sourceControlRepository(catalog('fast'));
  const pending=sourceControlRepository({...catalog('first'),status:'unavailable',fileCount:null,worktreeCount:null,worktrees:[],diagnostics:[{code:'code_source_control_pending',message:'custom text'}]});
  assert.equal(pending.pending,true,'等待只依据稳定诊断码派生，不匹配中文文案');
  assert.equal(sourceControlDefaultSource([]),undefined);
  assert.equal(sourceControlDefaultSource([pending,fast]),undefined);
  const selected=sourceControlDefaultSource([first,fast]);
  assert.equal(selected.repository,first);assert.equal(selected.worktree,first.worktrees[0]);
  assert.equal(sourceControlDefaultSource([first,{...fast,branch:'updated'}]).repository,first);
});

test('已确认没有工作树的失败首库不阻止默认查看后库，但不能跨过尚在等待的更早库',()=>{
  const failed=sourceControlRepository({...catalog('failed'),status:'unavailable',fileCount:null,worktreeCount:null,worktrees:[],diagnostics:[{code:'code_repository_unavailable',message:'unavailable'}]});
  const pending=sourceControlRepository({...catalog('pending'),status:'unavailable',fileCount:null,worktreeCount:null,worktrees:[],diagnostics:[{code:'code_source_control_pending',message:'waiting'}]});
  const ready=sourceControlRepository(catalog('ready'));
  assert.equal(failed.pending,false);
  assert.equal(sourceControlDefaultSource([failed,ready]).repository,ready);
  assert.equal(sourceControlDefaultSource([failed,pending,ready]),undefined,'更早库未完成时仍保持确定的默认顺序');
  assert.equal(sourceControlDefaultSource([failed,failed]),undefined,'全部失败时不伪造默认来源');
});

test('首登记库完成后优先其实际登记工作树，Git主工作树角色不替代登记目录',()=>{
  const observed=catalog('first');observed.worktrees[0].isRegistered=false;observed.worktrees[1].isRegistered=true;
  const first=sourceControlRepository(observed),next=sourceControlRepository(catalog('next'));
  assert.equal(sourceControlDefaultSource([first,next]).repository,first);
  assert.equal(sourceControlDefaultSource([first,next]).worktree.worktreeId,'first-linked');
});
