import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPackageStaticValidator } from '../../tools/verification/package-check/static-validation.ts';

function validator({ builtins, workspaceSkills }: any) {
  return createPackageStaticValidator({
    fs, path,
    isManifestSourceLabel: (value: any) => value === 'buildr',
    isPlainObject: (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value),
    normalizeRelativePathForBuildr: (value: any) => value,
    existsFile: (file: string) => fs.existsSync(file) && fs.statSync(file).isFile(),
    existsDirectory: (dir: string) => fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
    readPackageManifest: () => ({ builtins: { skills: builtins, rules: [], commands: [] }, skillSources: [], capabilityContracts: [], initialSkillBindings: [] }),
    readSkillManifest: () => workspaceSkills,
    builtinSkillEntry: (builtin: any) => builtin,
    builtinRuleEntry: (rule: any) => rule,
    sourcePathFromBuiltin: (builtin: any) => builtin.path,
    parseSkillSourceRef: () => ({ type: 'workspace', id: 'stub' }),
    toPosixRelative: (_root: string, file: string) => file,
    parseRulesManifestYaml: () => ({ rules: [] }),
    parseCommandsManifestYaml: () => ({ commands: [] }),
  });
}

function baselineRoot(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retirement-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), 'skills: []\n');
  return root;
}

test('包中裸删的内置技能缺少 replaces/retired 声明时基线检查报错', (t) => {
  const root = baselineRoot(t);
  const problems: string[] = [];
  validator({ builtins: [], workspaceSkills: [{ id: 'ghost-skill', source: 'buildr', path: 'buildr/ghost-skill' }] }).validateWorkspaceSkillsBaseline(root, problems);
  assert.ok(problems.some(item => item.includes('ghost-skill') && item.includes('retired')), problems.join('\n'));
});

test('显式 retired 或 replaces 声明放行已移除的内置技能', (t) => {
  const root = baselineRoot(t);
  for (const builtins of [
    [{ id: 'ghost-skill', target: 'skills/buildr/ghost-skill', description: 'retired', retired: true }],
    [{ id: 'new-skill', target: 'skills/buildr/new-skill', description: 'replacement', required: false, path: 'resources/workspace/skills/buildr/new-skill', replaces: { id: 'ghost-skill', target: 'skills/buildr/ghost-skill', runtimePath: 'ghost-skill' } }],
  ]) {
    const problems: string[] = [];
    validator({ builtins, workspaceSkills: [{ id: 'ghost-skill', source: 'buildr', path: 'buildr/ghost-skill' }] }).validateWorkspaceSkillsBaseline(root, problems);
    assert.deepEqual(problems.filter(item => item.includes('no longer a package builtin')), []);
  }
});
