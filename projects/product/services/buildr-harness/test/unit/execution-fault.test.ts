import test from 'node:test';
import assert from 'node:assert/strict';
import {executionFault,withExecutionFault} from '../../src/domain/execution-fault.ts';
import {NativeObservationError,NativeRequestError} from '../../src/domain/error-diagnostic.ts';
test('adapter fault mapping is bounded and independent of recovery permission',()=>{
 assert.equal(new NativeRequestError('Malformed tool call stream: orphan_tool_call_delta').fault?.kind,'protocol');
 for(const id of ['codex','dsh','qoder'])assert.equal(new NativeObservationError(id+'_execution_observation_lost').fault.kind,'transport');
 assert.equal(new NativeObservationError('agent_native_process_closed').fault.kind,'process');
 for(const text of ['invalid response','permission denied','quota exhausted','stopped by user','random error'])assert.equal(executionFault(text),undefined);
});
test('adapter events preserve identity and terminal facts while normalizing faults',()=>{
 const e={type:'observation' as const,observation:{status:'unknown' as const,executionRef:{id:'original'},tools:[{id:'write',label:'write',status:'unknown' as const}],diagnostic:'Malformed tool call stream: orphan_tool_call_delta'}};
 const normalized=withExecutionFault(e);assert.equal(normalized.type,'observation');
 if(normalized.type==='observation'){assert.equal(normalized.observation.executionRef?.id,'original');assert.equal(normalized.observation.tools[0]?.status,'unknown');assert.equal(normalized.observation.fault?.kind,'protocol');}
 const completed={type:'completed' as const,status:'completed' as const};assert.equal(withExecutionFault(completed),completed);
 assert.deepEqual(withExecutionFault({type:'completed',status:'failed',fault:{kind:'process'},diagnostic:'vendor details'}),{type:'completed',status:'failed',fault:{kind:'process'},diagnostic:'vendor details'});
});
