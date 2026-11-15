import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
test('shared UI has no Development, DSH plugin host or executor SDK import',()=>{
  const issues=[];
  for(const relative of fs.globSync('src/**/*.{ts,tsx}',{cwd:root})){
    const file=path.join(root,relative),source=fs.readFileSync(file,'utf8');
    for(const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){
      const name=match[1];
      if(name.startsWith('.')&&!path.resolve(path.dirname(file),name).startsWith(root+path.sep))issues.push([relative,name]);
      if(/buildr-web|react-router-dom|@anthropic|@deepseek|@qoder|features\/(?:task|code|workspace)\//.test(name))issues.push([relative,name]);
    }
  }
  assert.deepEqual(issues,[]);
});
test('one full feature owner is exposed with narrow optional business slots',()=>{
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(metadata.name,'@buildr-ai/buildr-harness-ui');
  assert.equal(metadata.exports['.'].import,'./dist/src/index.js');
  const host=fs.readFileSync(path.join(root,'src/host.tsx'),'utf8');
  assert.doesNotMatch(host,/dispatch|executeCommand|AgentOperations|Record<string,\s*any>/);
  for(const name of ['AgentConversationsContext','ConversationPanel','ConversationComposer','ConversationRequest','AgentConnectionSettings','ModelAccountSettings','ProgrammaticAccessSettings'])assert.ok(fs.statSync(path.join(root,'src/features/agent-conversations',name+'.tsx')).isFile());
});
