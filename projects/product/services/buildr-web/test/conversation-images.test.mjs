import test from 'node:test';
import assert from 'node:assert/strict';
import {imageSelectionError,transferredFiles,conversationImageLimit,conversationVideoLimit,attachmentMimeType} from '../src/features/agent-conversations/conversation-images.ts';
const png=new File(['png bytes'],'截图.png',{type:'image/png'});
test('选择、拖放和剪贴板文件都使用相同图片，剪贴板缺少files时读取file items',()=>{
  assert.deepEqual(transferredFiles({files:[png],items:[]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[{kind:'string',getAsFile:()=>null},{kind:'file',getAsFile:()=>png},{kind:'file',getAsFile:()=>null}]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[]}),[]);
});
test('校验整个批次并准确指出失败文件，不接受空图片、非图片、超容量或超过四张',()=>{
  assert.equal(imageSelectionError([png],3),undefined);
  assert.match(imageSelectionError([png,png],3),/4 份/);
  assert.match(imageSelectionError([new File(['pdf'],'资料.pdf',{type:'application/pdf'})],0),/资料.pdf/);
  assert.match(imageSelectionError([new File([],'空截图.png',{type:'image/png'})],0),/空截图.png/);
  assert.match(imageSelectionError([new File([new Uint8Array(conversationImageLimit+1)],'大图.png',{type:'image/png'})],0),/大图.png/);
  assert.match(imageSelectionError([png],0,1),/截图.png/);
  assert.equal(imageSelectionError([new File(['x'],'small.webp',{type:'image/webp'})],0),undefined);
});


test('视频与图片共用四份材料，剪贴板文件按容器类型校验且视频独立限32 MiB',()=>{
 const video=new File(['video'],'录屏.mp4',{type:'video/mp4'});
 assert.equal(imageSelectionError([video,png],2),undefined);assert.match(imageSelectionError([video,png],3),/4 份/);
 assert.equal(imageSelectionError([new File(['video'],'录屏.MOV')],0),undefined);assert.equal(attachmentMimeType({name:'clip.webm',type:'application/octet-stream'}),'video/webm');
 assert.match(imageSelectionError([new File([new Uint8Array(conversationVideoLimit+1)],'大视频.mp4',{type:'video/mp4'})],0),/大视频.mp4.*32 MiB/);
 assert.equal(imageSelectionError([video],0,1),undefined,'模型单图上限不能误用于视频原件');
 assert.deepEqual(transferredFiles({files:[],items:[{kind:'file',getAsFile:()=>video}]}),[video]);
});
