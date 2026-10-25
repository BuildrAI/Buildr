import test from 'node:test';

import assert from 'node:assert/strict';

import { translateRequest, type OpaqueReasoning } from '../../src/model-access/protocols.ts';

import type { ProtocolJson } from '../../src/model-access/contracts.ts';

const model={id:'source-model',label:'真实来源模型',images:true,tools:true,contextWindow:32000};

const noOpaque:OpaqueReasoning={encode(value){return JSON.stringify(value);},decode(value){return JSON.parse(value);}};

test('Messages preserves system authority, tool identity and images when converted to Responses',()=>{
  const converted=translateRequest({model:'m',system:[{type:'text',text:'system rule'}],messages:[{role:'user',content:[{type:'text',text:'look'},{type:'image',source:{type:'base64',media_type:'image/png',data:'abc'}}]},{role:'assistant',content:[{type:'tool_use',id:'t1',name:'read',input:{path:'a'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'value'}]}],tools:[{name:'read',input_schema:{type:'object'}}],max_tokens:42},'anthropic-messages','responses',noOpaque);
  const input=converted.input as ProtocolJson[];assert.equal(input[0].role,'system');assert.equal(input[2].call_id,'t1');assert.equal(input[3].call_id,'t1');assert.equal(converted.max_output_tokens,42);assert.equal((input[1].content as ProtocolJson[])[1].image_url,'data:image/png;base64,abc');
});
