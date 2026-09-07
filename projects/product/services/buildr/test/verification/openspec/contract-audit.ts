#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveVerificationBase } from '../changed-paths.ts';
import { createConvergencePlan } from '../../../src/task/openspec/application/convergence-planner.ts';
import { normalizeOpenSpecContractText, openSpecSection, parseOpenSpecDeltaSpec } from '../../../src/task/openspec/application/delta-parser.ts';

const productRoot: any = path.resolve(process.env.BUILDR_PROJECT_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'));
const gitRoot: any = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: productRoot, encoding: 'utf8' }).trim();
const verificationBase: any = resolveVerificationBase(gitRoot, process.env.BUILDR_VERIFICATION_BASE || null);
const gitPrefix: any = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: productRoot, encoding: 'utf8' }).trim();
function gitPathList(args: any): any  {
  return execFileSync('git', args, {
    cwd: productRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).split(/\r?\n/).filter(Boolean);
}

function withoutPurposeBody(markdown: any): any  {
  return String(markdown).replace(/(^## Purpose\s*$)[\s\S]*?(?=^##\s+)/m, '$1\n');
}

function isPurposeOnlyMaintenance(file: any): any  {
  let previous: any;
  try {
    previous = execFileSync('git', ['show', `${verificationBase}:${gitPrefix}${file}`], { cwd: productRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return false;
  }
  const currentPath: any = path.join(productRoot, file);
  if (!fs.existsSync(currentPath)) return false;
  const current: any = fs.readFileSync(currentPath, 'utf8');
  return withoutPurposeBody(previous) === withoutPurposeBody(current);
}

const candidatePaths: any = [...new Set([
  ...gitPathList(['diff', '--relative', '--name-only', `${verificationBase}...HEAD`, '--', 'openspec/specs', 'openspec/changes']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/specs']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/changes']),
  ...gitPathList(['ls-files', '--others', '--exclude-standard', '--', 'openspec/specs', 'openspec/changes']),
])].sort();
const changed: any = candidatePaths.filter((file: any) => file.startsWith('openspec/specs/') && !isPurposeOnlyMaintenance(file));
if (changed.length === 0) {
  console.log('OpenSpec contract audit passed: no canonical requirement changes in the candidate tree.');
  process.exit(0);
}

const changedCapabilities: any = new Set();
for (const file of changed) {
  const match: any = file.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
  if (!match) {
    console.error(`OpenSpec contract audit cannot associate non-canonical spec path: ${file}`);
    process.exit(1);
  }
  changedCapabilities.add(match[1]);
}

const archivedChanges: any = new Map();
for (const file of candidatePaths) {
  const match: any = file.match(/^openspec\/changes\/archive\/(\d{4}-\d{2}-\d{2}-.+?)\/specs\/([^/]+)\/spec\.md$/);
  if (!match) continue;
  const [, archiveEntry, capability]: any = match;
  const change: any = archivedChanges.get(archiveEntry) || { entry: archiveEntry, capabilities: new Map(), operations: [] };
  const deltaFile: any = path.join(productRoot, file);
  if (!fs.existsSync(deltaFile)) continue;
  const content: any = fs.readFileSync(deltaFile, 'utf8');
  const operations: any = parseOpenSpecDeltaSpec(content, capability);
  if (operations.length === 0) {
    console.error(`OpenSpec contract audit found archived delta without Requirement operations: ${file}`);
    process.exit(1);
  }
  change.capabilities.set(capability, { file, content, operations });
  change.operations.push(...operations);
  archivedChanges.set(archiveEntry, change);
}

const touchedCapabilities: any = new Set([...archivedChanges.values()].flatMap((change: any) => [...change.capabilities.keys()]));
const missing: any = [...changedCapabilities].filter((capability: any) => !touchedCapabilities.has(capability));
if (missing.length) {
  console.error(`OpenSpec contract audit found canonical spec changes without a matching Archived Change delta from the current candidate: ${missing.join(', ')}`);
  process.exit(1);
}

const replay: any = new Map();
function baseCanonical(capability: any): any  {
  const file: any = `openspec/specs/${capability}/spec.md`;
  try {
    return { exists: true, content: execFileSync('git', ['show', `${verificationBase}:${gitPrefix}${file}`], { cwd: productRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch {
    return { exists: false, content: '' };
  }
}
function actualCanonical(capability: any): any  {
  const file: any = path.join(productRoot, 'openspec', 'specs', capability, 'spec.md');
  return fs.existsSync(file) ? { exists: true, content: fs.readFileSync(file, 'utf8') } : { exists: false, content: '' };
}

const executableIdentity: any = { sourceKind: 'candidate-verifier', reference: 'product-candidate', version: '1', sha256: 'archived-delta-replay' };
const pendingChanges: any[] = [...archivedChanges.values()].sort((left: any, right: any) => left.entry.localeCompare(right.entry));
while (pendingChanges.length) {
  let selectedIndex = -1;
  let selectedPlan: any = null;
  const blockedPlans: any[] = [];
  for (const [index, change] of pendingChanges.entries()) {
    const canonicalFiles: any = new Map();
    const capabilityPurposes: any = new Map();
    for (const capability of change.capabilities.keys()) {
      const current: any = replay.get(capability) || baseCanonical(capability);
      canonicalFiles.set(capability, { path: `openspec/specs/${capability}/spec.md`, ...current });
      const actual: any = actualCanonical(capability);
      const purpose: any = openSpecSection(actual.content, 'Purpose').trim();
      if (purpose) capabilityPurposes.set(capability, purpose);
      else if (!actual.exists) capabilityPurposes.set(capability, `Historical replay placeholder for removed capability ${capability}; the final candidate does not retain this capability.`);
    }
    const deltaDigest: any = `sha256-${crypto.createHash('sha256').update([...change.capabilities.values()].map((item: any) => item.content).join('\0')).digest('hex')}`;
    const plan: any = createConvergencePlan({
      change: change.entry.replace(/^\d{4}-\d{2}-\d{2}-/, ''), project: 'product',
      delta: { hash: deltaDigest, operations: change.operations, capabilities: change.capabilities },
      canonicalFiles, capabilityPurposes, executableIdentity, activeConflicts: [],
    });
    if (plan.status === 'blocked') { blockedPlans.push({ change, plan }); continue; }
    selectedIndex = index;
    selectedPlan = plan;
    break;
  }
  if (selectedIndex < 0) {
    const failure: any = blockedPlans[0];
    console.error(`OpenSpec contract audit could not replay Archived Change ${failure.change.entry}: ${failure.plan.blocked.map((item: any) => item.code).join(', ')}`);
    process.exit(1);
  }
  pendingChanges.splice(selectedIndex, 1);
  for (const item of selectedPlan.files) {
    const match: any = item.path.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
    if (match) replay.set(match[1], { exists: item.expectedExists !== false, content: item.expectedExists === false ? '' : item.expectedContent });
  }
}

const mismatched: any = [...changedCapabilities].filter((capability: any) => {
  const expected: any = replay.get(capability) || baseCanonical(capability);
  const actual: any = actualCanonical(capability);
  return expected.exists !== actual.exists || (expected.exists && normalizeOpenSpecContractText(withoutPurposeBody(expected.content)) !== normalizeOpenSpecContractText(withoutPurposeBody(actual.content)));
});
if (mismatched.length) {
  console.error(`OpenSpec contract audit found Archived Change delta/canonical mismatch: ${mismatched.join(', ')}`);
  process.exit(1);
}

console.log(`OpenSpec contract audit passed: ${[...changedCapabilities].join(', ')} associated with current candidate Archived Change deltas.`);
