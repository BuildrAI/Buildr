#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SCHEMA = 'buildr.task-asset-observation/v2';
const LEGACY_SCHEMA = 'buildr.task-asset-observation/v1';
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VALID_STATUS = new Set(['observing', 'awaiting-human', 'accepted']);
const CANDIDATE_TYPES = new Set(['rule', 'skill', 'capability-contract', 'product-followup']);
const COVERAGE_TYPES = new Set(['complete', 'partial', 'conflict', 'absent']);
const ASSET_TYPES = new Set(['rule', 'skill', 'capability-contract']);
const IGNORE_ENTRY = '/.buildr/asset-review/';

function fail(message, code = 'asset_observation_invalid') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function argsOf(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) result._.push(value);
    else {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) result[key] = true;
      else { result[key] = next; index += 1; }
    }
  }
  return result;
}

function requireText(args, key) {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) fail(`--${key} is required`);
  return value.trim();
}

function objectText(value, key) {
  const result = value?.[key];
  if (typeof result !== 'string' || !result.trim()) fail(`${key} is required`, 'observation_evidence_invalid');
  return result.trim();
}

function validId(value, label) {
  if (!VALID_ID.test(value)) fail(`${label} must match ${VALID_ID}`);
  return value;
}

function parseJson(value, label, fallback = null) {
  if (value === undefined) return fallback;
  try { return JSON.parse(value); } catch (error) { fail(`${label} must be valid JSON: ${error.message}`); }
}

