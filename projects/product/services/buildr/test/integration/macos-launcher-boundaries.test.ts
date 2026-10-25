import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildLauncher } from '../../tools/build/launcher/build.ts';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');

test('generated Mac launcher为source CLI提供私有辅助PATH并保留npm默认入口，无GUI或服务副作用', { skip: process.platform !== 'darwin' }, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-helper-launcher-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceRoot = path.join(base, 'checkout with spaces/projects/product/services/buildr'), output = path.join(base, 'launcher'), programs = path.join(sourceRoot, 'tools/development/programs'), defaultBin = path.join(base, 'npm-bin'), observation = path.join(base, 'observed.json');
  fs.mkdirSync(programs, { recursive: true }); fs.mkdirSync(path.join(sourceRoot, 'bin')); fs.mkdirSync(path.join(sourceRoot, 'src')); fs.mkdirSync(path.join(sourceRoot, 'resources')); fs.mkdirSync(defaultBin);
  fs.writeFileSync(path.join(sourceRoot, 'resources/manifest.yml'), 'fixture\n'); fs.writeFileSync(path.resolve(sourceRoot, '../../.node-version'), '24.15.0\n');
  for (const relative of ['programs/buildr-mysql', 'resolve-development-node']) fs.copyFileSync(path.join(PRODUCT_ROOT, 'tools/development', relative), path.join(sourceRoot, 'tools/development', relative));
  fs.chmodSync(path.join(programs, 'buildr-mysql'), 0o755); fs.chmodSync(path.join(sourceRoot, 'tools/development/resolve-development-node'), 0o755);
  const defaultBuildr = path.join(defaultBin, 'buildr'); fs.writeFileSync(defaultBuildr, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(sourceRoot, 'bin/buildr-mysql.mjs'), "console.log('buildr-mysql 1.0.0');\n");
  const programModule = new URL('../../src/modules/connection-skills/infrastructure/program.ts', import.meta.url).href;
  fs.writeFileSync(path.join(sourceRoot, 'bin/buildr.mjs'), `import fs from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nimport {locateExecutable} from ${JSON.stringify(programModule)};\nconst mysql=locateExecutable('buildr-mysql');\nconst version=spawnSync(mysql,['--version'],{env:process.env,encoding:'utf8'});\nfs.writeFileSync(${JSON.stringify(observation)},JSON.stringify({node:process.execPath,args:process.argv.slice(2),path:process.env.PATH,mysql,buildr:locateExecutable('buildr'),version:{status:version.status,stdout:version.stdout,stderr:version.stderr}}));\n`);
  buildLauncher({ platform: 'darwin', output, identity: { schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', runtimeRole: 'development', source: 'checkout', buildId: 'private-helper', buildNumber: '1', protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform: 'darwin', builtAt: new Date().toISOString(), sourceRoot, developmentRuntime: { executable: process.execPath, version: process.versions.node, identity: `development-host:${process.execPath}:${process.versions.node}` } } });
  const wrapper = path.join(output, 'Buildr Web Dev.app/Contents/MacOS/Buildr');
  const inherited: NodeJS.ProcessEnv = { ...process.env, PATH: [defaultBin, '/usr/bin', '/bin'].join(path.delimiter), HOME: path.join(base, 'isolated-home'), BUILDR_LAUNCHER_NO_OPEN: '1' }; delete inherited.BUILDR_NODE; delete inherited.NVM_DIR;
  const result = spawnSync('/bin/sh', [wrapper], { env: inherited, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(observation) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fs.existsSync(observation), true, 'fixture CLI must finish; this test never launches a Web service');
  const observed = JSON.parse(fs.readFileSync(observation, 'utf8'));
  assert.deepEqual(observed.path.split(path.delimiter), [programs, path.dirname(process.execPath), defaultBin, '/usr/bin', '/bin']);
  assert.equal(observed.node, fs.realpathSync(process.execPath)); assert.equal(observed.mysql, fs.realpathSync(path.join(programs, 'buildr-mysql'))); assert.equal(observed.buildr, fs.realpathSync(defaultBuildr));
  assert.deepEqual(observed.args, ['web', '--port', '4458', '--no-open']);
  assert.deepEqual(observed.version, { status: 0, stdout: 'buildr-mysql 1.0.0\n', stderr: '' });
});
