#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveVerificationBase } from '../changed-paths.mjs';

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withoutPurposeBody(markdown) {
  return String(markdown).replace(/(^## Purpose\s*$)[\s\S]*?(?=^##\s+)/m, '$1\n');
}

function normalizedIntegrity(content) {
  const normalized = String(content).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
  return `sha256-${crypto.createHash('sha256').update(normalized).digest('hex')}`;
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
const candidatePathSet = new Set(candidatePaths);

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

const receipts = [];
for (const root of [path.join(productRoot, 'openspec', 'changes'), path.join(productRoot, 'openspec', 'changes', 'archive')]) {
  if (!fs.existsSync(root)) continue;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    for (const receiptName of ['contract-pre-sync-receipt.json', 'convergence-receipt.json']) {
      const receipt = path.join(root, entry.name, '.buildr', receiptName);
      if (!fs.existsSync(receipt)) continue;
      const relativeReceipt = path.relative(productRoot, receipt).split(path.sep).join('/');
      if (!candidatePathSet.has(relativeReceipt)) continue;
      try {
        const value = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      const expectedEntry = root.endsWith(`${path.sep}archive`)
        ? new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(value.change || '')}$`)
        : new RegExp(`^${escapeRegExp(value.change || '')}$`);
      if (!expectedEntry.test(entry.name)) {
        console.error(`OpenSpec contract audit found receipt/change path mismatch: ${relativeReceipt}`);
        process.exit(1);
      }
      if (value.schemaVersion === 'buildr.openspec-contract-receipt/v1'
        && value.postSyncVerified === true
        && typeof value.postSyncDeltaHash === 'string'
        && value.postSyncSpecIntegrities
        && typeof value.postSyncSpecIntegrities === 'object') {
        const capabilities = [];
        for (const [capability, expectedIntegrity] of Object.entries(value.postSyncSpecIntegrities)) {
          const deltaFile = path.join(root, entry.name, 'specs', capability, 'spec.md');
          const canonicalFile = path.join(productRoot, 'openspec', 'specs', capability, 'spec.md');
          if (!fs.existsSync(deltaFile) || !fs.existsSync(canonicalFile) || typeof expectedIntegrity !== 'string') continue;
          const actualIntegrity = normalizedIntegrity(fs.readFileSync(canonicalFile, 'utf8'));
          if (actualIntegrity === expectedIntegrity) capabilities.push(capability);
        }
        receipts.push({ change: value.change, capabilities });
      } else if (value.schemaVersion === 'buildr.openspec-convergence-receipt/v3'
        && value.disposition === 'archived'
        && Array.isArray(value.files)) {
        const capabilities = [];
        for (const file of value.files) {
          const match = typeof file?.path === 'string' ? file.path.match(/^openspec\/specs\/([^/]+)\/spec\.md$/) : null;
          if (!match) continue;
          const deltaFile = path.join(root, entry.name, 'specs', match[1], 'spec.md');
          const canonicalFile = path.join(productRoot, file.path);
          if (!fs.existsSync(deltaFile)) continue;
          if (file.expectedExists === false && file.expectedDigest === null && !fs.existsSync(canonicalFile)) {
            capabilities.push(match[1]);
            continue;
          }
          if (file.expectedExists === false || typeof file.expectedDigest !== 'string' || !fs.existsSync(canonicalFile)) continue;
          if (normalizedIntegrity(fs.readFileSync(canonicalFile, 'utf8')) === file.expectedDigest) capabilities.push(match[1]);
        }
        receipts.push({ change: value.change, capabilities });
      }
      } catch {
        console.error(`OpenSpec contract audit found invalid receipt: ${path.relative(productRoot, receipt)}`);
        process.exit(1);
      }
    }
  }
}

const verified = new Set(receipts.flatMap((receipt) => receipt.capabilities));
const missing = [...changedCapabilities].filter((capability) => !verified.has(capability));
if (missing.length) {
  console.error(`OpenSpec contract audit found canonical spec changes without a matching receipt from the current candidate: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`OpenSpec contract audit passed: ${[...changedCapabilities].join(', ')} associated with current candidate receipts.`);
