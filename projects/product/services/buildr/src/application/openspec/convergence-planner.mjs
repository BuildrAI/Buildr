import { CONVERGENCE_ALGORITHM_VERSION, CONVERGENCE_PLAN_SCHEMA, convergenceDigest, convergenceIdentity, convergencePlanIdentity, normalizeConvergenceText } from './convergence-model.mjs';

function parseCanonical(content) {
  const source = normalizeConvergenceText(content);
  const matches = [...source.matchAll(/^### Requirement:\s*(.+?)\s*$/gm)];
  const blocks = [];
  const identities = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const title = matches[index][1].trim();
    const start = matches[index].index;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const block = normalizeConvergenceText(source.slice(start, end));
    blocks.push({ title, block });
    identities.set(title, [...(identities.get(title) || []), block]);
  }
  return { source, prefix: normalizeConvergenceText(source.slice(0, matches[0]?.index ?? source.length)), blocks, identities };
}

function renderCanonical(document, replacements, removals, additions) {
  const kept = document.blocks.filter((item) => !removals.has(item.title)).map((item) => replacements.get(item.title) || item.block);
  return normalizeConvergenceText([document.prefix.trimEnd(), ...kept.map((item) => item.trimEnd()), ...additions.map((item) => item.trimEnd())].filter(Boolean).join('\n\n'));
}

function scenarioNames(block) {
  const names = [...normalizeConvergenceText(block).matchAll(/^#### Scenario:\s*(.+?)\s*$/gm)].map((match) => match[1].trim());
  return { names, unique: names.length === new Set(names).size };
}

export function createConvergencePlan({ change, project, delta, canonicalFiles, capabilityPurposes = new Map(), executableIdentity, activeConflicts = [] }) {
  const grouped = new Map();
  for (const operation of delta.operations) grouped.set(operation.capability, [...(grouped.get(operation.capability) || []), operation]);
  const files = [];
  const operations = [];
  const blocked = [...activeConflicts];

  for (const [capability, capabilityOperations] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const snapshot = canonicalFiles.get(capability);
    const exists = snapshot?.exists === true;
    const removesWholeAbsentCapability = !exists && capabilityOperations.length > 0 && capabilityOperations.every((operation) => operation.type === 'REMOVED');
    const purpose = capabilityPurposes.get(capability)?.trim();
    const beforeContent = exists ? normalizeConvergenceText(snapshot.content) : normalizeConvergenceText(`# ${capability} Specification\n\n## Purpose\n\n${purpose || ''}\n\n## Requirements\n`);
    const document = parseCanonical(beforeContent);
    const replacements = new Map();
    const removals = new Set();
    const additions = [];
    if (!exists && !removesWholeAbsentCapability && (!purpose || purpose.length < 50)) blocked.push({ capability, requirement: null, operation: 'CREATE_CAPABILITY', code: 'semantic-resolution-required' });

    for (const operation of capabilityOperations) {
      const title = operation.title || operation.from;
      const copies = document.identities.get(title) || [];
      let status = 'safe';
      let reason = 'unique-structural-result';
      const fail = (code) => { status = 'blocked'; reason = code; blocked.push({ capability, requirement: title, operation: operation.type, code }); };
      if (copies.length > 1) fail('semantic-resolution-required');
      else if (operation.type === 'ADDED') {
        const expected = normalizeConvergenceText(operation.requirement);
        if (copies.length === 0) additions.push(expected);
        else if (copies[0] === expected) { status = 'already-applied'; reason = 'canonical-equals-delta'; }
        else fail('added-identity-conflict');
      } else if (operation.type === 'MODIFIED') {
        const expected = normalizeConvergenceText(operation.requirement);
        const currentScenarios = scenarioNames(copies[0] || '');
        const expectedScenarios = scenarioNames(expected);
        const omitted = currentScenarios.names.filter((name) => !expectedScenarios.names.includes(name));
        if (copies.length !== 1) fail('requirement-not-unique');
        else if (!currentScenarios.unique || !expectedScenarios.unique || omitted.length) fail('semantic-resolution-required');
        else if (copies[0] === expected) { status = 'already-applied'; reason = 'canonical-equals-delta'; }
        else replacements.set(operation.title, expected);
      } else if (operation.type === 'REMOVED') {
        if (copies.length === 0) { status = 'already-applied'; reason = 'requirement-absent'; }
        else if (copies.length !== 1) fail('requirement-not-unique');
        else removals.add(operation.title);
      } else if (operation.type === 'RENAMED') {
        const destination = document.identities.get(operation.to) || [];
        if (copies.length !== 1 || destination.length) fail('rename-not-unique');
        else replacements.set(operation.from, normalizeConvergenceText(copies[0].replace(`### Requirement: ${operation.from}`, `### Requirement: ${operation.to}`)));
      } else fail('unsupported-operation');
      operations.push({ capability, type: operation.type, requirement: title, status, reason });
    }
    const expectedExists = !removesWholeAbsentCapability && !(exists && document.blocks.length > 0 && document.blocks.every((item) => removals.has(item.title)) && additions.length === 0);
    const expectedContent = expectedExists ? renderCanonical(document, replacements, removals, additions) : '';
    files.push({
      path: snapshot.path,
      beforeExists: exists,
      expectedExists,
      beforeDigest: exists ? convergenceDigest(beforeContent) : null,
      expectedDigest: expectedExists ? convergenceDigest(expectedContent) : null,
      beforeContent,
      expectedContent,
    });
  }

  const identity = convergenceIdentity({ change, project, deltaDigest: delta.hash, files, executableIdentity });
  const plan = {
    schemaVersion: CONVERGENCE_PLAN_SCHEMA,
    algorithmVersion: CONVERGENCE_ALGORITHM_VERSION,
    convergenceIdentity: identity,
    planIdentity: null,
    change,
    project,
    deltaDigest: delta.hash,
    executableIdentity,
    status: blocked.length ? 'blocked' : operations.every((item) => item.status === 'already-applied') ? 'already-applied' : 'safe',
    operations,
    blocked,
    files,
  };
  plan.planIdentity = convergencePlanIdentity(plan);
  return plan;
}
