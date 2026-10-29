import test from 'node:test';
import assert from 'node:assert/strict';
import {draftMaterialIds,firstConversationSubmissions} from '../src/features/agent-conversations/conversation-first-submission.ts';
test('首次发送身份和准确输入在刷新后恢复，不被其他提交的迟到清理覆盖',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const manager=firstConversationSubmissions(storage,'profile');
  const one={draftId:'draft-one',workspaceId:'workspace-one',input:{text:'first',connectionId:'codex',clientRequestId:'request-one',expectedDraftRevision:'images-one',attachmentIds:['image-one']}};
  manager.save(one);assert.deepEqual(firstConversationSubmissions(storage,'profile').read(),one);
  manager.clear('different-request');assert.deepEqual(manager.read(),one);
  const next={...one,input:{...one.input,text:'next',clientRequestId:'request-two'}};manager.save(next);manager.clear('request-one');assert.deepEqual(manager.read(),next);
  manager.clear('request-two');assert.equal(manager.read(),undefined);assert.equal(firstConversationSubmissions(storage,'profile').read(),undefined);
});
test('浏览器存储被拒绝仍保存同页提交身份，不自动重放网络',()=>{
  const unavailable=()=>{throw Error('denied');};const manager=firstConversationSubmissions({getItem:unavailable,setItem:unavailable,removeItem:unavailable});
  const value={draftId:'draft',workspaceId:'workspace',input:{text:'first',connectionId:'codex',clientRequestId:'request',expectedDraftRevision:'empty'}};
  manager.save(value);assert.deepEqual(manager.read(),value);manager.clear('request');assert.equal(manager.read(),undefined);
});

test('真实对话各自保存图片成员，刷新恢复不复制文件字节或混入共享草稿',async()=>{
  const {readConversationImages,writeConversationImages}=await import('../src/features/agent-conversations/useConversationAttachments.ts');
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const image={id:'image-a',name:'one.png',mimeType:'image/png',size:8,revision:'r1',file:new File(['bytes'],'one.png')};
  assert.equal(writeConversationImages(storage,'profile',{a:[image],b:[{...image,id:'image-b'}]}),true);
  const restored=readConversationImages(storage,'profile');assert.equal(restored.a[0].id,'image-a');assert.equal(restored.b[0].id,'image-b');assert.equal(restored.new,undefined);assert.equal(restored.a[0].file,undefined);
});

test('first-send comparison ignores derived video frames but keeps original membership and order',()=>{
  assert.deepEqual(draftMaterialIds([{id:'frame',frame:true},{id:'recording'},{id:'photo'}]),['recording','photo']);
  assert.deepEqual(draftMaterialIds([{id:'photo'}]),['photo']);
});
