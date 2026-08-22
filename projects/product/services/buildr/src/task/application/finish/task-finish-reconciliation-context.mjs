import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { observeGitTaskContribution, observeGitTaskContributionFromRef } from './git-task-contribution.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { resolveTaskFinishTargetBranch } from './task-finish-delivery-target.mjs';
import { normalizeTaskFinishRepositorySet } from './task-finish-repository-set.mjs';

function gitText(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function samePath(left, right) {
  const canonical = (value) => {
    try { return fs.realpathSync(value); } catch { return path.resolve(value); }
  };
  return canonical(left) === canonical(right);
}

function independentGitRoot(workspaceRoot, sourcePath) {
  const candidate = path.resolve(workspaceRoot, sourcePath);
  if (!fs.existsSync(candidate)) return null;
  let real;
  try { real = fs.realpathSync(candidate); } catch { return null; }
  const top = gitText(real, ['rev-parse', '--show-toplevel']);
  return top && samePath(top, real) ? real : null;
}

function scopedRepositories(runtime, root, taskRecord, receipt) {
  const components = new Map((receipt.contentTarget?.components || []).map((item) => [item.selector, item]));
  const descriptors = [];
  const add = (selector, sourcePath, source = {}) => {
    const component = components.get(selector);
    if (!component || component.sourcePath !== sourcePath) return;
    const retainedRoot = independentGitRoot(root, sourcePath);
    if (!retainedRoot) return;
    descriptors.push({ selector, sourcePath, retainedRoot, declaredRemote: source.git?.remote || null, integrationBranch: source.git?.integrationBranch || null });
  };
  add('workspace', '.', {});
  const projects = runtime.readProjectRegistryRecord(root);
  if (projects.registry?.migrationRequired) throw Object.assign(new Error('Project registry migration is required before delivery reconciliation.'), { code: 'task_finish.reconciliation_registry_migration_required' });
  const projectCodes = new Set([...(taskRecord.scope.projects || []), ...(taskRecord.changes || []).map((item) => item.project), ...(taskRecord.scope.services || []).map((item) => item.project)]);
  for (const projectCode of projectCodes) {
    const project = projects.projects[projectCode];
    if (!project) throw Object.assign(new Error(`Task Project is unavailable: ${projectCode}.`), { code: 'task_finish.reconciliation_project_missing' });
    add(`project:${projectCode}`, project.source.path, project.source);
  }
  for (const reference of taskRecord.scope.services || []) {
    const services = runtime.readServiceRegistryRecord(root, reference.project);
    const service = services.services[reference.service];
    if (!service) throw Object.assign(new Error(`Task Service is unavailable: ${reference.project}/${reference.service}.`), { code: 'task_finish.reconciliation_service_missing' });
    add(`service:${reference.project}/${reference.service}`, service.source.path, service.source);
  }
  if (!descriptors.length) throw Object.assign(new Error('No Task-scoped Git repository matches the immutable Content Target.'), { code: 'task_finish.repository_set_missing' });
  return descriptors;
}

function sourceResolution(root, taskId, descriptor, evidence) {
  const configuredBranch = evidence?.branch || null;
  const checkoutPath = evidence?.checkoutPath || null;
  if (checkoutPath && fs.existsSync(checkoutPath)) {
    const checkoutRoot = gitText(checkoutPath, ['rev-parse', '--show-toplevel']);
    const checkoutBranch = gitText(checkoutPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (checkoutRoot && checkoutBranch && samePath(checkoutRoot, checkoutPath) && (!configuredBranch || configuredBranch === checkoutBranch)) {
      return { taskRoot: fs.realpathSync(checkoutPath), branch: checkoutBranch, sourceRef: null };
    }
  }
  const branches = (gitText(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) || '').split('\n').filter(Boolean);
  const preferred = new Set([configuredBranch, taskId, `codex/${taskId}`].filter(Boolean));
  const candidates = branches.filter((branch) => preferred.has(branch) || branch.endsWith(`/${taskId}`));
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) {
    throw Object.assign(new Error(`Task source branch is ${unique.length ? 'ambiguous' : 'unavailable'} for ${descriptor.selector}.`), {
      code: unique.length ? 'task_finish.reconciliation_source_ambiguous' : 'task_finish.reconciliation_source_missing',
      details: { selector: descriptor.selector, candidates: unique },
    });
  }
  return { taskRoot: root, branch: unique[0], sourceRef: unique[0] };
}

export function resolveTaskFinishReconciliationContext({ runtime, root, task, receipt, requestedTargetBranch = null, requestedRemote = null }) {
  const inspected = runtime.inspectTaskRecord(root, task);
  const evidence = runtime.readGitWorktreeEvidence?.(root, task, { optional: true })?.evidence || null;
  const evidenceBySelector = new Map((evidence?.repositories || []).map((item) => [item.selector, item]));
  const repositories = scopedRepositories(runtime, root, inspected.record, receipt).map((descriptor) => {
    const saved = evidenceBySelector.get(descriptor.selector) || null;
    if (saved && saved.sourcePath !== descriptor.sourcePath) throw Object.assign(new Error(`Stored Git evidence source path conflicts with registry scope: ${descriptor.selector}.`), { code: 'task_finish.reconciliation_scope_conflict' });
    const target = resolveTaskFinishTargetBranch({ root: descriptor.retainedRoot, requestedTargetBranch });
    const targetHead = gitText(descriptor.retainedRoot, ['rev-parse', `${target.targetBranch}^{commit}`]);
    if (!targetHead) throw Object.assign(new Error(`Delivery target is unavailable: ${descriptor.selector}/${target.targetBranch}.`), { code: 'task_finish.target_ref_missing' });
    const source = sourceResolution(descriptor.retainedRoot, task, descriptor, saved);
    const taskContribution = source.sourceRef
      ? observeGitTaskContributionFromRef({ root: descriptor.retainedRoot, sourceRef: source.sourceRef, deliveryBaselineHead: targetHead })
      : observeGitTaskContribution({ root: source.taskRoot, deliveryBaselineHead: targetHead });
    const disposition = taskContribution.originalBaseline.tree === taskContribution.source.tree ? 'not-applicable' : 'applicable';
    const remote = disposition === 'applicable'
      ? resolveTaskFinishDeliveryRemote({ root: descriptor.retainedRoot, targetBranch: target.targetBranch, requestedRemote, environmentRemote: saved?.remote || descriptor.declaredRemote }).remote
      : null;
    return {
      selector: descriptor.selector,
      sourcePath: descriptor.sourcePath,
      retainedRoot: descriptor.retainedRoot,
      taskRoot: source.taskRoot,
      environmentBranch: source.branch,
      targetBranch: target.targetBranch,
      remote,
      disposition,
      reason: disposition === 'not-applicable' ? 'no-contribution' : null,
      taskContribution,
    };
  });
  return {
    ready: true,
    source: 'handoff-scope-git',
    workspaceRoot: path.resolve(root),
    environmentRoot: path.resolve(root),
    validationRoot: path.resolve(root),
    repositories: normalizeTaskFinishRepositorySet(repositories),
    controller: null,
  };
}
