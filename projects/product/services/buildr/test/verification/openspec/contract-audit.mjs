#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveVerificationBase } from '../changed-paths.mjs';
import { createConvergencePlan } from '../../../src/task/openspec/application/convergence-planner.mjs';
import { normalizeOpenSpecContractText, openSpecSection, parseOpenSpecDeltaSpec } from '../../../src/task/openspec/application/delta-parser.mjs';

const productRoot = path.resolve(process.env.BUILDR_PROJECT_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'));
const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: productRoot, encoding: 'utf8' }).trim();
const verificationBase = resolveVerificationBase(gitRoot, process.env.BUILDR_VERIFICATION_BASE || null);
const gitPrefix = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: productRoot, encoding: 'utf8' }).trim();
function gitPathList(args) {
  return execFileSync('git', args, {
    cwd: productRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).split(/\r?\n/).filter(Boolean);
}

function withoutPurposeBody(markdown) {
  return String(markdown).replace(/(^## Purpose\s*$)[\s\S]*?(?=^##\s+)/m, '$1\n');
}

function isPurposeOnlyMaintenance(file) {
  let previous;
  try {
    previous = execFileSync('git', ['show', `${verificationBase}:${gitPrefix}${file}`], { cwd: productRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return false;
  }
  const currentPath = path.join(productRoot, file);
  if (!fs.existsSync(currentPath)) return false;
  const current = fs.readFileSync(currentPath, 'utf8');
  return withoutPurposeBody(previous) === withoutPurposeBody(current);
}

const candidatePaths = [...new Set([
  ...gitPathList(['diff', '--relative', '--name-only', `${verificationBase}...HEAD`, '--', 'openspec/specs', 'openspec/changes']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/specs']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/changes']),
  ...gitPathList(['ls-files', '--others', '--exclude-standard', '--', 'openspec/specs', 'openspec/changes']),
])].sort();
const changed = candidatePaths.filter((file) => file.startsWith('openspec/specs/') && !isPurposeOnlyMaintenance(file));
if (changed.length === 0) {
  console.log('OpenSpec contract audit passed: no canonical requirement changes in the candidate tree.');
  process.exit(0);
}

const changedCapabilities = new Set();
for (const file of changed) {
  const match = file.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
  if (!match) {
    console.error(`OpenSpec contract audit cannot associate non-canonical spec path: ${file}`);
    process.exit(1);
  }
  changedCapabilities.add(match[1]);
}

const archivedChanges = new Map();
for (const file of candidatePaths) {
  const match = file.match(/^openspec\/changes\/archive\/(\d{4}-\d{2}-\d{2}-.+?)\/specs\/([^/]+)\/spec\.md$/);
  if (!match) continue;
  const [, archiveEntry, capability] = match;
  const change = archivedChanges.get(archiveEntry) || { entry: archiveEntry, capabilities: new Map(), operations: [] };
  const deltaFile = path.join(productRoot, file);
  if (!fs.existsSync(deltaFile)) continue;
  const content = fs.readFileSync(deltaFile, 'utf8');
  const operations = parseOpenSpecDeltaSpec(content, capability);
  if (operations.length === 0) {
    console.error(`OpenSpec contract audit found archived delta without Requirement operations: ${file}`);
    process.exit(1);
  }
  change.capabilities.set(capability, { file, content, operations });
  change.operations.push(...operations);
  archivedChanges.set(archiveEntry, change);
}

const touchedCapabilities = new Set([...archivedChanges.values()].flatMap((change) => [...change.capabilities.keys()]));
const missing = [...changedCapabilities].filter((capability) => !touchedCapabilities.has(capability));
if (missing.length) {
  console.error(`OpenSpec contract audit found canonical spec changes without a matching Archived Change delta from the current candidate: ${missing.join(', ')}`);
  process.exit(1);
}

const replay = new Map();
function baseCanonical(capability) {
  const file = `openspec/specs/${capability}/spec.md`;
  try {
    return { exists: true, content: execFileSync('git', ['show', `${verificationBase}:${gitPrefix}${file}`], { cwd: productRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch {
    return { exists: false, content: '' };
  }
}
function actualCanonical(capability) {
  const file = path.join(productRoot, 'openspec', 'specs', capability, 'spec.md');
  return fs.existsSync(file) ? { exists: true, content: fs.readFileSync(file, 'utf8') } : { exists: false, content: '' };
}

const executableIdentity = { sourceKind: 'candidate-verifier', reference: 'product-candidate', version: '1', sha256: 'archived-delta-replay' };
for (const change of [...archivedChanges.values()].sort((left, right) => left.entry.localeCompare(right.entry))) {
  const canonicalFiles = new Map();
  const capabilityPurposes = new Map();
  for (const capability of change.capabilities.keys()) {
    const current = replay.get(capability) || baseCanonical(capability);
    replay.set(capability, current);
    canonicalFiles.set(capability, { path: `openspec/specs/${capability}/spec.md`, ...current });
    const actual = actualCanonical(capability);
    const purpose = openSpecSection(actual.content, 'Purpose').trim();
    if (purpose) capabilityPurposes.set(capability, purpose);
    else if (!actual.exists) capabilityPurposes.set(
      capability,
      `Historical replay placeholder for removed capability ${capability}; the final candidate does not retain this capability.`,
    );
  }
  const deltaDigest = `sha256-${crypto.createHash('sha256').update([...change.capabilities.values()].map((item) => item.content).join('\0')).digest('hex')}`;
  const plan = createConvergencePlan({
    change: change.entry.replace(/^\d{4}-\d{2}-\d{2}-/, ''), project: 'product',
    delta: { hash: deltaDigest, operations: change.operations, capabilities: change.capabilities },
    canonicalFiles, capabilityPurposes, executableIdentity, activeConflicts: [],
  });
  if (plan.status === 'blocked') {
    console.error(`OpenSpec contract audit could not replay Archived Change ${change.entry}: ${plan.blocked.map((item) => item.code).join(', ')}`);
    process.exit(1);
  }
  for (const item of plan.files) {
    const match = item.path.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
    if (match) replay.set(match[1], { exists: item.expectedExists !== false, content: item.expectedExists === false ? '' : item.expectedContent });
  }
}

const mismatched = [...changedCapabilities].filter((capability) => {
  const expected = replay.get(capability) || baseCanonical(capability);
  const actual = actualCanonical(capability);
  return expected.exists !== actual.exists || (expected.exists && normalizeOpenSpecContractText(expected.content) !== normalizeOpenSpecContractText(actual.content));
});
if (mismatched.length) {
  console.error(`OpenSpec contract audit found Archived Change delta/canonical mismatch: ${mismatched.join(', ')}`);
  process.exit(1);
}

console.log(`OpenSpec contract audit passed: ${[...changedCapabilities].join(', ')} associated with current candidate Archived Change deltas.`);
