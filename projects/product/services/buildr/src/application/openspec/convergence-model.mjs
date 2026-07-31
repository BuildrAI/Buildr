import crypto from 'node:crypto';

export const CONVERGENCE_ALGORITHM_VERSION = 2;
export const CONVERGENCE_PLAN_SCHEMA = 'buildr.openspec-convergence-plan/v1';
export const CONVERGENCE_RECEIPT_SCHEMA = 'buildr.openspec-convergence-receipt/v3';
export const CONVERGENCE_RESULT_SCHEMA = 'buildr.openspec-convergence-result/v1';

export function normalizeConvergenceText(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n*$/, '\n');
}

export function convergenceDigest(value) {
  const serialized = typeof value === 'string' ? value : stableJson(value);
  return `sha256-${crypto.createHash('sha256').update(serialized).digest('hex')}`;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function portableExecutableIdentity({ projectRoot, executable, version, sha256 }) {
  const normalizedRoot = String(projectRoot).replaceAll('\\', '/').replace(/\/$/, '');
  const normalizedExecutable = String(executable).replaceAll('\\', '/');
  const relative = normalizedExecutable.startsWith(`${normalizedRoot}/`) ? normalizedExecutable.slice(normalizedRoot.length + 1) : null;
  return {
    sourceKind: relative ? 'project-relative' : 'external-declared',
    reference: relative || `external:${normalizedExecutable.split('/').at(-1)}`,
    version: version || null,
    sha256,
  };
}

export function convergenceIdentity({ change, project, deltaDigest, files, executableIdentity, algorithmVersion = CONVERGENCE_ALGORITHM_VERSION }) {
  return convergenceDigest({
    algorithmVersion,
    change,
    project,
    deltaDigest,
    executableIdentity,
    files: [...files].map(({ path, beforeDigest }) => ({ path, beforeDigest })).sort((a, b) => a.path.localeCompare(b.path)),
  });
}

export function convergencePlanIdentity(plan) {
  return convergenceDigest({
    schemaVersion: plan.schemaVersion,
    algorithmVersion: plan.algorithmVersion,
    convergenceIdentity: plan.convergenceIdentity,
    change: plan.change,
    project: plan.project,
    deltaDigest: plan.deltaDigest,
    status: plan.status,
    operations: plan.operations,
    blocked: plan.blocked,
    files: plan.files,
  });
}

export function createConvergenceReceipt({ plan, executableIdentity, now = new Date().toISOString() }) {
  if (plan.schemaVersion !== CONVERGENCE_PLAN_SCHEMA || convergencePlanIdentity(plan) !== plan.planIdentity) throw new Error('OpenSpec convergence plan identity is invalid.');
  return {
    schemaVersion: CONVERGENCE_RECEIPT_SCHEMA,
    algorithmVersion: plan.algorithmVersion,
    change: plan.change,
    project: plan.project,
    convergenceIdentity: plan.convergenceIdentity,
    planIdentity: plan.planIdentity,
    deltaDigest: plan.deltaDigest,
    executableIdentity,
    files: plan.files,
    operations: plan.operations,
    disposition: 'planned-not-applied',
    validation: null,
    apply: null,
    confirmation: null,
    archive: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateConvergenceReceipt(receipt) {
  if (!receipt || receipt.schemaVersion !== CONVERGENCE_RECEIPT_SCHEMA) throw new Error('Unsupported OpenSpec convergence receipt schema.');
  if (!['planned-not-applied', 'applied-and-matched', 'state-unknown', 'archived'].includes(receipt.disposition)) throw new Error('OpenSpec convergence receipt disposition is invalid.');
  const plan = {
    schemaVersion: CONVERGENCE_PLAN_SCHEMA,
    algorithmVersion: receipt.algorithmVersion,
    convergenceIdentity: receipt.convergenceIdentity,
    planIdentity: receipt.planIdentity,
    change: receipt.change,
    project: receipt.project,
    deltaDigest: receipt.deltaDigest,
    status: receipt.operations?.every((item) => item.status === 'already-applied') ? 'already-applied' : 'safe',
    operations: receipt.operations || [],
    blocked: [],
    files: receipt.files,
  };
  if (!Array.isArray(receipt.files) || receipt.files.length === 0 || convergencePlanIdentity(plan) !== receipt.planIdentity) throw new Error('OpenSpec convergence receipt plan identity is invalid.');
  for (const file of receipt.files) {
    if (convergenceDigest(normalizeConvergenceText(file.beforeContent)) !== file.beforeDigest
      || convergenceDigest(normalizeConvergenceText(file.expectedContent)) !== file.expectedDigest) {
      throw new Error(`OpenSpec convergence receipt content digest mismatch: ${file.path}`);
    }
  }
  return receipt;
}