function findWorkspaceRoot(input) {
  let cursor = path.resolve(input);
  if (!fs.existsSync(cursor)) fail(`Workspace path does not exist: ${cursor}`, 'workspace_not_found');
  if (!fs.statSync(cursor).isDirectory()) cursor = path.dirname(cursor);
  while (true) {
    if (fs.existsSync(path.join(cursor, '.buildr', 'workspace.yml'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) fail(`Buildr Workspace not found from: ${input}`, 'workspace_not_found');
    cursor = parent;
  }
}

function workspaceId(root) {
  const manifest = path.join(root, '.buildr', 'workspace.yml');
  if (!fs.existsSync(manifest)) fail(`Workspace manifest not found: ${manifest}`, 'workspace_identity_invalid');
  const content = fs.readFileSync(manifest, 'utf8');
  const match = content.match(/^id:\s*([0-9a-fA-F-]{36})\s*$/m);
  if (!match) fail('.buildr/workspace.yml.id must be a UUID', 'workspace_identity_invalid');
  return match[1].toLowerCase();
}

function gitOutput(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function gitSucceeds(cwd, args) {
  try { execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function canonicalWorkspaceRoot(foundRoot, id) {
  const rawCommon = gitOutput(foundRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    || gitOutput(foundRoot, ['rev-parse', '--git-common-dir']);
  if (!rawCommon) return foundRoot;
  const common = path.isAbsolute(rawCommon) ? rawCommon : path.resolve(foundRoot, rawCommon);
  if (path.basename(common) !== '.git') return foundRoot;
  const candidate = path.dirname(common);
  if (candidate === foundRoot) return foundRoot;
  const manifest = path.join(candidate, '.buildr', 'workspace.yml');
  if (!fs.existsSync(manifest)) return foundRoot;
  const candidateId = workspaceId(candidate);
  if (candidateId !== id) fail(`Canonical Workspace identity mismatch: ${candidateId} != ${id}`, 'workspace_identity_mismatch');
  return candidate;
}

function dataRoot() {
  if (process.env.BUILDR_APP_DATA_DIR) return path.resolve(process.env.BUILDR_APP_DATA_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Buildr');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Buildr');
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'buildr');
}

function ensureIgnored(root) {
  const ignore = path.join(root, '.gitignore');
  if (!fs.existsSync(ignore) || !fs.readFileSync(ignore, 'utf8').split(/\r?\n/).includes(IGNORE_ENTRY)) {
    fail(`Canonical Workspace .gitignore must contain ${IGNORE_ENTRY}`, 'observation_gitignore_missing');
  }
}

function field(content, name, optional = false) {
  const match = content.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  if (!match) {
    if (optional) return null;
    fail(`Observation missing ${name}`, 'observation_corrupt');
  }
  const raw = match[1].trim();
  if (raw === 'null') return null;
  if (name === 'status') return raw;
  try { return JSON.parse(raw); } catch (error) { fail(`Observation ${name} is invalid: ${error.message}`, 'observation_corrupt'); }
}

function parse(content) {
  const observationsBlock = content.match(/## Observations\n\n([\s\S]*?)\n\n## Agent Review/);
  const reviewBlock = content.match(/## Agent Review\n\n([\s\S]*?)\n\n## Human Decision/);
  const lines = observationsBlock?.[1]?.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2)) || [];
  return {
    schemaVersion: field(content, 'schemaVersion'),
    observationId: field(content, 'observationId'),
    workspaceId: field(content, 'workspaceId'),
    owner: field(content, 'owner'),
    status: field(content, 'status'),
    createdAt: field(content, 'createdAt'),
    updatedAt: field(content, 'updatedAt'),
    source: field(content, 'source'),
    assessment: field(content, 'assessment', true),
    decision: field(content, 'decision'),
    destination: field(content, 'destination'),
    observations: lines,
    review: reviewBlock?.[1] === '_Pending._' ? '' : (reviewBlock?.[1] || ''),
  };
}

function validateRecordIdentity(record, expectedWorkspaceId, file) {
  if (![SCHEMA, LEGACY_SCHEMA].includes(record.schemaVersion)) fail(`Unsupported observation schema in ${file}`, 'observation_corrupt');
  if (record.workspaceId !== expectedWorkspaceId) fail(`Observation Workspace identity mismatch: ${file}`, 'observation_identity_mismatch');
  validId(record.observationId, 'observation id');
  validId(record.owner, 'owner');
}

function legacyInbox(id) {
  return path.join(dataRoot(), 'asset-review', id, 'inbox');
}

function cleanupEmptyLegacy(inbox) {
  const workspaceDirectory = path.dirname(inbox);
  if (fs.existsSync(inbox) && fs.readdirSync(inbox).length === 0) fs.rmdirSync(inbox);
  if (fs.existsSync(workspaceDirectory) && fs.readdirSync(workspaceDirectory).length === 0) fs.rmdirSync(workspaceDirectory);
}

function migrateLegacy(ctx) {
  const sourceInbox = legacyInbox(ctx.workspaceId);
  const migrated = [];
  if (!fs.existsSync(sourceInbox)) return migrated;
  fs.mkdirSync(ctx.inbox, { recursive: true, mode: 0o700 });
  for (const name of fs.readdirSync(sourceInbox).filter((entry) => entry.endsWith('.md')).sort()) {
    const source = path.join(sourceInbox, name);
    const target = path.join(ctx.inbox, name);
    const content = fs.readFileSync(source, 'utf8');
    const record = parse(content);
    validateRecordIdentity(record, ctx.workspaceId, source);
    if (path.basename(source, '.md') !== record.observationId) fail(`Legacy observation filename mismatch: ${source}`, 'observation_identity_mismatch');
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, 'utf8') !== content) fail(`Legacy observation conflicts with Workspace target: ${source} -> ${target}`, 'observation_migration_conflict');
      fs.rmSync(source);
      migrated.push({ source, target, result: 'deduplicated' });
      continue;
    }
    try { fs.renameSync(source, target); }
    catch (error) {
      if (error.code !== 'EXDEV') throw error;
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, 0o600);
      const targetHandle = fs.openSync(target, 'r');
      try { fs.fsyncSync(targetHandle); } finally { fs.closeSync(targetHandle); }
      const copied = parse(fs.readFileSync(target, 'utf8'));
      validateRecordIdentity(copied, ctx.workspaceId, target);
      fs.rmSync(source);
    }
    migrated.push({ source, target, result: 'migrated' });
  }
  cleanupEmptyLegacy(sourceInbox);
  return migrated;
}

function context(args) {
  const foundRoot = findWorkspaceRoot(requireText(args, 'workspace-root'));
  const id = workspaceId(foundRoot);
  const root = canonicalWorkspaceRoot(foundRoot, id);
  ensureIgnored(root);
  const ctx = { root, workspaceId: id, inbox: path.join(root, '.buildr', 'asset-review', 'inbox') };
  ctx.migration = migrateLegacy(ctx);
  return ctx;
}

function observationFile(ctx, observationId) {
  return path.join(ctx.inbox, `${validId(observationId, 'observation id')}.md`);
}

function render(record) {
  if (!VALID_STATUS.has(record.status)) fail(`Unsupported status: ${record.status}`);
  const json = (value) => value == null ? 'null' : JSON.stringify(value);
  return `---
schemaVersion: ${JSON.stringify(SCHEMA)}
observationId: ${JSON.stringify(record.observationId)}
workspaceId: ${JSON.stringify(record.workspaceId)}
owner: ${JSON.stringify(record.owner)}
status: ${record.status}
createdAt: ${JSON.stringify(record.createdAt)}
updatedAt: ${JSON.stringify(record.updatedAt)}
source: ${json(record.source)}
assessment: ${json(record.assessment)}
decision: ${json(record.decision)}
destination: ${json(record.destination)}
---

# Task Asset Observation

## Observations

${record.observations.length ? record.observations.map((item) => `- ${item}`).join('\n') : '_None._'}

## Agent Review

${record.review || '_Pending._'}

## Human Decision

${record.decision ? `Accepted \`${record.decision.candidateType}\`: ${record.decision.summary}` : '_Pending._'}

## Handoff Evidence

${record.destination ? `\`\`\`json\n${JSON.stringify(record.destination, null, 2)}\n\`\`\`` : '_Pending._'}
`;
}

function readOwned(file, ctx, owner) {
  if (!fs.existsSync(file)) fail(`Observation not found: ${file}`, 'observation_not_found');
  const record = parse(fs.readFileSync(file, 'utf8'));
  validateRecordIdentity(record, ctx.workspaceId, file);
  if (record.owner !== owner) fail(`Observation owner mismatch: expected ${record.owner}, received ${owner}`, 'observation_owner_mismatch');
  return record;
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.rmSync(temporary); }
}

function mutate(args, action) {
  const ctx = context(args);
  const observationId = validId(requireText(args, 'observation-id'), 'observation id');
  const owner = validId(requireText(args, 'owner'), 'owner');
  const file = observationFile(ctx, observationId);
  const record = readOwned(file, ctx, owner);
  action(record, ctx);
  record.schemaVersion = SCHEMA;
  record.updatedAt = new Date().toISOString();
  atomicWrite(file, render(record));
  return { ok: true, action: args._[0], canonicalWorkspaceRoot: ctx.root, file, migration: ctx.migration, observation: record };
}

function assertWorkspacePath(root, value, label) {
  const relative = value.replaceAll('\\', '/');
  const absolute = path.resolve(root, relative);
  const lexicalPrefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(lexicalPrefix)) fail(`${label} must stay inside canonical Workspace`, 'observation_evidence_invalid');
  if (!fs.existsSync(absolute)) fail(`${label} does not exist: ${relative}`, 'observation_evidence_invalid');
  const realRoot = fs.realpathSync(root);
  const realAbsolute = fs.realpathSync(absolute);
  if (!realAbsolute.startsWith(`${realRoot}${path.sep}`)) fail(`${label} must not escape canonical Workspace through a symlink`, 'observation_evidence_invalid');
  return { relative, absolute: realAbsolute };
}

function validateHandoff(record, destination) {
  if (!destination || Array.isArray(destination) || typeof destination !== 'object') fail('destination must be an object', 'observation_handoff_invalid');
  const sourceTask = objectText(record.source, 'task');
  const targetTask = validId(objectText(destination, 'task'), 'destination task');
  if (objectText(destination, 'sourceTask') !== sourceTask || targetTask === sourceTask) fail('Handoff must target a task different from source.task', 'observation_handoff_invalid');
  const candidateType = record.decision?.candidateType;
  if (candidateType === 'product-followup') validId(objectText(destination, 'change'), 'destination change');
  else {
    if (objectText(destination, 'assetType') !== candidateType || !ASSET_TYPES.has(candidateType)) fail('Handoff assetType must match accepted candidate type', 'observation_handoff_invalid');
    objectText(destination, 'assetId');
  }
  return destination;
}

function validateAssetCompletion(record, ctx, completion) {
  const destination = record.destination;
  if (objectText(completion, 'task') !== objectText(destination, 'task')) fail('Completion task does not match handoff', 'observation_evidence_invalid');
  if (objectText(completion, 'assetType') !== objectText(destination, 'assetType') || objectText(completion, 'assetId') !== objectText(destination, 'assetId')) fail('Completion asset identity does not match handoff', 'observation_evidence_invalid');
  const maintenance = assertWorkspacePath(ctx.root, objectText(completion, 'maintenanceRecord'), 'maintenanceRecord');
  if (!maintenance.relative.startsWith('asset-maintenance/') || !fs.readFileSync(maintenance.absolute, 'utf8').includes(`observationId: ${record.observationId}`)) fail('maintenanceRecord does not reference observation', 'observation_evidence_invalid');
  if (!gitOutput(ctx.root, ['ls-files', '--error-unmatch', maintenance.relative])) fail('maintenanceRecord is not tracked', 'observation_evidence_invalid');
  const commit = objectText(completion, 'commit');
  const remoteRef = objectText(completion, 'remoteRef');
  objectText(completion, 'targetBranch');
  if (!gitOutput(ctx.root, ['rev-parse', '--verify', `${commit}^{commit}`])) fail('Completion commit is not available', 'observation_evidence_invalid');
  if (!gitOutput(ctx.root, ['rev-parse', '--verify', remoteRef])) fail('Completion remoteRef is not available', 'observation_evidence_invalid');
  if (!gitSucceeds(ctx.root, ['merge-base', '--is-ancestor', commit, remoteRef])) fail('Completion commit is not integrated into remoteRef', 'observation_evidence_invalid');
}

function validateProductCompletion(record, ctx, completion) {
  const change = validId(objectText(completion, 'change'), 'completion change');
  if (objectText(completion, 'task') !== objectText(record.destination, 'task') || change !== objectText(record.destination, 'change')) fail('Product completion does not match handoff', 'observation_evidence_invalid');
  const artifact = assertWorkspacePath(ctx.root, objectText(completion, 'artifact'), 'artifact');
  const normalized = artifact.absolute.replaceAll('\\', '/');
  const expectedSuffixes = [`/openspec/changes/${change}/proposal.md`, `/openspec/changes/${change}/design.md`];
  const escapedChange = change.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const archivedArtifact = new RegExp(`/openspec/changes/archive/[^/]+-${escapedChange}/(?:proposal|design)\\.md$`).test(normalized);
  if (!expectedSuffixes.some((suffix) => normalized.endsWith(suffix)) && !archivedArtifact) fail('Product completion artifact must be proposal.md or design.md in the completed or archived change', 'observation_evidence_invalid');
}

function validateNoChangeCompletion(record, completion) {
  if (objectText(completion, 'task') !== objectText(record.destination, 'task')) fail('No-change completion does not match handoff', 'observation_evidence_invalid');
  objectText(completion, 'conclusion');
  objectText(completion, 'evidenceReference');
}

function execute(args) {
  const action = args._[0];
  if (!action) fail('Action is required');
  if (action === 'start') {
    const ctx = context(args);
    const observationId = validId(requireText(args, 'observation-id'), 'observation id');
    const owner = validId(requireText(args, 'owner'), 'owner');
    const file = observationFile(ctx, observationId);
    if (fs.existsSync(file)) return { ok: true, action, existing: true, canonicalWorkspaceRoot: ctx.root, file, migration: ctx.migration, observation: readOwned(file, ctx, owner) };
    const source = parseJson(args.source, '--source', {});
    validId(objectText(source, 'task'), 'source task');
    const now = new Date().toISOString();
    const record = { schemaVersion: SCHEMA, observationId, workspaceId: ctx.workspaceId, owner, status: 'observing', createdAt: now, updatedAt: now, source, assessment: null, decision: null, destination: null, observations: [], review: '' };
    atomicWrite(file, render(record));
    return { ok: true, action, existing: false, canonicalWorkspaceRoot: ctx.root, file, migration: ctx.migration, observation: record };
  }
  if (action === 'list') {
    const ctx = context(args);
    const files = fs.existsSync(ctx.inbox) ? fs.readdirSync(ctx.inbox).filter((name) => name.endsWith('.md')).sort().map((name) => path.join(ctx.inbox, name)) : [];
    return { ok: true, action, workspaceId: ctx.workspaceId, canonicalWorkspaceRoot: ctx.root, inbox: ctx.inbox, migration: ctx.migration, files };
  }
  if (action === 'observe') return mutate(args, (record) => {
    if (record.status !== 'observing') fail('Only observing records accept new observations', 'observation_state_invalid');
    const message = requireText(args, 'message').replace(/\s+/g, ' ');
    const evidence = typeof args.evidence === 'string' && args.evidence.trim() ? ` [evidence: ${args.evidence.trim().replace(/\s+/g, ' ')}]` : '';
    record.observations.push(`${message}${evidence}`);
  });
  if (action === 'discard') {
    const ctx = context(args);
    const observationId = validId(requireText(args, 'observation-id'), 'observation id');
    const owner = validId(requireText(args, 'owner'), 'owner');
    const file = observationFile(ctx, observationId);
    const record = readOwned(file, ctx, owner);
    if (record.status !== 'observing') fail('Only observing records can be discarded', 'observation_state_invalid');
    const review = requireText(args, 'review');
    fs.rmSync(file);
    return { ok: true, action, result: 'discarded', deleted: true, canonicalWorkspaceRoot: ctx.root, file, observationId, review };
  }
  if (action === 'finalize') return mutate(args, (record) => {
    if (record.status !== 'observing') fail('Only observing records can be finalized', 'observation_state_invalid');
    const candidateType = requireText(args, 'candidate-type');
    const coverage = requireText(args, 'coverage');
    if (!CANDIDATE_TYPES.has(candidateType)) fail(`Unsupported candidate type: ${candidateType}`);
    if (!COVERAGE_TYPES.has(coverage) || coverage === 'complete') fail('Finalized candidate coverage must be partial, conflict, or absent');
    record.assessment = { candidateType, coverage, evidenceSummary: requireText(args, 'evidence-summary') };
    record.review = requireText(args, 'review');
    record.status = 'awaiting-human';
  });
  if (action === 'accept') return mutate(args, (record) => {
    if (record.status !== 'awaiting-human') fail('Only awaiting-human records can be accepted', 'observation_state_invalid');
    const candidateType = requireText(args, 'candidate-type');
    if (candidateType !== record.assessment?.candidateType) fail('Accepted candidate type must match finalized assessment', 'observation_state_invalid');
    record.decision = { candidateType, summary: requireText(args, 'summary'), decidedAt: new Date().toISOString() };
    record.status = 'accepted';
  });
  if (action === 'handoff') return mutate(args, (record) => {
    if (record.status !== 'accepted') fail('Only accepted records can receive handoff evidence', 'observation_state_invalid');
    record.destination = validateHandoff(record, parseJson(requireText(args, 'destination'), '--destination'));
  });
  if (action === 'reject') {
    const ctx = context(args);
    const observationId = validId(requireText(args, 'observation-id'), 'observation id');
    const owner = validId(requireText(args, 'owner'), 'owner');
    const file = observationFile(ctx, observationId);
    const record = readOwned(file, ctx, owner);
    if (record.status !== 'awaiting-human') fail('Only awaiting-human records can be rejected', 'observation_state_invalid');
    fs.rmSync(file);
    return { ok: true, action, deleted: true, canonicalWorkspaceRoot: ctx.root, file, observationId };
  }
  if (action === 'complete') {
    const ctx = context(args);
    const observationId = validId(requireText(args, 'observation-id'), 'observation id');
    const owner = validId(requireText(args, 'owner'), 'owner');
    const file = observationFile(ctx, observationId);
    const record = readOwned(file, ctx, owner);
    if (record.status !== 'accepted' || !record.destination) fail('Accepted observation needs destination evidence before completion', 'observation_handoff_incomplete');
    const outcome = requireText(args, 'outcome');
    const completion = parseJson(requireText(args, 'completion'), '--completion');
    if (outcome === 'asset-integrated') validateAssetCompletion(record, ctx, completion);
    else if (outcome === 'product-absorbed') validateProductCompletion(record, ctx, completion);
    else if (outcome === 'no-change') validateNoChangeCompletion(record, completion);
    else fail(`Unsupported outcome: ${outcome}`);
    fs.rmSync(file);
    return { ok: true, action, outcome, deleted: true, canonicalWorkspaceRoot: ctx.root, file, observationId, completion };
  }
  fail(`Unsupported action: ${action}`);
}

try {
  process.stdout.write(`${JSON.stringify(execute(argsOf(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code || 'asset_observation_error', message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
}
