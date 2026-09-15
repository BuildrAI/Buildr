import fs from 'node:fs';
import path from 'node:path';
import type { OpenSpecDelta } from './delta-model.ts';
import type { ConvergencePlan, ConvergenceReceipt, ExecutableIdentity, ExecutionEvidence } from './convergence-model.ts';
import { createConvergenceReceipt, validateConvergenceReceipt } from './convergence-model.ts';
import { observeConvergence } from './convergence-observer.ts';
import { inspectChangeChecklist } from './change-checklist.ts';

export type ConvergenceContext = { change: string; project: string; projectRoot: string; changeRoot: string; delta: OpenSpecDelta; archived?: boolean };
export function convergenceReceiptPath(changeRoot: string) { return path.join(changeRoot, '.buildr', 'convergence-receipt.json'); }
export function runOpenSpecConvergence({ context, executableIdentity, activeConflicts = [], preparePlan, archive, resolveArchivedChangeRoot, writeReceipt, releaseReceipt, io = fs }: {
  context: ConvergenceContext; executableIdentity: ExecutableIdentity; activeConflicts?: unknown[];
  preparePlan(): ConvergencePlan; archive(skipSpecs: boolean): ExecutionEvidence; resolveArchivedChangeRoot(): string;
  writeReceipt(file: string, receipt: ConvergenceReceipt): unknown; releaseReceipt?: (file: string) => unknown; io?: typeof fs;
}) {
  const startedAt = Date.now();
  const execution: (ExecutionEvidence & { id: string })[] = [];
  const result = (status: string, extra: Record<string, unknown> = {}) => ({ change: context.change, project: context.project, status,
    durationMs: Date.now() - startedAt, commandCount: execution.reduce((sum, step) => sum + (step.commandCount || 0), 0), execution, ...extra });
  let receiptFile = convergenceReceiptPath(context.changeRoot);
  const release = () => { if (releaseReceipt) releaseReceipt(receiptFile); else if (io.existsSync(receiptFile)) io.rmSync(receiptFile); };
  let receipt: ConvergenceReceipt | null = null;
  try {
    if (io.existsSync(receiptFile)) {
      receipt = validateConvergenceReceipt(JSON.parse(io.readFileSync(receiptFile, 'utf8')));
      if (receipt.change !== context.change || receipt.project !== context.project) throw new Error('Recovery record belongs to another change or project.');
    }
  } catch (error) {
    return result('recovery-unprovable', { code: 'convergence-receipt-invalid', message: String(error), receipt: receiptFile, effects: [] });
  }
  if (context.archived) {
    if (receipt) {
      const observed = observeConvergence({ projectRoot: context.projectRoot, receipt, archived: true, io });
      if (observed.disposition !== 'archived') return result('recovery-unprovable', { code: 'archived-content-changed', ...observed, effects: [] });
      try { release(); } catch (error) { return result('blocked', { code: 'convergence-receipt-release-failed', disposition: 'archived', message: String(error), effects: [] }); }
    }
    return result('passed', { disposition: 'archived', receipt: null, receiptReleased: true, effects: [] });
  }
  const checklist = inspectChangeChecklist(context.changeRoot, { io });
  if (checklist.exists && (checklist.remaining ?? 0) > 0) return result('blocked', { code: 'change-checklist-incomplete', checklist, effects: [] });
  if (activeConflicts.length) return result('blocked', { code: 'active-change-conflict', blockers: activeConflicts, effects: [] });
  // Old sidecars cannot authorize a new write. Leave them available for diagnosis.
  if (!receipt && ['deterministic-convergence.json', 'deterministic-sync-plan.json', 'convergence-recovery.json'].some(name => io.existsSync(path.join(context.changeRoot, '.buildr', name)))) {
    return result('recovery-unprovable', { code: 'legacy-recovery-requires-inspection', effects: [], nextActions: ['核对旧恢复记录与当前文件；不得覆盖或删除未确认现场。'] });
  }
  let skipSpecs = false;
  if (receipt) {
    if (receipt.deltaDigest !== context.delta.hash || JSON.stringify(receipt.executableIdentity) !== JSON.stringify(executableIdentity)) {
      return result('recovery-unprovable', { code: 'recovery-input-changed', receipt: receiptFile, effects: [] });
    }
    const observed = observeConvergence({ projectRoot: context.projectRoot, receipt, io });
    if (observed.disposition === 'state-unknown') return result('recovery-unprovable', { ...observed, code: 'convergence-state-unknown', effects: [] });
    skipSpecs = observed.disposition === 'applied-and-matched';
  } else {
    const plan = preparePlan();
    execution.push({ id: 'upstream-preview', status: plan.status === 'blocked' ? 'blocked' : 'passed', commandCount: 1 });
    if (plan.status === 'blocked') return result('blocked', { blockers: plan.blocked, code: 'upstream-spec-invalid', effects: [] });
    if (plan.deltaDigest !== context.delta.hash || !plan.files.length) return result('blocked', { code: 'upstream-input-changed', effects: [] });
    receipt = createConvergenceReceipt({ plan, executableIdentity });
    writeReceipt(receiptFile, receipt);
    // Preview is recovery evidence; only upstream owns normal spec mutation.
    const observed = observeConvergence({ projectRoot: context.projectRoot, receipt, io });
    if (observed.disposition === 'state-unknown') return result('recovery-unprovable', { ...observed, effects: [] });
  }
  let archived: ExecutionEvidence;
  try { archived = archive(skipSpecs); }
  catch (error) { archived = { status: 'blocked', code: 'archive-execution-failed', diagnostic: String(error), commandCount: 1 }; }
  execution.push({ id: 'upstream-archive', ...archived });
  let archivedRoot: string | null = null;
  try { archivedRoot = resolveArchivedChangeRoot(); } catch { /* Active after upstream failure. */ }
  if (archivedRoot) receiptFile = convergenceReceiptPath(archivedRoot);
  const observed = observeConvergence({ projectRoot: context.projectRoot, receipt, archived: Boolean(archivedRoot), io });
  const effects = observed.files.filter(item => item.actualDigest !== item.beforeDigest).map(item => ({ path: item.path, digest: item.actualDigest, type: item.actualDigest === null ? 'deleted' : 'updated' }));
  if (observed.disposition === 'state-unknown') return result('recovery-unprovable', { code: 'post-archive-content-mismatch', ...observed, receipt: receiptFile, effects });
  if (archived.status !== 'passed' || !archivedRoot || observed.disposition !== 'archived') {
    return result('blocked', { code: archived.code || 'archive-incomplete', ...observed, receipt: receiptFile, effects, nextActions: ['保留当前结果，核对诊断后重新运行相同归档动作。'] });
  }
  try { release(); } catch (error) { return result('blocked', { code: 'convergence-receipt-release-failed', disposition: 'archived', message: String(error), effects }); }
  return result('passed', { disposition: 'archived', receipt: null, receiptReleased: true, effects });
}
