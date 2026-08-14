import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DETERMINISTIC_SYNC_PLAN_SCHEMA = 'buildr.openspec-sync-plan/v1';
export const DETERMINISTIC_SYNC_RESULT_SCHEMA = 'buildr.openspec-sync-result/v1';

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n*$/, '\n');
}

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function deterministicSyncContentDigest(value) {
  return digest(normalize(value));
}

export function parseCanonicalSpec(content) {
  const source = normalize(content);
  const matches = [...source.matchAll(/^### Requirement:\s*(.+?)\s*$/gm)];
  const blocks = [];
  const identities = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const title = matches[index][1].trim();
    const start = matches[index].index;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const block = normalize(source.slice(start, end));
    blocks.push({ title, start, end, block });
    identities.set(title, [...(identities.get(title) || []), block]);
  }
  return { source, prefix: normalize(source.slice(0, matches[0]?.index ?? source.length)), blocks, identities };
}

function renderCanonical(document, replacements, removals, additions) {
  const kept = document.blocks
    .filter((item) => !removals.has(item.title))
    .map((item) => replacements.get(item.title) || item.block);
  return normalize([document.prefix.trimEnd(), ...kept.map((item) => item.trimEnd()), ...additions.map((item) => item.trimEnd())]
    .filter(Boolean).join('\n\n'));
}

function scenarioIdentities(block) {
  const names = [...normalize(block).matchAll(/^#### Scenario:\s*(.+?)\s*$/gm)].map((match) => match[1].trim());
  return { names, unique: new Set(names).size === names.length };
}

export function deterministicSyncPlanIdentity(plan) {
  return digest(JSON.stringify({ change: plan.change, project: plan.project, deltaHash: plan.deltaHash, files: plan.files, operations: plan.operations }));
}

export function reverseDeterministicSyncPlan(plan) {
  if (plan.schemaVersion !== DETERMINISTIC_SYNC_PLAN_SCHEMA || plan.identity !== deterministicSyncPlanIdentity(plan)) {
    throw new Error('OpenSpec deterministic sync receipt is stale or invalid.');
  }
  const reversed = {
    schemaVersion: DETERMINISTIC_SYNC_PLAN_SCHEMA,
    change: plan.change,
    project: plan.project,
    deltaHash: plan.deltaHash,
    status: 'safe',
    operations: (plan.operations || []).map((item) => ({ ...item, recovery: 'restore-before' })),
    blocked: [],
    files: (plan.files || []).map((item) => ({
      path: item.path,
      beforeDigest: item.expectedDigest,
      expectedDigest: item.beforeDigest,
      before: item.expected,
      expected: item.before,
    })),
  };
  reversed.identity = deterministicSyncPlanIdentity(reversed);
  return reversed;
}

export function createDeterministicSyncPlan({ change, project, projectRoot, delta, baseline, capabilityPurposes = new Map() }) {
  const grouped = new Map();
  for (const operation of delta.operations) grouped.set(operation.capability, [...(grouped.get(operation.capability) || []), operation]);
  const operations = [];
  const files = [];
  const blocked = [];

  for (const [capability, capabilityOperations] of grouped) {
    const file = path.join(projectRoot, 'openspec', 'specs', capability, 'spec.md');
    const exists = fs.existsSync(file);
    const purpose = capabilityPurposes.get(capability)?.trim();
    const before = exists ? normalize(fs.readFileSync(file, 'utf8')) : normalize(`# ${capability} Specification\n\n## Purpose\n\n${purpose || ''}\n\n## Requirements\n`);
    const document = parseCanonicalSpec(before);
    const replacements = new Map();
    const removals = new Set();
    const additions = [];
    const baselineTargets = new Map((baseline.targets || []).filter((item) => item.capability === capability).map((item) => [item.title, item]));

    if (!exists && (!purpose || purpose.length < 50)) blocked.push({ capability, requirement: null, operation: 'CREATE_CAPABILITY', code: 'semantic-resolution-required' });

    for (const operation of capabilityOperations) {
      const title = operation.title || operation.from;
      const copies = document.identities.get(title) || [];
      let status = 'safe';
      let reason = 'unique-structural-result';
      const fail = (code, details = {}) => { status = 'blocked'; reason = code; blocked.push({ capability, requirement: title, operation: operation.type, code, ...details }); };
      if (copies.length > 1) fail('semantic-resolution-required');
      else if (operation.type === 'ADDED') {
        if (copies.length === 0) additions.push(operation.requirement);
        else if (copies[0] === normalize(operation.requirement)) { status = 'already-applied'; reason = 'canonical-equals-delta'; }
        else fail('added-identity-conflict');
      } else if (operation.type === 'MODIFIED') {
        const target = baselineTargets.get(operation.title);
        const baselineScenarios = scenarioIdentities(target?.content || '');
        const deltaScenarios = scenarioIdentities(operation.requirement);
        const omitted = baselineScenarios.names.filter((name) => !deltaScenarios.names.includes(name));
        if (!target || target.state !== 'present' || copies[0] !== target.content) fail('baseline-or-canonical-drift');
        else if (!baselineScenarios.unique || !deltaScenarios.unique) fail('semantic-resolution-required');
        else if (omitted.length) fail('semantic-resolution-required', {
          reason: 'scenario-identities-omitted',
          omittedScenarioIdentities: [...omitted].sort((left, right) => left.localeCompare(right)),
        });
        else if (copies[0] === normalize(operation.requirement)) { status = 'already-applied'; reason = 'canonical-equals-delta'; }
        else replacements.set(operation.title, normalize(operation.requirement));
      } else if (operation.type === 'REMOVED') {
        const target = baselineTargets.get(operation.title);
        if (copies.length === 0) { status = 'already-applied'; reason = 'requirement-absent'; }
        else if (!target || target.state !== 'present' || copies[0] !== target.content) fail('baseline-or-canonical-drift');
        else removals.add(operation.title);
      } else if (operation.type === 'RENAMED') {
        const destination = document.identities.get(operation.to) || [];
        const target = baselineTargets.get(operation.from);
        if (copies.length !== 1 || destination.length || !target || copies[0] !== target.content) fail('rename-not-unique');
        else replacements.set(operation.from, normalize(copies[0].replace(`### Requirement: ${operation.from}`, `### Requirement: ${operation.to}`)));
      } else fail('unsupported-operation');
      operations.push({ capability, type: operation.type, requirement: title, status, reason });
    }
    const after = renderCanonical(document, replacements, removals, additions);
    files.push({ path: path.relative(projectRoot, file).split(path.sep).join('/'), beforeDigest: digest(before), expectedDigest: digest(after), before, expected: after });
  }
  const plan = { schemaVersion: DETERMINISTIC_SYNC_PLAN_SCHEMA, change, project, deltaHash: delta.hash, status: blocked.length ? 'blocked' : operations.every((item) => item.status === 'already-applied') ? 'already-applied' : 'safe', operations, blocked, files };
  plan.identity = deterministicSyncPlanIdentity(plan);
  return plan;
}

export function applyDeterministicSyncPlan({ projectRoot, plan, expectedIdentity = plan.identity, io = fs, validateExpected = null }) {
  if (plan.schemaVersion !== DETERMINISTIC_SYNC_PLAN_SCHEMA || plan.identity !== expectedIdentity || deterministicSyncPlanIdentity(plan) !== plan.identity) throw new Error('OpenSpec deterministic sync receipt is stale or invalid.');
  if (plan.status === 'blocked') return { schemaVersion: DETERMINISTIC_SYNC_RESULT_SCHEMA, status: 'blocked', identity: plan.identity, effects: [], blocked: plan.blocked };
  const prepared = [];
  for (const item of plan.files) {
    const file = path.resolve(projectRoot, item.path);
    if (!file.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error('OpenSpec sync target escapes Project root.');
    const current = io.existsSync(file) ? normalize(io.readFileSync(file, 'utf8')) : normalize(`# ${path.basename(path.dirname(file))} Specification\n`);
    if (digest(current) !== item.beforeDigest) return { schemaVersion: DETERMINISTIC_SYNC_RESULT_SCHEMA, status: 'receipt-stale', identity: plan.identity, effects: [] };
    if (digest(item.expected) !== item.expectedDigest) throw new Error('OpenSpec deterministic sync expected content digest mismatch.');
    prepared.push({ file, content: item.expected, changed: item.beforeDigest !== item.expectedDigest });
  }
  // Prepare every temporary file before the first canonical rename. A failed
  // preparation therefore has batch-zero effects. Rename failures are rolled
  // back from the receipt-bound before images.
  const temporaries = [];
  const committed = [];
  let validationEvidence = null;
  try {
    for (const item of prepared.filter((entry) => entry.changed)) {
      io.mkdirSync(path.dirname(item.file), { recursive: true });
      const temporary = `${item.file}.buildr-sync-${process.pid}-${temporaries.length}`;
      io.writeFileSync(temporary, item.content);
      if (digest(normalize(io.readFileSync(temporary, 'utf8'))) !== digest(item.content)) throw new Error('OpenSpec deterministic sync temporary verification failed.');
      temporaries.push({ ...item, temporary });
    }
    const validation = validateExpected?.({
      projectRoot,
      plan,
      files: prepared.map((item) => ({ path: path.relative(projectRoot, item.file).split(path.sep).join('/'), content: item.content, digest: digest(item.content) })),
    }) || null;
    validationEvidence = validation;
    if (validation && validation.status !== 'passed') {
      for (const item of temporaries) if (io.existsSync(item.temporary)) io.rmSync(item.temporary, { force: true });
      return { schemaVersion: DETERMINISTIC_SYNC_RESULT_SCHEMA, status: 'blocked', identity: plan.identity, effects: [], blocked: [{ operation: 'VALIDATE_EXPECTED', code: 'expected-tree-invalid' }], validation };
    }
    for (const item of temporaries) { io.renameSync(item.temporary, item.file); committed.push(item); }
  } catch (error) {
    for (const item of temporaries) if (io.existsSync(item.temporary)) io.rmSync(item.temporary, { force: true });
    for (const item of committed.reverse()) io.writeFileSync(item.file, plan.files.find((entry) => path.resolve(projectRoot, entry.path) === item.file).before);
    throw error;
  }
  return { schemaVersion: DETERMINISTIC_SYNC_RESULT_SCHEMA, status: 'passed', identity: plan.identity, effects: prepared.filter((item) => item.changed).map((item) => ({ path: path.relative(projectRoot, item.file).split(path.sep).join('/'), digest: digest(item.content) })), validation: validationEvidence };
}
