import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownDestination} from '../../src/lib/markdownDestination.ts';
test('Markdown angle delimiters preserve literal spaces and citation locations',()=>{
 for(const path of ['.buildr/local/记录 文档.md','/work/a (copy).md','C:\\work\\report.md','a.md:12:3','a.md#L12','https://example.com/a'])assert.equal(markdownDestination('<'+path+'>'),path);
 assert.equal(markdownDestination(' normal.md '),'normal.md');
 for(const path of ['<x.md','x.md>','<a<b>','<a\nb>','<>'])assert.equal(markdownDestination(path),null);
});

test('file URL normalization decodes to the real filesystem path and rejects malformed or non-local targets',async()=>{
 const {localFilePath}=await import('../../src/lib/localFileLink.ts');
 assert.equal(localFilePath('file:///tmp/name%20space.md#L12'),'/tmp/name space.md#L12');
 assert.equal(localFilePath('file:///Users/a/Application%20Support/%E5%9B%BE%E7%89%87.png'),'/Users/a/Application Support/图片.png');
 assert.equal(localFilePath('file://localhost/tmp/a.md'),'/tmp/a.md');
 assert.equal(localFilePath('file:///C:/work/a.md'),'C:/work/a.md');
 for(const value of ['file:///tmp/%ZZ.md','file:///tmp/%00secret','file:///tmp/%5csecret','file:///tmp/a%3Fb.md','file://server/share/a.md','file:///tmp/a.md?token=x','file:/tmp/a.md'])assert.equal(localFilePath(value),null,value);
});

test('only HTML link fragments are separated from the source path',async()=>{
 const {htmlFileLink,htmlPreviewAddress}=await import('../../src/lib/localFileLink.ts');
 assert.deepEqual(htmlFileLink('/tmp/report.html#skills',false),{path:'/tmp/report.html',fragment:'#skills'});
 assert.deepEqual(htmlFileLink('audit/report.HTM#missing',false),{path:'audit/report.HTM',fragment:'#missing'});
 assert.deepEqual(htmlFileLink('file:///tmp/a%23b.htm#%E6%8A%80%E8%83%BD',false),{path:'/tmp/a#b.htm',fragment:'#%E6%8A%80%E8%83%BD'});
 assert.deepEqual(htmlFileLink('file:///tmp/report.html%23skills',false),{path:'/tmp/report.html#skills'});
 for(const reference of ['src/main.ts#L42','src/main.ts:42','/tmp/report.html','/tmp/a#b.html']){
  assert.deepEqual(htmlFileLink(reference,false),{path:reference});
 }
 assert.deepEqual(htmlFileLink('/tmp/report.html#skills',true),{path:'/tmp/report.html#skills'});
 assert.equal(htmlPreviewAddress('/preview?path=a%23b#old','#skills'),'/preview?path=a%23b#skills');
 assert.equal(htmlPreviewAddress(undefined,'#skills'),undefined);
});

test('conversation links split line locations without reinterpreting encoded or literal filenames',async()=>{
 const {conversationFileLink}=await import('../../src/lib/localFileLink.ts');
 assert.deepEqual(conversationFileLink('/a/AGENTS.project.md#L7',false),{path:'/a/AGENTS.project.md',line:7});
 assert.deepEqual(conversationFileLink('file:///a/a%23b.md#L7',false),{path:'/a/a#b.md',line:7});
 assert.deepEqual(conversationFileLink('file:///a/a.md%23L7',false),{path:'/a/a.md#L7'});
 assert.deepEqual(conversationFileLink('/a/a.md#L7',true),{path:'/a/a.md#L7'});
 assert.deepEqual(conversationFileLink('/a/a.md:7',false),{path:'/a/a.md',line:7});
 assert.deepEqual(conversationFileLink('/a/report.html#L7',false),{path:'/a/report.html',fragment:'#L7'});
});
