import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  developmentDependenciesReady,
  ensureDevelopmentDependencies,
  prepareDevelopmentDependencies,
} from '../../tools/development/prepare-development-dependencies.ts';

const DECLARATION = `schemaVersion: buildr.project-preparation/v1
entries:
  - id: buildr-agent.npm-ci
    scope: {kind: service, service: buildr-agent}
    cwd: services/buildr-agent
    executable: ../buildr/tools/development/run-development-npm
    args: [ci, --ignore-scripts]
  - id: buildr-agent.build
    scope: {kind: service, service: buildr-agent}
    cwd: services/buildr-agent
    executable: ../buildr/tools/development/run-development-npm
    args: [run, build]
  - id: buildr.npm-ci
    scope: {kind: service, service: buildr}
    cwd: services/buildr
    executable: tools/development/run-development-npm
    args: [ci, --install-links]
  - id: buildr-web.npm-ci
    scope: {kind: service, service: buildr-web}
    cwd: services/buildr-web
    executable: ../buildr/tools/development/run-development-npm
    args: [ci]
  - id: dsh-plugin.npm-ci
    scope: {kind: service, service: dsh-plugin}
    cwd: services/dsh-plugin
    executable: ../buildr/tools/development/run-development-npm
    args: [ci, --ignore-scripts]
  - id: buildr.browser-chromium
    scope: {kind: service, service: buildr}
    cwd: services/buildr
    executable: tools/development/run-development-npm
    args: [run, browser:prepare]
`;

function fixture(): { root: string; calls: Array<{ executable: string; args: string[]; cwd: string }> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-prepare-'));
  fs.writeFileSync(path.join(root, 'preparation.yml'), DECLARATION);
  const service = (name: string, dependencies: Record<string, string> = {}) => {
    const directory = path.join(root, 'services', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, dependencies }));
    fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({ name, lockfileVersion: 3 }));
    return directory;
  };
  service('buildr', { react: '*' });
  service('buildr-web', { react: '*' });
  service('buildr-agent', { react: '*' });
  // Zero-dependency service: no lockfile, never invokes npm ci.
  const plugin = path.join(root, 'services', 'dsh-plugin');
  fs.mkdirSync(plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify({ name: 'dsh-plugin' }));
  const calls: Array<{ executable: string; args: string[]; cwd: string }> = [];
  const execute = (executable: string, args: string[], cwd: string) => {
    calls.push({ executable, args, cwd });
    // Simulate an npm ci producing the installed-lock marker.
    if (args[0] === 'ci') {
      fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'node_modules', '.package-lock.json'), '{}');
    }
    if (args[0] === 'run' && args[1] === 'build') {
      fs.mkdirSync(path.join(cwd, 'build'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'build', 'index.js'), '');
    }
    return { status: 0 };
  };
  return { root, calls, execute } as any;
}

test('preparation executes declared entries in order and only pays for what is missing', () => {
  const { root, calls, execute } = fixture() as any;
  const result = prepareDevelopmentDependencies({ root, execute });
  assert.deepEqual(result.executed, ['buildr-agent.npm-ci', 'buildr-agent.build', 'buildr.npm-ci', 'buildr-web.npm-ci']);
  assert.deepEqual(result.reused, ['dsh-plugin.npm-ci']);
  assert.equal(calls.length, 4);
  // The private Agent must be installed and built before the main service ci
  // materializes its public package through the postinstall hook.
  assert.ok(calls[0].args.includes('--ignore-scripts'));
  assert.deepEqual(calls[1].args, ['run', 'build']);
  assert.ok(calls[2].args.includes('--install-links'));
  assert.equal(calls.every((call: any) => call.executable.endsWith('run-development-npm')), true);
  // The heavyweight browser download never runs inside a dependency prepare.
  assert.equal(calls.some((call: any) => call.args.includes('browser:prepare')), false);
  // A second run reuses the fresh markers instead of reinstalling.
  const again = prepareDevelopmentDependencies({ root, execute });
  assert.deepEqual(again.executed, []);
  assert.equal(calls.length, 4);
  fs.rmSync(root, { recursive: true, force: true });
});

test('readiness and failure propagation keep the probe honest', () => {
  const { root, calls, execute } = fixture() as any;
  assert.equal(developmentDependenciesReady(root), false);
  ensureDevelopmentDependencies({ root, execute });
  assert.equal(developmentDependenciesReady(root), true);
  const failing = (executable: string, args: string[], cwd: string) => ({ status: 1 });
  fs.rmSync(path.join(root, 'services', 'buildr-web', 'node_modules'), { recursive: true, force: true });
  assert.throws(() => prepareDevelopmentDependencies({ root, execute: failing }), /development_preparation_failed: buildr-web\.npm-ci/u);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a stale lockfile reinstalls and a lockfile gap with real dependencies surfaces', () => {
  const { root, calls, execute } = fixture() as any;
  prepareDevelopmentDependencies({ root, execute });
  const marker = path.join(root, 'services', 'buildr-web', 'node_modules', '.package-lock.json');
  // An older marker than a refreshed lockfile must re-pay npm ci.
  const stale = new Date(Date.now() - 60_000);
  fs.utimesSync(marker, stale, stale);
  const again = prepareDevelopmentDependencies({ root, execute });
  assert.deepEqual(again.executed, ['buildr-web.npm-ci']);
  // A service declaring dependencies without a lockfile must fail loudly
  // instead of being treated as reproducible.
  const dependencies = path.join(root, 'services', 'dsh-plugin', 'package.json');
  fs.writeFileSync(dependencies, JSON.stringify({ name: 'dsh-plugin', dependencies: { leftpad: '*' } }));
  assert.throws(() => prepareDevelopmentDependencies({ root, execute }), /preparation_lockfile_missing: dsh-plugin\.npm-ci/u);
  fs.rmSync(root, { recursive: true, force: true });
});
