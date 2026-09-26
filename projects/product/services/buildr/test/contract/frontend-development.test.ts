import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
test('前端开发按既有可选技能机制投射且不引入强制绑定',()=>{
 const root=path.resolve(import.meta.dirname,'../..'),manifest=YAML.parse(fs.readFileSync(path.join(root,'resources/manifest.yml'),'utf8'));
 const skill=manifest.builtins.skills.find((s:{id:string})=>s.id==='frontend-development');
 assert.equal(skill.required,false);assert.equal(skill.provides,undefined);assert.equal(skill.requires,undefined);assert.equal(skill.runtimes.length,7);
 assert.ok(manifest.workspaceFiles.includes(`${skill.path}/SKILL.md => ${skill.target}/SKILL.md copy`));
 assert.ok(fs.existsSync(path.join(root,skill.path,'SKILL.md')));
});
