import crypto from 'node:crypto';

import { normalizeContributionHandoff, parentCoordinationError } from './parent-coordination.mjs';

export const TERMINAL_CONTRIBUTION_RECONCILIATION_SCHEMA = 'buildr.terminal-contribution-reconciliation/v1';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parentCoordinationError('terminal_contribution_reconciliation_field_invalid', `${field} 必须是对象。`, 400, { field });
  return value;
}

function closed(value, allowed, field) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw parentCoordinationError('terminal_contribution_reconciliation_field_forbidden', `${field}.${key} 不受支持。`, 400, { field: `${field}.${key}` });
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4000) throw parentCoordinationError('terminal_contribution_reconciliation_field_invalid', `${field} 必须是1..4000字符的非空字符串。`, 400, { field });
  return value.trim();
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw parentCoordinationError('terminal_contribution_reconciliation_field_invalid', `${field} 必须是大于等于1的整数。`, 400, { field });
  return value;
}

function timestamp(value, field) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw parentCoordinationError('terminal_contribution_reconciliation_field_invalid', `${field} 必须是ISO时间。`, 400, { field });
  return new Date(value).toISOString();
}

function normalizeAssociationGate(value, field) {
  const gate = object(value, field);
  if (gate.status === 'gate-disposition') {
    closed(gate, new Set(['status', 'disposition', 'targetIdentity', 'summary', 'source']), field);
    return { status: 'gate-disposition', disposition: text(gate.disposition, `${field}.disposition`), targetIdentity: gate.targetIdentity ?? null, summary: text(gate.summary, `${field}.summary`), source: text(gate.source, `${field}.source`) };
  }
  if (!['adopted-at-delivery', 'verified-at-delivery'].includes(gate.status)) throw parentCoordinationError('terminal_contribution_reconciliation_field_invalid', `${field}.status 不受支持。`, 400, { field: `${field}.status` });
  closed(gate, new Set(['status', 'targetIdentity', 'resultDigest', 'outcome']), field);
  return { status: gate.status, targetIdentity: text(gate.targetIdentity, `${field}.targetIdentity`), resultDigest: text(gate.resultDigest, `${field}.resultDigest`), outcome: text(gate.outcome, `${field}.outcome`) };
}

export function terminalAssociationFromHandoff(association, handoff) {
  const value = object(association, 'finishAssociation');
  const gates = object(value.gates, 'finishAssociation.gates');
  closed(gates, new Set(['planning', 'completion', 'verification']), 'finishAssociation.gates');
  const normalized = {
    handoffIdentity: text(value.handoffIdentity, 'finishAssociation.handoffIdentity'),
    candidateIdentity: text(value.candidateIdentity, 'finishAssociation.candidateIdentity'),
    candidateGeneration: positiveInteger(value.candidateGeneration, 'finishAssociation.candidateGeneration'),
    gates: {
      planning: normalizeAssociationGate(gates.planning, 'finishAssociation.gates.planning'),
      completion: normalizeAssociationGate(gates.completion, 'finishAssociation.gates.completion'),
      verification: normalizeAssociationGate(gates.verification, 'finishAssociation.gates.verification'),
    },
  };
  const expected = {
    handoffIdentity: handoff.identity,
    candidateIdentity: handoff.candidate?.identity,
    candidateGeneration: handoff.candidate?.generation,
    gates: {
      planning: deliveredGate(handoff.gates?.planning, 'planning'),
      completion: deliveredGate(handoff.gates?.completion, 'completion'),
      verification: deliveredGate(handoff.gates?.verification, 'verification'),
    },
  };
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) throw parentCoordinationError('terminal_contribution_reconciliation_finish_mismatch', 'terminal Finish association与immutable Development handoff不匹配。', 409, { expected, actual: normalized });
  return normalized;
}

function deliveredGate(gate, type) {
  if (!gate) return null;
  if (gate.disposition) return { status: 'gate-disposition', disposition: gate.disposition, targetIdentity: gate.targetIdentity ?? null, summary: gate.summary, source: gate.source };
  return { status: type === 'verification' ? 'verified-at-delivery' : 'adopted-at-delivery', targetIdentity: gate.targetIdentity, resultDigest: gate.resultDigest, outcome: gate.outcome };
}

export function taskCompletionIdentity(task) {
  return digest({ taskId: task.taskId, parentTaskId: task.parentTaskId, status: task.status,
    resultSummary: task.resultSummary, resultNoChange: task.resultNoChange, updatedAt: task.updatedAt });
}

