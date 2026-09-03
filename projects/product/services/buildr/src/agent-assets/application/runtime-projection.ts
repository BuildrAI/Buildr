import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { runFinalDoctor } from '../../infrastructure/final-doctor-process.ts';

export function blockingSyncSourceIssues(plan: any): any  {
  return (plan?.components?.errors || []).filter((item: any) => item.required === true);
}
import { resolveRuleScope } from '../infrastructure/runtime/render-claude-code-rules.ts';
import { assembleRuntimeProjection } from '../infrastructure/runtime/projection.ts';
import { getRuntimeAdapter, reconcileRuntimePlan } from '../infrastructure/runtime/adapter-contract.ts';
import { buildEffectiveSkillInventory, classifySkillCandidate } from '../infrastructure/runtime/skills/inventory.ts';
import {
  legacySkillProjectionOwnershipReceiptTarget,
  parseSkillProjectionReceipt,
  sha256Integrity,
  skillProjectionOwnershipReceiptTarget,
} from '../infrastructure/runtime/skills/projection-files.ts';
import { createRuntimePlan } from '../infrastructure/runtime/adapter-contract.ts';
import { observeGitCheckoutIdentity, sameFilesystemPath } from '../../infrastructure/git/checkout-identity.ts';

export function registerApplicationRuntime(runtime: any): any  {
  const syncPackageBuiltins = (...args: any[]) => runtime.syncPackageBuiltins(...args);
  const doctor = (...args: any[]) => runtime.doctor(...args);
  const syncPackageComponents = (...args: any[]) => runtime.syncPackageComponents(...args);
  const buildRuntimeOrphanRemovalPlan = (...args: any[]) => runtime.buildRuntimeOrphanRemovalPlan(...args);
  const optionValue = (...args: any[]) => runtime.optionValue(...args);
  const withResolvedTarget = (...args: any[]) => runtime.withResolvedTarget(...args);
  const skillScopeForRuleScope = (...args: any[]) => runtime.skillScopeForRuleScope(...args);
  const withWorkspaceMutation = (...args: any[]) => runtime.withWorkspaceMutation(...args);
  const assertSafeSyncMutationPaths = (...args: any[]) => runtime.assertSafeSyncMutationPaths(...args);
  const productRoot = (...args: any[]) => runtime.productRoot(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const assertInitializedBuildrWorkspace = (...args: any[]) => runtime.assertInitializedBuildrWorkspace(...args);
  const workspaceMigrationPlan = (...args: any[]) => runtime.workspaceMigrationPlan(...args);
  const migrateWorkspaceMetadata = (...args: any[]) => runtime.migrateWorkspaceMetadata(...args);
  const openWorkspaceStructuredStore = (...args: any[]) => runtime.openWorkspaceStructuredStore(...args);
  const workspaceStructuredStorePath = (...args: any[]) => runtime.workspaceStructuredStorePath(...args);
  const projectMigrationPlan = (...args: any[]) => runtime.projectMigrationPlan(...args);
  const migrateProjectRegistry = (...args: any[]) => runtime.migrateProjectRegistry(...args);

  function pathIsWithin(root: any, candidate: any): any  {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  }

  function assertRuntimeProjectionTarget(targetRoot: any, options: any = {}): any  {
    const source = observeGitCheckoutIdentity(productRoot());
    if (!source?.linkedWorktree) return { source, target: observeGitCheckoutIdentity(targetRoot) };
    if (options.destination === 'user' && (!options.runtimeTargetRoot || !pathIsWithin(targetRoot, options.runtimeTargetRoot))) {
      const error: Error & Record<string, any> = new Error('候选 Product checkout 不能更新共享的用户级 Agent runtime；请使用自身任务验证 Workspace。');
      error.code = 'runtime.candidate_shared_target';
      error.details = { source: source.checkoutRoot, target: options.runtimeTargetRoot || 'user' };
      throw error;
    }
    const target = observeGitCheckoutIdentity(targetRoot);
    if (target && sameFilesystemPath(source.gitCommonDirectory, target.gitCommonDirectory) && !sameFilesystemPath(source.checkoutRoot, target.checkoutRoot)) {
      const error: Error & Record<string, any> = new Error('候选 Product checkout 只能渲染自己的任务验证 Workspace；不能更新 retained Workspace 或另一个 task worktree 的 Agent runtime。');
      error.code = 'runtime.candidate_cross_checkout_target';
      error.details = { source: source.checkoutRoot, target: target.checkoutRoot };
      throw error;
    }
    return { source, target };
  }

  function assertRuntimeSyncTarget(targetRoot: any, agent: any): any  {
    const authority = assertRuntimeProjectionTarget(targetRoot);
    if (!authority.source?.linkedWorktree || !authority.target || !sameFilesystemPath(authority.source.checkoutRoot, authority.target.checkoutRoot)) {
      return { ...authority, disposition: 'full-sync' };
    }
    const command = `buildr render ${agent} --product-skill --target ${authority.target.checkoutRoot}`;
    return {
      ...authority,
      disposition: 'projection-only',
      diagnostic: [
        '候选 Product checkout 的 sync 已安全收敛为 projection-only；未迁移 Workspace store，也未同步 package builtin/Component 源资产。',
        `Source: ${authority.source.checkoutRoot}`,
        `Target: ${authority.target.checkoutRoot}`,
        `后续请直接使用：${command}`,
        '需要验证完整 sync：改用不属于同一 Git common-dir checkout 的独立验证 Workspace。',
      ].join('\n'),
      projectionCommand: command,
    };
  }

  function renderRuntime(agent: any, args: any, options: any = {}): any  {
    const renderArgs: any[] = [...args];
    if (!renderArgs.includes('--scope')) {
      renderArgs.push('--scope', '.');
    }
    const renderCommand = withResolvedTarget(renderArgs);
    const { targetRoot } = renderCommand;
    assertRuntimeProjectionTarget(targetRoot);
    const requestedScope = optionValue(renderCommand.args, '--scope', '.');
    const scopeInfo = resolveRuleScope(targetRoot, requestedScope);
    const skillScope = skillScopeForRuleScope(scopeInfo.scope);
    const removals = buildRuntimeOrphanRemovalPlan(targetRoot, agent, skillScope).map((item: any) => ({ ...item, targetFile: item.path }));
    const { plan } = assembleRuntimeProjection({ repoRoot: targetRoot, targetRoot, scope: scopeInfo.scope, adapterId: agent, selection: { productSkill: options.productSkill === true, rules: true, workspaceSkills: true }, removals });
    reconcileRuntimePlan(plan);
    return { targetRoot, files: [...plan.writes.map((item: any) => item.targetFile), ...plan.removals.map((item: any) => item.targetFile)], rulesActions: plan.ruleActions, warnings: plan.warnings, scope: scopeInfo.scope };
  }

  function renderSkillsRuntime(agent: any, args: any): any  {
    const renderCommand = withResolvedTarget(args);
    const skillScope = optionValue(renderCommand.args, '--scope', '.');
    const destination = optionValue(renderCommand.args, '--destination', 'workspace');
    if (!['workspace', 'user'].includes(destination)) throw new Error(`Unsupported Skill destination: ${destination}. Use workspace or user.`);
    const runtimeTargetRoot = destination === 'workspace' ? renderCommand.targetRoot : os.homedir();
    if (!runtimeTargetRoot) throw new Error(`Cannot determine user home for Skill destination ${destination}.`);
    assertRuntimeProjectionTarget(renderCommand.targetRoot, { destination, runtimeTargetRoot });
    if (skillScope !== '.') {
      const error: Error & Record<string, any> = new Error(`Legacy Project Skill render scope is no longer supported: ${skillScope}. This Buildr version does not migrate Project Skill sources; review and move the source to workspace skills/ before using --destination ${destination}.`);
      error.code = 'skills.project_scope_unsupported';
      error.nextActions = ['Review the legacy Project Skill source without modifying it.', `buildr skills render ${agent} --destination ${destination} --target ${renderCommand.targetRoot}`];
      throw error;
    }
    if (args.includes('--scope')) console.error('Warning: --scope . is deprecated for skills render; use --destination workspace or --destination user.');
    const orphanPlan = destination === 'workspace' ? buildRuntimeOrphanRemovalPlan(renderCommand.targetRoot, agent, '.').map((item: any) => ({ ...item, targetFile: item.path })) : [];
    const assembled = assembleRuntimeProjection({ repoRoot: renderCommand.targetRoot, targetRoot: runtimeTargetRoot, scope: '.', adapterId: agent, destination, selection: { workspaceSkills: true }, removals: orphanPlan });
    let plan = assembled.plan;
    const candidates = plan.writes.filter((item: any) => item.kind === 'skill-projection-receipt').map((item: any) => {
      const receipt = parseSkillProjectionReceipt(item.content, `candidate receipt ${item.skillId}`);
      return { skillId: receipt.skillId, assetIdentity: receipt.assetIdentity, sourceIdentity: receipt.sourceIdentity, sourceWorkspaceId: receipt.sourceWorkspaceId, sourceDigest: receipt.sourceDigest, renderDigest: receipt.renderDigest };
    });
    const inventory = buildEffectiveSkillInventory({ adapterId: agent, workspaceRoot: renderCommand.targetRoot, candidateIds: candidates.map((item: any) => item.skillId) });
    const classifications = candidates.map((candidate: any) => ({ candidate, ...classifySkillCandidate(candidate, inventory, destination) }));
    const blocking = classifications.filter((item: any) => item.blocking);
    if (blocking.length) {
      const report: any = { schemaVersion: 'buildr.skill-conflict-report/v1', destination, inventoryEvidence: inventory.evidence, conflicts: blocking.map((item: any) => ({
        skillId: item.candidate.skillId,
        assetIdentity: item.candidate.assetIdentity,
        sourceIdentity: item.candidate.sourceIdentity,
        sourceWorkspaceId: item.candidate.sourceWorkspaceId,
        sourceDigest: item.candidate.sourceDigest,
        renderDigest: item.candidate.renderDigest,
        reason: item.status,
        provenance: item.observed.map((entry: any) => ({ destination: entry.destination, sourceCategory: entry.sourceCategory, sourceWorkspaceId: entry.sourceWorkspaceId, path: entry.path, receiptPath: entry.receiptPath })),
        observed: item.observed,
        nextActions: ['Rename the candidate Skill.', 'Remove or disable the external Skill explicitly.', 'Skip this projection and keep the current state.'],
      })) };
      if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return { targetRoot: runtimeTargetRoot, files: [], plan: [], warnings: [], jsonReported: true };
      }
      throw new Error(`Skill render preflight blocked with zero writes:\n${blocking.map((item: any) => `- ${item.candidate.skillId}: ${item.status}`).join('\n')}`);
    }
    const satisfiedIds: any = new Set(classifications.filter((item: any) => item.status === 'satisfied_by_user').map((item: any) => item.candidate.skillId));
    const adapter = getRuntimeAdapter(agent);
    const satisfactionFile = (skillId: any) => path.join(renderCommand.targetRoot, adapter.traits.skills.root, 'buildr', 'skill-satisfaction', agent, `${skillId}.json`);
    const satisfactionWrites = classifications.filter((item: any) => item.status === 'satisfied_by_user').map((item: any) => {
      const observed = item.observed[0];
      const evidence: any = { schemaVersion: 'buildr.skill-satisfaction/v1', agent, destination: 'workspace', skillId: item.candidate.skillId, satisfiedBy: 'user', assetIdentity: item.candidate.assetIdentity, renderDigest: item.candidate.renderDigest, userReceiptPath: observed.receiptPath };
      return { targetFile: satisfactionFile(item.candidate.skillId), content: `${JSON.stringify(evidence, null, 2)}\n`, source: `user:${item.candidate.skillId}`, skillId: item.candidate.skillId, kind: 'skill-satisfaction-evidence', isManaged: (content: any) => { try { return JSON.parse(content).schemaVersion === 'buildr.skill-satisfaction/v1'; } catch { return false; } } };
    });
    const satisfactionRemovals = classifications.filter((item: any) => item.status !== 'satisfied_by_user' && fs.existsSync(satisfactionFile(item.candidate.skillId))).map((item: any) => ({ targetFile: satisfactionFile(item.candidate.skillId), expectedIntegrity: sha256Integrity(fs.readFileSync(satisfactionFile(item.candidate.skillId))), source: `workspace:${item.candidate.skillId}`, skillId: item.candidate.skillId, kind: 'skill-satisfaction-stale' }));
    plan = createRuntimePlan({
      ...plan,
      writes: [...(satisfiedIds.size ? plan.writes.filter((item: any) => !satisfiedIds.has(item.skillId)) : plan.writes), ...satisfactionWrites],
      removals: [...(satisfiedIds.size ? plan.removals.filter((item: any) => !satisfiedIds.has(item.skillId)) : plan.removals), ...satisfactionRemovals],
    });
    reconcileRuntimePlan(plan);
    const files: any[] = [...plan.writes.map((item: any) => item.targetFile), ...plan.removals.map((item: any) => item.targetFile)];
    const remaining = destination === 'workspace' ? buildRuntimeOrphanRemovalPlan(renderCommand.targetRoot, agent, '.') : [];
    if (remaining.length) throw new Error(`运行时同步未完成，请重新运行 buildr skills render ${agent}。`);
    return { targetRoot: runtimeTargetRoot, files, plan: plan.writes, warnings: plan.warnings, classifications, skillInventoryEvidence: { evidence: inventory.evidence, opaqueSources: inventory.opaqueSources } };
  }

  function renderRulesRuntime(agent: any, args: any): any  {
    const renderCommand = withResolvedTarget(args);
    assertRuntimeProjectionTarget(renderCommand.targetRoot);
    const scope = optionValue(renderCommand.args, '--scope', '.');
    const { plan } = assembleRuntimeProjection({ repoRoot: renderCommand.targetRoot, targetRoot: renderCommand.targetRoot, scope, adapterId: agent, selection: { rules: true } });
    reconcileRuntimePlan(plan);
    return { targetRoot: renderCommand.targetRoot, files: plan.writes.map((item: any) => item.targetFile), actions: plan.ruleActions, warnings: plan.warnings };
  }

  function replacementRuntimePreflight(targetRoot: any, agent: any, findings: any): any  {
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const conflicts: any[] = [];
    for (const finding of findings.filter((item: any) => item.replacementFrom && ['installed', 'uninstalled'].includes(item.status))) {
      try {
        buildRuntimeOrphanRemovalPlan(targetRoot, agent, '.', { runtimePath: finding.predecessorRuntimePath });
      } catch (error: any) {
        conflicts.push({
          type: 'runtime', id: finding.id, status: 'modified', path: finding.predecessorRuntimePath,
          replacementFrom: finding.replacementFrom, reason: error.message,
        });
      }
      const targetDir = path.join(targetRoot, runtimeRoot, 'skills', ...finding.replacementRuntimePath.split('/'));
      const targetReceipts: any[] = [
        skillProjectionOwnershipReceiptTarget(targetRoot, 'workspace', agent, finding.replacementRuntimePath),
        legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, agent, finding.replacementRuntimePath),
      ];
      if (fs.existsSync(targetDir) || targetReceipts.some((file: any) => fs.existsSync(file))) {
        conflicts.push({
          type: 'runtime', id: finding.id, status: 'modified', path: finding.replacementRuntimePath,
          replacementFrom: finding.replacementFrom, reason: 'replacement runtime target already exists',
        });
      }
    }
    return conflicts;
  }

  function buildSyncSourcePlan(targetRoot: any, agent: any): any  {
    const workspace = workspaceMigrationPlan(targetRoot);
    const projects = projectMigrationPlan(targetRoot);
    const builtins = syncPackageBuiltins(targetRoot, { checkOnly: true });
    const components = syncPackageComponents(targetRoot, { checkOnly: true });
    const affectedPaths = assertSafeSyncMutationPaths(targetRoot, [...workspace.affectedPaths, ...projects.affectedPaths, ...builtins.affectedPaths, ...components.affectedPaths]);
    const needsDecision: any[] = [
      ...builtins.findings.filter((finding: any) => !finding.component && !finding.required && !finding.converge && ['modified', 'missing'].includes(finding.status)),
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

  function assertSyncSourcePlanReady(plan: any): any  {
    const requiredErrors = blockingSyncSourceIssues(plan);
    if (requiredErrors.length) {
      throw new Error(`sync 暂停：required Component 源资产存在冲突。\n- ${requiredErrors.map((item: any) => item.error).join('\n- ')}`);
    }
  }

  function migrateWorkspaceStructuredStore(targetRoot: any): any  {
    const file = workspaceStructuredStorePath(targetRoot);
    if (!fs.existsSync(file)) return { status: 'uninitialized', file, migrations: [] };
    const opened = openWorkspaceStructuredStore(targetRoot, { writable: true });
    try {
      const applied = opened.database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row: any) => ({ version: row.version, name: row.name }));
      return { status: 'current', file: opened.file, version: opened.version, migrations: applied };
    } finally {
      opened.database.close();
    }
  }

  function syncRuntime(agent: any, args: any): any  {
    const adapter = getRuntimeAdapter(agent);
    const syncArgs: any[] = [...args];
    if (!syncArgs.includes('--scope')) syncArgs.push('--scope', '.');
    const targetRoot = path.resolve(optionValue(syncArgs, '--target', process.cwd()));
    const authority = assertRuntimeSyncTarget(targetRoot, agent);
    if (authority.disposition === 'projection-only') {
      const rendered = runtime.renderRuntime(agent, syncArgs, { productSkill: true });
      console.warn(authority.diagnostic);
      if (rendered.files.length > 0) {
        const ruleTargets: any = new Set(rendered.rulesActions.map((item: any) => item.targetFile));
        for (const item of rendered.rulesActions) console.log(`[${item.action}] ${toPosixRelative(targetRoot, item.targetFile)}`);
        for (const file of rendered.files) if (!ruleTargets.has(file)) console.log(toPosixRelative(targetRoot, file));
      }
      for (const warning of rendered.warnings) console.error(`Warning: ${warning}`);
      return;
    }
    assertInitializedBuildrWorkspace(targetRoot);
    const preflight = buildSyncSourcePlan(targetRoot, agent);
    assertSyncSourcePlanReady(preflight);
    const structuredStoreMigration = migrateWorkspaceStructuredStore(targetRoot);
    let lockedPlan: any = null;
    const updated = withWorkspaceMutation(targetRoot, `buildr.sync:${agent}`, preflight.affectedPaths, () => {
      const workspaceMigration = migrateWorkspaceMetadata(targetRoot);
      const projectMigration = migrateProjectRegistry(targetRoot);
      const sourceUpdate = syncPackageBuiltins(targetRoot);
      const components = syncPackageComponents(targetRoot, { plans: lockedPlan.components.plans, preparedFindings: lockedPlan.components.findings, strictPreparedPlans: true });
      const requiredErrors = components.errors.filter((item: any) => item.required === true);
      if (requiredErrors.length) throw new Error(`sync 暂停：required Component 源资产存在冲突。\n- ${requiredErrors.map((item: any) => item.error).join('\n- ')}`);
      sourceUpdate.changed.push(...components.changed);
      sourceUpdate.findings.push(...components.findings.filter((item: any) => item.status === 'blocked').map((item: any) => ({ type: 'component', ...item, ownershipUnit: `component:${item.id}` })));
      sourceUpdate.changed.unshift(...workspaceMigration.changed);
      sourceUpdate.changed.unshift(...projectMigration.changed);
      return sourceUpdate;
    }, {
      preSnapshot(): any  {
        lockedPlan = buildSyncSourcePlan(targetRoot, agent);
        assertSyncSourcePlanReady(lockedPlan);
        if (lockedPlan.signature !== preflight.signature) throw new Error('sync source plan changed after preflight; rerun sync against the current workspace state.');
      },
    });
    const rendered = renderRuntime(agent, syncArgs, { productSkill: true });
    const productInvocation = runtime.currentProductInvocation();
    const finalDoctor = (runFinalDoctor as any)({
      invocation: productInvocation,
      agent,
      targetRoot,
      cwd: productRoot(),
    });
    console.log(`已同步 Buildr 到 ${agent}：${targetRoot}`);
    if (structuredStoreMigration.migrations.length > 0) console.log(`Workspace structured store：已确认 migration 0000-${String(structuredStoreMigration.migrations.at(-1).version).padStart(4, '0')}。`);
    if (updated.changed.length > 0) {
      console.log('产品能力变更：');
      for (const file of updated.changed) console.log(`  ${file}`);
    }
    for (const finding of updated.findings.filter((item: any) => item.required !== true && ['blocked', 'modified', 'missing'].includes(item.status))) {
      console.error(`Warning: optional ownership unit ${finding.ownershipUnit || `${finding.type}:${finding.id}`} 保持原样：${finding.error || finding.status}`);
    }
    if (rendered.files.length > 0) {
      console.log('runtime 渲染：');
      const ruleTargets: any = new Set(rendered.rulesActions.map((item: any) => item.targetFile));
      for (const item of rendered.rulesActions) console.log(`  [${item.action}] ${toPosixRelative(targetRoot, item.targetFile)}`);
      for (const file of rendered.files) {
        if (!ruleTargets.has(file)) console.log(`  ${toPosixRelative(targetRoot, file)}`);
      }
    }
    for (const warning of rendered.warnings) console.error(`Warning: ${warning}`);
    if (finalDoctor.classification.status !== 'passed') {
      const detail = finalDoctor.classification.diagnostic ? `\n${finalDoctor.classification.diagnostic}` : '';
      throw new Error(`${agent} sync 未完成：${finalDoctor.classification.message}${detail}`);
    }
    console.log('doctor 通过。');
  }

  Object.assign(runtime, { assertRuntimeProjectionTarget, assertRuntimeSyncTarget, renderRuntime, renderSkillsRuntime, renderRulesRuntime, buildSyncSourcePlan, assertSyncSourcePlanReady, syncRuntime });
  return runtime;
}
