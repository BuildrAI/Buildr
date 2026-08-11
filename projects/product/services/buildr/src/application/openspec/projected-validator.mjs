import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnCommandSync } from '../../infrastructure/process.mjs';

const diagnosticDigest = (value) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;

// Legacy recovery callers keep this adapter during the convergence receipt
// migration. New transactions use validateProjectedOpenSpec below.
export function validateProjectedOpenSpecTree({ projectRoot, delta, files, executable, includeBaselineTargets = false, collectBaselineTargets, io, spawn = spawnCommandSync }) {
  const startedAt = Date.now();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-projected-'));
  try {
    const temporaryProject = path.join(temporaryRoot, 'project');
    io.ensureDirectory(temporaryProject);
    io.copyDirectory(path.join(projectRoot, 'openspec'), path.join(temporaryProject, 'openspec'));
    for (const item of files) io.atomicWriteFile(path.join(temporaryProject, item.path), item.content);
    if (!path.isAbsolute(executable) || !io.existsFile(executable)) return { status: 'blocked', code: 'openspec-executable-unavailable', durationMs: Date.now() - startedAt };
    const version = spawn(executable, ['--version'], { cwd: temporaryProject, encoding: 'utf8' });
    const validation = spawn(executable, ['validate', '--all', '--strict', '--no-interactive'], { cwd: temporaryProject, encoding: 'utf8' });
    const output = `${validation.stdout || ''}${validation.stderr || ''}`;
    let baselineTargets = null;
    let baselineError = null;
    if (validation.status === 0 && includeBaselineTargets) {
      try { baselineTargets = collectBaselineTargets(temporaryProject, delta); }
      catch (error) { baselineError = error.message; }
    }
    const passed = validation.status === 0 && !baselineError;
    return {
      status: passed ? 'passed' : 'blocked',
      code: passed ? null : baselineError ? 'recovery-baseline-unprovable' : 'expected-tree-strict-validation-failed',
      executable,
      version: version.status === 0 ? version.stdout.trim() : null,
      durationMs: Date.now() - startedAt,
      expectedDigests: Object.fromEntries(files.map((item) => [item.path, item.digest])),
      baselineTargets,
      diagnostic: { bytes: Buffer.byteLength(output), sha256: diagnosticDigest(output), preview: baselineError || output.slice(0, 2000), truncated: output.length > 2000 },
    };
  } finally {
    io.removePath(temporaryRoot);
  }
}

export function validateProjectedOpenSpec({ projectRoot, files = [], executable, copyDirectory, atomicWriteFile, removePath, spawn = spawnCommandSync, mode = 'projected' }) {
  const startedAt = Date.now();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-convergence-'));
  try {
    const temporaryProject = path.join(temporaryRoot, 'project');
    fs.mkdirSync(temporaryProject, { recursive: true });
    copyDirectory(path.join(projectRoot, 'openspec'), path.join(temporaryProject, 'openspec'));
    for (const item of files) {
      const target = path.join(temporaryProject, item.path);
      if (item.exists === false) removePath(target);
      else atomicWriteFile(target, item.content);
    }
    if (!path.isAbsolute(executable) || !fs.existsSync(executable)) return { status: 'blocked', code: 'openspec-executable-unavailable', durationMs: Date.now() - startedAt, commandCount: 0 };
    const validation = spawn(executable, ['validate', '--all', '--strict', '--no-interactive'], { cwd: temporaryProject, encoding: 'utf8' });
    const output = `${validation.stdout || ''}${validation.stderr || ''}`;
    return {
      status: validation.status === 0 ? 'passed' : 'blocked',
      code: validation.status === 0 ? null : `${mode}-strict-validation-failed`,
      durationMs: Date.now() - startedAt,
      commandCount: 1,
      diagnostic: { bytes: Buffer.byteLength(output), sha256: diagnosticDigest(output), preview: output.slice(0, 2000), truncated: output.length > 2000 },
    };
  } finally {
    removePath(temporaryRoot);
  }
}

export function validateActualOpenSpec({ projectRoot, executable, spawn = spawnCommandSync }) {
  const startedAt = Date.now();
  if (!path.isAbsolute(executable) || !fs.existsSync(executable)) return { status: 'blocked', code: 'openspec-executable-unavailable', durationMs: 0, commandCount: 0 };
  const validation = spawn(executable, ['validate', '--all', '--strict', '--no-interactive'], { cwd: projectRoot, encoding: 'utf8' });
  const output = `${validation.stdout || ''}${validation.stderr || ''}`;
  return {
    status: validation.status === 0 ? 'passed' : 'blocked',
    code: validation.status === 0 ? null : 'post-apply-strict-validation-failed',
    durationMs: Date.now() - startedAt,
    commandCount: 1,
    diagnostic: { bytes: Buffer.byteLength(output), sha256: diagnosticDigest(output), preview: output.slice(0, 2000), truncated: output.length > 2000 },
  };
}