export function createTerminalContributionReconciliation(input) {
  const payload = {
    schemaVersion: 'buildr.terminal-contribution-reconciliation/v2',
    childTaskId: text(input.childTaskId, 'childTaskId'),
    parentTaskId: text(input.parentTaskId, 'parentTaskId'),
    parentPlanIdentity: text(input.parentPlanIdentity, 'parentPlanIdentity'),
    taskResultIdentity: text(input.taskResultIdentity, 'taskResultIdentity'),
    contributionHandoff: normalizeContributionHandoff(input.contributionHandoff),
    reason: text(input.reason, 'reason'), source: text(input.source, 'source'),
  };
  return normalizeTerminalContributionReconciliation({ ...payload, identity: digest(payload), createdAt: input.createdAt });
}

export function normalizeTerminalContributionReconciliation(value) {
  const record = object(value, 'reconciliation');
  if (record.schemaVersion === 'buildr.terminal-contribution-reconciliation/v2') {
    closed(record, new Set(['schemaVersion', 'identity', 'childTaskId', 'parentTaskId', 'parentPlanIdentity', 'taskResultIdentity', 'contributionHandoff', 'reason', 'source', 'createdAt']), 'reconciliation');
    const payload = { schemaVersion: record.schemaVersion,
      childTaskId: text(record.childTaskId, 'childTaskId'), parentTaskId: text(record.parentTaskId, 'parentTaskId'),
      parentPlanIdentity: text(record.parentPlanIdentity, 'parentPlanIdentity'), taskResultIdentity: text(record.taskResultIdentity, 'taskResultIdentity'),
      contributionHandoff: normalizeContributionHandoff(record.contributionHandoff), reason: text(record.reason, 'reason'), source: text(record.source, 'source') };
    if (payload.contributionHandoff.parentTaskId !== payload.parentTaskId) throw parentCoordinationError('terminal_contribution_reconciliation_parent_mismatch', '贡献处置与父任务不一致。', 409);
    if (record.identity !== digest(payload)) throw parentCoordinationError('terminal_contribution_reconciliation_identity_mismatch', '贡献处置身份与内容不一致。', 409);
    return { ...payload, identity: record.identity, createdAt: timestamp(record.createdAt, 'createdAt') };
  }

  closed(record, new Set(['schemaVersion', 'identity', 'childTaskId', 'parentTaskId', 'parentPlanIdentity', 'finishAssociation', 'contributionHandoff', 'reason', 'source', 'createdAt']), 'reconciliation');
  if (record.schemaVersion !== TERMINAL_CONTRIBUTION_RECONCILIATION_SCHEMA) throw parentCoordinationError('terminal_contribution_reconciliation_schema_unsupported', `reconciliation.schemaVersion 必须是 ${TERMINAL_CONTRIBUTION_RECONCILIATION_SCHEMA}。`, 409);
  const handoff = normalizeContributionHandoff(record.contributionHandoff);
  const association = object(record.finishAssociation, 'reconciliation.finishAssociation');
  closed(association, new Set(['handoffIdentity', 'candidateIdentity', 'candidateGeneration', 'gates']), 'reconciliation.finishAssociation');
  const gates = object(association.gates, 'reconciliation.finishAssociation.gates');
  closed(gates, new Set(['planning', 'completion', 'verification']), 'reconciliation.finishAssociation.gates');
  const payload = {
    schemaVersion: TERMINAL_CONTRIBUTION_RECONCILIATION_SCHEMA,
    childTaskId: text(record.childTaskId, 'reconciliation.childTaskId'),
    parentTaskId: text(record.parentTaskId, 'reconciliation.parentTaskId'),
    parentPlanIdentity: text(record.parentPlanIdentity, 'reconciliation.parentPlanIdentity'),
    finishAssociation: {
      handoffIdentity: text(association.handoffIdentity, 'reconciliation.finishAssociation.handoffIdentity'),
      candidateIdentity: text(association.candidateIdentity, 'reconciliation.finishAssociation.candidateIdentity'),
      candidateGeneration: positiveInteger(association.candidateGeneration, 'reconciliation.finishAssociation.candidateGeneration'),
      gates: {
        planning: normalizeAssociationGate(gates.planning, 'reconciliation.finishAssociation.gates.planning'),
        completion: normalizeAssociationGate(gates.completion, 'reconciliation.finishAssociation.gates.completion'),
        verification: normalizeAssociationGate(gates.verification, 'reconciliation.finishAssociation.gates.verification'),
      },
    },
    contributionHandoff: handoff,
    reason: text(record.reason, 'reconciliation.reason'),
    source: text(record.source, 'reconciliation.source'),
  };
  if (handoff.parentTaskId !== payload.parentTaskId) throw parentCoordinationError('terminal_contribution_reconciliation_parent_mismatch', 'Contribution Handoff parentTaskId与恢复Parent不一致。', 409);
  const identity = digest(payload);
  if (record.identity !== identity) throw parentCoordinationError('terminal_contribution_reconciliation_identity_mismatch', 'terminal contribution reconciliation identity与内容不一致。', 409, { expected: identity, actual: record.identity });
  return { identity, ...payload, createdAt: timestamp(record.createdAt, 'reconciliation.createdAt') };
}
