import crypto from 'node:crypto';
import {
  VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS,
  VERIFICATION_COMMAND_TIMEOUT_MAX_MS,
  VERIFICATION_COMMAND_TIMEOUT_MIN_MS,
} from './verification-deadline.mjs';

const TARGETS = new Set(['task-delivery', 'product-candidate', 'published-release']);
const SCOPES = new Set(['affected', 'full', 'release-only']);
const RISK_CODES = new Set(['selection-authority-change', 'unknown-owner', 'high-risk-input']);

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function texts(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return [...new Set(value.map((item, index) => text(item, `${field}[${index}]`)))].sort();
}

function globRegex(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') { source += '.*'; index += 1; }
    else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

function matchesSource(changedPath, source) {
  return globRegex(source).test(changedPath) || changedPath === source || changedPath.startsWith(`${source.replace(/\/$/, '')}/`);
}

export function createVerificationRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Verification Request input must be an object.');
  const project = text(input.project, 'request.project');
  const targetKind = text(input.target?.kind, 'request.target.kind');
  const targetIdentity = text(input.target?.identity, 'request.target.identity');
  const selectionScope = text(input.selection?.scope, 'request.selection.scope');
  if (!TARGETS.has(targetKind)) throw new Error(`request.target.kind is not supported: ${targetKind}.`);
  if (!SCOPES.has(selectionScope)) throw new Error(`request.selection.scope is not supported: ${selectionScope}.`);
  if (selectionScope === 'release-only' && targetKind !== 'published-release') throw new Error('release-only selection requires published-release target.');
  if (targetKind === 'published-release' && selectionScope !== 'release-only') throw new Error('published-release target requires release-only selection.');
  const request = {
    schemaVersion: 'buildr.verification-request/v1',
    project,
    services: texts(input.services || [], 'request.services'),
    target: { kind: targetKind, identity: targetIdentity },
    selection: { scope: selectionScope },
    changedPaths: texts(input.changedPaths || [], 'request.changedPaths'),
    risks: texts(input.risks || [], 'request.risks'),
    declarations: (input.declarations || []).map((item, index) => ({
      project: text(item.project, `request.declarations[${index}].project`),
      identity: text(item.identity, `request.declarations[${index}].identity`),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    dependencies: (input.dependencies || []).map((item, index) => ({
      from: text(item.from, `request.dependencies[${index}].from`),
      to: text(item.to, `request.dependencies[${index}].to`),
      reason: text(item.reason, `request.dependencies[${index}].reason`),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
  for (const risk of request.risks) if (!RISK_CODES.has(risk)) throw new Error(`request.risks contains unsupported code: ${risk}.`);
  return Object.freeze({ ...request, identity: digest(request) });
}

function publicInvocation(invocation) {
  if (invocation.kind === 'command') return {
    kind: 'command',
    argv: [...invocation.argv],
    cwd: invocation.cwd || '.',
    timeoutMs: invocation.timeoutMs ?? VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS,
  };
  if (invocation.kind === 'agent') return { kind: 'agent', instructions: [...invocation.instructions] };
  return { kind: 'provider', provider: invocation.provider };
}

function selectedItem(capability, selection, request) {
  const wantsAffected = request.selection.scope === 'affected';
  const invocation = wantsAffected && capability.invocation.affected ? capability.invocation.affected : capability.invocation.full;
  const actualScope = wantsAffected && capability.invocation.affected ? 'affected' : 'full';
  return {
    id: capability.id,
    capability: capability.id,
    evidence: [...capability.evidence],
    proves: [...capability.proves],
    selection: { ...selection, scope: actualScope },
    executionUnit: { id: `${capability.id}:${actualScope}`, capability: capability.id, scope: actualScope, invocation: publicInvocation(invocation), resourceClaims: [...(capability.resourceClaims || [])] },
  };
}

export function createVerificationPlan({ request: inputRequest, declaration, provider = null }) {
  const request = inputRequest?.schemaVersion === 'buildr.verification-request/v1' ? inputRequest : createVerificationRequest(inputRequest);
  if (!declaration || declaration.schemaVersion !== 'buildr.project-verification/v3') throw new Error('Verification Plan requires a normalized v3 declaration.');
  const declarationIdentity = request.declarations.find((item) => item.project === request.project)?.identity || null;
  const eligible = declaration.capabilities.filter((capability) => capability.scope.project === request.project
    && (capability.scope.services.length === 0 || capability.scope.services.some((service) => request.services.includes(service)))
    && capability.usableFor.includes(request.target.kind));
  if (provider) return assertVerificationPlan(provider({ request, declaration, declarationIdentity }));

  const selected = new Map();
  const fullReasons = [];
  const forceFull = request.selection.scope === 'full' || request.risks.some((risk) => ['selection-authority-change', 'high-risk-input'].includes(risk));
  if (forceFull) {
    const reasonCode = request.selection.scope === 'full' ? 'requested-full' : request.risks.includes('selection-authority-change') ? 'selection-authority-change' : 'high-risk-input';
    fullReasons.push({ code: reasonCode, trigger: request.risks.find((risk) => risk === reasonCode) || request.target.identity });
    for (const capability of eligible) selected.set(capability.id, selectedItem(capability, { kind: 'full', reasonCode, trigger: request.target.identity, parent: null }, request));
  } else {
    for (const capability of eligible) {
      const trigger = request.changedPaths.find((changedPath) => capability.discovery.sources.some((source) => matchesSource(changedPath, source)));
      if (!trigger) continue;
      const item = selectedItem(capability, { kind: 'direct', reasonCode: 'discovery-source-match', trigger, parent: null }, request);
      if (item.selection.scope === 'full') {
        item.selection.kind = 'full';
        item.selection.reasonCode = 'affected-entry-unavailable';
        fullReasons.push({ code: 'affected-entry-unavailable', trigger: capability.id });
      }
      selected.set(capability.id, item);
    }
    for (const dependency of request.dependencies) {
      if (!selected.has(dependency.from) || selected.has(dependency.to)) continue;
      const capability = eligible.find((item) => item.id === dependency.to);
      if (!capability) continue;
      selected.set(capability.id, selectedItem(capability, { kind: 'dependency', reasonCode: dependency.reason, trigger: dependency.from, parent: dependency.from }, request));
    }
  }

  const coverageGaps = [];
  if (request.risks.includes('unknown-owner')) coverageGaps.push({ scope: 'owner', code: 'unknown-owner', summary: 'Changed inputs contain an unknown verification owner.' });
  for (const changedPath of request.changedPaths) {
    if (!eligible.some((capability) => capability.discovery.sources.some((source) => matchesSource(changedPath, source)))) {
      coverageGaps.push({ scope: 'path', code: 'unknown-owner', path: changedPath, summary: `No trustworthy verification owner for ${changedPath}.` });
    }
  }
  if (eligible.length === 0) coverageGaps.push({ scope: 'project', code: 'no-usable-capability', summary: `No capability supports ${request.target.kind}.` });
  const selectedItems = [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
  const material = {
    schemaVersion: 'buildr.verification-plan/v1',
    requestIdentity: request.identity,
    declarationIdentity,
    providerIdentity: null,
    target: request.target,
    selection: request.selection,
    selectedItems,
    executionUnits: selectedItems.map((item) => item.executionUnit),
    fullReasons: [...new Map(fullReasons.map((item) => [JSON.stringify(item), item])).values()],
    coverageGaps: [...new Map(coverageGaps.map((item) => [JSON.stringify(item), item])).values()],
    status: coverageGaps.length ? 'blocked' : 'ready',
  };
  return Object.freeze({ ...material, identity: digest(material) });
}

export function assertVerificationPlan(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 'buildr.verification-plan/v1') throw new Error('Verification Plan must use buildr.verification-plan/v1.');
  const assertKeys = (object, allowed, label) => {
    for (const key of Object.keys(object || {})) if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported.`);
  };
  assertKeys(value, new Set(['schemaVersion', 'requestIdentity', 'declarationIdentity', 'providerIdentity', 'target', 'selection', 'selectedItems', 'executionUnits', 'fullReasons', 'coverageGaps', 'status', 'identity']), 'plan');
  const { identity, ...material } = value;
  if (identity !== digest(material)) throw new Error('Verification Plan identity does not match its closed content.');
  if (!['ready', 'blocked'].includes(value.status)) throw new Error('Verification Plan status must be ready or blocked.');
  if (!Array.isArray(value.selectedItems) || !Array.isArray(value.executionUnits) || !Array.isArray(value.coverageGaps)) throw new Error('Verification Plan collections are invalid.');
  assertKeys(value.target, new Set(['kind', 'identity']), 'plan.target');
  assertKeys(value.selection, new Set(['scope']), 'plan.selection');
  if (!TARGETS.has(value.target?.kind) || !SCOPES.has(value.selection?.scope)) throw new Error('Verification Plan target or selection scope is invalid.');
  for (const [index, item] of value.selectedItems.entries()) {
    assertKeys(item, new Set(['id', 'capability', 'evidence', 'proves', 'selection', 'executionUnit']), `plan.selectedItems[${index}]`);
    assertKeys(item.selection, new Set(['kind', 'reasonCode', 'trigger', 'parent', 'scope']), `plan.selectedItems[${index}].selection`);
    if (!['direct', 'dependency', 'full'].includes(item.selection?.kind) || !['affected', 'full'].includes(item.selection?.scope)) throw new Error(`Verification Plan selected item is invalid: ${item.id}.`);
  }
  for (const [index, unit] of value.executionUnits.entries()) {
    assertKeys(unit, new Set(['id', 'capability', 'scope', 'invocation', 'resourceClaims']), `plan.executionUnits[${index}]`);
    assertKeys(unit.invocation, new Set(['kind', 'argv', 'cwd', 'instructions', 'provider', 'timeoutMs']), `plan.executionUnits[${index}].invocation`);
    if (!['command', 'agent', 'provider'].includes(unit.invocation?.kind)) throw new Error(`Verification Plan execution unit invocation is invalid: ${unit.id}.`);
    if (unit.invocation.kind === 'command' && unit.invocation.timeoutMs !== undefined && (!Number.isInteger(unit.invocation.timeoutMs)
      || unit.invocation.timeoutMs < VERIFICATION_COMMAND_TIMEOUT_MIN_MS
      || unit.invocation.timeoutMs > VERIFICATION_COMMAND_TIMEOUT_MAX_MS)) {
      throw new Error(`Verification Plan command timeoutMs is invalid: ${unit.id}.`);
    }
  }
  const itemIds = new Set(value.selectedItems.flatMap((item) => [item.id, item.capability]));
  for (const unit of value.executionUnits) if (!itemIds.has(unit.capability)) throw new Error(`Verification Plan execution unit references unknown selected item: ${unit.capability}.`);
  if (new Set(value.executionUnits.map((unit) => unit.id)).size !== value.executionUnits.length) throw new Error('Verification Plan execution unit ids must be unique.');
  if (value.executionUnits.some((unit) => unit.invocation.kind === 'provider') && !value.providerIdentity) throw new Error('Verification Plan provider execution requires providerIdentity.');
  if (options.providerIdentity && value.providerIdentity !== options.providerIdentity) throw new Error('Verification Plan provider identity is stale.');
  return value;
}

export function createVerificationPlanResult({ plan: inputPlan, preparation = null }) {
  const plan = assertVerificationPlan(inputPlan);
  if (preparation !== null) {
    if (!preparation || typeof preparation !== 'object' || Array.isArray(preparation)) throw new Error('Verification Plan preparation preview must be an object or null.');
    const keys = new Set(['status', 'identity', 'requirements', 'planRequest']);
    for (const key of Object.keys(preparation)) if (!keys.has(key)) throw new Error(`Verification Plan preparation.${key} is not supported.`);
    if (!['ready', 'action-required'].includes(preparation.status)
      || typeof preparation.identity !== 'string'
      || !Array.isArray(preparation.requirements)
      || (preparation.planRequest !== null && (typeof preparation.planRequest !== 'object' || Array.isArray(preparation.planRequest)))) {
      throw new Error('Verification Plan preparation preview is invalid.');
    }
  }
  const material = {
    schemaVersion: 'buildr.verification-plan-result/v1',
    operation: 'plan',
    status: plan.status,
    plan,
    preparation,
    effects: [],
    nextActions: preparation?.status === 'action-required'
      ? ['将preparation.planRequest原样交给Task Environment prepare；成功后使用本Plan result启动verification run。']
      : [],
  };
  return Object.freeze({ ...material, identity: digest(material) });
}

export function assertVerificationPlanDocument(value, options = {}) {
  if (value?.schemaVersion === 'buildr.verification-plan/v1') return { plan: assertVerificationPlan(value, options), result: null };
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 'buildr.verification-plan-result/v1') {
    throw new Error('Verification Plan document must use buildr.verification-plan/v1 or buildr.verification-plan-result/v1.');
  }
  const allowed = new Set(['schemaVersion', 'operation', 'status', 'plan', 'preparation', 'effects', 'nextActions', 'identity']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`verificationPlanResult.${key} is not supported.`);
  const { identity, ...material } = value;
  if (identity !== digest(material) || value.operation !== 'plan' || value.status !== value.plan?.status
    || !Array.isArray(value.effects) || value.effects.length !== 0 || !Array.isArray(value.nextActions)) {
    throw new Error('Verification Plan result identity or closed fields are invalid.');
  }
  const normalized = createVerificationPlanResult({ plan: assertVerificationPlan(value.plan, options), preparation: value.preparation });
  if (normalized.identity !== value.identity || JSON.stringify(normalized) !== JSON.stringify(value)) throw new Error('Verification Plan result content is not canonical.');
  return { plan: value.plan, result: value };
}
