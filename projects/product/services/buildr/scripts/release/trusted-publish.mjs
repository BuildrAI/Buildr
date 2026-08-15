#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { releasePublishAuthority } from './release-authority.mjs';

export function authorityFailureDiagnostic(output, authority = releasePublishAuthority) {
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

export function runTrustedPublish(args, options = {}) {
  const execute = options.execute ?? ((command, commandArgs) => spawnSync(command, commandArgs, { encoding: 'utf8', env: options.env ?? process.env }));
  const npmCommand = options.npmCommand ?? 'npm';
  const result = execute(npmCommand, ['publish', ...args]);
  const stdout = String(result?.stdout ?? '');
  const stderr = String(result?.stderr ?? result?.error?.message ?? '');
  return {
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout,
    stderr,
    diagnostic: Number(result?.status) === 0 ? null : authorityFailureDiagnostic(`${stderr}\n${stdout}`),
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  const result = runTrustedPublish(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.diagnostic) process.stderr.write(`\n${JSON.stringify(result.diagnostic, null, 2)}\n`);
  process.exitCode = result.status;
}
