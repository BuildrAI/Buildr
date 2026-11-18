import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import {AGENT_OPERATION_SCHEMAS} from '../../src/operation-schemas.ts';

test('cancelled current and retained runs remain readable through strict conversation and reminder transports',()=>{
 const at=new Date().toISOString();
 const run={id:'run',participantId:'p',provider:'qoder',generation:'g',status:'stopped',accepted:false,tools:[],stopRequested:true,resourcesReleased:true,executionState:'unknown',startedAt:at,updatedAt:at};
 const conversation={id:'chat',workspaceId:'workspace',cwd:'/workspace',title:'Stopped',revision:'r',hidden:false,updatedAt:at,participants:[],entries:[],requests:[],run,retainedRuns:[{...run,id:'old',questionsEndedBy:'run'}]};
 const ajv=new Ajv2020({strict:false});
 for(const [schema,value]of [[AGENT_OPERATION_SCHEMAS.conversation,conversation],[AGENT_OPERATION_SCHEMAS.conversations,{conversations:[conversation]}]] as const){
  const validate=ajv.compile(schema);assert.equal(validate(value),true,JSON.stringify(validate.errors));
 }
});

test('native question release is an optional transport capability, not a global stop permission',()=>{
 const ajv=new Ajv2020({strict:false}),validate=ajv.compile(AGENT_OPERATION_SCHEMAS.connections);
 const capabilities={endQuestionWait:true,text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
 const connection={id:'codex',provider:'codex',label:'Codex',revision:'r',status:'ready',enabled:true,models:[],capabilities};
 assert.equal(validate({connections:[connection]}),true,JSON.stringify(validate.errors));
 const {endQuestionWait,...legacy}=capabilities;assert.equal(validate({connections:[{...connection,capabilities:legacy}]}),true);
});

test('pending summaries hide ended questions but retain approval decisions on the same active execution',async()=>{
 const {pendingConversationSummary}=await import('../../src/domain/pending-summary.ts');
 const view={id:'chat',workspaceId:'scope',title:'Work',run:{id:'new',status:'running'},retainedRuns:[{id:'old',questionsEndedBy:'new'}],requests:[{id:'question',kind:'question',runId:'old'},{id:'approval',kind:'approval',runId:'old'}]} as unknown as import('../../src/contracts.ts').ConversationView;
 assert.equal(pendingConversationSummary(view).count,1);assert.equal(view.requests.length,2,'summary is read-only');
});
