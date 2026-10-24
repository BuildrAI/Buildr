import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { buildApplicationPayload } from '../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { findExecutableOnPath, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { parseConnectionDefinition } from '../../src/modules/connection-skills/domain/definition.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';

function files(root: string, relative = ''): string[] {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const next = path.join(relative, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `unexpected source link: ${next}`);
    return entry.isDirectory() ? files(root, next) : entry.isFile() ? [next] : [];
  });
}

test('installed package independently delivers three complete builtin connection skills and its MySQL executable', async t => {
  if (!process.env.BUILDR_SMOKE_ROOT) {
    // Ordinary integration selection still enters the sole workspace isolation owner.
    const runner = fileURLToPath(new URL('../../tools/development/run-isolated-workspace-smoke.ts', import.meta.url));
    const isolated = spawnSync(process.execPath, [runner, '--script', fileURLToPath(import.meta.url)], { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(isolated.error, undefined);
    assert.equal(isolated.status, 0, isolated.stdout + isolated.stderr);
    assert.match(isolated.stdout, /"status":"passed"[\s\S]*"cleanup":"cleaned"/u);
    return;
  }
  const root = fs.realpathSync(fs.mkdtempSync(path.join(process.env.BUILDR_SMOKE_ROOT || os.tmpdir(), 'builtin-connections-package-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), 'b'.repeat(40));
  const payload = await buildApplicationPayload(path.join(root, 'payload'), 'b'.repeat(40), { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  const artifact = createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot });
  const extracted = path.join(root, 'extracted'); fs.mkdirSync(extracted);
  const unpack = spawnSync('tar', ['-xzf', artifact.tarball, '-C', extracted], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(unpack.status, 0, unpack.stderr);
  const extractedPackage = path.join(extracted, 'package'), metadata = JSON.parse(fs.readFileSync(path.join(extractedPackage, 'package.json'), 'utf8'));
  for (const relative of ['workspace/skills/buildr/archify', 'workspace/components/buildr/archify', 'contracts/bootstrap.yml', 'installation/launcher/buildr-icon.png']) {
    assert.equal(fs.existsSync(path.join(extractedPackage, 'payload/product/resources', relative)), false, relative);
  }
  assert.equal(metadata.bin['buildr-mysql'], 'bin/buildr-mysql.mjs');
  assert.ok(fs.statSync(path.join(extractedPackage, 'runtime/mysql-connection.cjs')).isFile());
  assert.equal(fs.existsSync(path.join(extractedPackage, 'node_modules')), false);

  const prefix = path.join(root, 'prefix'), nodeBin = path.dirname(process.execPath);
  const prefixBin = process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
  const userConfig = path.join(root, 'empty-npmrc'); fs.writeFileSync(userConfig, '');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [prefixBin, nodeBin].join(path.delimiter),
    BUILDR_APP_DATA_DIR: path.join(root, 'installed-app-data'),
    BUILDR_PRODUCT_DATA_DIR: path.join(root, 'installed-product-data'),
    BUILDR_LOCAL_APP_NO_OPEN: '1',
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_userconfig: userConfig,
    npm_config_update_notifier: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  };
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'BUILDR_APPLICATION_PAYLOAD_ROOT', 'BUILDR_NPM_ENTRY_PATH', 'BUILDR_INTERNAL_PRODUCT_REENTRY', 'BUILDR_DEVELOPMENT_ENTRY', 'BUILDR_SOURCE_ROOT']) delete env[key];
  const npm = path.join(nodeBin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const installed = spawnCommandSync(npm, ['install', '--global', '--prefix', prefix, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', artifact.tarball], { cwd: root, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  const packageRoot = path.join(prefix, process.platform === 'win32' ? '' : 'lib', 'node_modules/@buildr-ai/buildr');
  assert.ok(fs.statSync(path.join(packageRoot, 'runtime/mysql-connection.cjs')).isFile());
  assert.equal(fs.existsSync(path.join(packageRoot, 'node_modules')), false, 'mysql2 and the parser must be in the package bundle, without a second dependency install');
  const mysqlPath = findExecutableOnPath('buildr-mysql', { env });
  assert.ok(mysqlPath, 'installed PATH must expose buildr-mysql');
  if (process.platform !== 'win32') assert.equal(fs.realpathSync(mysqlPath), fs.realpathSync(path.join(packageRoot, 'bin/buildr-mysql.mjs')));
  const mysqlVersion = spawnCommandSync(mysqlPath, ['--version'], { cwd: extracted, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(mysqlVersion.status, 0, mysqlVersion.stderr); assert.match(mysqlVersion.stdout, /^buildr-mysql 1\.0\.0\s*$/u);
  const mysqlHelp = spawnCommandSync(mysqlPath, ['--help'], { cwd: extracted, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(mysqlHelp.status, 0, mysqlHelp.stderr); assert.match(JSON.parse(mysqlHelp.stdout).help.join('\n'), /test.*databases|版本检查[\s\S]*数据库/u);
  const cli = path.join(packageRoot, 'bin/buildr.mjs');
  const run = (args: string[], override = env, successful = true) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: extracted, env: override, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.error, undefined);
    if (successful) assert.equal(result.status, 0, result.stdout + result.stderr);
    return result;
  };
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  run(['init', '--target', workspace, '--name', 'builtin-package-fixture', '--profile', 'personal', '--source-only']);
  assert.equal(fs.existsSync(path.join(env.BUILDR_PRODUCT_DATA_DIR!, 'local/preserved-skills/archify')), false);
  const manifest = YAML.parse(fs.readFileSync(path.join(workspace, 'skills/manifest.yml'), 'utf8'));
  const systems = [
    { skillId: 'mysql-connection', definitionId: 'mysql', config: { host: 'database.example.invalid', port: 3306 }, help: /test[\s\S]*databases/u },
    { skillId: 'kibana-connection', definitionId: 'kibana', config: { apiBaseUrl: 'https://logs.example.invalid/proxy/kibana/s/fixture', dataViewId: 'fixture-view' }, help: /views\|fields\|search\|aggregate/u },
    { skillId: 'xxl-job-connection', definitionId: 'xxl-job', config: { consoleUrl: 'https://scheduler.example.invalid/xxl-job-admin', production: false, apiVersion: '2.3.0' }, help: /executors[\s\S]*prepare[\s\S]*trigger/u },
  ];
  const catalog = JSON.parse(run(['connection-skill', 'definitions', 'list', '--target', workspace, '--json']).stdout);
  for (const system of systems) {
    const skill = manifest.skills.find((entry: { id: string }) => entry.id === system.skillId);
    assert.ok(skill, system.skillId);
    assert.equal(skill.path, `connections/${system.skillId}`);
    assert.equal(skill.assetIdentity, `buildr:skill:${system.skillId}`);
    assert.equal(skill.sourceIdentity, `package:skills/connections/${system.skillId}`);
    assert.deepEqual(skill.connectionDefinitions, ['assets/connection.yml']);
    const adopted = JSON.parse(fs.readFileSync(path.join(workspace, '.buildr/local/package-resources.json'), 'utf8'));
    const source = path.join(env.BUILDR_PRODUCT_DATA_DIR!, 'resources', 'skills/connections', system.skillId);
    assert.equal(fs.existsSync(path.join(workspace, 'skills/connections', system.skillId)), false);
    const definition = parseConnectionDefinition(fs.readFileSync(path.join(source, 'assets/connection.yml'), 'utf8'));
    assert.equal(definition.definitionId, system.definitionId);
    const entry = catalog.definitions.find((item: any) => item.skill.assetIdentity === skill.assetIdentity && item.definition.definitionId === system.definitionId);
    assert.equal(entry?.available, true, JSON.stringify(entry?.diagnostics ?? catalog.diagnostics));
    assert.ok(fs.statSync(path.join(source, 'SKILL.md')).isFile());
    assert.ok(fs.statSync(path.join(source, 'references/commands-and-results.md')).isFile());
    if (definition.programs.cli!.kind === 'bundled') assert.ok(fs.statSync(path.join(source, definition.programs.cli!.entry!)).isFile());
    const file = path.join(root, system.skillId + '.json');
    fs.writeFileSync(file, JSON.stringify({ id: `package-${system.definitionId}`, name: `Package ${system.definitionId}`, environment: 'fixture', binding: { skillAssetIdentity: skill.assetIdentity, sourceIdentity: skill.sourceIdentity, definitionId: system.definitionId, configVersion: definition.configVersion }, config: system.config, authentication: { intent: 'remove' }, expected: { teamRevision: 'absent', definitionRevision: entry.revision } }), { mode: 0o600 });
    const saved = JSON.parse(run(['connection-skill', 'create', '--target', workspace, '--file', file, '--json']).stdout).instance;
    assert.equal(saved.authentication.team.configured, false);
    const help = JSON.parse(run(['connection-skill', 'help', '--connection', saved.id, '--target', workspace, '--json']).stdout);
    assert.equal(help.exitCode, 0, help.stderr); assert.match(help.stdout, system.help);
    assert.doesNotMatch(help.stdout, /MODULE_NOT_FOUND|Cannot find|EXAMPLE_PASSWORD/u);
  }
  const checked = JSON.parse(run(['connection-skill', 'check', '--connection', 'package-mysql', '--target', workspace, '--json']).stdout);
  assert.equal(checked.ready, true, JSON.stringify(checked));
  const missing = run(['connection-skill', 'help', '--connection', 'package-mysql', '--target', workspace, '--json'], { ...env, PATH: nodeBin }, false);
  assert.notEqual(missing.status, 0); assert.match(missing.stdout + missing.stderr, /connection_skill_dependency_missing|程序或运行依赖未安装/u);

  run(['skills', 'render', 'codex', '--target', workspace]);
  for (const system of systems) {
    const adopted = JSON.parse(fs.readFileSync(path.join(workspace, '.buildr/local/package-resources.json'), 'utf8'));
    const source = path.join(env.BUILDR_PRODUCT_DATA_DIR!, 'resources', 'skills/connections', system.skillId), projected = path.join(workspace, '.agents/skills', system.skillId);
    assert.ok(fs.statSync(path.join(projected, 'SKILL.md')).isFile());
    const attachments = files(source).filter(file => file !== 'SKILL.md');
    assert.ok(attachments.length >= 2);
    for (const relative of attachments) {
      const original = path.join(source, relative), copy = path.join(projected, relative);
      assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(original), `${system.skillId}/${relative}`);
      if (process.platform !== 'win32') assert.equal(fs.statSync(copy).mode & 0o100, fs.statSync(original).mode & 0o100, `${system.skillId}/${relative} executable mode`);
    }
  }
});
