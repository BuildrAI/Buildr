import type { OpenSpecDelta } from './delta-parser.ts';
import type { CanonicalSnapshot } from './convergence-planner.ts';
import type { ConvergenceReceipt, ConvergencePlan, ExecutableIdentity, ExecutionEvidence, ExecutionStep, ConvergenceBlocker } from './convergence-model.ts';
import type { SyncPlan } from './deterministic-sync.ts';
export type ConvergenceContext = { change: string; project: string; projectRoot: string; changeRoot: string; delta: OpenSpecDelta; archived?: boolean };
export type LegacyReceipt = { schemaVersion: string; change: string; project: string; deltaHash: string; stage: string; planIdentity?: string; openspecExecutableIdentity?: ExecutableIdentity; transitions?: { stage: string; planIdentity?: string }[] };
type RunInput = {
  context: ConvergenceContext; executable: string; executableIdentity: ExecutableIdentity; capabilityPurposes?: Map<string, string>; activeConflicts?: ConvergenceBlocker[];
  validateProjected(input: { files: { path: string; content: string; exists: boolean }[] }): ExecutionEvidence;
  validateActual(): ExecutionEvidence; archive(): ExecutionEvidence; resolveArchivedChangeRoot(): string;
  writeReceipt(file: string, receipt: ConvergenceReceipt): unknown; releaseReceipt?: ((file: string) => unknown) | null; io?: typeof fs;
};
import fs from 'node:fs';
import path from 'node:path';
import { applyCanonicalPlan } from './canonical-applier.ts';
import { createConvergencePlan } from './convergence-planner.ts';
import { observeConvergence } from './convergence-observer.ts';
import { CONVERGENCE_PLAN_SCHEMA, CONVERGENCE_RECEIPT_SCHEMA, createConvergenceReceipt, convergenceDigest, convergenceIdentity, convergencePlanIdentity, normalizeConvergenceText, validateConvergenceReceipt } from './convergence-model.ts';
import { deterministicSyncPlanIdentity } from './deterministic-sync.ts';
import { inspectChangeChecklist } from './change-checklist.ts';

export function convergenceReceiptPath(changeRoot: string) {
  return path.join(changeRoot, '.buildr', 'convergence-receipt.json');
}

function publicReceipt(projectRoot: string, file: string, receipt: ConvergenceReceipt) {
  return {
    path: path.relative(projectRoot, file).split(path.sep).join('/'),
    identity: receipt.convergenceIdentity,
    planIdentity: receipt.planIdentity,
    disposition: receipt.disposition,
  };
}

function releaseTransactionReceipt(file: string, { io }: { io: typeof fs }) {
  if (!io.existsSync(file)) return;
  io.rmSync(file);
  const directory = path.dirname(file);
  if (io.existsSync(directory) && io.readdirSync(directory).length === 0) io.rmdirSync(directory);
}

function result(status: string, context: ConvergenceContext, startedAt: number, execution: ExecutionStep[], extra: Record<string, unknown> = {}) {
  return {
    status,
    change: context.change,
    project: context.project,
    durationMs: Date.now() - startedAt,
    commandCount: execution.reduce((sum, item) => sum + (item.commandCount || 0), 0),
    execution,
    ...extra,
  };
}

export function canonicalSnapshots({ projectRoot, delta, io }: { projectRoot: string; delta: OpenSpecDelta; io: Pick<typeof fs, 'existsSync' | 'readFileSync'> }) {
  const snapshots = new Map<string, CanonicalSnapshot>();
  for (const capability of [...delta.capabilities.keys()].sort()) {
    const file = path.join(projectRoot, 'openspec', 'specs', capability, 'spec.md');
    snapshots.set(capability, {
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      exists: io.existsSync(file),
      content: io.existsSync(file) ? io.readFileSync(file, 'utf8') : '',
    });
  }
  return snapshots;
}

