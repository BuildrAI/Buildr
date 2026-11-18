#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../../projects/product/services/buildr/src/infrastructure/filesystem/filesystem-path-identity.ts';
import { releasePublishAuthority, releasePackageName } from './release-authority.ts';
import { publisherNpmCli } from '../../../projects/product/services/buildr/tools/verification/candidate-environment.ts';
import { readReleaseArtifact } from './release-artifact.ts';
import { assertRegistryArtifact, registryVersionState, waitForRegistryPublication } from './registry-version-state.ts';
import {inspectArtifactDistribution} from '../../../projects/product/services/buildr-harness/tools/inspect-artifact-distribution.ts';

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
  const previousAttempt = options.previousAttempt ?? 'not-attempted';
  let attempted: boolean | null = previousAttempt === 'attempted' ? true : previousAttempt === 'not-attempted' ? false : null;
  const read = () => registryVersionState(manifest.packageName, manifest.version, dependencies.fetchImpl ?? fetch);
  try {
    const before = await read();
    assertRegistryArtifact(before, manifest);
    if (before.published) return { status: 'passed', action: 'reused', registry: before, effects: [], attempted };
    if (previousAttempt !== 'not-attempted') return {
      status: options.deferReadback ? 'passed' : 'blocked', action: 'readback-required', registry: before, attempted, effects,
      diagnostic: { code: 'npm-publication-unconfirmed', message: 'Previous npm write may have occurred; only official registry readback is allowed.' },
    };
    const distribution = await (dependencies.verifyDistribution ?? inspectArtifactDistribution)(artifact.tarball, manifest.packageName);
    if (distribution.status !== 'eligible' || distribution.publicationApproved !== true) return {
      status: 'blocked', action: 'distribution-review-required', attempted, effects,
      diagnostic: {code: 'distribution-approval-required', message: '准确发行物缺少允许发行的许可或平台支持依据。', findings: distribution.findings},
      nextActions: ['补齐准确版本许可决定、许可证据与平台支持批准后，重新准备准确候选；不执行 npm 写入。'],
    };
    const publishEffect = { type: 'npm-published', package: manifest.packageName, version: manifest.version, sourceCommit: manifest.sourceCommit,
      sha256: manifest.sha256, integrity: manifest.integrity, state: 'unknown' };
    effects.push(publishEffect);
    attempted = true;
    dependencies.onEffects?.(effects);
    const command = await (dependencies.publish ?? ((args: string[]) => runTrustedPublish(args, {
      npmCommand: process.execPath,
      execute: (_command: string, commandArgs: string[]) => spawnSync(process.execPath, [publisherNpmCli(), ...commandArgs], { encoding: 'utf8', env: process.env, timeout: 120_000 }),
    })))([artifact.tarball, '--access', 'public', '--tag', npmTag, '--registry=https://registry.npmjs.org/']);
    if (command.stdout) process.stdout.write(command.stdout);
    if (command.stderr) process.stderr.write(command.stderr);
    process.stdout.write(`[release] npm-publish exitCode=${command.status ?? 'unknown'}\n`);
    if (command.status === 0) {
      publishEffect.state = 'accepted';
      dependencies.onEffects?.(effects);
    }
    if (options.deferReadback && (command.status === 0 || !command.diagnostic)) {
      return { status: 'passed', action: 'readback-required', registry: before, attempted, effects };
    }
    const now = dependencies.now ?? Date.now;
    const shortFailureReadback = command.status !== 0 && command.diagnostic !== null;
    const waitOptions = shortFailureReadback
      ? { attempts: 3, delayMs: 5_000, ...dependencies.registryWait, sleep: dependencies.sleep, now }
      : { ...dependencies.registryWait, sleep: dependencies.sleep, now };
    let readbackObservations = 0;
    const readbackStartedAt = now();
    const after = await waitForRegistryPublication(async () => {
      const state = await read(); assertRegistryArtifact(state, manifest); return state;
    }, {
      ...waitOptions,
      onObservation: dependencies.onObservation
        ? (value: any) => { readbackObservations++; dependencies.onObservation(value); }
        : (value: any) => { readbackObservations++; process.stdout.write(`[release] registry-readback ${JSON.stringify(value)}\n`); },
    });
    const readbackElapsedMs = now() - readbackStartedAt;
    process.stdout.write(`[release] npm-readback attempts=${readbackObservations} elapsedMs=${readbackElapsedMs} confirmed=${after.published ? 'true' : 'false'}\n`);
    if (!after.published) {
      publishEffect.state = command.status === 0 ? 'accepted' : 'not-confirmed';
      const fallbackDiagnostic = {
        code: 'npm-publication-unconfirmed',
        message: `Official Registry has not confirmed ${manifest.packageName}@${manifest.version} after ${readbackObservations} readback checks (${readbackElapsedMs}ms); npm exit=${command.status ?? 'unknown'}.`,
        attempts: readbackObservations,
        elapsedMs: readbackElapsedMs,
        exitCode: command.status ?? null,
      };
      return {
        status: 'blocked',
        action: 'readback-required',
        attempted,
        effects,
        diagnostic: command.diagnostic ?? fallbackDiagnostic,
        nextActions: command.status === 0
          ? ['回读同一版本与integrity后恢复；npm publish已返回成功但官方源尚未可见，未知状态下不重复publish。']
          : ['回读同一版本与integrity后恢复；未知状态下不重复publish。'],
      };
    }
    publishEffect.state = 'confirmed';
    dependencies.onEffects?.(effects);
    return { status: 'passed', action: command.status === 0 ? 'published' : 'recovered', registry: after, attempted, effects };
  } catch (error) {
    return { status: 'blocked', action: 'readback-required', attempted, effects, diagnostic: { code: (error as any)?.code ?? 'npm-publication-blocked', message: error instanceof Error ? error.message : String(error) }, nextActions: ['回读官方Registry中的精确版本，保留已发布事实，冲突时停止。'] };
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes('--manifest') || !args.includes('--tag')) throw new Error('Usage: trusted-publish.ts --manifest <frozen-manifest> --tag <next|latest> [--output <file>]');
  const output = args.includes('--output') ? option('--output') : null;
  const result = await publishFrozenArtifact({ manifestPath: option('--manifest'), npmTag: option('--tag'),
    previousAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1) > 1 ? 'unknown' : 'not-attempted' }, {
    onEffects: (effects: any[]) => { if (output) fs.writeFileSync(output, `${JSON.stringify({ status: 'running', effects })}\n`, { mode: 0o600 }); },
  });
  if (output) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
