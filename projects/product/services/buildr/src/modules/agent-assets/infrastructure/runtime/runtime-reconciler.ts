import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRuntimeAdapter, REQUIRED_RENDER_CAPABILITIES } from './adapter-contract.ts';
import {
  runtimeFileMatches,
  sha256Integrity,
  runtimeWriteBuffer,
  runtimeWriteMode,
  runtimeWriteModeMatches,
} from './skills/projection-files.ts';

function safeTarget(targetRoot: any, targetFile: any): any  {
  const root = path.resolve(targetRoot);
  const target = path.resolve(targetFile);
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function firstSymbolicLinkSegment(targetRoot: any, targetFile: any): any  {
  const root = path.resolve(targetRoot);
  const target = path.resolve(targetFile);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let current = root;
  for (const segment of ['.', ...relative.split(path.sep)]) {
    if (segment !== '.') current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return current;
    } catch (error: any) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return null;
}

export function assertRuntimeTargetPath(targetRoot: any, targetFile: any, label: any = 'Runtime target'): any  {
  if (!safeTarget(targetRoot, targetFile)) {
    throw new Error(`${label} is outside target root: ${targetFile}`);
  }
  const symbolicLink = firstSymbolicLinkSegment(targetRoot, targetFile);
  if (symbolicLink) {
    throw new Error(`${label} crosses a symbolic link: ${symbolicLink}`);
  }
  return path.resolve(targetFile);
}

export function validateRuntimePlan(plan: any, adapter: any = getRuntimeAdapter(plan?.adapterId)): any  {
  const errors: any[] = [];
  if (plan?.schemaVersion !== 'buildr.runtime-plan/v1') errors.push('runtime plan schemaVersion is invalid');
  if (plan?.adapterId !== adapter.id) errors.push(`runtime plan adapterId does not match descriptor: ${plan?.adapterId}`);
  const writes: any = new Map();
  for (const item of plan?.writes || []) {
    try { assertRuntimeTargetPath(plan.targetRoot, item.targetFile, 'runtime write target'); }
    catch (error: any) { errors.push(error.message); }
    if (typeof item.content !== 'string') errors.push(`runtime write content must be a string: ${item.targetFile}`);
    try {
      runtimeWriteBuffer(item);
      runtimeWriteMode(item);
      if (item.sourceContent !== undefined) runtimeWriteBuffer(item, true);
    } catch (error: any) {
      errors.push(error.message);
    }
    if (item.commitLast !== undefined && typeof item.commitLast !== 'boolean') errors.push(`runtime write commitLast must be boolean: ${item.targetFile}`);
    if (item.previousIntegrity !== undefined && !/^sha256-[a-f0-9]{64}$/.test(item.previousIntegrity)) errors.push(`runtime write previous integrity is invalid: ${item.targetFile}`);
    if (item.previousExecutable !== undefined && typeof item.previousExecutable !== 'boolean') errors.push(`runtime write previous executable is invalid: ${item.targetFile}`);
    const existing = writes.get(path.resolve(item.targetFile));
    const identity = JSON.stringify([item.contentEncoding || 'utf8', item.content, item.mode ?? null]);
    const existingIdentity = existing && JSON.stringify([existing.contentEncoding || 'utf8', existing.content, existing.mode ?? null]);
    if (existing && existingIdentity !== identity) errors.push(`runtime writes contain conflicting target: ${item.targetFile}`);
    else writes.set(path.resolve(item.targetFile), item);
  }
  const removals: any = new Set();
  for (const item of plan?.removals || []) {
    const targetFile = typeof item === 'string' ? item : item.targetFile;
    try { assertRuntimeTargetPath(plan.targetRoot, targetFile, 'runtime removal target'); }
    catch (error: any) { errors.push(error.message); }
    if (typeof item !== 'string' && item.expectedIntegrity !== undefined && !/^sha256-[a-f0-9]{64}$/.test(item.expectedIntegrity)) errors.push(`runtime removal integrity is invalid: ${targetFile}`);
    if (typeof item !== 'string' && item.expectedExecutable !== undefined && typeof item.expectedExecutable !== 'boolean') errors.push(`runtime removal executable is invalid: ${targetFile}`);
    if (typeof item !== 'string' && item.removeLast !== undefined && typeof item.removeLast !== 'boolean') errors.push(`runtime removal removeLast must be boolean: ${targetFile}`);
    if (writes.has(path.resolve(targetFile))) errors.push(`runtime target cannot be written and removed: ${targetFile}`);
    if (removals.has(path.resolve(targetFile))) errors.push(`runtime removals contain duplicate target: ${targetFile}`);
    removals.add(path.resolve(targetFile));
  }
  const evidence: any = new Map((plan?.capabilityEvidence || []).map((item: any) => [item.capability, item]));
  for (const capability of REQUIRED_RENDER_CAPABILITIES) {
    if (evidence.get(capability)?.supported !== true) errors.push(`runtime plan is missing capability evidence: ${capability}`);
  }
  for (const capability of evidence.keys()) {
    if (!REQUIRED_RENDER_CAPABILITIES.includes(capability)) errors.push(`runtime plan has unknown capability evidence: ${capability}`);
  }
  if (errors.length > 0) throw new Error(`Invalid runtime plan for ${adapter.id}:\n- ${errors.join('\n- ')}`);
  return plan;
}

function runtimePath(targetRoot: any, targetFile: any): any  {
  return path.relative(targetRoot, targetFile).split(path.sep).join('/');
}

function runtimeWriteMismatchSummary(item: any, current: any, expected: any): any  {
  if (item.kind !== 'skill-projection-receipt' || current === null) return '';
  const hashes = `current=${sha256Integrity(current)} expected=${sha256Integrity(expected)}`;
  try {
    const currentReceipt = JSON.parse(current.toString('utf8'));
    const expectedReceipt = JSON.parse(expected.toString('utf8'));
    const fields = [...new Set([...Object.keys(currentReceipt), ...Object.keys(expectedReceipt)])]
      .filter((field: any) => JSON.stringify(currentReceipt[field]) !== JSON.stringify(expectedReceipt[field]))
      .sort();
    const currentFiles: any = new Map((currentReceipt.files || []).map((file: any) => [file.path, file]));
    const expectedFiles: any = new Map((expectedReceipt.files || []).map((file: any) => [file.path, file]));
    const fileDifferences = [...new Set([...currentFiles.keys(), ...expectedFiles.keys()])]
      .sort()
      .filter((file: any) => JSON.stringify(currentFiles.get(file)) !== JSON.stringify(expectedFiles.get(file)))
      .slice(0, 5)
      .map((file: any) => `${file}: current=${JSON.stringify(currentFiles.get(file) ?? null)} expected=${JSON.stringify(expectedFiles.get(file) ?? null)}`);
    const files = fileDifferences.length > 0 ? ` File differences: ${fileDifferences.join('; ')}.` : '';
    return ` Receipt differences: ${fields.join(', ') || 'serialized bytes only'}; ${hashes}.${files}`;
  } catch {
    return ` Receipt bytes differ; ${hashes}.`;
  }
}

function diagnosticFinding(item: any, observedStatus: any, plan: any, detail: any = ''): any  {
  const diagnostic = item.diagnostic || {};
  const status = observedStatus === 'ok' && diagnostic.currentStatus
    ? diagnostic.currentStatus
    : observedStatus === 'ok' && diagnostic.actionRequiredWhenCurrent ? 'stale' : observedStatus;
  const code = diagnostic.codes?.[status] || diagnostic.code;
  const message = (diagnostic.messages?.[status]
    || (status === 'ok' ? `${diagnostic.label || item.source || 'runtime target'} is up to date.` : `${diagnostic.label || item.source || 'runtime target'} is ${status}.`));
  const detailedMessage = `${message}${detail}`;
  const repair = status === 'ok' ? undefined : diagnostic.repairs?.[status] || diagnostic.repair;
  return {
    status,
    path: runtimePath(plan.targetRoot, item.targetFile),
    adapter: plan.adapterId,
    source: item.source,
    message: detailedMessage,
    ...(code ? { code } : {}),
    ...(repair ? { repair } : {}),
    userActionRequired: status !== 'ok' && status !== 'info' && status !== 'warning',
  };
}

export function reconcileRuntimePlan(plan: any, options: any = {}): any  {
  validateRuntimePlan(plan);
  const snapshotRuntimePlanTargets = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-rollback-'));
    const targets = [...new Set([
      ...plan.writes.map((item: any) => path.resolve(item.targetFile)),
      ...plan.removals.map((item: any) => path.resolve(typeof item === 'string' ? item : item.targetFile)),
    ])].sort((left: any, right: any) => left.localeCompare(right));
    const snapshots = targets.map((target: any, index: any) => {
      let existingAncestor = path.dirname(target);
      while (existingAncestor !== plan.targetRoot && !fs.existsSync(existingAncestor)) existingAncestor = path.dirname(existingAncestor);
      const existed = fs.existsSync(target);
      const backup = path.join(root, String(index));
      if (existed) fs.cpSync(target, backup, { recursive: true, preserveTimestamps: true });
      return { target, backup, existed, existingAncestor };
    });
    return {
      restore: () => {
        for (const snapshot of [...snapshots].reverse()) {
          fs.rmSync(snapshot.target, { recursive: true, force: true });
          if (snapshot.existed) {
            fs.mkdirSync(path.dirname(snapshot.target), { recursive: true });
            fs.cpSync(snapshot.backup, snapshot.target, { recursive: true, preserveTimestamps: true });
          } else {
            let current = path.dirname(snapshot.target);
            while (current !== snapshot.existingAncestor && current.startsWith(`${plan.targetRoot}${path.sep}`)) {
              if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
              fs.rmdirSync(current);
              current = path.dirname(current);
            }
          }
        }
      },
      cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
  };
  const compareOnly = options.compareOnly === true;
  const conflicts: any[] = [];
  const changed: any[] = [];
  const removed: any[] = [];
  for (const item of plan.writes) {
    if (!fs.existsSync(item.targetFile)) continue;
    const current = fs.readFileSync(item.targetFile);
    const expected = runtimeWriteBuffer(item);
    const modeMatches = runtimeWriteModeMatches(item.targetFile, item);
    const currentText = (item.contentEncoding || 'utf8') === 'utf8' ? current.toString('utf8') : null;
    const matches = (current.equals(expected) && modeMatches) || (currentText !== null && item.matchesCurrent?.(currentText) === true);
    const source = runtimeWriteBuffer(item, true);
    const sourceMatches = source !== null && current.equals(source);
    const previousMatches = item.previousIntegrity
      ? runtimeFileMatches(item.targetFile, item.previousIntegrity, item.previousExecutable)
      : false;
    if (!matches && !sourceMatches && !previousMatches && item.isManaged) {
      const managedInput = currentText === null ? current : currentText;
      if (!item.isManaged(managedInput)) conflicts.push(item);
    }
  }
  for (const removal of plan.removals) {
    const item = typeof removal === 'string' ? { targetFile: removal } : removal;
    if (!fs.existsSync(item.targetFile) || !item.expectedIntegrity) continue;
    if (!runtimeFileMatches(item.targetFile, item.expectedIntegrity, item.expectedExecutable)) conflicts.push(item);
  }
  const findings: any[] = [...plan.findings];
  for (const item of conflicts) findings.push(diagnosticFinding(item, 'conflict', plan));
  const plannedConflicts = findings.filter((finding: any) => finding.status === 'conflict');
  if (!compareOnly && plannedConflicts.length > 0) {
    throw new Error(`Runtime reconcile found conflict(s); no files were changed:\n- ${plannedConflicts.map((finding: any) => finding.message || finding.path).sort().join('\n- ')}`);
  }
  const rollback = !compareOnly && plan.removals.some((item: any) => typeof item !== 'string' && item.kind === 'legacy-skill-projection-ownership-receipt')
    ? snapshotRuntimePlanTargets()
    : null;
  const reconcileWrite = (item: any) => {
    if (conflicts.includes(item)) return;
    const current = fs.existsSync(item.targetFile) ? fs.readFileSync(item.targetFile) : null;
    const expected = runtimeWriteBuffer(item);
    const expectedMode = runtimeWriteMode(item);
    const currentText = current !== null && (item.contentEncoding || 'utf8') === 'utf8' ? current.toString('utf8') : null;
    const modeMatches = current === null || runtimeWriteModeMatches(item.targetFile, item);
    const status = current === null
      ? 'missing'
      : (current.equals(expected) && modeMatches) || (currentText !== null && item.matchesCurrent?.(currentText) === true)
        ? 'ok'
        : 'stale';
    findings.push(diagnosticFinding(item, status, plan, status === 'stale' ? runtimeWriteMismatchSummary(item, current, expected) : ''));
    if (!compareOnly && status !== 'ok') {
      fs.mkdirSync(path.dirname(item.targetFile), { recursive: true });
      fs.writeFileSync(item.targetFile, expected);
      if (expectedMode !== null) {
        const currentMode = fs.statSync(item.targetFile).mode;
        fs.chmodSync(item.targetFile, expectedMode === 0o100 ? currentMode | 0o100 : currentMode & ~0o100);
      }
      changed.push(item.targetFile);
    }
  };
  try {
    for (const item of plan.writes.filter((write: any) => write.commitLast !== true)) reconcileWrite(item);
    for (const nativeAsset of plan.nativeAssets) {
      const item = typeof nativeAsset === 'string' ? { targetFile: nativeAsset, source: nativeAsset } : nativeAsset;
      const status = fs.existsSync(item.targetFile) ? 'ok' : 'missing';
      findings.push(diagnosticFinding(item, status, plan));
    }
    const reconcileRemoval = (removal: any) => {
      const item = typeof removal === 'string' ? { targetFile: removal } : removal;
      if (conflicts.includes(item)) return;
      if (!fs.existsSync(item.targetFile)) return;
      if (item.isManaged && !item.isManaged(item.type === 'directory' ? null : fs.readFileSync(item.targetFile, 'utf8'))) return;
      findings.push(diagnosticFinding(item, 'orphan', plan));
      if (!compareOnly) {
        fs.rmSync(item.targetFile, { recursive: item.type === 'directory', force: true });
        removed.push(item.targetFile);
        if (item.pruneEmptyRoot) {
          const root = path.resolve(item.pruneEmptyRoot);
          let current = path.dirname(path.resolve(item.targetFile));
          while ((current === root || current.startsWith(`${root}${path.sep}`)) && current !== path.dirname(root)) {
            if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
            fs.rmdirSync(current);
            if (current === root) break;
            current = path.dirname(current);
          }
        }
      }
    };
    for (const removal of plan.removals.filter((item: any) => typeof item === 'string' || item.removeLast !== true)) reconcileRemoval(removal);
    for (const item of plan.writes.filter((write: any) => write.commitLast === true)) reconcileWrite(item);
    for (const removal of plan.removals.filter((item: any) => typeof item !== 'string' && item.removeLast === true)) reconcileRemoval(removal);
    return { targetRoot: plan.targetRoot, adapterId: plan.adapterId, scope: plan.scope, changed, removed, findings, repairs: plan.repairs, warnings: plan.warnings, ruleActions: plan.ruleActions };
  } catch (error: any) {
    rollback?.restore();
    throw error;
  } finally {
    rollback?.cleanup();
  }
}
