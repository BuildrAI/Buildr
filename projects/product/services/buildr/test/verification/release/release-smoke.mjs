#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { readReleaseArtifact } from '../../../scripts/release/release-artifact.mjs';
import { officialRegistry } from '../../../scripts/release/registry-version-state.mjs';
import { readSharedCandidatePackage } from './candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageName = '@buildr-ai/buildr';
const exactRegistryPackagePattern = /^@buildr-ai\/buildr@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const RELEASE_ARTIFACT_MANIFEST_ENV = 'BUILDR_RELEASE_ARTIFACT_MANIFEST';
export const RELEASE_PACKAGE_SPEC_ENV = 'BUILDR_RELEASE_PACKAGE_SPEC';

export function resolveReleaseSmokeSource(env = process.env) {
  const candidateRequested = Boolean(env.BUILDR_CANDIDATE_TARBALL || env.BUILDR_CANDIDATE_PACK_METADATA);
  const artifactRequested = Boolean(env[RELEASE_ARTIFACT_MANIFEST_ENV]);
  const registryRequested = Boolean(env[RELEASE_PACKAGE_SPEC_ENV]);
  const explicitSources = [candidateRequested, artifactRequested, registryRequested].filter(Boolean).length;
  if (explicitSources > 1) throw new Error('release smoke accepts exactly one explicit package source');

  if (candidateRequested) {
    const shared = readSharedCandidatePackage(env);
    return {
      kind: 'candidate-tarball',
      installTarget: shared.tarball,
      expectedName: shared.metadata.name ?? packageName,
      expectedVersion: shared.metadata.version ?? null,
      offline: true,
    };
  }
  if (artifactRequested) {
    const artifact = readReleaseArtifact(env[RELEASE_ARTIFACT_MANIFEST_ENV], { packageName });
    return {
      kind: 'release-artifact',
      installTarget: artifact.tarball,
      expectedName: artifact.manifest.packageName,
      expectedVersion: artifact.manifest.version,
      offline: true,
    };
  }
  if (registryRequested) {
    const match = exactRegistryPackagePattern.exec(env[RELEASE_PACKAGE_SPEC_ENV]);
    if (!match) throw new Error('registry release smoke requires exact @buildr-ai/buildr@<version> package spec');
    return {
      kind: 'official-registry',
      installTarget: env[RELEASE_PACKAGE_SPEC_ENV],
      expectedName: packageName,
      expectedVersion: match[1],
      offline: false,
    };
  }
  return { kind: 'standalone-pack', installTarget: null, expectedName: packageName, expectedVersion: null, offline: true };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && command === npmExecutable,
  });
  if (result.status !== (options.expectedStatus ?? 0)) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function parseJson(label, output, schemaVersion) {
  const payload = JSON.parse(output);
  assert.equal(payload.schemaVersion, schemaVersion, `${label} schemaVersion`);
  return payload;
}

export function runReleaseSmoke(env = process.env) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-smoke-'));
  const packDirectory = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  const workspace = path.join(root, 'workspace');
  const appData = path.join(root, 'app-data');
  const runtimeData = process.env.BUILDR_NODE_RUNTIME_DATA_DIR || appData;
  const source = resolveReleaseSmokeSource(env);

  function runBuildr(buildrScript, args) {
    return run(process.execPath, [buildrScript, ...args], {
      cwd: workspace,
      env: { BUILDR_APP_DATA_DIR: appData, BUILDR_NODE_RUNTIME_DATA_DIR: runtimeData },
    });
  }

  try {
    fs.mkdirSync(packDirectory, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });

    let installTarget = source.installTarget;
    let expectedVersion = source.expectedVersion;
    if (!installTarget) {
      const pack = JSON.parse(run(npmExecutable, ['pack', productRoot, '--pack-destination', packDirectory, '--json']));
      assert.equal(pack.length, 1, 'release smoke must produce one tarball');
      installTarget = path.join(packDirectory, pack[0].filename);
      expectedVersion = pack[0].version;
    }
    const installArgs = source.offline
      ? ['install', '--offline', '--global', '--prefix', prefix, installTarget]
      : ['install', '--prefer-online', '--global', '--prefix', prefix, '--registry', officialRegistry, installTarget];
    run(npmExecutable, installArgs);

    const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
    const installedPackageRoot = path.join(modulesRoot, '@buildr-ai', 'buildr');
    const installedMetadata = JSON.parse(fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'));
    assert.equal(installedMetadata.name, source.expectedName, 'installed package name');
    if (expectedVersion) assert.equal(installedMetadata.version, expectedVersion, 'installed package version');
    const buildrScript = path.join(installedPackageRoot, 'bin', 'buildr.mjs');
    assert.equal(fs.existsSync(buildrScript), true, 'installed Buildr executable source must exist');

    const updateCheck = parseJson('registry update check', run(process.execPath, [buildrScript, 'update', 'check', '--json'], {
      cwd: workspace,
      expectedStatus: 1,
      env: {
        BUILDR_APP_DATA_DIR: appData,
        BUILDR_NODE_RUNTIME_DATA_DIR: runtimeData,
        npm_config_registry: 'http://127.0.0.1:9',
        npm_config_fetch_retries: '0',
        npm_config_fetch_timeout: '1000',
      },
    }), 'buildr.update-check/v1');
    assert.equal(updateCheck.mode, 'registry-package');
    assert.equal(updateCheck.status, 'blocked');

    runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team']);
    runBuildr(buildrScript, ['sync', 'codex', '--target', workspace]);
    const doctorBefore = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
    assert.equal(doctorBefore.summary.error, 0);

    runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke']);
    const doctorAfter = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
    assert.equal(doctorAfter.summary.error, 0);
    assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);

    console.log(`Buildr release smoke passed from ${source.kind} on ${process.platform} with Node ${process.versions.node}.`);
    return { source: source.kind, version: installedMetadata.version };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) runReleaseSmoke();
