import assert from 'node:assert/strict';
import test from 'node:test';
import { repositorySourceLines, visibleRepositoryMatch } from '../src/features/workspace/components/repository-file-page.ts';
const page=(offset,endOffset,matchOffset,matchEndOffset)=>({index:0,total:2,offset,endOffset,startLine:2,endLine:2,startsMidLine:true,endsMidLine:true,matchOffset,matchEndOffset});

test('observed byte match uses original Unicode string offsets and keeps actual line numbers',()=>{
  const content='前😀界needle\n尾';
  const visible=visibleRepositoryMatch(content,page(100,120,107,116));
  assert.deepEqual(visible,{start:3,end:10,continuesBefore:false,continuesAfter:false});
  const rows=repositorySourceLines(content,40,visible);
  assert.deepEqual(rows,[{text:'前😀界needle',line:40,match:{start:3,end:10}},{text:'尾',line:41,match:undefined}]);
});

test('cross-page observed match highlights only real visible bytes without inferring partial words',()=>{
  assert.deepEqual(visibleRepositoryMatch('前界',page(0,6,3,14)),{start:1,end:2,continuesBefore:false,continuesAfter:true});
  assert.deepEqual(visibleRepositoryMatch('😀needle尾',page(6,19,3,16)),{start:0,end:8,continuesBefore:true,continuesAfter:false});
  assert.equal(visibleRepositoryMatch('xyz',page(20,23,3,16)),null);
});

test('invalid or incompatible byte boundaries do not manufacture a match',()=>{
  assert.equal(visibleRepositoryMatch('界',page(0,3,1,3)),null);
  assert.equal(visibleRepositoryMatch('界',page(0,4,0,3)),null);
  assert.equal(visibleRepositoryMatch('界',{...page(0,3,0,3),matchOffset:undefined}),null);
});

test('nonfinal page ending in LF does not render the next page line; full-file trailing line remains',()=>{
  const content='line 40\nline 41\n';
  const first=repositorySourceLines(content,40,undefined,true);
  const next=repositorySourceLines('line 42\n',42,undefined,false);
  assert.deepEqual(first.map(row=>row.line),[40,41]);
  assert.deepEqual(next.map(row=>row.line),[42,43]);
  assert.equal(next.at(-1).text,'');
  assert.equal(first.map(row=>row.text).join('\n')+'\n',content);
  assert.deepEqual(repositorySourceLines(content,40).map(row=>row.line),[40,41,42]);
});
