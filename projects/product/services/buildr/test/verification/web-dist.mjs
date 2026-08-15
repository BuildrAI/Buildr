#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.resolve(productRoot, '../buildr-web');
const trackedWebDist = path.join(productRoot, 'src/interfaces/local-app/web-dist');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function describeWebDistTree(root) {
  assert.equal(fs.statSync(root).isDirectory(), true, `Buildr Web dist root is not a directory: ${root}`);
  const entries = [];
  const visit = (current, relative = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        entries.push({ path: childRelative, type: 'directory' });
        visit(child, childRelative);
      } else if (entry.isFile()) entries.push({ path: childRelative, type: 'file', sha256: sha256(child) });
      else entries.push({ path: childRelative, type: entry.isSymbolicLink() ? 'symlink' : 'other' });
    }
  };
  visit(root);
  return entries;
}

export function compareWebDistTrees(expectedRoot, actualRoot) {
  const expected = describeWebDistTree(expectedRoot);
  const actual = describeWebDistTree(actualRoot);
  const byPath = (entries) => new Map(entries.map((entry) => [entry.path, entry]));
  const expectedByPath = byPath(expected);
  const actualByPath = byPath(actual);
  const drift = [];
  for (const relative of [...new Set([...expectedByPath.keys(), ...actualByPath.keys()])].sort()) {
    const expectedEntry = expectedByPath.get(relative);
    const actualEntry = actualByPath.get(relative);
    if (!expectedEntry) drift.push({ path: relative, kind: 'unexpected' });
    else if (!actualEntry) drift.push({ path: relative, kind: 'missing' });
    else if (expectedEntry.type !== actualEntry.type) drift.push({ path: relative, kind: 'type', expected: expectedEntry.type, actual: actualEntry.type });
    else if (expectedEntry.type === 'file' && expectedEntry.sha256 !== actualEntry.sha256) drift.push({ path: relative, kind: 'content' });
  }
  return { ok: drift.length === 0, expected, actual, drift };
}

function defaultBuild(stagingRoot) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = [
    ...(npmExecPath ? [npmExecPath] : []),
    '--prefix', webRoot, 'run', 'build', '--', '--outDir', stagingRoot,
  ];
  const result = spawnSync(command, args, {
    cwd: productRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`Buildr Web staging build failed with exit code ${result.status ?? 'unknown'}.`);
    error.code = 'web_dist_build_failed';
    throw error;
  }
}

export function verifyTrackedWebDist({ trackedRoot = trackedWebDist, build = defaultBuild, temporaryParent = os.tmpdir() } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, 'buildr-web-dist-verification-'));
  const stagingRoot = path.join(temporaryRoot, 'web-dist');
  try {
    build(stagingRoot);
    const comparison = compareWebDistTrees(trackedRoot, stagingRoot);
    if (!comparison.ok) {
      const error = new Error(`Tracked Buildr Web dist differs from the staging build:\n${comparison.drift.slice(0, 20).map((entry) => `- ${entry.kind}: ${entry.path}`).join('\n')}`);
      error.code = 'web_dist_drift';
      error.details = { drift: comparison.drift, truncated: comparison.drift.length > 20 };
      throw error;
    }
    return { status: 'passed', fileCount: comparison.actual.filter((entry) => entry.type === 'file').length };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const result = verifyTrackedWebDist();
    process.stdout.write(`Buildr Web tracked dist matches staging build (${result.fileCount} files).\n`);
  } catch (error) {
    process.stderr.write(`${error.code || 'web_dist_verification_failed'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
