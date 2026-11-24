import assert from 'node:assert/strict';
import test from 'node:test';
import {localFilePath} from '../src/lib/localFileLink.ts';

test('local file URLs decode to real filesystem paths and keep unsafe targets out',()=>{
 assert.equal(localFilePath('file:///Users/a/Application%20Support/%E5%9B%BE%E7%89%87.png'),'/Users/a/Application Support/图片.png');
 assert.equal(localFilePath('file:///tmp/name%20space.md#L12'),'/tmp/name space.md#L12');
 assert.equal(localFilePath('file://localhost/tmp/a.md'),'/tmp/a.md');
 assert.equal(localFilePath('file:///C:/work/a.md'),'C:/work/a.md');
 for(const value of ['file:///tmp/%ZZ.md','file:///tmp/%00secret','file:///tmp/%5csecret','file:///tmp/a%3Fb.md','file://server/share/a.md','file:///tmp/a.md?token=x','file:/tmp/a.md'])assert.equal(localFilePath(value),null,value);
});
