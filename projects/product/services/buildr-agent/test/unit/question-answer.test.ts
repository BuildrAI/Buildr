import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveQuestionAnswer, isMaterialAnswer } from '../../src/domain/question-answer.ts';
import { waitingQuestionText } from '../../src/domain/waiting-question-handoff.ts';
import type { PendingRequestView } from '../../src/contracts.ts';
const request:PendingRequestView={id:'request',conversationId:'chat',workspaceId:'workspace',participantId:'agent',runId:'run',generation:'gen',kind:'question',title:'范围',questions:[{id:'scope',label:'处理范围',allowOther:true,options:[{id:'yes',label:'确认'}]}]};
const image=(id:string)=>({id,path:'/private/attachments/'+id,mimeType:'image/png'});
const expand=(ids:string[])=>({images:ids.map(image),description:''});
test('自由回答图片转换为已校验本机来源，旧选项与多选不变',()=>{
  assert.deepEqual(resolveQuestionAnswer(request,{scope:'yes'},expand),{answer:{scope:'yes'},attachmentIds:[],images:[]});
  assert.deepEqual(resolveQuestionAnswer(request,{scope:['yes']},expand).answer,{scope:['yes']});
  const result=resolveQuestionAnswer(request,{scope:{text:'按截图处理',attachmentIds:['image']}},expand);
  assert.deepEqual(result.attachmentIds,['image']);assert.match((result.answer as any).scope,/按截图处理/);assert.match((result.answer as any).scope,/\/private\/attachments\/image/);assert.match((result.answer as any).scope,/未读取不能声称看过/);
});
test('拒绝客户端路径、不可自由填写的选项、跨范围材料和未准备的视频',()=>{
  assert.equal(isMaterialAnswer({text:'x',attachmentIds:[],path:'/etc/passwd'}),false);
  for(const value of [{text:'x',attachmentIds:['a'],path:'/etc/passwd'},{text:'x',attachmentIds:['a','b','c','d','e']}])assert.throws(()=>resolveQuestionAnswer(request,{scope:value},expand));
  assert.throws(()=>resolveQuestionAnswer({...request,questions:[{id:'scope',label:'范围',options:[{id:'yes',label:'确认'}]}]},{scope:{text:'',attachmentIds:['a']}},expand));
  assert.throws(()=>resolveQuestionAnswer(request,{scope:{text:'',attachmentIds:['a']}},()=>{throw new Error('other conversation');}),/other conversation/);
  assert.throws(()=>resolveQuestionAnswer(request,{scope:{text:'',attachmentIds:['a']}},()=>{throw new Error('unprepared video');}));
});
test('图片回答随交接解析为来源而不是回应旧执行',()=>{
 const answer={scope:{text:'',attachmentIds:['a']}};
 const result=waitingQuestionText(request,{runId:'run',participantId:'agent',generation:'gen',requestIds:['request'],answers:[{requestId:'request',answer}]},value=>resolveQuestionAnswer(request,value,expand).answer);
 assert.equal(result.answered,true);const text=JSON.parse(result.text);assert.match(text.回答.scope,/\/private\/attachments\/a/);assert.match(text.状态,/未回应旧原生执行/);
  assert.deepEqual(text.显示回答,{scope:''},'human display and native attachment delivery remain separate');
});

test('视频回答复用媒体展开并保留原件与抽样画面的来源说明',()=>{
 const answer=resolveQuestionAnswer(request,{scope:{text:'看录屏',attachmentIds:['video']}},ids=>{assert.deepEqual(ids,['video']);return {images:[image('frame')],description:'\n用户附加视频：不含音轨；原件 /private/video；抽样时间 0'};});
 assert.deepEqual(answer.attachmentIds,['video']);assert.deepEqual(answer.images,[image('frame')]);assert.match((answer.answer as any).scope,/不含音轨/);assert.match((answer.answer as any).scope,/\/private\/video/);
});

test('多个问题共用材料时按唯一画面核对容量，不重复计算同一帧',()=>{
 const questions=Array.from({length:5},(_,index)=>({id:'q'+index,label:'问题'+index}));
 const result=resolveQuestionAnswer({...request,questions},Object.fromEntries(questions.map(question=>[question.id,{text:'',attachmentIds:['video']}])),()=>({images:Array.from({length:8},(_,index)=>image('frame'+index)),description:'抽样画面，不含音轨'}));
 assert.deepEqual(result.attachmentIds,['video']);assert.equal(result.images.length,8);assert.equal(Object.keys(result.answer as object).length,5);
});
