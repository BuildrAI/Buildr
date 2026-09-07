import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');
const scanRoots: any[] = ['README.md', 'docs', 'package', 'bin', 'src', 'scripts', 'test', 'openspec/specs'];
const textExtensions: any = new Set(['.md', '.mjs', '.yml', '.yaml']);
const allowedProjectSkillContext: any = /legacy|unsupported|no longer supported|must be rejected|must not|旧文档|询问 Project Skill|未公开|人工审阅|迁移|拒绝|而不是|不再|不得|不支持|不折叠|不创建|不解释/i;
const obsoleteCurrentState: any[] = [
  /workspace\s*[/、]\s*project skills?/i,
  /workspace or project skills?/i,
  /workspace\/root\/project skills?/i,
  /project-level skills root/i,
  /project skill discovery/i,
  /project skills manifest/i,
];

function filesUnder(relative: any): any  {
  const absolute: any = path.join(productRoot, relative);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [absolute];
  const files: any[] = [];
  const visit: any = (directory: any) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file: any = path.join(directory, entry.name);
      const normalized: any = path.relative(productRoot, file).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (normalized === 'docs/archive' || normalized === 'openspec/changes') continue;
        visit(file);
      } else if (textExtensions.has(path.extname(entry.name))) {
        files.push(file);
      }
    }
  };
  visit(absolute);
  return files;
}

test('current-state 表面不恢复 Project Skill source 模型', () => {
  const violations: any[] = [];
  for (const file of scanRoots.flatMap(filesUnder)) {
    const relative: any = path.relative(productRoot, file).split(path.sep).join('/');
    if (relative === 'test/contract/skill-scope-terminology.test.ts') continue;
    const lines: any = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line: any, index: any) => {
      const mentionsProjectSkill: any = /project skills?/i.test(line);
      const matchesObsoleteModel: any = obsoleteCurrentState.some((pattern: any) => pattern.test(line));
      if ((mentionsProjectSkill || matchesObsoleteModel) && !allowedProjectSkillContext.test(line)) {
        violations.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, [], `Unqualified Project Skill terminology:\n${violations.join('\n')}`);
});

test('canonical Skill 模型同时表达 source、Project context 与 destinations', () => {
  const managed: any = fs.readFileSync(path.join(projectRoot, 'openspec/specs/managed-skill-assets/spec.md'), 'utf8');
  const project: any = fs.readFileSync(path.join(projectRoot, 'openspec/specs/project-registry/spec.md'), 'utf8');
  assert.match(managed, /workspace 根维护 Skill 源资产/);
  assert.match(managed, /user 与 workspace/);
  assert.match(project, /Project 只引用 workspace 能力资产/);
  assert.match(project, /capability\/applicability|capability requirement/);
});
