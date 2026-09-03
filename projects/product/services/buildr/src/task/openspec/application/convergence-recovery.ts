import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DETERMINISTIC_SYNC_PLAN_SCHEMA,
  deterministicSyncContentDigest,
  deterministicSyncPlanIdentity,
  reverseDeterministicSyncPlan,
} from './deterministic-sync.ts';

export const CONVERGENCE_RECOVERY_SCHEMA = 'buildr.openspec-convergence-recovery/v1';

function digest(value: any) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function blocked(status: any, code: any, message: any, evidence: any = {}) {
  return { schemaVersion: CONVERGENCE_RECOVERY_SCHEMA, status, code, message, effects: [], ...evidence };
}

export function inspectConvergenceRecovery({
  projectRoot,
  change,
  project,
  newDeltaHash,
  receipt,
  baseline,
  syncPlan,
  executableIdentity,
  io = fs,
}: any) {
  const required = [
    ['convergence-receipt', receipt],
    ['contract-baseline', baseline],
    ['deterministic-sync-plan', syncPlan],
  ];
  const missingEvidence = required.filter(([, value]: any) => !value).map(([name]: any) => name);
  if (missingEvidence.length) {
    return blocked('recovery-unprovable', 'convergence-recovery-evidence-missing', 'OpenSpec convergence recovery evidence is incomplete.', { missingEvidence });
  }
  if (receipt.change !== change || receipt.project !== project || baseline.change !== change || baseline.project !== project
    || syncPlan.change !== change || syncPlan.project !== project) {
    return blocked('recovery-unprovable', 'convergence-recovery-metadata-mismatch', 'OpenSpec convergence recovery metadata does not match the current change and Project.');
  }
  if (receipt.stage !== 'post-sync' || receipt.deltaHash === newDeltaHash) {
    return blocked('recovery-unprovable', 'convergence-recovery-transition-unsupported', 'OpenSpec convergence recovery requires a completed old post-sync receipt and a changed delta identity.');
  }
  if (baseline.deltaHash !== receipt.deltaHash || syncPlan.deltaHash !== receipt.deltaHash
    || syncPlan.schemaVersion !== DETERMINISTIC_SYNC_PLAN_SCHEMA || syncPlan.identity !== deterministicSyncPlanIdentity(syncPlan)) {
    return blocked('recovery-unprovable', 'convergence-recovery-chain-mismatch', 'OpenSpec baseline, sync plan, and convergence receipt do not form one identity chain.');
  }
  const receiptPlanIdentities = (receipt.transitions || [])
    .filter((item: any) => item.stage === 'sync-plan' || item.stage === 'sync-apply')
    .map((item: any) => item.planIdentity)
    .filter(Boolean);
  if (receiptPlanIdentities.length < 2 || receiptPlanIdentities.some((identity: any) => identity !== syncPlan.identity)) {
    return blocked('recovery-unprovable', 'convergence-recovery-plan-receipt-mismatch', 'The convergence receipt does not bind the deterministic sync plan used by both planning and apply stages.');
  }
  const receiptExecutable = receipt.openspecExecutableIdentity;
  if (!receiptExecutable?.sha256 || receiptExecutable.sha256 !== executableIdentity?.sha256) {
    return blocked('recovery-unprovable', 'convergence-recovery-executable-mismatch', 'OpenSpec executable identity does not match the completed convergence receipt.');
  }
  if (!Array.isArray(syncPlan.files) || syncPlan.files.length === 0) {
    return blocked('recovery-unprovable', 'convergence-recovery-files-missing', 'OpenSpec deterministic sync plan does not contain restorable files.');
  }

  const files: any[] = [];
  for (const item of syncPlan.files) {
    const file = path.resolve(projectRoot, item.path);
    if (!file.startsWith(`${path.resolve(projectRoot)}${path.sep}`) || !io.existsSync(file)) {
      return blocked('recovery-unprovable', 'convergence-recovery-target-missing', 'A receipt-bound canonical target is missing or outside the Project root.', { target: item.path });
    }
    if (deterministicSyncContentDigest(item.before) !== item.beforeDigest || deterministicSyncContentDigest(item.expected) !== item.expectedDigest) {
      return blocked('recovery-unprovable', 'convergence-recovery-content-mismatch', 'The deterministic sync plan contains content that does not match its digest.', { target: item.path });
    }
    const currentDigest = deterministicSyncContentDigest(io.readFileSync(file, 'utf8'));
    const state = currentDigest === item.expectedDigest ? 'post-sync' : currentDigest === item.beforeDigest ? 'pre-sync' : 'drifted';
    files.push({ path: item.path, beforeDigest: item.beforeDigest, expectedDigest: item.expectedDigest, currentDigest, state });
  }
  if (files.some((item: any) => item.state === 'drifted') || new Set(files.map((item: any) => item.state)).size > 1) {
    return blocked('semantic-resolution-required', 'convergence-recovery-canonical-drift', 'Canonical specs no longer match one provable pre-sync or post-sync state.', { files });
  }

  const canonicalState = files[0].state;
  const reversePlan: any = reverseDeterministicSyncPlan(syncPlan);
  const identityFiles = files.map(({ path: filePath, beforeDigest, expectedDigest }: any) => ({ path: filePath, beforeDigest, expectedDigest }));
  const identity = digest({ change, project, oldDeltaHash: receipt.deltaHash, newDeltaHash, oldPlanIdentity: syncPlan.identity, files: identityFiles, executableIdentity });
  return {
    schemaVersion: CONVERGENCE_RECOVERY_SCHEMA,
    status: 'recoverable-stale-receipt',
    code: 'convergence-recovery-ready',
    identity,
    change,
    project,
    oldDeltaHash: receipt.deltaHash,
    newDeltaHash,
    oldPlanIdentity: syncPlan.identity,
    reversePlanIdentity: reversePlan.identity,
    baselineIdentity: digest(baseline),
    executableIdentity,
    canonicalState,
    files,
    reversePlan,
    effects: canonicalState === 'post-sync' ? ['canonical-spec-restore', 'contract-baseline-rebind'] : ['contract-baseline-rebind'],
  };
}

