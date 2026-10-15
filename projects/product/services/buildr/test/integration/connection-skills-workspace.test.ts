import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveConnectionSkillWorkspace } from '../../src/modules/connection-skills/infrastructure/workspace.ts';

test('真实关联工作树保留所选配置目录，代码位置只路由唯一已登记且同Git来源', t => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connection-source-'))); t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const primary = path.join(temporary, 'primary'), linked = path.join(temporary, 'linked'), clone = path.join(temporary, 'independent');
  fs.mkdirSync(primary); fs.mkdirSync(path.join(primary, '.buildr')); fs.mkdirSync(path.join(primary, 'code')); fs.writeFileSync(path.join(primary, 'code/tracked'), 'fixture');
  const id = crypto.randomUUID(); fs.writeFileSync(path.join(primary, '.buildr/workspace.json'), JSON.stringify({ id }));
  const git = (cwd: string, args: string[]) => { const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 10_000, env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))) }); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  git(primary, ['init', '-b', 'main']); git(primary, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.']); git(primary, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  git(primary, ['worktree', 'add', '-b', 'fixture-linked', linked]); git(temporary, ['clone', '--no-hardlinks', primary, clone]);
  let registered = [primary];
  const reader = {
    getWorkspace(root: string) { return { rootPath: fs.realpathSync(root), workspace: JSON.parse(fs.readFileSync(path.join(root, '.buildr/workspace.json'), 'utf8')) as { id: string } }; },
    resolveSourceWorkspaceRoot(root: string) { for (let current = root; ; current = path.dirname(current)) { if (fs.existsSync(path.join(current, '.buildr/workspace.json'))) return current; if (current === path.dirname(current)) return null; } },
    listRegisteredWorkspaces() { return { workspaces: registered.map(rootPath => ({ rootPath, workspace: { id } })) }; },
  };
  assert.equal(resolveConnectionSkillWorkspace(primary, reader).rootPath, primary);
  assert.equal(resolveConnectionSkillWorkspace(linked, reader).rootPath, primary);
  assert.equal(resolveConnectionSkillWorkspace(path.join(linked, 'code'), reader).rootPath, primary);
  registered = [linked]; assert.equal(resolveConnectionSkillWorkspace(linked, reader).rootPath, linked); assert.equal(resolveConnectionSkillWorkspace(path.join(primary, 'code'), reader).rootPath, linked);
  registered = []; assert.equal(resolveConnectionSkillWorkspace(path.join(linked, 'code'), reader).rootPath, linked);
  registered = [primary]; assert.throws(() => resolveConnectionSkillWorkspace(clone, reader), { code: 'connection_skill_workspace_identity_conflict' });
  registered = [primary, linked]; assert.throws(() => resolveConnectionSkillWorkspace(primary, reader), { code: 'connection_skill_workspace_ambiguous' });
  registered = [primary]; fs.writeFileSync(path.join(primary, '.buildr/workspace.json'), JSON.stringify({ id: crypto.randomUUID() })); assert.throws(() => resolveConnectionSkillWorkspace(linked, reader), { code: 'connection_skill_workspace_source_changed' });
});
