import assert from 'node:assert/strict';
import test from 'node:test';
import { generateQoderNativeTitle } from '../../src/executors/qoder/model-title.ts';

const input=(model?:string)=>({contextRef:{id:'work-context'},cwd:'/work',description:'用户要求：梳理供应商入驻发布流程',...(model?{model}:{}),signal:new AbortController().signal});

function chatStream(title:string):Response {
  const frames=[
    `data: ${JSON.stringify({choices:[{index:0,delta:{content:JSON.stringify({title})}}]})}\n\n`,
    `data: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\n`,
    'event:finish\n\n',
  ];
  return new Response(frames.join(''),{headers:{'content-type':'text/event-stream'}});
}

test('Qoder native title sends one tool-free /chat request with the selected catalog model', async()=>{
  const requests:string[]=[];let body:any;
  const title=await generateQoderNativeTitle(input('model-b'),async(path,init)=>{
    requests.push(path);
    if(path==='/models')return Response.json({chat:[{key:'model-a',display_name:'A'},{key:'model-b',display_name:'B',is_reasoning:true}],app:[{key:'app-only'}]});
    body=JSON.parse(String(init?.body));
    return chatStream('Qoder 原生标题');
  });
  assert.equal(title,'Qoder 原生标题');
  assert.deepEqual(requests,['/models','/chat']);
  assert.equal(body.stream,true);
  assert.deepEqual(body.tools,[]);
  assert.deepEqual(body.parameters,{max_tokens:128});
  assert.equal(body.model_config.key,'model-b');
  assert.equal(body.model_config.is_reasoning,true);
  assert.equal(body.chat_context.extra.modelConfig.key,'model-b');
  assert.equal(body.messages.length,1);
  assert.ok(body.messages[0].content.includes('梳理供应商入驻发布流程'));
  assert.match(body.session_id,/^buildr-title-/);
  assert.equal(body.session_id,'buildr-title-'+body.request_id);
  assert.equal(body.business.name,'对话标题');
});

test('Qoder native title uses the first enabled catalog entry when the requested model is absent', async()=>{
  let selected:string|undefined;
  await generateQoderNativeTitle(input('unknown-model'),async(path,_init)=>{
    if(path==='/models')return Response.json({chat:[{key:'disabled',enable:false},{key:'first'},{key:'second'}],app:[{key:'app-only'}]});
    selected=JSON.parse(String(_init?.body)).model_config.key;
    return chatStream('兜底模型标题');
  });
  assert.equal(selected,'first');
});

test('Qoder native title fails closed when the catalog cannot be read', async()=>{
  await assert.rejects(generateQoderNativeTitle(input(),async()=>new Response('',{status:401})),/agent_title_unavailable/);
  await assert.rejects(generateQoderNativeTitle(input(),async()=>Response.json({chat:[]})),/agent_title_unavailable/);
});

test('Qoder native title reports unavailable instead of a raw missing-account error', async()=>{
  const missing=Object.assign(new Error('ENOENT'),{code:'ENOENT'});
  await assert.rejects(generateQoderNativeTitle(input(),async()=>{throw missing;}),/agent_title_unavailable/);
});