export function createConvergenceRecoveryReceipt(plan: any, stage: any = 'planned', transitions: any = []) {
  if (plan?.schemaVersion !== CONVERGENCE_RECOVERY_SCHEMA || plan.status !== 'recoverable-stale-receipt' || !plan.identity) {
    throw new Error('OpenSpec convergence recovery plan is invalid.');
  }
  return {
    schemaVersion: CONVERGENCE_RECOVERY_SCHEMA,
    identity: plan.identity,
    change: plan.change,
    project: plan.project,
    oldDeltaHash: plan.oldDeltaHash,
    newDeltaHash: plan.newDeltaHash,
    oldPlanIdentity: plan.oldPlanIdentity,
    reversePlanIdentity: plan.reversePlanIdentity,
    baselineIdentity: plan.baselineIdentity,
    executableIdentity: plan.executableIdentity,
    files: plan.files,
    stage,
    transitions,
  };
}

export function continueConvergenceRecoveryReceipt(plan: any, existing: any = null) {
  if (!existing) return { status: 'ready', receipt: createConvergenceRecoveryReceipt(plan), disposition: 'created' };
  if (existing.identity === plan.identity) return { status: 'ready', receipt: existing, disposition: 'resumed' };
  if (existing.stage !== 'completed' || existing.newDeltaHash !== plan.oldDeltaHash) {
    return blocked('recovery-unprovable', 'convergence-recovery-receipt-mismatch', 'An existing convergence recovery receipt does not prove continuity with the next identity transition.');
  }
  const { history: previousHistory = [], ...completedTransition } = existing;
  return {
    status: 'ready',
    disposition: 'rotated',
    receipt: {
      ...createConvergenceRecoveryReceipt(plan),
      history: [...previousHistory, completedTransition],
    },
  };
}
