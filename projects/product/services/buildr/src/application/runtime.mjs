import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from '../infrastructure/process.mjs';
import { resolveRuleScope } from '../infrastructure/runtime/render-claude-code-rules.mjs';
import { assembleRuntimeProjection } from '../infrastructure/runtime/projection.mjs';
import { getRuntimeAdapter, reconcileRuntimePlan } from '../infrastructure/runtime/adapter-contract.mjs';
import { buildEffectiveSkillInventory, classifySkillCandidate } from '../infrastructure/runtime/skills/inventory.mjs';
import { parseSkillProjectionReceipt, sha256Integrity } from '../infrastructure/runtime/skills/projection-files.mjs';
import { createRuntimePlan } from '../infrastructure/runtime/adapter-contract.mjs';
import { observeGitCheckoutIdentity } from '../infrastructure/git/checkout-identity.mjs';

export function registerApplicationRuntime(runtime) {
  const syncPackageBuiltins = (...args) => runtime.syncPackageBuiltins(...args);
  const doctor = (...args) => runtime.doctor(...args);
  const syncPackageComponents = (...args) => runtime.syncPackageComponents(...args);
  const buildRuntimeOrphanRemovalPlan = (...args) => runtime.buildRuntimeOrphanRemovalPlan(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const withResolvedTarget = (...args) => runtime.withResolvedTarget(...args);
  const skillScopeForRuleScope = (...args) => runtime.skillScopeForRuleScope(...args);
  const withWorkspaceMutation = (...args) => runtime.withWorkspaceMutation(...args);
  const assertSafeSyncMutationPaths = (...args) => runtime.assertSafeSyncMutationPaths(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);
  const workspaceMigrationPlan = (...args) => runtime.workspaceMigrationPlan(...args);
  const migrateWorkspaceMetadata = (...args) => runtime.migrateWorkspaceMetadata(...args);
  const projectMigrationPlan = (...args) => runtime.projectMigrationPlan(...args);
  const migrateProjectRegistry = (...args) => runtime.migrateProjectRegistry(...args);

  function pathIsWithin(root, candidate) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  }

  function assertRuntimeProjectionTarget(targetRoot, options = {}) {
    const source = observeGitCheckoutIdentity(productRoot());
    if (!source?.linkedWorktree) return { source, target: observeGitCheckoutIdentity(targetRoot) };
    if (options.destination === 'user' && (!options.runtimeTargetRoot || !pathIsWithin(targetRoot, options.runtimeTargetRoot))) {
      const error = new Error('候选 Product checkout 不能更新共享的用户级 Agent runtime；请使用自身任务验证 Workspace。');
      error.code = 'runtime.candidate_shared_target';
      error.details = { source: source.checkoutRoot, target: options.runtimeTargetRoot || 'user' };
      throw error;
    }
    const target = observeGitCheckoutIdentity(targetRoot);
    if (target && source.gitCommonDirectory === target.gitCommonDirectory && source.checkoutRoot !== target.checkoutRoot) {
      const error = new Error('候选 Product checkout 只能渲染自己的任务验证 Workspace；不能更新 retained Workspace 或另一个 task worktree 的 Agent runtime。');
      error.code = 'runtime.candidate_cross_checkout_target';
      error.details = { source: source.checkoutRoot, target: target.checkoutRoot };
      throw error;
    }
    return { source, target };
  }

  function renderRuntime(agent, args, options = {}) {
    const renderArgs = [...args];
    if (!renderArgs.includes('--scope')) {
      renderArgs.push('--scope', '.');
    }
    const renderCommand = withResolvedTarget(renderArgs);
    const { targetRoot } = renderCommand;
    assertRuntimeProjectionTarget(targetRoot);
    const requestedScope = optionValue(renderCommand.args, '--scope', '.');
    const scopeInfo = resolveRuleScope(targetRoot, requestedScope);
    const skillScope = skillScopeForRuleScope(scopeInfo.scope);
    const removals = buildRuntimeOrphanRemovalPlan(targetRoot, agent, skillScope).map((item) => ({ ...item, targetFile: item.path }));
    const { plan } = assembleRuntimeProjection({ repoRoot: targetRoot, targetRoot, scope: scopeInfo.scope, adapterId: agent, selection: { productSkill: options.productSkill === true, rules: true, workspaceSkills: true }, removals });
    reconcileRuntimePlan(plan);
    return { targetRoot, files: [...plan.writes.map((item) => item.targetFile), ...plan.removals.map((item) => item.targetFile)], rulesActions: plan.ruleActions, warnings: plan.warnings, scope: scopeInfo.scope };
  }

  function renderSkillsRuntime(agent, args) {
    const renderCommand = withResolvedTarget(args);
    const skillScope = optionValue(renderCommand.args, '--scope', '.');
    const destination = optionValue(renderCommand.args, '--destination', 'workspace');
    if (!['workspace', 'user'].includes(destination)) throw new Error(`Unsupported Skill destination: ${destination}. Use workspace or user.`);
    const runtimeTargetRoot = destination === 'workspace' ? renderCommand.targetRoot : os.homedir();
    if (!runtimeTargetRoot) throw new Error(`Cannot determine user home for Skill destination ${destination}.`);
    assertRuntimeProjectionTarget(renderCommand.targetRoot, { destination, runtimeTargetRoot });
    if (skillScope !== '.') {
      const error = new Error(`Legacy Project Skill render scope is no longer supported: ${skillScope}. Run buildr skills migrate-project-assets --target ${renderCommand.targetRoot} --check, then use --destination ${destination}.`);
      error.code = 'skills.project_scope_unsupported';
      throw error;
    }
    if (args.includes('--scope')) console.error('Warning: --scope . is deprecated for skills render; use --destination workspace or --destination user.');
    const orphanPlan = destination === 'workspace' ? buildRuntimeOrphanRemovalPlan(renderCommand.targetRoot, agent, '.').map((item) => ({ ...item, targetFile: item.path })) : [];
    const assembled = assembleRuntimeProjection({ repoRoot: renderCommand.targetRoot, targetRoot: runtimeTargetRoot, scope: '.', adapterId: agent, destination, selection: { workspaceSkills: true }, removals: orphanPlan });
    let plan = assembled.plan;
    const candidates = plan.writes.filter((item) => item.kind === 'skill-projection-receipt').map((item) => {
      const receipt = parseSkillProjectionReceipt(item.content, `candidate receipt ${item.skillId}`);
      return { skillId: receipt.skillId, assetIdentity: receipt.assetIdentity, sourceIdentity: receipt.sourceIdentity, sourceWorkspaceId: receipt.sourceWorkspaceId, sourceDigest: receipt.sourceDigest, renderDigest: receipt.renderDigest };
    });
    const inventory = buildEffectiveSkillInventory({ adapterId: agent, workspaceRoot: renderCommand.targetRoot, candidateIds: candidates.map((item) => item.skillId) });
    const classifications = candidates.map((candidate) => ({ candidate, ...classifySkillCandidate(candidate, inventory, destination) }));
    const blocking = classifications.filter((item) => item.blocking);
    if (blocking.length) {
      const report = { schemaVersion: 'buildr.skill-conflict-report/v1', destination, inventoryEvidence: inventory.evidence, conflicts: blocking.map((item) => ({
        skillId: item.candidate.skillId,
        assetIdentity: item.candidate.assetIdentity,
        sourceIdentity: item.candidate.sourceIdentity,
        sourceWorkspaceId: item.candidate.sourceWorkspaceId,
        sourceDigest: item.candidate.sourceDigest,
        renderDigest: item.candidate.renderDigest,
        reason: item.status,
        provenance: item.observed.map((entry) => ({ destination: entry.destination, sourceCategory: entry.sourceCategory, sourceWorkspaceId: entry.sourceWorkspaceId, path: entry.path, receiptPath: entry.receiptPath })),
        observed: item.observed,
        nextActions: ['Rename the candidate Skill.', 'Remove or disable the external Skill explicitly.', 'Skip this projection and keep the current state.'],
      })) };
      if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return { targetRoot: runtimeTargetRoot, files: [], plan: [], warnings: [], jsonReported: true };
      }
      throw new Error(`Skill render preflight blocked with zero writes:\n${blocking.map((item) => `- ${item.candidate.skillId}: ${item.status}`).join('\n')}`);
    }
    const satisfiedIds = new Set(classifications.filter((item) => item.status === 'satisfied_by_user').map((item) => item.candidate.skillId));
    const adapter = getRuntimeAdapter(agent);
    const satisfactionFile = (skillId) => path.join(renderCommand.targetRoot, adapter.traits.skills.root, 'buildr', 'skill-satisfaction', agent, `${skillId}.json`);
    const satisfactionWrites = classifications.filter((item) => item.status === 'satisfied_by_user').map((item) => {
      const observed = item.observed[0];
      const evidence = { schemaVersion: 'buildr.skill-satisfaction/v1', agent, destination: 'workspace', skillId: item.candidate.skillId, satisfiedBy: 'user', assetIdentity: item.candidate.assetIdentity, renderDigest: item.candidate.renderDigest, userReceiptPath: observed.receiptPath };
      return { targetFile: satisfactionFile(item.candidate.skillId), content: `${JSON.stringify(evidence, null, 2)}\n`, source: `user:${item.candidate.skillId}`, skillId: item.candidate.skillId, kind: 'skill-satisfaction-evidence', isManaged: (content) => { try { return JSON.parse(content).schemaVersion === 'buildr.skill-satisfaction/v1'; } catch { return false; } } };
    });
    const satisfactionRemovals = classifications.filter((item) => item.status !== 'satisfied_by_user' && fs.existsSync(satisfactionFile(item.candidate.skillId))).map((item) => ({ targetFile: satisfactionFile(item.candidate.skillId), expectedIntegrity: sha256Integrity(fs.readFileSync(satisfactionFile(item.candidate.skillId))), source: `workspace:${item.candidate.skillId}`, skillId: item.candidate.skillId, kind: 'skill-satisfaction-stale' }));
    plan = createRuntimePlan({
      ...plan,
      writes: [...(satisfiedIds.size ? plan.writes.filter((item) => !satisfiedIds.has(item.skillId)) : plan.writes), ...satisfactionWrites],
      removals: [...(satisfiedIds.size ? plan.removals.filter((item) => !satisfiedIds.has(item.skillId)) : plan.removals), ...satisfactionRemovals],
    });
    reconcileRuntimePlan(plan);
    const files = [...plan.writes.map((item) => item.targetFile), ...plan.removals.map((item) => item.targetFile)];
    const remaining = destination === 'workspace' ? buildRuntimeOrphanRemovalPlan(renderCommand.targetRoot, agent, '.') : [];
    if (remaining.length) throw new Error(`运行时同步未完成，请重新运行 buildr skills render ${agent}。`);
    return { targetRoot: runtimeTargetRoot, files, plan: plan.writes, warnings: plan.warnings, classifications, skillInventoryEvidence: { evidence: inventory.evidence, opaqueSources: inventory.opaqueSources } };
  }

  function renderRulesRuntime(agent, args) {
    const renderCommand = withResolvedTarget(args);
    assertRuntimeProjectionTarget(renderCommand.targetRoot);
    const scope = optionValue(renderCommand.args, '--scope', '.');
    const { plan } = assembleRuntimeProjection({ repoRoot: renderCommand.targetRoot, targetRoot: renderCommand.targetRoot, scope, adapterId: agent, selection: { rules: true } });
    reconcileRuntimePlan(plan);
    return { targetRoot: renderCommand.targetRoot, files: plan.writes.map((item) => item.targetFile), actions: plan.ruleActions, warnings: plan.warnings };
  }

  function replacementRuntimePreflight(targetRoot, agent, findings) {
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const conflicts = [];
    for (const finding of findings.filter((item) => item.replacementFrom && ['installed', 'uninstalled'].includes(item.status))) {
      try {
        buildRuntimeOrphanRemovalPlan(targetRoot, agent, '.', { runtimePath: finding.predecessorRuntimePath });
      } catch (error) {
        conflicts.push({
          type: 'runtime', id: finding.id, status: 'modified', path: finding.predecessorRuntimePath,
          replacementFrom: finding.replacementFrom, reason: error.message,
        });
      }
      const targetDir = path.join(targetRoot, runtimeRoot, 'skills', ...finding.replacementRuntimePath.split('/'));
      const targetReceipt = path.join(targetRoot, runtimeRoot, 'buildr', 'skill-projection-receipts', agent, `${finding.replacementRuntimePath}.json`);
      if (fs.existsSync(targetDir) || fs.existsSync(targetReceipt)) {
        conflicts.push({
          type: 'runtime', id: finding.id, status: 'modified', path: finding.replacementRuntimePath,
          replacementFrom: finding.replacementFrom, reason: 'replacement runtime target already exists',
        });
      }
    }
    return conflicts;
  }

  function buildSyncSourcePlan(targetRoot, agent) {
    const workspace = workspaceMigrationPlan(targetRoot);
    const projects = projectMigrationPlan(targetRoot);
    const builtins = syncPackageBuiltins(targetRoot, { checkOnly: true });
    const components = syncPackageComponents(targetRoot, { checkOnly: true });
    const affectedPaths = assertSafeSyncMutationPaths(targetRoot, [...workspace.affectedPaths, ...projects.affectedPaths, ...builtins.affectedPaths, ...components.affectedPaths]);
    const needsDecision = [
      ...builtins.findings.filter((finding) => !finding.component && !finding.required && !finding.converge && ['modified', 'missing'].includes(finding.status)),
      ...replacementRuntimePreflight(targetRoot, agent, builtins.findings),
    ];
    return {
      builtins,
      components,
      workspace,
      projects,
      affectedPaths,
      needsDecision,
      signature: JSON.stringify({ workspace: workspace.signature, projects: projects.signature, builtins: builtins.signature, components: components.signature }),
    };
  }

  function assertSyncSourcePlanReady(plan) {
    if (plan.components.errors.length) {
      throw new Error(`sync 暂停：Component 源资产存在冲突。\n- ${plan.components.errors.map((item) => item.error).join('\n- ')}`);
    }
    if (plan.needsDecision.length) {
      throw new Error(`sync 暂停：以下 optional Buildr 内置能力需要用户决策。\n- ${plan.needsDecision.map((item) => `${item.type}:${item.id} (${item.status})`).join('\n- ')}`);
    }
  }

  function assertEnvironmentMigrationReady(migration) {
    if (migration?.status !== 'blocked') return;
    const conflicts = migration.entries.filter((entry) => entry.classification === 'D').map((entry) => `${entry.taskId}: ${entry.reason}`);
    throw new Error(`sync 暂停：旧 Task Environment authority 无法安全迁移。${conflicts.length ? `\n- ${conflicts.join('\n- ')}` : `\n- ${migration.diagnostic?.message || '检查 migration evidence。'}`}`);
  }

  function syncRuntime(agent, args) {
    const adapter = getRuntimeAdapter(agent);
    const syncArgs = [...args];
    if (!syncArgs.includes('--scope')) syncArgs.push('--scope', '.');
    const targetRoot = path.resolve(optionValue(syncArgs, '--target', process.cwd()));
    assertRuntimeProjectionTarget(targetRoot);
    assertInitializedBuildrWorkspace(targetRoot);
    const environmentMigrationPlan = runtime.migrateLegacyTaskEnvironments?.(targetRoot, { apply: false }) || null;
    assertEnvironmentMigrationReady(environmentMigrationPlan);
    const preflight = buildSyncSourcePlan(targetRoot, agent);
    assertSyncSourcePlanReady(preflight);
    const environmentMigration = runtime.migrateLegacyTaskEnvironments?.(targetRoot, { apply: true }) || null;
    assertEnvironmentMigrationReady(environmentMigration);
    let lockedPlan = null;
    const updated = withWorkspaceMutation(targetRoot, `buildr.sync:${agent}`, preflight.affectedPaths, () => {
      const workspaceMigration = migrateWorkspaceMetadata(targetRoot);
      const projectMigration = migrateProjectRegistry(targetRoot);
      const sourceUpdate = syncPackageBuiltins(targetRoot);
      const components = syncPackageComponents(targetRoot, { plans: lockedPlan.components.plans });
      if (components.errors.length) {
        throw new Error(`sync 暂停：Component 源资产存在冲突。\n- ${components.errors.map((item) => item.error).join('\n- ')}`);
      }
      const needsDecision = sourceUpdate.findings.filter((finding) => !finding.component && !finding.required && !finding.converge && ['modified', 'missing'].includes(finding.status));
      if (needsDecision.length) {
        throw new Error(`sync 暂停：以下 optional Buildr 内置能力需要用户决策。\n- ${needsDecision.map((item) => `${item.type}:${item.id} (${item.status})`).join('\n- ')}`);
      }
      sourceUpdate.changed.push(...components.changed);
      sourceUpdate.changed.unshift(...workspaceMigration.changed);
      sourceUpdate.changed.unshift(...projectMigration.changed);
      return sourceUpdate;
    }, {
      preSnapshot() {
        lockedPlan = buildSyncSourcePlan(targetRoot, agent);
        assertSyncSourcePlanReady(lockedPlan);
        if (lockedPlan.signature !== preflight.signature) throw new Error('sync source plan changed after preflight; rerun sync against the current workspace state.');
      },
    });
    const workspaceRecord = runtime.readWorkspaceRecord(targetRoot);
    const canAdoptCurrentNode = workspaceRecord.workspace.runtime?.node?.version === process.versions.node;
    const workspaceNode = runtime.ensureWorkspaceNodeRuntime(workspaceRecord.workspace, { adoptCurrent: canAdoptCurrentNode });
    const rendered = renderRuntime(agent, syncArgs, { productSkill: true });
    const doctorResult = spawnSync(process.execPath, [path.join(productRoot(), 'bin', 'buildr.mjs'), 'doctor', '--agent', agent, '--target', targetRoot, '--json'], {
      cwd: productRoot(),
      encoding: 'utf8',
    });
    console.log(`已同步 Buildr 到 ${agent}：${targetRoot}`);
    if (environmentMigration?.status === 'migrated' && environmentMigration.counts.total > 0) console.log(`Task Environment 迁移：A=${environmentMigration.counts.A} B=${environmentMigration.counts.B} C=${environmentMigration.counts.C} D=${environmentMigration.counts.D}`);
    console.log(`Workspace Node：${workspaceNode.identity.version}（${workspaceNode.action}）`);
    if (updated.changed.length > 0) {
      console.log('产品能力变更：');
      for (const file of updated.changed) console.log(`  ${file}`);
    }
    if (rendered.files.length > 0) {
      console.log('runtime 渲染：');
      const ruleTargets = new Set(rendered.rulesActions.map((item) => item.targetFile));
      for (const item of rendered.rulesActions) console.log(`  [${item.action}] ${toPosixRelative(targetRoot, item.targetFile)}`);
      for (const file of rendered.files) {
        if (!ruleTargets.has(file)) console.log(`  ${toPosixRelative(targetRoot, file)}`);
      }
    }
    for (const warning of rendered.warnings) console.error(`Warning: ${warning}`);
    if (doctorResult.status !== 0) {
      console.log('doctor 仍有需要处理的问题：');
      process.stdout.write(doctorResult.stdout || '');
      process.stderr.write(doctorResult.stderr || '');
      throw new Error(`${agent} sync 未完成：最终 doctor 未通过。`);
    }
    console.log('doctor 通过。');
  }

  Object.assign(runtime, { assertRuntimeProjectionTarget, renderRuntime, renderSkillsRuntime, renderRulesRuntime, buildSyncSourcePlan, assertSyncSourcePlanReady, syncRuntime });
  return runtime;
}
