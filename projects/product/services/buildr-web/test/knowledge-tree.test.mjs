import assert from 'node:assert/strict';import test from 'node:test';
import {parseKnowledgeTree,knowledgeBlocks,relatedFileTree} from '../src/features/knowledge/knowledge-tree.ts';
test('文件树保留规范、作者业务边界、层级与可点击文件职责',()=>{
 const tree=parseKnowledgeTree('- `./` — 项目\n  - **`modules/knowledge/`** — 业务范围\n    - `domain/` — 规则\n      - [model.ts](../../src/model.ts) — 对象规则\n  - [spec.md](../../specs/spec.md) — 规范');
 assert.equal(tree[0].children[0].boundary,true);assert.equal(tree[0].children[0].children[0].children[0].href,'../../src/model.ts');assert.equal(tree[0].children[1].description,'规范');
 assert.equal(parseKnowledgeTree('- not a path'),null);
});
test('树解析不篡改普通说明、围栏代码与不支持的列表',()=>{
 const blocks=knowledgeBlocks('说明\n\n- **`src/`** — 模块\n  - [a.ts](../a.ts) — 职责\n\n后续\n```text\n- `fake/`\n```');
 assert.equal(blocks.filter(b=>b.kind==='tree').length,1);assert.ok(blocks.at(-1).text.includes('fake/'));
 assert.equal(knowledgeBlocks('- 普通解释\n  - 另一条')[0].kind,'markdown');
});
test('相关文件只按显式路径建树，压缩单链目录且保留文件身份',()=>{
 const tree=relatedFileTree([{id:'model',path:'knowledge/archify/demo.json',title:'图源'},{id:'view',path:'knowledge/archify/demo.html',title:'展示'}]);
 assert.equal(tree[0].label,'knowledge/archify/');assert.deepEqual(tree[0].children.map(x=>x.sourceId),['model','view']);assert.equal(tree[0].children[0].description,'图源');
});

test('不同登记范围的同名路径保持独立，不伪造成共同物理目录',()=>{
 const tree=relatedFileTree([{id:'a-file',path:'src/a.ts',title:'A',scope:{kind:'service',id:'a'}},{id:'b-file',path:'src/a.ts',title:'B',scope:{kind:'service',id:'b'}}]);
 assert.equal(tree.length,2);assert.equal(tree[0].label,'服务「a」');assert.equal(tree[0].children[0].children[0].sourceId,'a-file');assert.equal(tree[1].children[0].children[0].sourceId,'b-file');
});