function canonicalSafelyExtendsExpected({ projectRoot, receipt, io }: { projectRoot: string; receipt: ConvergenceReceipt; io: typeof fs }) {
  return receipt.files.every((item) => {
    const file = path.resolve(projectRoot, item.path);
    if (!file.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) return false;
    if (item.expectedExists === false) return !io.existsSync(file);
    if (!io.existsSync(file)) return false;
    const expected = normalizeConvergenceText(item.expectedContent);
    const actual = normalizeConvergenceText(io.readFileSync(file, 'utf8'));
    if (actual === expected) return true;
    if (!actual.startsWith(expected)) return false;
    return actual.slice(expected.length).trimStart().startsWith('### Requirement:');
  });
}

function planFromReceipt(receipt: ConvergenceReceipt): ConvergencePlan {
  return {
    schemaVersion: CONVERGENCE_PLAN_SCHEMA,
    algorithmVersion: receipt.algorithmVersion,
    convergenceIdentity: receipt.convergenceIdentity,
    planIdentity: receipt.planIdentity,
    change: receipt.change,
    project: receipt.project,
    deltaDigest: receipt.deltaDigest,
    executableIdentity: receipt.executableIdentity,
    status: receipt.operations.every((item) => item.status === 'already-applied') ? 'already-applied' : 'safe',
    operations: receipt.operations,
    blocked: [],
    files: receipt.files,
  };
}

function legacyReceiptPlanIdentity(receipt: LegacyReceipt) {
  if (typeof receipt.planIdentity === 'string' && receipt.planIdentity) return receipt.planIdentity;
  const transitionIdentities = [...new Set((Array.isArray(receipt.transitions) ? receipt.transitions : [])
    .filter((item) => ['sync-plan', 'sync-apply'].includes(item?.stage))
    .map((item) => item.planIdentity)
    .filter((identity) => typeof identity === 'string' && identity))];
  return transitionIdentities.length === 1 ? transitionIdentities[0] : null;
}

function migrateLegacyReceipt({ context, executableIdentity, io }: { context: ConvergenceContext; executableIdentity: ExecutableIdentity; io: typeof fs }) {
  const oldReceiptFile = path.join(context.changeRoot, '.buildr', 'deterministic-convergence.json');
  const oldPlanFile = path.join(context.changeRoot, '.buildr', 'deterministic-sync-plan.json');
  const recoveryFile = path.join(context.changeRoot, '.buildr', 'convergence-recovery.json');
  if (io.existsSync(recoveryFile) && !io.existsSync(oldReceiptFile)) return { status: 'recovery-unprovable', code: 'legacy-recovery-without-convergence' };
  if (!io.existsSync(oldReceiptFile)) return { status: 'none' };
  if (!io.existsSync(oldPlanFile)) return { status: 'recovery-unprovable', code: 'legacy-plan-missing' };
  let oldReceipt: LegacyReceipt;
  let oldPlan: SyncPlan;
  try {
    oldReceipt = JSON.parse(io.readFileSync(oldReceiptFile, 'utf8'));
    oldPlan = JSON.parse(io.readFileSync(oldPlanFile, 'utf8'));
  } catch {
    return { status: 'recovery-unprovable', code: 'legacy-sidecar-invalid' };
  }
  const legacyPlanIdentity = legacyReceiptPlanIdentity(oldReceipt);
  if (!['buildr.openspec-convergence-receipt/v1', 'buildr.openspec-convergence-receipt/v2'].includes(oldReceipt.schemaVersion)
    || oldPlan.schemaVersion !== 'buildr.openspec-sync-plan/v1'
    || oldReceipt.change !== context.change || oldReceipt.project !== context.project
    || oldPlan.change !== context.change || oldPlan.project !== context.project
    || typeof oldReceipt.deltaHash !== 'string' || !oldReceipt.deltaHash
    || oldReceipt.deltaHash !== oldPlan.deltaHash
    || oldReceipt.stage !== 'post-sync' || oldReceipt.openspecExecutableIdentity?.sha256 !== executableIdentity.sha256
    || oldReceipt.openspecExecutableIdentity?.version !== executableIdentity.version
    || deterministicSyncPlanIdentity(oldPlan) !== oldPlan.identity
    || legacyPlanIdentity !== oldPlan.identity
    || !Array.isArray(oldPlan.files) || oldPlan.files.length === 0) {
    return { status: 'recovery-unprovable', code: 'legacy-identity-chain-incomplete' };
  }
  const files = oldPlan.files.map((item) => ({
    path: item.path,
    beforeDigest: item.beforeDigest,
    expectedDigest: item.expectedDigest,
    beforeContent: item.before,
    expectedContent: item.expected,
  }));
  if (files.some((item) => convergenceDigest(normalizeConvergenceText(item.beforeContent)) !== item.beforeDigest
    || convergenceDigest(normalizeConvergenceText(item.expectedContent)) !== item.expectedDigest)) {
    return { status: 'recovery-unprovable', code: 'legacy-content-digest-mismatch' };
  }
  const identity = convergenceIdentity({ change: context.change, project: context.project, deltaDigest: oldReceipt.deltaHash, files, executableIdentity });
  const plan: ConvergencePlan = {
    schemaVersion: CONVERGENCE_PLAN_SCHEMA,
    algorithmVersion: 2,
    convergenceIdentity: identity,
    planIdentity: null,
    change: context.change,
    project: context.project,
    deltaDigest: oldReceipt.deltaHash,
    executableIdentity,
    status: oldPlan.status,
    operations: oldPlan.operations || [],
    blocked: [],
    files,
  };
  plan.planIdentity = convergencePlanIdentity(plan);
  return { status: 'migrated', receipt: createConvergenceReceipt({ plan, executableIdentity }) };
}

