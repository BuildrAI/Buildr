import test from 'node:test';
import assert from 'node:assert/strict';
import {imageSelectionError,transferredFiles,conversationImageLimit} from '../src/features/agent-conversations/conversation-images.ts';
const png=new File(['png bytes'],'截图.png',{type:'image/png'});
test('选择、拖放和剪贴板文件都使用相同图片，剪贴板缺少files时读取file items',()=>{
  assert.deepEqual(transferredFiles({files:[png],items:[]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[{kind:'string',getAsFile:()=>null},{kind:'file',getAsFile:()=>png},{kind:'file',getAsFile:()=>null}]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[]}),[]);
});
test('校验整个批次并准确指出失败文件，不接受空图片、非图片、超容量或超过四张',()=>{
  assert.equal(imageSelectionError([png],3),undefined);
  assert.match(imageSelectionError([png,png],3),/4 张/);
  assert.match(imageSelectionError([new File(['pdf'],'资料.pdf',{type:'application/pdf'})],0),/资料.pdf/);
  assert.match(imageSelectionError([new File([],'空截图.png',{type:'image/png'})],0),/空截图.png/);
  assert.match(imageSelectionError([new File([new Uint8Array(conversationImageLimit+1)],'大图.png',{type:'image/png'})],0),/大图.png/);
  assert.match(imageSelectionError([png],0,1),/截图.png/);
  assert.equal(imageSelectionError([new File(['x'],'small.webp',{type:'image/webp'})],0),undefined);
});
