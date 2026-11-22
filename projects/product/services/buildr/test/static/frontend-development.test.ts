import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
test('前端开发不再独立安装，保留可用的原型入口',()=>{
 const root=path.resolve(import.meta.dirname,'../..'),manifest=YAML.parse(fs.readFileSync(path.join(root,'resources/manifest.yml'),'utf8'));
 for (const id of ['frontend-development','agent-first-design','code-map','terminology-governance','task-retrospective']) {
   assert.equal(manifest.builtins.skills.find((s:{id:string})=>s.id===id)?.retired,true);
   assert.equal(fs.existsSync(path.join(root,'resources/workspace/skills/buildr',id,'SKILL.md')),false);
 }
 assert.ok(fs.existsSync(path.join(root,'resources/workspace/skills/buildr/ui-prototype/SKILL.md')));
});
