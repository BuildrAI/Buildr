#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { upstreamConvergencePlan } from '../../../src/modules/openspec/application/upstream-openspec.ts';
import { normalizeConvergenceText as normalizeOpenSpecContractText } from '../../../src/modules/openspec/application/convergence-model.ts';

const productRoot: any = path.resolve(process.env.BUILDR_PROJECT_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'));
const gitRoot: any = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: productRoot, encoding: 'utf8' }).trim();
const requestedReference = process.env.BUILDR_VERIFICATION_BASE || 'HEAD';
const verificationBase: string = execFileSync('git', ['rev-parse', '--verify', `${requestedReference}^{commit}`], { cwd: gitRoot, encoding: 'utf8' }).trim();
console.log(`Specification change consistency: reference=${requestedReference} commit=${verificationBase}`);
const gitPrefix: any = execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: productRoot, encoding: 'utf8' }).trim();
function gitPathList(args: any): any  {
  return execFileSync('git', args, {
    cwd: productRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).split(/\r?\n/).filter(Boolean);
}

function requirementBody(markdown: string): string {
  const match = /^## Requirements\s*$/mu.exec(markdown);
  if (!match) throw new Error('Canonical specification is missing its Requirements section.');
  return normalizeOpenSpecContractText(markdown.slice(match.index));
}

function isMetadataOnlyMaintenance(file: string): boolean {
  try {
    const previous = execFileSync('git', ['show', `${verificationBase}:${gitPrefix}${file}`], { cwd: productRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const currentPath = path.join(productRoot, file);
    return fs.existsSync(currentPath) && requirementBody(previous) === requirementBody(fs.readFileSync(currentPath, 'utf8'));
  } catch { return false; }
}

const candidatePaths: any = [...new Set([
  ...gitPathList(['diff', '--relative', '--name-only', `${verificationBase}...HEAD`, '--', 'openspec/specs', 'openspec/changes']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/specs']),
  ...gitPathList(['diff', '--relative', '--name-only', 'HEAD', '--', 'openspec/changes']),
  ...gitPathList(['ls-files', '--others', '--exclude-standard', '--', 'openspec/specs', 'openspec/changes']),
])].sort();
const changed: any = candidatePaths.filter((file: any) => file.startsWith('openspec/specs/') && !isMetadataOnlyMaintenance(file));
if (changed.length === 0) {
  console.log('Specification change consistency passed: no canonical requirement changes in the candidate tree.');
  process.exit(0);
}

const changedCapabilities: any = new Set();
for (const file of changed) {
  const match: any = file.match(/^openspec\/specs\/([^/]+)\/spec\.md$/);
  if (!match) {
    console.error(`Specification change consistency cannot associate non-canonical spec path: ${file}`);
    process.exit(1);
  }
  changedCapabilities.add(match[1]);
}

const matchingChanges: any = new Map();
for (const file of candidatePaths) {
  const match: any = file.match(/^openspec\/changes\/((?:archive\/[^/]+|[^/]+))\/specs\/([^/]+)\/spec\.md$/);
  if (!match) continue;
  const [, changeEntry, capability]: any = match;
  const change: any = matchingChanges.get(changeEntry) || { entry: changeEntry, capabilities: new Map(), operations: [] };
  const deltaFile: any = path.join(productRoot, file);
  if (!fs.existsSync(deltaFile)) continue;
  const content: any = fs.readFileSync(deltaFile, 'utf8');
  change.capabilities.set(capability, { file, content });
  matchingChanges.set(changeEntry, change);
}

const touchedCapabilities: any = new Set([...matchingChanges.values()].flatMap((change: any) => [...change.capabilities.keys()]));
const missing: any = [...changedCapabilities].filter((capability: any) => !touchedCapabilities.has(capability));
if (missing.length) {
  console.error(`Specification change consistency found canonical spec changes without a matching active or archived Change delta from the observed source: ${missing.join(', ')}`);
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

const executableIdentity: any = { sourceKind: 'candidate-verifier', reference: 'product-candidate', version: '1', sha256: 'observed-delta-replay' };
const pendingChanges: any[] = [...matchingChanges.values()].sort((left: any, right: any) => left.entry.localeCompare(right.entry));
while (pendingChanges.length) {
  let selectedIndex = -1;
  let selectedPlan: any = null;
  const blockedPlans: any[] = [];
  for (const [index, change] of pendingChanges.entries()) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-upstream-audit-'));
    let plan: any;
    try {
      const changeRoot = path.join(temporary, 'openspec/changes/replay');
      fs.mkdirSync(changeRoot, { recursive: true });
      const originalRoot = path.join(productRoot, 'openspec/changes', change.entry);
      const metadata = path.join(originalRoot, '.openspec.yaml');
      fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), fs.existsSync(metadata) ? fs.readFileSync(metadata) : 'schema: spec-driven\n');
      for (const [capability, item] of change.capabilities) {
        const current = replay.get(capability) || baseCanonical(capability);
        const target = path.join(temporary, 'openspec/specs', capability, 'spec.md');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (current.exists) fs.writeFileSync(target, current.content);
        const deltaFile = path.join(changeRoot, 'specs', capability, 'spec.md');
        fs.mkdirSync(path.dirname(deltaFile), { recursive: true });
        fs.writeFileSync(deltaFile, item.content);
      }
      plan = upstreamConvergencePlan({ executable: path.resolve(import.meta.dirname, '../../../node_modules/.bin/openspec'), projectRoot: temporary,
        changeRoot, change: 'replay', project: 'product', executableIdentity });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    if (plan.status === 'blocked') { blockedPlans.push({ change, plan }); continue; }
    selectedIndex = index;
    selectedPlan = plan;
    break;
  }
  if (selectedIndex < 0) {
    const failure: any = blockedPlans[0];
    console.error(`Specification change consistency could not replay active or archived Change ${failure.change.entry}: ${failure.plan.blocked.map((item: any) => (item.message || item.code)).join(', ')}`);
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
  return expected.exists !== actual.exists || (expected.exists && requirementBody(expected.content) !== requirementBody(actual.content));
});
if (mismatched.length) {
  console.error(`Specification change consistency found active or archived Change delta/canonical mismatch: ${mismatched.join(', ')}`);

  process.exit(1);
}

console.log(`Specification change consistency passed: ${[...changedCapabilities].join(', ')} associated with observed active or archived Change deltas.`);
