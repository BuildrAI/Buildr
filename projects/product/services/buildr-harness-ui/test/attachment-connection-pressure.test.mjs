import assert from 'node:assert/strict';
import test from 'node:test';
import {isPageVisible,subscribePageVisibility,modelCatalogRefreshMs} from '../src/features/agent-conversations/page-visibility.ts';
import {timeAttachmentStage} from '../src/features/agent-conversations/api/attachment-timing.ts';

test('页面隐藏和恢复准确通知，卸载释放订阅，非浏览器安全',()=>{
  assert.equal(isPageVisible(),true);
  const old=globalThis.document,doc=new EventTarget();doc.visibilityState='visible';globalThis.document=doc;
  const states=[],stop=subscribePageVisibility(()=>states.push(isPageVisible()));
  try{doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));assert.deepEqual(states,[false,true]);stop();doc.dispatchEvent(new Event('visibilitychange'));assert.equal(states.length,2);}
  finally{stop();if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
test('聊天模型目录降低频率，设置页保留原刷新',()=>{assert.equal(modelCatalogRefreshMs(false),30000);assert.equal(modelCatalogRefreshMs(true),5000);});
test('上传耗时只使用固定阶段名，清理旧值，不改变成功结果或错误',async()=>{
  const calls=[],timing={now:()=>12,clearMeasures:name=>calls.push(['clear',name]),measure:(name,span)=>calls.push(['measure',name,span])};
  const result={id:'result'};assert.equal(await timeAttachmentStage('read-file',async()=>result,timing),result);
  assert.deepEqual(calls,[['clear','buildr.attachment.read-file'],['measure','buildr.attachment.read-file',{start:12,end:12}]]);
  const error=Error('network');await assert.rejects(timeAttachmentStage('request',async()=>{throw error;},timing),failure=>failure===error);
  const broken={now(){throw Error('diagnostic');},clearMeasures(){throw Error('diagnostic');},measure(){throw Error('diagnostic');}};
  assert.equal(await timeAttachmentStage('request',async()=>result,broken),result);
  await assert.rejects(timeAttachmentStage('request',async()=>{throw error;},broken),failure=>failure===error);
  assert.equal(await timeAttachmentStage('request',async()=>result,{...timing,measure(){throw Error('measure');}}),result);
});