export function runOpenSpecConvergence({
  context,
  executable,
  executableIdentity,
  capabilityPurposes,
  activeConflicts = [],
  validateProjected,
  validateActual,
  archive,
  resolveArchivedChangeRoot,
  writeReceipt,
  releaseReceipt = null,
  io = fs,
}: RunInput) {
  const startedAt = Date.now();
  const execution: ExecutionStep[] = [];
  const release = releaseReceipt || ((file: string) => releaseTransactionReceipt(file, { io }));
  if (!context.archived) {
    const checklist = inspectChangeChecklist(context.changeRoot, { io });
    const incomplete = checklist.exists && (checklist.remaining ?? 0) > 0;
    execution.push({ id: 'checklist', status: incomplete ? 'blocked' : 'passed', durationMs: 0, commandCount: 0 });
    if (incomplete) {
      return result('blocked', context, startedAt, execution, {
        code: 'change-checklist-incomplete',
        checklist,
        effects: [],
        nextActions: ['完成或修订 Change checklist 中所有归档前任务后重新运行 converge。'],
      });
    }
  }
  let receiptFile = convergenceReceiptPath(context.changeRoot);
  let receipt: ConvergenceReceipt | null = null;
  if (context.archived && !io.existsSync(receiptFile)) {
    return result('passed', context, startedAt, execution, {
      disposition: 'archived',
      receipt: null,
      receiptReleased: true,
      effects: [],
    });
  }
  if (io.existsSync(receiptFile)) {
    try { receipt = validateConvergenceReceipt(JSON.parse(io.readFileSync(receiptFile, 'utf8'))); }
    catch (error) { return result('recovery-unprovable', context, startedAt, execution, { code: 'convergence-receipt-invalid', message: (error instanceof Error ? error.message : String(error)), nextActions: ['人工核对 receipt 与 canonical 文件；不得删除 sidecar 后继续。'] }); }
  } else {
    const legacy = migrateLegacyReceipt({ context, executableIdentity, io });
    if (legacy.status === 'recovery-unprovable') return result('recovery-unprovable', context, startedAt, execution, { code: legacy.code, nextActions: ['人工核对历史 sidecar identity chain 与 canonical 文件。'] });
    if (legacy.status === 'migrated') receipt = legacy.receipt!;
  }

  if (context.archived && receipt) {
    if (receipt.retention !== 'transaction') {
      return result('passed', context, startedAt, execution, {
        disposition: 'archived', receipt: publicReceipt(context.projectRoot, receiptFile, receipt), receiptReleased: false, effects: [],
      });
    }
    try {
      release(receiptFile);
      execution.push({ id: 'receipt-release', status: 'passed', durationMs: 0, commandCount: 0 });
    } catch (error) {
      execution.push({ id: 'receipt-release', status: 'blocked', durationMs: 0, commandCount: 0 });
      return result('blocked', context, startedAt, execution, {
        code: 'convergence-receipt-release-failed', disposition: 'archived',
        receipt: publicReceipt(context.projectRoot, receiptFile, receipt), receiptReleased: false,
        message: (error instanceof Error ? error.message : String(error)), effects: [], nextActions: ['重新运行 converge 只完成事务 Receipt release。'],
      });
    }
    return result('passed', context, startedAt, execution, { disposition: 'archived', receipt: null, receiptReleased: true, effects: [] });
  }

  if (receipt) {
    const observation = observeConvergence({ projectRoot: context.projectRoot, receipt, archived: context.archived, io });
    const safeCurrentDeltaReplan = observation.disposition === 'state-unknown'
      && receipt.deltaDigest !== context.delta.hash
      && canonicalSafelyExtendsExpected({ projectRoot: context.projectRoot, receipt, io });
    execution.push({ id: 'observe', status: observation.disposition === 'state-unknown' && !safeCurrentDeltaReplan ? 'blocked' : 'passed', durationMs: 0, commandCount: 0 });
    if (observation.disposition === 'state-unknown' && !safeCurrentDeltaReplan) {
      const unknown = { ...receipt, disposition: 'state-unknown', updatedAt: new Date().toISOString() };
      writeReceipt(receiptFile, unknown);
      return result('recovery-unprovable', context, startedAt, execution, { code: 'canonical-state-unknown', files: observation.files, receipt: publicReceipt(context.projectRoot, receiptFile, unknown), nextActions: ['人工核对 canonical 文件；Buildr 不会自动覆盖混合或未知状态。'] });
    }
    if (safeCurrentDeltaReplan) receipt = null;
    if (receipt) {
      if (receipt.deltaDigest !== context.delta.hash) receipt = null;
      else if (receipt.executableIdentity.sha256 !== executableIdentity.sha256 || receipt.executableIdentity.version !== executableIdentity.version) receipt = null;
      else receipt = { ...receipt, disposition: observation.disposition, updatedAt: new Date().toISOString() };
    }
  }

  if (!receipt) {
    const planStartedAt = Date.now();
    const plan = createConvergencePlan({
      change: context.change,
      project: context.project,
      delta: context.delta,
      canonicalFiles: canonicalSnapshots({ projectRoot: context.projectRoot, delta: context.delta, io }),
      capabilityPurposes,
      executableIdentity,
      activeConflicts,
    });
    execution.push({ id: 'plan', status: plan.status === 'blocked' ? 'blocked' : 'passed', durationMs: Date.now() - planStartedAt, commandCount: 0 });
    if (plan.status === 'blocked') return result('blocked', context, startedAt, execution, { code: 'semantic-resolution-required', blocked: plan.blocked, operations: plan.operations, effects: [], nextActions: ['解决 delta 或 active Change 语义冲突后重新运行 converge。'] });
    const validation = validateProjected({ files: plan.files.map((item) => ({ path: item.path, content: item.expectedContent, exists: item.expectedExists !== false })) });
    execution.push({ id: 'projected-validation', ...validation });
    if (validation.status !== 'passed') return result('blocked', context, startedAt, execution, { code: validation.code, validation, nextActions: ['修正 Change artifacts 使 projected Project 通过 strict validation。'] });
    receipt = { ...createConvergenceReceipt({ plan, executableIdentity }), validation };
    receiptFile = convergenceReceiptPath(context.changeRoot);
    writeReceipt(receiptFile, receipt);
  }

  const plan = planFromReceipt(receipt);
  if (receipt.disposition === 'planned-not-applied') {
    const applyStartedAt = Date.now();
    const applied = applyCanonicalPlan({ projectRoot: context.projectRoot, plan, currentDeltaDigest: context.delta.hash, currentExecutableIdentity: executableIdentity, io });
    execution.push({ id: 'apply', status: applied.status, durationMs: Date.now() - applyStartedAt, commandCount: 0 });
    if (applied.status !== 'passed') return result('blocked', context, startedAt, execution, { code: 'convergence-input-changed', nextActions: ['重新运行 converge 以当前事实重新规划。'], effects: [] });
    receipt = { ...receipt, disposition: 'applied-and-matched', apply: applied, updatedAt: new Date().toISOString() };
    writeReceipt(receiptFile, receipt);
  }

  const observation = observeConvergence({ projectRoot: context.projectRoot, receipt, archived: false, io });
  if (observation.disposition !== 'applied-and-matched') return result('recovery-unprovable', context, startedAt, execution, { code: 'post-apply-digest-mismatch', files: observation.files, receipt: publicReceipt(context.projectRoot, receiptFile, receipt), nextActions: ['人工核对 canonical 文件。'] });
  const confirmation = validateActual();
  execution.push({ id: 'confirmation', ...confirmation });
  if (confirmation.status !== 'passed') {
    receipt = { ...receipt, confirmation, updatedAt: new Date().toISOString() };
    writeReceipt(receiptFile, receipt);
    return result('blocked', context, startedAt, execution, { code: confirmation.code, receipt: publicReceipt(context.projectRoot, receiptFile, receipt), nextActions: ['修复 strict validation 失败，不得恢复 canonical 或刷新 baseline。'] });
  }
  receipt = { ...receipt, disposition: 'applied-and-matched', confirmation, updatedAt: new Date().toISOString() };
  writeReceipt(receiptFile, receipt);

  const archiveResult = archive();
  execution.push({ id: 'archive', ...archiveResult });
  if (archiveResult.status !== 'passed') {
    receipt = { ...receipt, archive: archiveResult, updatedAt: new Date().toISOString() };
    writeReceipt(receiptFile, receipt);
    return result('blocked', context, startedAt, execution, { code: archiveResult.code || 'archive-failed', disposition: receipt.disposition, receipt: publicReceipt(context.projectRoot, receiptFile, receipt), nextActions: ['重新运行 converge 只重试 archive。'] });
  }
  const archivedRoot = resolveArchivedChangeRoot();
  receiptFile = convergenceReceiptPath(archivedRoot);
  try {
    release(receiptFile);
    execution.push({ id: 'receipt-release', status: 'passed', durationMs: 0, commandCount: 0 });
  } catch (error) {
    execution.push({ id: 'receipt-release', status: 'blocked', durationMs: 0, commandCount: 0 });
    return result('blocked', context, startedAt, execution, {
      code: 'convergence-receipt-release-failed', disposition: 'archived',
      receipt: publicReceipt(context.projectRoot, receiptFile, receipt), receiptReleased: false,
      message: (error instanceof Error ? error.message : String(error)), effects: receipt.apply?.effects || [],
      nextActions: ['重新运行 converge 只完成事务 Receipt release。'],
    });
  }
  return result('passed', context, startedAt, execution, {
    disposition: 'archived', receipt: null, receiptReleased: true, effects: receipt.apply?.effects || [],
  });
}
