import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import {AGENT_OPERATION_SCHEMAS} from '../../src/operation-schemas.ts';

test('cancelled current and retained runs remain readable through strict conversation and reminder transports',()=>{
 const at=new Date().toISOString();
 const run={id:'run',participantId:'p',provider:'qoder',generation:'g',status:'stopped',accepted:false,tools:[],stopRequested:true,resourcesReleased:true,executionState:'unknown',startedAt:at,updatedAt:at};
 const conversation={id:'chat',workspaceId:'workspace',cwd:'/workspace',title:'Stopped',revision:'r',hidden:false,updatedAt:at,participants:[],entries:[],requests:[],run,retainedRuns:[{...run,id:'old'}]};
 const ajv=new Ajv2020({strict:false});
 for(const [schema,value]of [[AGENT_OPERATION_SCHEMAS.conversation,conversation],[AGENT_OPERATION_SCHEMAS.conversations,{conversations:[conversation]}]] as const){
  const validate=ajv.compile(schema);assert.equal(validate(value),true,JSON.stringify(validate.errors));
 }
});
