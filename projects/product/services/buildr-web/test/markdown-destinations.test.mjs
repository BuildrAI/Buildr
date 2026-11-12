import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownDestination} from '../src/lib/markdownDestination.ts';
test('Markdown angle delimiters preserve literal spaces and citation locations',()=>{
 for(const path of ['.buildr/local/记录 文档.md','/work/a (copy).md','C:\\work\\report.md','a.md:12:3','a.md#L12','https://example.com/a'])assert.equal(markdownDestination('<'+path+'>'),path);
 assert.equal(markdownDestination(' normal.md '),'normal.md');
 for(const path of ['<x.md','x.md>','<a<b>','<a\nb>','<>'])assert.equal(markdownDestination(path),null);
});

test('file URL normalization preserves one downstream decoding and rejects malformed or non-local targets',async()=>{
 const {localFilePath}=await import('../src/lib/localFileLink.ts');
 assert.equal(localFilePath('file:///tmp/name%20space.md#L12'),'/tmp/name%20space.md#L12');
 assert.equal(localFilePath('file://localhost/tmp/a.md'),'/tmp/a.md');
 assert.equal(localFilePath('file:///C:/work/a.md'),'C:/work/a.md');
 for(const value of ['file:///tmp/%ZZ.md','file:///tmp/%00secret','file:///tmp/%5csecret','file://server/share/a.md','file:///tmp/a.md?token=x','file:/tmp/a.md'])assert.equal(localFilePath(value),null,value);
});
