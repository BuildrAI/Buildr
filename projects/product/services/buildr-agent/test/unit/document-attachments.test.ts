import assert from 'node:assert/strict';
import test from 'node:test';
import { documentTypes, documentExtensions, documentBytes, attachmentName } from '../../src/domain/document-attachments.ts';
import { AGENT_OPERATION_SCHEMAS } from '../../src/operation-schemas.ts';
import { normalizeSendDraft } from '../../src/domain/send-draft.ts';

test('document content checks retain bytes without parsing and reject false binary signatures',()=>{
 const content = (mimeType:string, value:Buffer|string) => documentBytes({mimeType,bytes:Buffer.from(value)});
 for (const type of documentTypes) {
  const bytes = Buffer.from(type==='application/pdf'?'%PDF-1.7\n':type==='application/rtf'?'{\\rtf1 text}':type.includes('openxmlformats')||type.includes('oasis.opendocument')?Buffer.from([80,75,3,4,0]):['application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'].includes(type)?Buffer.from([208,207,17,224,161,177,26,225]):'文档内容');
  assert.deepEqual(content(type,bytes),bytes);
 }
 for(const type of ['application/pdf','application/msword',documentExtensions.docx!]) assert.throws(()=>content(type,'not a document'),{code:'agent_document_invalid'});
 assert.throws(()=>content('application/pdf',''),{code:'agent_document_invalid'});
 assert.throws(()=>content('text/plain',Buffer.alloc(32*1024*1024+1)),{code:'agent_document_invalid'});
 assert.throws(()=>content('application/javascript','run()'),{code:'agent_document_invalid'});
 for(const name of ['../bad.pdf','bad\n.pdf','a/b.txt'])assert.throws(()=>attachmentName(name),{code:'agent_attachment_invalid'});
 assert.equal(attachmentName('合同.pdf'),'合同.pdf');
});

test('send input accepts nine attachments but rejects ten with all transport schemas aligned',()=>{
 const base={expectedRevision:'version',connectionId:'local',text:''};
 assert.equal(normalizeSendDraft({...base,attachmentIds:Array.from({length:9},(_,i)=>String(i))}).attachmentIds!.length,9);
 assert.throws(()=>normalizeSendDraft({...base,attachmentIds:Array.from({length:10},(_,i)=>String(i))}),{code:'agent_attachments_invalid'});
 assert.ok(JSON.stringify(AGENT_OPERATION_SCHEMAS).includes('application/pdf'));
});
