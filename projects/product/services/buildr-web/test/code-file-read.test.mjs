import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readExplorerFile} from '../src/features/code/code-file-read.ts';
const snapshot={selector:{kind:'code',repositoryId:'repo',checkoutId:'checkout',path:'src/main.ts'},fileId:'file-one',absolutePath:'/repo/src/main.ts',rootPath:'/repo',path:'src/main.ts',content:'const x = 1;\n你好🌳\n',kind:'text',revision:'file-revision',sourceRevision:'source-revision',locationLabel:'repo',versionLabel:'dev · 当前文件',sizeBytes:29,observedAt:new Date().toISOString(),editable:true,protectedRanges:[],readonlyReason:null,readonlyReasonCode:null};
const input={repositoryId:'repo',checkoutId:'checkout',path:snapshot.path};
function reader(value=snapshot){const calls=[];return {calls,editorFile:async(...args)=>{calls.push(['editor',...args]);return value;},file:async(...args)=>{calls.push(['file',...args]);return {kind:'image',content:'fallback'};}};}
test('当前完整文本只读取一次，阅读与编辑共用正文、来源和准确摘要',async()=>{
  const api=reader(),file=await readExplorerFile('workspace',input,new AbortController().signal,api);
  assert.equal(api.calls.length,1);assert.equal(api.calls[0][0],'editor');
  assert.equal(file.content,snapshot.content);assert.equal(file.editorSnapshot,snapshot);assert.equal(file.revision,snapshot.revision);assert.equal(file.source.checkoutId,input.checkoutId);
  assert.equal(file.digest,'sha256-'+createHash('sha256').update(snapshot.content).digest('hex'));
});
test('历史、图片和后续文件段保持原读取，编辑超限或不支持时有界回退',async()=>{
  for(const extra of [{commitHash:'a'.repeat(40)},{path:'x.png'},{page:1,expectedRevision:'observed'}]){
    const api=reader();await readExplorerFile('workspace',{...input,...extra},new AbortController().signal,api);assert.deepEqual(api.calls.map(c=>c[0]),['file']);
  }
  const api=reader({...snapshot,kind:'unsupported',content:''});await readExplorerFile('workspace',input,new AbortController().signal,api);assert.deepEqual(api.calls.map(c=>c[0]),['editor','file']);
});
test('来源失败不回退到其他读取，搜索过期和版本变化准确拒绝',async()=>{
  const api=reader();api.editorFile=async()=>{throw Error('来源身份变化');};
  await assert.rejects(readExplorerFile('workspace',input,new AbortController().signal,api),/来源身份变化/);assert.equal(api.calls.length,0);
  await assert.rejects(readExplorerFile('workspace',{...input,line:99},new AbortController().signal,reader()),/行号/);
  await assert.rejects(readExplorerFile('workspace',{...input,line:2,matchQuery:'不存在'},new AbortController().signal,reader()),/匹配文字/);
  await assert.rejects(readExplorerFile('workspace',{...input,expectedRevision:'old'},new AbortController().signal,reader()),/文件已变化/);
  const file=await readExplorerFile('workspace',{...input,line:2,matchQuery:'你好'},new AbortController().signal,reader());assert.equal(file.content,snapshot.content);
});
