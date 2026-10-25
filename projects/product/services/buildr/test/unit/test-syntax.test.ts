import assert from 'node:assert/strict';
import test from 'node:test';
import {testSyntaxFindings} from '../../tools/testing/test-syntax.ts';

test('test syntax accepts TS, JSX and native module input without executing it',()=>{
  for(const [file,content] of [['fixture.ts','throw new Error("must not execute"); const value: number = 1;'],['fixture.tsx','export const View = () => <div/>;'],['fixture.mjs','export const read = async () => import("not-installed");']]) assert.deepEqual(testSyntaxFindings(file!,content!),[]);
});
test('removing a loop body is diagnosed at the actual file position',()=>{
  const result=testSyntaxFindings('journey.ts','export async function run(){\n for(const first of [true,false])\n}\n');
  assert.equal(result.length,1);assert.equal(result[0]!.file,'journey.ts');assert.equal(result[0]!.line,3);assert.match(result[0]!.message,/Expected|Unexpected|Expression/);
});
test('semantic type mismatches are not presented as syntax or strict typing proof',()=>{
  assert.deepEqual(testSyntaxFindings('types.ts','const value: number = "not a number";'),[]);
});
