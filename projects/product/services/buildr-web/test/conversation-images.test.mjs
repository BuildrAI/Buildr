import test from 'node:test';
import assert from 'node:assert/strict';
import {imageSelectionError,transferredFiles,conversationImageLimit,conversationVideoLimit,attachmentMimeType} from '../src/features/agent-conversations/conversation-images.ts';
const png=new File(['png bytes'],'截图.png',{type:'image/png'});
test('选择、拖放和剪贴板文件都使用相同图片，剪贴板缺少files时读取file items',()=>{
  assert.deepEqual(transferredFiles({files:[png],items:[]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[{kind:'string',getAsFile:()=>null},{kind:'file',getAsFile:()=>png},{kind:'file',getAsFile:()=>null}]}),[png]);
  assert.deepEqual(transferredFiles({files:[],items:[]}),[]);
});
test('校验整个批次并准确指出失败文件，不接受空图片、非图片、超容量或超过九份',()=>{
  assert.equal(imageSelectionError([png],3),undefined);
  assert.match(imageSelectionError([png,png],8),/9 份/);
  assert.match(imageSelectionError([new File(['exe'],'程序.exe',{type:'application/octet-stream'})],0),/程序.exe/);
  assert.match(imageSelectionError([new File([],'空截图.png',{type:'image/png'})],0),/空截图.png/);
  assert.match(imageSelectionError([new File([new Uint8Array(conversationImageLimit+1)],'大图.png',{type:'image/png'})],0),/大图.png/);
  assert.match(imageSelectionError([png],0,1),/截图.png/);
  assert.equal(imageSelectionError([new File(['x'],'small.webp',{type:'image/webp'})],0),undefined);
});


test('视频与图片共用九份材料，剪贴板文件按容器类型校验且视频独立限32 MiB',()=>{
 const video=new File(['video'],'录屏.mp4',{type:'video/mp4'});
 assert.equal(imageSelectionError([video,png],2),undefined);assert.match(imageSelectionError([video,png],8),/9 份/);
 assert.equal(imageSelectionError([new File(['video'],'录屏.MOV')],0),undefined);assert.equal(attachmentMimeType({name:'clip.webm',type:'application/octet-stream'}),'video/webm');
 assert.match(imageSelectionError([new File([new Uint8Array(conversationVideoLimit+1)],'大视频.mp4',{type:'video/mp4'})],0),/大视频.mp4.*32 MiB/);
 assert.equal(imageSelectionError([video],0,1),undefined,'模型单图上限不能误用于视频原件');
 assert.deepEqual(transferredFiles({files:[],items:[{kind:'file',getAsFile:()=>video}]}),[video]);
});

test('常见文档按扩展名识别空类型及浏览器别名，最多九份且文档独立限32 MiB',()=>{
 for(const name of ['说明.md','文档.PDF','合同.doc','合同.docx','表格.xlsx','演示.pptx','数据.csv','记录.txt','配置.yaml','开放.odt']) {
   assert.equal(imageSelectionError([new File(['content'],name)],8),undefined,name);
 }
 assert.equal(attachmentMimeType({name:'说明.md',type:'application/octet-stream'}),'text/markdown');
 assert.equal(attachmentMimeType({name:'配置.yml',type:'text/yaml'}),'application/yaml');
 const document=new File(['content'],'资料.pdf',{type:'application/pdf'});
 assert.equal(imageSelectionError(Array(9).fill(document),0,1),undefined);
 assert.match(imageSelectionError(Array(10).fill(document),0),/9 份/);
 assert.match(imageSelectionError([new File([],'空文档.md')],0),/空文档/);
 assert.match(imageSelectionError([new File([new Uint8Array(32*1024*1024+1)],'大文档.pdf')],0),/32 MiB/);
});
