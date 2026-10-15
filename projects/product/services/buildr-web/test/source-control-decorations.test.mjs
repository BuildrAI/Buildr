import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceControlDecorations } from '../src/features/code/source-control-decorations.ts';

test('文件标记精确匹配代码库与检出，变更沿祖先聚合，重命名前路径和删除目录仍提示',()=>{
  const data={repositories:[{id:'repo',worktrees:[{worktreeId:'main',fileCount:4,changes:[
    {path:'src/deep/edited.ts',status:'modified'},
    {path:'src/deep/added.ts',status:'added'},
    {path:'src/deep/added.ts',status:'modified'},
    {path:'next/renamed.ts',previousPath:'old/nested/original.ts',status:'renamed'},
    {path:'removed/last.ts',status:'deleted'},
  ]},{worktreeId:'other',fileCount:1,changes:[{path:'src/deep/edited.ts',status:'conflicted'}]}]}]};
  const value=sourceControlDecorations(data,'repo','main');
  assert.equal(value.hasChanges,true);assert.equal(value.files.get('src/deep/edited.ts'),'M');assert.equal(value.files.get('src/deep/added.ts'),'A');
  assert.deepEqual([...value.directories],['src','src/deep','next','old','old/nested','removed']);
  assert.equal(sourceControlDecorations(data,'repo','other').files.get('src/deep/edited.ts'),'C');
  assert.equal(sourceControlDecorations(data,'another-repo','main').hasChanges,false);
  assert.equal(sourceControlDecorations(data,'repo','main',true).files.size,0,'固定历史不能混入当前状态');
});
