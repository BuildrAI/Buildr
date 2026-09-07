#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { releasePublishAuthority, releasePackageName } from './release-authority.ts';
import { publisherNpmCli } from '../verification/candidate-environment.ts';
import { readReleaseArtifact } from './release-artifact.ts';
import { assertRegistryArtifact, registryVersionState } from './registry-version-state.ts';

export function authorityFailureDiagnostic(output: any, authority: any = releasePublishAuthority): any  {
  if (!/(?:E401|ENEEDAUTH|E404|OIDC|Trusted Publisher)/i.test(String(output ?? ''))) return null;
  return {
    schemaVersion: 'buildr.trusted-publish-diagnostic/v1',
    code: 'trusted-publisher-authority-check-required',
    expected: authority,
    recovery: [
      '针对 current origin/main 重新 dispatch 完整 release transaction，并在其唯一 protected job 内重做 OIDC authority proof。',
      '按 expected tuple 修复 npm Trusted Publisher 或 GitHub current authority。',
      '保留现有 tag，在 GitHub-hosted release workflow 上恢复；不得回退本机 token publish。',
    ],
  };
}

export function runTrustedPublish(args: any, options: any = {}): any  {
  const execute: any = options.execute ?? ((command: any, commandArgs: any) => spawnSync(command, commandArgs, { encoding: 'utf8', env: options.env ?? process.env }));
  const npmCommand: any = options.npmCommand ?? 'npm';
  const result: any = execute(npmCommand, ['publish', ...args]);
  const stdout: any = String(result?.stdout ?? '');
  const stderr: any = String(result?.stderr ?? result?.error?.message ?? '');
  return {
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout,
    stderr,
    diagnostic: Number(result?.status) === 0 ? null : authorityFailureDiagnostic(`${stderr}\n${stdout}`),
  };
}

export async function publishFrozenArtifact(options: any, dependencies: any = {}): Promise<any> {
  const artifact = readReleaseArtifact(options.manifestPath);
  const manifest = artifact.manifest;
  if (manifest.packageName !== releasePackageName) throw new Error('Publication only accepts the Buildr package.');
  const npmTag = manifest.version.includes('-') ? 'next' : 'latest';
  if (options.npmTag !== npmTag) throw new Error(`Frozen package ${manifest.version} requires dist-tag ${npmTag}.`);
  const effects: any[] = [];
  const read = () => registryVersionState(manifest.packageName, manifest.version, dependencies.fetchImpl ?? fetch);
  try {
    const before = await read();
    assertRegistryArtifact(before, manifest);
    if (before.published) return { status: 'passed', action: 'reused', registry: before, effects: [] };
    const publishEffect = { type: 'npm-published', package: manifest.packageName, version: manifest.version, integrity: manifest.integrity, state: 'unknown' };
    effects.push(publishEffect);
    dependencies.onEffects?.(effects);
    const command = await (dependencies.publish ?? ((args: string[]) => runTrustedPublish(args, {
      npmCommand: process.execPath,
      execute: (_command: string, commandArgs: string[]) => spawnSync(process.execPath, [publisherNpmCli(), ...commandArgs], { encoding: 'utf8', env: process.env, timeout: 120_000 }),
    })))([artifact.tarball, '--access', 'public', '--tag', npmTag, '--registry=https://registry.npmjs.org/']);
    if (command.stdout) process.stdout.write(command.stdout);
    if (command.stderr) process.stderr.write(command.stderr);
    const after = await read();
    assertRegistryArtifact(after, manifest);
    if (!after.published) {
      publishEffect.state = command.status === 0 ? 'unknown' : 'not-confirmed';
      return { status: 'blocked', action: 'readback-required', effects, diagnostic: command.diagnostic ?? { code: 'npm-publication-unconfirmed', message: 'Official Registry has not confirmed the publish result.' }, nextActions: ['回读同一版本与integrity后恢复；未知状态下不重复publish。'] };
    }
    publishEffect.state = 'confirmed';
    dependencies.onEffects?.(effects);
    return { status: 'passed', action: command.status === 0 ? 'published' : 'recovered', registry: after, effects };
  } catch (error) {
    return { status: 'blocked', action: 'readback-required', effects, diagnostic: { code: (error as any)?.code ?? 'npm-publication-blocked', message: error instanceof Error ? error.message : String(error) }, nextActions: ['回读官方Registry中的精确版本，保留已发布事实，冲突时停止。'] };
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes('--manifest') || !args.includes('--tag')) throw new Error('Usage: trusted-publish.ts --manifest <frozen-manifest> --tag <next|latest> [--output <file>]');
  const output = args.includes('--output') ? option('--output') : null;
  const result = await publishFrozenArtifact({ manifestPath: option('--manifest'), npmTag: option('--tag') }, {
    onEffects: (effects: any[]) => { if (output) fs.writeFileSync(output, `${JSON.stringify({ status: 'running', effects })}\n`, { mode: 0o600 }); },
  });
  if (output) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
