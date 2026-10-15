import assert from 'node:assert/strict';
import test from 'node:test';
import { planCodeDirectoryRefresh, removedCodeDirectoryPaths } from '../src/features/code/code-directory-refresh.ts';

const worktree = (changes=[],extra={}) => ({available:true,status:'complete',branch:'main',head:'head-1',observedRevision:JSON.stringify(changes),changes,coverage:{truncated:false},...extra});
const change = (path,status='modified',previousPath=null) => ({path,status,previousPath});
const loaded = ['', 'src', 'src/deep', 'docs', 'old', 'old/nested', ...Array.from({length:50},(_,index)=>'unrelated/'+index)].map(path=>({path,entries:[]}));
const initial = (tree=worktree()) => planCodeDirectoryRefresh(undefined,'repo:checkout',tree,loaded).observation;

test('已访问大量目录后首次编辑、连续编辑和提交同路径只更新正文，不重读目录',()=>{
  const clean=initial(),first=planCodeDirectoryRefresh(clean,'repo:checkout',worktree([change('src/deep/file.ts')]),loaded);
  assert.deepEqual(first.paths,[]);assert.equal(first.readFile,true);
  const next=planCodeDirectoryRefresh(first.observation,'repo:checkout',worktree([change('src/deep/file.ts')],{observedRevision:'second-content'}),loaded);
  assert.deepEqual(next.paths,[]);assert.equal(next.readFile,true);
  const otherWorktree=planCodeDirectoryRefresh(next.observation,'repo:checkout',worktree([change('src/deep/file.ts')],{observedRevision:'second-content'}),loaded);
  assert.equal(otherWorktree.readFile,false,'聚合代码库版本因另一工作树变化时不重读当前正文');
  const committed=planCodeDirectoryRefresh(next.observation,'repo:checkout',worktree(),loaded);
  assert.deepEqual(committed.paths,[]);
});

test('新增、删除、重命名和恢复仅合并已加载父目录及祖先，不遍历无关缓存',()=>{
  const previous=initial(worktree([change('src/deep/old.ts','untracked'),change('old/nested/moved.ts','modified')]));
  const next=planCodeDirectoryRefresh(previous,'repo:checkout',worktree([
    change('src/deep/new.ts','added'),change('next/location.ts','renamed','old/nested/moved.ts'),change('docs/deleted.md','deleted'),
  ]),loaded);
  assert.deepEqual(new Set(next.paths),new Set(['','src','src/deep','old','old/nested','docs']));
  assert.ok(next.paths.length<loaded.length/5);
  const restored=planCodeDirectoryRefresh(next.observation,'repo:checkout',worktree(),loaded);
  assert.deepEqual(new Set(restored.paths),new Set(['','src','src/deep','old','old/nested','docs']));
});

test('未知深层目录回落最近已加载祖先，首次观察仅修复真实目录不一致',()=>{
  const loadedWithAncestor=loaded.map(directory=>directory.path==='src'?{...directory,entries:[{path:'src/new'}]}:directory);
  const first=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('src/new/deeper/file.ts','untracked')]),loadedWithAncestor);
  assert.deepEqual(first.paths,[],'尚未加载的父目录不需要补一次启动读取');
  const later=planCodeDirectoryRefresh(first.observation,'repo:checkout',worktree([change('src/new/deeper/file.ts','untracked'),change('src/another/deep/file.ts','added')]),loaded);
  assert.deepEqual(new Set(later.paths),new Set(['','src']));
  const mismatch=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('src/deep/new.ts','untracked'),change('docs/missing.md','deleted')]),[
    ...loaded.filter(item=>item.path!=='docs'),{path:'docs',entries:[{path:'docs/missing.md'}]},
  ]);
  assert.deepEqual(new Set(mismatch.paths),new Set(['','src','src/deep','docs']));
  const rootOnly=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('new-dir/nested/a.ts','untracked')]),[{path:'',entries:[]}]);
  assert.deepEqual(rootOnly.paths,[''],'首次SCM晚到且新增整个目录时核对已加载根');
  assert.equal(rootOnly.readFile,true,'首次状态也允许核对已缓存的当前正文，调用方不读取未打开文件');
  const presentAncestor=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('new-dir/nested/a.ts','untracked')]),[{path:'',entries:[{path:'new-dir'}]}]);
  assert.deepEqual(presentAncestor.paths,[],'已存在祖先且深层未展开，不重复读取启动根');
  const collapsedDeletion=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('old/nested/a.ts','deleted')]),[{path:'',entries:[{path:'old'}]}]);
  assert.deepEqual(collapsedDeletion.paths,[''],'旧根仍有已删除目录且深层未展开时必须核对祖先');
  const collapsedRename=planCodeDirectoryRefresh(undefined,'repo:checkout',worktree([change('new/nested/a.ts','renamed','old/nested/a.ts')]),[{path:'',entries:[{path:'old'},{path:'new'}]}]);
  assert.deepEqual(collapsedRename.paths,[''],'重命名旧侧的未加载后代不能证明祖先仍有效');
});

test('分支、HEAD或来源身份变化保守核对已加载目录',()=>{
  const previous=initial();
  for(const [identity,extra]of [['repo:checkout',{branch:'feature'}],['repo:checkout',{head:'head-2'}],['another:checkout',{}]]){
    const next=planCodeDirectoryRefresh(previous,identity,worktree([],extra),loaded);
    assert.deepEqual(next.paths,loaded.map(item=>item.path));
  }
});

test('不可用空列表不当作权威删除；不完整观察及恢复后保守核对',()=>{
  const previous=initial(worktree([change('src/deep/file.ts')]));
  const unavailable=planCodeDirectoryRefresh(previous,'repo:checkout',worktree([],{available:false,status:'unavailable'}),loaded);
  assert.deepEqual(unavailable.paths,[]);assert.equal(unavailable.readFile,false);assert.deepEqual(unavailable.observation.entries,previous.entries);assert.equal(unavailable.observation.uncertain,true);
  const recovered=planCodeDirectoryRefresh(unavailable.observation,'repo:checkout',worktree([change('src/deep/file.ts')]),loaded);
  assert.deepEqual(recovered.paths,loaded.map(item=>item.path));
  const partial=planCodeDirectoryRefresh(previous,'repo:checkout',worktree([],{status:'partial',coverage:{truncated:true}}),loaded);
  assert.deepEqual(partial.paths,loaded.map(item=>item.path));assert.deepEqual(partial.observation.entries,previous.entries);
  const complete=planCodeDirectoryRefresh(partial.observation,'repo:checkout',worktree([change('src/deep/file.ts')]),loaded);
  assert.deepEqual(complete.paths,loaded.map(item=>item.path));
});

test('完整父目录移除已消失子树及待返回目录；截断列表不能证明删除',()=>{
  const known=['','src','src/removed','src/removed/nested','src/kept','src/kept/deep','unrelated/cached'];
  const parent={path:'src',entries:[{path:'src/kept',kind:'directory'},{path:'src/replaced',kind:'file'}],truncated:false};
  assert.deepEqual(removedCodeDirectoryPaths(parent,known),['src/removed','src/removed/nested']);
  assert.deepEqual(removedCodeDirectoryPaths({...parent,truncated:true},known),[]);
  assert.deepEqual(removedCodeDirectoryPaths({path:'',entries:[{path:'src',kind:'directory'}],truncated:false},known),['unrelated/cached']);
  assert.deepEqual(removedCodeDirectoryPaths(parent,[...known,'src/replaced/deep']),['src/removed','src/removed/nested','src/replaced/deep']);
});
