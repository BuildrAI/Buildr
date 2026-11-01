import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { sharedResourcesRoot } from '../../src/infrastructure/product-resources/shared-resources.ts';
import { componentMemberSource } from '../../src/modules/agent-assets/infrastructure/component-member-source.ts';
import { validateComponentMemberResources } from '../../src/modules/agent-assets/domain/component-member-resources.ts';

const service = path.resolve(import.meta.dirname, '../..');
const digest = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
async function scenario() {
  const root = process.env.BUILDR_SMOKE_ROOT!;
  assert.ok(root, 'Use the isolated workspace runner.');
  const run = (args: string[], success = true, environment: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [path.join(service, 'bin/buildr.mjs'), ...args], {
      cwd: service, env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (success) assert.equal(result.status, 0, args.join(' ') + '\n' + result.stdout + result.stderr);
    else assert.notEqual(result.status, 0, args.join(' ') + ' unexpectedly succeeded');
    return result.stdout;
  };
  const spaces = ['one', 'two', 'three'].map(name => path.join(root, name));
  const definitionPath = (workspace: string) => path.join(workspace, 'components/buildr/openspec/component.yml');
  const read = (workspace: string) => YAML.parse(fs.readFileSync(definitionPath(workspace), 'utf8'));
  const write = (workspace: string, definition: any) => fs.writeFileSync(definitionPath(workspace), YAML.stringify(definition));
  for (const workspace of spaces) {
    run(['init', '--agent', 'codex', '--target', workspace, '--name', path.basename(workspace), '--profile', 'personal', '--description', 'Isolated shared contributions migration']);
    const definition = read(workspace);
    assert.equal(Object.keys(definition.memberResources).length, 7);
    assert.equal(fs.existsSync(path.join(workspace, 'components/buildr/openspec/contributions')), false);
    assert.equal(fs.existsSync(path.join(workspace, 'commands/buildr/openspec/manifest.yml')), false);
    // Reconstruct a genuine pre-migration local component, including its receipt.
    for (const member of [...definition.members.skillContributions, ...definition.members.commandCollections]) {
      const target = path.join(workspace, member);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(service, 'resources/workspace', member), target);
    }
    delete definition.memberResources;
    write(workspace, definition);
  }
  const commandMember = 'commands/buildr/openspec/manifest.yml';
  const oldCommand = path.join(spaces[0]!, commandMember), commandBytes = fs.readFileSync(oldCommand);
  const oldDefinition = fs.readFileSync(definitionPath(spaces[0]!));
  run(['sync', 'codex', '--target', spaces[0]!], false, { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1' });
  assert.deepEqual(fs.readFileSync(oldCommand), commandBytes, 'Failed migration restores the local command definition.');
  assert.deepEqual(fs.readFileSync(definitionPath(spaces[0]!)), oldDefinition);
  fs.appendFileSync(oldCommand, '\n# User command customization.\n');
  run(['sync', 'codex', '--target', spaces[0]!], false);
  assert.match(fs.readFileSync(oldCommand, 'utf8'), /User command customization/);
  fs.writeFileSync(oldCommand, commandBytes);
  const fragment = read(spaces[0]!).members.skillContributions[0];
  const custom = path.join(spaces[0]!, fragment), original = fs.readFileSync(custom);
  fs.appendFileSync(custom, '\nUser customization.\n');
  const receiptBefore = fs.readFileSync(definitionPath(spaces[0]!));
  run(['sync', 'codex', '--target', spaces[0]!], false);
  assert.match(fs.readFileSync(custom, 'utf8'), /User customization/);
  assert.deepEqual(fs.readFileSync(definitionPath(spaces[0]!)), receiptBefore);
  fs.writeFileSync(custom, original);
  const linked = path.join(spaces[1]!, fragment);
  fs.unlinkSync(linked); fs.symlinkSync(custom, linked);
  run(['sync', 'codex', '--target', spaces[1]!], false);
  assert.equal(fs.lstatSync(linked).isSymbolicLink(), true);
  fs.unlinkSync(linked); fs.writeFileSync(linked, original);
  const unknown = path.join(spaces[2]!, 'components/buildr/openspec/contributions/user.md');
  fs.writeFileSync(unknown, 'Keep this user document.');
  const sources: string[] = [];
  for (const workspace of spaces) {
    run(['sync', 'codex', '--target', workspace]);
    const definition = read(workspace);
    assert.equal(Object.keys(definition.memberResources).length, 7);
    for (const member of definition.members.skillContributions) assert.equal(fs.existsSync(path.join(workspace, member)), false);
    sources.push(componentMemberSource(workspace, fragment, definition));
    assert.equal(fs.existsSync(path.join(workspace, commandMember)), false);
    const commands = JSON.parse(run(['commands', 'check', '--target', workspace, '--json']));
    assert.ok(commands.catalog.definitions.find((item: any) => item.id === 'openspec').sources.includes(commandMember));
    assert.equal(commands.manifests.find((item: any) => item.path === commandMember).source, componentMemberSource(workspace, commandMember, definition));
    assert.match(fs.readFileSync(path.join(workspace, '.agents/skills/openspec-explore/SKILL.md'), 'utf8'), /Buildr Terminology Sidebar/);
    const check = JSON.parse(run(['component', 'check', 'openspec', '--target', workspace, '--json']));
    assert.equal(check.ok, true, JSON.stringify(check));
    const doctor = JSON.parse(run(['doctor', '--agent', 'codex', '--target', workspace, '--json']));
    assert.equal(doctor.health.ready, true, JSON.stringify(doctor.findings));
    const before = fs.readFileSync(definitionPath(workspace));
    run(['sync', 'codex', '--target', workspace]);
    assert.deepEqual(fs.readFileSync(definitionPath(workspace)), before);
  }
  assert.equal(new Set(sources).size, 1);
  assert.equal(fs.readFileSync(unknown, 'utf8'), 'Keep this user document.');
  assert.equal(fs.existsSync(path.join(spaces[0]!, 'components/buildr/openspec/contributions')), false);
  // A newer shared publication is consumed instead of copying older package bytes.
  const shared = sources[0]!, descriptorPath = path.join(sharedResourcesRoot(), 'resource-set.json');
  fs.appendFileSync(shared, '\nCurrent shared contribution.\n');
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  const entry = descriptor.files.find((item: any) => item.source === `workspace/${fragment}`);
  entry.sha256 = digest(fs.readFileSync(shared));
  descriptor.id = `${descriptor.version}-${digest(JSON.stringify(descriptor.files))}`;
  fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));
  run(['sync', 'codex', '--target', spaces[0]!]);
  assert.ok(read(spaces[0]!).integrity.includes(`${fragment}=sha256-${entry.sha256}`));
  assert.match(fs.readFileSync(path.join(spaces[0]!, '.agents/skills/openspec-explore/SKILL.md'), 'utf8'), /Current shared contribution/);
  fs.appendFileSync(shared, 'tampered');
  run(['component', 'check', 'openspec', '--target', spaces[0]!, '--json'], false);
  assert.throws(() => componentMemberSource(spaces[0]!, fragment, read(spaces[0]!)), /damaged/);
  fs.writeFileSync(shared, fs.readFileSync(shared, 'utf8').replace(/tampered$/, ''));
  const definition = read(spaces[0]!);
  assert.deepEqual(validateComponentMemberResources(definition), []);
  for (const invalid of [
    { ...definition, source: 'workspace' },
    { ...definition, memberResources: { [fragment]: '/etc/hosts' } },
    { ...definition, memberResources: { [fragment]: 'resources/workspace/components/buildr/other/contributions/example.md' } },
    { ...definition, memberResources: { 'components/buildr/openspec/contributions/../example.md': 'resources/workspace/components/buildr/openspec/contributions/../example.md' } },
  ]) assert.ok(validateComponentMemberResources(invalid).length);
  const local = path.join(root, 'private.md'); fs.writeFileSync(local, 'private');
  assert.equal(componentMemberSource(root, 'private.md', { source: 'workspace' }), fs.realpathSync(local));
  const sharedCommand = componentMemberSource(spaces[0]!, commandMember, definition);
  const sharedCommandBytes = fs.readFileSync(sharedCommand);
  run(['commands', 'add', 'local-node', '--executable', 'node', '--purpose', 'Local workspace tool', '--target', spaces[0]!]);
  fs.appendFileSync(sharedCommand, '\n# Shared command tampering.\n');
  const brokenCommands = JSON.parse(run(['commands', 'check', '--target', spaces[0]!, '--json'], false));
  assert.ok(brokenCommands.findings.some((item: any) => item.path === commandMember && item.code === 'commands.manifest_invalid'));
  assert.ok(brokenCommands.catalog.definitions.some((item: any) => item.id === 'local-node'), 'Independent local catalog remains visible.');
  fs.writeFileSync(sharedCommand, sharedCommandBytes);
  run(['project', 'create', 'needs-openspec', '--target', spaces[0]!]);
  const requirements = path.join(spaces[0]!, 'projects/needs-openspec/commands.yml');
  fs.writeFileSync(requirements, YAML.stringify({ schemaVersion: 'buildr.project-commands/v1', requirements: [{ id: 'openspec', required: false }] }));
  run(['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', spaces[0]!], false);
  assert.equal(read(spaces[0]!).id, 'openspec');
  fs.writeFileSync(requirements, YAML.stringify({ schemaVersion: 'buildr.project-commands/v1', requirements: [] }));
  const before = fs.readFileSync(shared);
  run(['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', spaces[0]!]);
  assert.deepEqual(fs.readFileSync(shared), before, 'Uninstall cannot remove the shared source.');
  assert.deepEqual(fs.readFileSync(sharedCommand), sharedCommandBytes);
  run(['sync', 'codex', '--target', spaces[1]!]);
  assert.equal(JSON.parse(run(['component', 'check', 'openspec', '--target', spaces[1]!, '--json'])).ok, true);
  const currentDefinition = definitionPath(spaces[1]!), currentBytes = fs.readFileSync(currentDefinition);
  const externalDefinition = path.join(root, 'external-definition.yml'); fs.writeFileSync(externalDefinition, currentBytes);
  fs.unlinkSync(currentDefinition); fs.symlinkSync(externalDefinition, currentDefinition);
  const linkedDefinition = JSON.parse(run(['commands', 'check', '--target', spaces[1]!, '--json'], false));
  assert.ok(linkedDefinition.findings.some((item: any) => item.path === commandMember && /symbolic link/.test(item.message)));
  fs.unlinkSync(currentDefinition); fs.writeFileSync(currentDefinition, currentBytes);
}

if (process.argv.includes('--shared-contributions-scenario')) await scenario();
else test('官方组件原文共享：三空间补充/命令迁移、定制保护、回滚、目录发现、引用及卸载隔离', { timeout: 300_000 }, () => {
  const result = spawnSync(process.execPath, [path.join(service, 'tools/development/run-isolated-workspace-check.ts'), '--script', fileURLToPath(import.meta.url), '--', '--shared-contributions-scenario'], {
    cwd: service, env: process.env, encoding: 'utf8', timeout: 295_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"status":"passed"/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
});
