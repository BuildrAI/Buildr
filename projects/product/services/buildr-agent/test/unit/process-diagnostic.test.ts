import test from 'node:test';
import assert from 'node:assert/strict';
import { failure } from '../../src/process/transport.ts';

test('internal transport failures preserve safe engine codes, not raw secrets or native-model blame',()=>{
 let value:any;
 const response={headersSent:false,writeHead(){},end(text:string){value=JSON.parse(text);}};
 failure(response as any,Object.assign(new Error('database locked Authorization: Bearer private-secret'),{code:'SQLITE_BUSY'}));
 assert.equal(value.error.code,'agent_process_operation_failed');
 assert.equal(value.error.internalCode,'SQLITE_BUSY');
 assert.ok(!JSON.stringify(value).includes('private-secret'));
 assert.ok(!value.error.message.includes('原生执行'));
});
