import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownDestination} from '../src/lib/markdownDestination.ts';
test('Markdown angle delimiters preserve literal spaces and citation locations',()=>{
 for(const path of ['.buildr/local/记录 文档.md','/work/a (copy).md','C:\\work\\report.md','a.md:12:3','a.md#L12','https://example.com/a'])assert.equal(markdownDestination('<'+path+'>'),path);
 assert.equal(markdownDestination(' normal.md '),'normal.md');
 for(const path of ['<x.md','x.md>','<a<b>','<a\nb>','<>'])assert.equal(markdownDestination(path),null);
});
