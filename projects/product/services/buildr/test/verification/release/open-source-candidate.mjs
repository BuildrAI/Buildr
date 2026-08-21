#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { createCandidatePackage, readSharedCandidatePackage } from './candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workspaceRoot = path.resolve(productRoot, '../../../..');
const maximumTrackedFileBytes = 1024 * 1024;

const contentRules = [
  { id: 'secret.private-key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { id: 'secret.github-token', pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { id: 'secret.npm-token', pattern: /npm_[A-Za-z0-9]{20,}/ },
  { id: 'secret.aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { id: 'private.internal-domain', pattern: /git\.ops\.yunlizhi\.cn|product-mananger\.git/i },
  { id: 'private.absolute-user-path', pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+\/(?:Buildr|\.ssh|\.npm|Library)(?:\/|\b)/ },
  { id: 'public.repository-placeholder', pattern: /<(?:buildr-)?repo(?:sitory)?-url>/i },
];

const tarballForbiddenPrefixes = [
  '.agents/', '.claude/', '.codex/', '.git/', '.github/', '.worktrees/', 'openspec/', 'projects/', 'test/',
];

function finding(rule, relativePath, message) {
  return { rule, path: relativePath.split(path.sep).join('/'), message };
}

export function inspectCandidateFile(relativePath, content, size = Buffer.byteLength(content)) {
  const findings = [];
  if (size > maximumTrackedFileBytes) findings.push(finding('candidate.large-file', relativePath, `tracked file exceeds ${maximumTrackedFileBytes} bytes`));
  if (content.includes('\0')) return findings;
  for (const rule of contentRules) {
    if (rule.pattern.test(content)) findings.push(finding(rule.id, relativePath, 'blocked content pattern detected; inspect and remove or explicitly redesign the fixture'));
  }
  const emails = content.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  if (emails.some((email) => !email.endsWith('@example.com') && email !== 'git@github.com')) {
    findings.push(finding('private.email-address', relativePath, 'non-fixture email address detected; replace it with a public project contact or example.com fixture'));
  }
  return findings;
}

export function inspectPackageMetadata(metadata) {
  const findings = [];
  if (metadata.name !== '@buildr-ai/buildr') findings.push(finding('package.identity', 'projects/product/services/buildr/package.json', 'expected @buildr-ai/buildr'));
  if (metadata.bin?.buildr !== 'bin/buildr.mjs') findings.push(finding('package.bin', 'projects/product/services/buildr/package.json', 'expected normalized buildr executable'));
  if (metadata.repository?.url !== 'git+https://github.com/BuildrAI/Buildr.git' || metadata.repository?.directory !== 'projects/product/services/buildr') findings.push(finding('package.repository', 'projects/product/services/buildr/package.json', 'canonical repository metadata is missing'));
  if (metadata.homepage !== 'https://github.com/BuildrAI/Buildr#readme') findings.push(finding('package.homepage', 'projects/product/services/buildr/package.json', 'canonical homepage is missing'));
  if (metadata.bugs?.url !== 'https://github.com/BuildrAI/Buildr/issues') findings.push(finding('package.bugs', 'projects/product/services/buildr/package.json', 'canonical issue URL is missing'));
  if (metadata.publishConfig?.access !== 'public') findings.push(finding('package.access', 'projects/product/services/buildr/package.json', 'publishConfig.access must be public'));
  if (metadata.publishConfig?.registry !== 'https://registry.npmjs.org/') findings.push(finding('package.registry', 'projects/product/services/buildr/package.json', 'publishConfig.registry must be the official npm registry'));
  return findings;
}

export function inspectPackageVersionConsistency(metadata, lockfile) {
  const findings = [];
  if (lockfile?.version !== metadata?.version) findings.push(finding('package.version-lock', 'projects/product/services/buildr/package-lock.json', 'top-level lockfile version must match package.json'));
  if (lockfile?.packages?.['']?.version !== metadata?.version) findings.push(finding('package.root-version-lock', 'projects/product/services/buildr/package-lock.json', 'root package lock version must match package.json'));
  return findings;
}

export function inspectTarballFiles(files) {
  const findings = [];
  const paths = new Set(files.map((entry) => entry.path));
  for (const required of [
    'LICENSE',
    'README.md',
    'package.json',
    'bin/buildr.mjs',
    'application-payload.json',
    'installation-origin.json',
    'runtime/buildr.cjs',
    'payload/product/resources/manifest.yml',
    'payload/product/web-dist/index.html',
  ]) {
    if (!paths.has(required)) findings.push(finding('tarball.required', required, 'required publish asset is missing'));
  }
  for (const entry of paths) {
    if (tarballForbiddenPrefixes.some((prefix) => entry === prefix.slice(0, -1) || entry.startsWith(prefix))) {
      findings.push(finding('tarball.forbidden', entry, 'non-publish asset is present in npm tarball'));
    }
    if (entry.includes('self-bootstrap-closeout') || entry.endsWith('/buildr-self-bootstrap-closeout-driver.mjs')) {
      findings.push(finding('tarball.self-bootstrap-runner', entry, 'Buildr self-bootstrap runner must remain owned by the self-bootstrap Workspace Skill'));
    }
  }
  return findings;
}

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: workspaceRoot, encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status}`);
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

export function inspectCandidatePaths(root, relativePaths) {
  const findings = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) continue;
    const buffer = fs.readFileSync(absolutePath);
    findings.push(...inspectCandidateFile(relativePath, buffer.toString('utf8'), buffer.length));
  }
  return findings;
}

function inspectTrackedCandidate() {
  return inspectCandidatePaths(workspaceRoot, trackedFiles());
}

async function packAndInspect() {
  const shared = readSharedCandidatePackage();
  if (shared) return inspectTarballFiles(shared.metadata.files);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-open-source-candidate-'));
  try {
    return inspectTarballFiles((await createCandidatePackage(productRoot, root)).metadata.files);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function inspectReadmes() {
  const findings = [];
  const readmes = ['README.md', 'README.en.md'].map((file) => [file, fs.readFileSync(path.join(workspaceRoot, file), 'utf8')]);
  for (const token of ['https://github.com/BuildrAI/Buildr', '@buildr-ai/buildr', 'buildr runtime list --json']) {
    for (const [file, content] of readmes) {
      if (!content.includes(token)) findings.push(finding('readme.parity', file, `missing canonical token: ${token}`));
    }
  }
  if (!readmes[0][1].includes('[English](README.en.md)')) findings.push(finding('readme.navigation', 'README.md', 'missing English navigation'));
  if (!readmes[1][1].includes('[中文](README.md)')) findings.push(finding('readme.navigation', 'README.en.md', 'missing Chinese navigation'));
  for (const [chinese, english] of [
    ['## 三个核心价值', '## Three Core Values'],
    ['## Buildr 如何工作', '## How Buildr Works'],
    ['## 快速开始', '## Quick Start'],
    ['## 当前能力', '## Current Capabilities'],
    ['## 文档', '## Documentation'],
    ['## Buildr 自举 workspace', '## Buildr Bootstrap Workspace'],
  ]) {
    if (!readmes[0][1].includes(chinese)) findings.push(finding('readme.structure', 'README.md', `missing section: ${chinese}`));
    if (!readmes[1][1].includes(english)) findings.push(finding('readme.structure', 'README.en.md', `missing section: ${english}`));
  }
  return findings;
}

export async function runOpenSourceCandidateCheck() {
  const metadata = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(productRoot, 'package-lock.json'), 'utf8'));
  return [
    ...inspectTrackedCandidate(),
    ...inspectPackageMetadata(metadata),
    ...inspectPackageVersionConsistency(metadata, lockfile),
    ...inspectReadmes(),
    ...await packAndInspect(),
  ];
}

async function main() {
  const findings = await runOpenSourceCandidateCheck();
  if (findings.length) {
    console.error('Open-source candidate verification failed:');
    for (const item of findings) console.error(`- [${item.rule}] ${item.path}: ${item.message}`);
    process.exit(1);
  }
  console.log('Open-source candidate verification passed: tracked tree, public metadata, bilingual README, file sizes, and npm tarball inventory.');
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await main();
