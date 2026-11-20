import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
test('Harness owns complete webpage and has no Development/SDK dependency',()=>{const issues=[];for(const file of fs.globSync('src/**/*.{ts,tsx}',{cwd:root})){const text=fs.readFileSync(path.join(root,file),'utf8');for(const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g))if(/buildr-web|react-router-dom|@anthropic|@deepseek|@qoder|features\/(?:task|code|workspace)\//.test(match[1]))issues.push([file,match[1]]);}assert.deepEqual(issues,[]);});
test('Development imports only public composition facades and mounts the complete conversation surface',()=>{
  const dev=path.resolve(root,'../buildr-web');
  for(const file of fs.globSync('src/**/*.{ts,tsx}',{cwd:dev})){
    const text=fs.readFileSync(path.join(dev,file),'utf8');
    assert.doesNotMatch(text,/@buildr-ai\/buildr-harness-(?:ui|web)/);
    for(const match of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){
      if(match[1].includes('buildr-harness-web/')) {
        const target=path.resolve(dev,path.dirname(file),match[1]);
        const facades=['shell','conversation','explorer','source-control','workbench-ui','workbench-editor','workbench-model','workbench-editor-model','workbench-hooks'];
        assert.ok(facades.some(name=>[name,name+'.ts'].some(entry=>target===path.join(root,'src',entry))),file);
      }
    }
  }
  const facade=fs.readFileSync(path.join(root,'src/shell.ts'),'utf8');
  assert.doesNotMatch(facade,/features\/|HarnessApp|AgentConversations/);
  const surface=fs.readFileSync(path.join(dev,'src/features/harness-ui/ConversationWorkspace.tsx'),'utf8');
  assert.match(surface,/<HarnessConversationSurface/);
  assert.doesNotMatch(surface,/<iframe|postMessage|context-anchor|contentWindow|development-harness-rail/);
  const shell=fs.readFileSync(path.join(dev,'src/app/DevelopmentHarnessShell.tsx'),'utf8');
  assert.doesNotMatch(shell,/development-harness-divider|SplitDivider/);
  assert.ok(!fs.existsSync(path.join(dev,'src/features/harness-ui/ConversationActivity.tsx')));
  const history=fs.readFileSync(path.join(root,'src/features/agent-conversations/ConversationHistory.tsx'),'utf8');
  assert.doesNotMatch(history,/focusNavigation/);
  assert.match(fs.readFileSync(path.join(root,'src/integration/HarnessConversationSurface.tsx'),'utf8'),/<AgentConversationsProvider/);
  assert.ok(!fs.existsSync(path.resolve(root,'../buildr-harness-ui/package.json')));
});
test('Shared markdown renderer, block CSS and reset import order remain aligned across both web apps',()=>{
  const dev=path.resolve(root,'../buildr-web');
  assert.equal(fs.readFileSync(path.join(root,'src/markdown.ts'),'utf8'),fs.readFileSync(path.join(dev,'src/markdown.ts'),'utf8'));
  const shared=fs.readFileSync(path.join(root,'src/shared.css'),'utf8');
  assert.equal(shared,fs.readFileSync(path.join(dev,'src/shared.css'),'utf8'));
  for(const selector of ['.markdown-code-block','button.markdown-copy-code','.markdown-diagram-renderer','.markdown-table-scroll'])assert.ok(shared.includes(selector),selector);
  const devStyles=fs.readFileSync(path.join(dev,'src/styles.css'),'utf8');
  assert.doesNotMatch(devStyles,/\.markdown-code-block\b/);
  const main=fs.readFileSync(path.join(root,'src/main.tsx'),'utf8');
  assert.ok(main.indexOf("import 'antd/dist/reset.css';")<main.indexOf("from './index'"),'reset.css precedes shared.css');
});
