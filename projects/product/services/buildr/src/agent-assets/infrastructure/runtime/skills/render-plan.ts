import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_RENDER_CAPABILITIES,
  assertRuntimeTargetPath,
  createRuntimePlan,
  getRuntimeAdapter,
  reconcileRuntimePlan,
} from '../adapter-contract.ts';
import { FRONTMATTER_BOUNDARY, MANAGED_PREFIX, SKILL_CONTRIBUTION_MARKER, resolveSkillScope } from './primitives.ts';
import { capabilityBindingsForSkill, resolveSkillCapabilityGraph } from './capabilities.ts';
import { resolvePackageAgentSkill, resolveSkills } from './sources.ts';
import {
  buildCompanionWrite,
  buildSkillProjectionReceipt,
  enumerateSkillSourceFiles,
  legacySkillProjectionOwnershipReceiptRoot,
  observeSkillProjectionOwnershipReceipt,
  parseSkillProjectionReceipt,
  renderSkillProjectionReceipt,
  runtimeWriteBuffer,
  sha256Integrity,
} from './projection-files.ts';

export function hasManagedSkillMarker(content: any): any  {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.startsWith(MANAGED_PREFIX)) {
    return true;
  }
  if (lines[0] !== FRONTMATTER_BOUNDARY) {
    return false;
  }

  const endIndex = lines.findIndex((line: any, index: any) => index > 0 && line === FRONTMATTER_BOUNDARY);
  return endIndex !== -1 && lines[endIndex + 1]?.startsWith(MANAGED_PREFIX);
}

function addManagedMarker(source: any, marker: any): any  {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_BOUNDARY) {
    return `${marker}\n${source}`;
  }

  const endIndex = lines.findIndex((line: any, index: any) => index > 0 && line === FRONTMATTER_BOUNDARY);
  if (endIndex === -1) {
    return `${marker}\n${source}`;
  }

  lines.splice(endIndex + 1, 0, marker);
  return lines.join('\n');
}

function contributionBlock(contribution: any): any  {
  const identity = contribution.placement === 'slot' ? contribution.slot : contribution.placement;
  return [
    `<!-- buildr:contribution ${contribution.componentId}#${identity} -->`,
    contribution.content,
    '<!-- /buildr:contribution -->',
  ].join('\n');
}

function prependAfterFrontmatter(source: any, block: any): any  {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_BOUNDARY) return `${block}\n\n${source}`;
  const endIndex = lines.findIndex((line: any, index: any) => index > 0 && line === FRONTMATTER_BOUNDARY);
  if (endIndex === -1) throw new Error('Boundary Skill contribution requires valid closed frontmatter.');
  lines.splice(endIndex + 1, 0, '', block);
  return lines.join('\n');
}

function capabilityBindingBlock(skill: any): any  {
  const consumer = skill.capabilityBindings;
  if (!consumer) return '';
  const lines: any[] = ['<!-- buildr:capability-bindings begin -->', '## Buildr Capability Bindings', ''];
  lines.push(`Consumer readiness: \`${consumer.readiness}\`${consumer.reason ? ` (reason: \`${consumer.reason}\`)` : ''}. \`ready\` 只表示结构可路由。`, '');
  for (const dependency of consumer.dependencies) {
    const selected = dependency.selectedProvider;
    const providerPath = selected ? `${getRuntimeAdapter(skill.runtime).traits.skills.root}/skills/${selected.runtimePath}/SKILL.md` : 'unresolved';
    lines.push(`- \`${dependency.capability}@${dependency.version}\` — mode \`${dependency.mode}\`, readiness \`${dependency.readiness}\`, reason \`${dependency.reason || 'none'}\``);
    lines.push(`  - contract: \`${dependency.contract?.contractPath || 'unresolved'}\``);
    lines.push(`  - provider: \`${selected?.id || 'none'}\` → \`${providerPath}\` (scope \`${selected?.scope || 'unresolved'}\`)`);
  }
  lines.push('');
  if (consumer.readiness === 'blocked') {
    lines.push('**Safety stop:** required capability 尚未 ready。不得执行 provider-dependent action；只能解释阻塞并通过当前 workspace Doctor 获取修复动作。', '');
  } else {
    lines.push('执行 provider-dependent action 前，读取上面已解析的 contract 与 provider；成功仍由 contract 要求的授权和 result evidence 判断。', '');
  }
  lines.push('<!-- buildr:capability-bindings end -->');
  return lines.join('\n');
}

function capabilityBindingReceipt(consumer: any): any  {
  if (!consumer) return null;
  return {
    consumer: consumer.consumer,
    scope: consumer.scope,
    readiness: consumer.readiness,
    reason: consumer.reason,
    dependencies: consumer.dependencies.map((dependency: any) => ({
      capability: dependency.capability,
      version: dependency.version,
      mode: dependency.mode,
      readiness: dependency.readiness,
      reason: dependency.reason,
      contract: dependency.contract ? {
        id: dependency.contract.id,
        version: dependency.contract.version,
        path: dependency.contract.contractPath,
        digest: dependency.contract.digest,
      } : null,
      selectedProvider: dependency.selectedProvider ? {
        id: dependency.selectedProvider.id,
        scope: dependency.selectedProvider.scope,
        runtimePath: dependency.selectedProvider.runtimePath,
      } : null,
      provenance: dependency.provenance,
    })),
  };
}

export function buildSkillTarget(targetRoot: any, skill: any, runtime: any = 'claude-code'): any  {
  return buildRuntimeSkillTarget(targetRoot, skill, runtime);
}

export function buildRuntimeSkillTarget(targetRoot: any, skill: any, runtime: any): any  {
  return path.join(buildRuntimeSkillDirectory(targetRoot, skill, runtime), 'SKILL.md');
}

export function buildRuntimeSkillDirectory(targetRoot: any, skill: any, runtime: any): any  {
  const runtimePath = skill.runtimePath ?? skill.id;
  const root = getRuntimeAdapter(runtime).traits.skills.root;
  return path.join(targetRoot, root, 'skills', ...runtimePath.split('/'));
}

function sourceHash(content: any): any  {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function buildSkillContent(repoRoot: any, skill: any): any  {
  const rawSource = skill.sourceContent ?? fs.readFileSync(skill.sourceFile, 'utf8');
  const contributionsBySlot: any = new Map();
  const prepended: any[] = [];
  const appended: any[] = [];
  for (const contribution of skill.skillContributions || []) {
    if (contribution.placement === 'prepend') {
      prepended.push(contribution);
      continue;
    }
    if (contribution.placement === 'append') {
      appended.push(contribution);
      continue;
    }
    if (!contributionsBySlot.has(contribution.slot)) contributionsBySlot.set(contribution.slot, []);
    contributionsBySlot.get(contribution.slot).push(contribution);
  }
  let source = rawSource.replace(SKILL_CONTRIBUTION_MARKER, (_marker: any, slot: any) => {
    const contributions = contributionsBySlot.get(slot) || [];
    return contributions.map(contributionBlock).join('\n\n');
  });
  if (prepended.length) source = prependAfterFrontmatter(source, prepended.map(contributionBlock).join('\n\n'));
  if (appended.length) source = `${source.trimEnd()}\n\n${appended.map(contributionBlock).join('\n\n')}\n`;
  const bindingBlock = capabilityBindingBlock(skill);
  if (bindingBlock) source = prependAfterFrontmatter(source, bindingBlock);
  const marker = `<!-- Generated by Buildr. Hash: ${sourceHash(source)}. Do not edit. -->`;
  return addManagedMarker(source, marker);
}

export function buildAgentInstallPlanTarget(targetRoot: any, skill: any, runtime: any = 'claude-code'): any  {
  return path.join(targetRoot, getRuntimeAdapter(runtime).traits.skills.root, 'buildr', 'skill-install-plans', `${skill.id}.md`);
}

function formatSkillSourceDetails(skill: any): any  {
  const lines: any[] = [];
  if (skill.source) {
    lines.push('- source:');
    lines.push(`  - kind: ${skill.source.kind}`);
    lines.push(`  - url: ${skill.source.url}`);
  }
  if (skill.resolved) {
    lines.push('- resolved:');
    lines.push(`  - kind: ${skill.resolved.kind}`);
    lines.push(`  - url: ${skill.resolved.url}`);
    if (skill.resolved.version) lines.push(`  - version: ${skill.resolved.version}`);
    if (skill.resolved.integrity) lines.push(`  - integrity: ${skill.resolved.integrity}`);
  }
  return lines.length > 0 ? lines.join('\n') : '- no source or resolved information recorded';
}

export function buildAgentInstallPlanContent(skill: any): any  {
  return [
    `# Buildr Skill Install Plan: ${skill.id}`,
    '',
    '<!-- Generated by Buildr. Agent action required. Do not treat this file as an installed Skill. -->',
    '',
    'This Skill is declared in Buildr but requires Agent installation or resolution.',
    '',
    '## Manifest Information',
    '',
    formatSkillSourceDetails(skill),
    '',
    '## Required Agent Action',
    '',
    '1. Read the source/resolved information above.',
    '2. Resolve a precise install source when possible.',
    '3. Update Buildr manifest with `buildr skills add <id> --resolved-source <url> --replace` when a precise source is found.',
    '4. Install the Skill into the current Agent runtime only after the source is understood.',
    '',
  ].join('\n');
}

export function resolveRenderSkills(repoRoot: any, scope: any, runtime: any): any  {
  const { organizationRoot, projectRoot } = resolveSkillScope(repoRoot, scope);
  if (projectRoot) {
    const error: Error & Record<string, any> = new Error(`Legacy Project Skill render scope is no longer supported: ${scope}. Use --destination workspace or --destination user from the workspace source authority.`);
    error.code = 'skills.project_scope_unsupported';
    error.reason = 'project_scope_removed';
    error.nextActions = ['Review the legacy Project Skill source without modifying it; this Buildr version does not migrate it.', `buildr skills render ${runtime} --destination workspace --target ${organizationRoot}`];
    throw error;
  }
  const workspaceGraph = resolveSkillCapabilityGraph(organizationRoot, null, { runtime });
  return resolveSkills(organizationRoot, null, { runtime }).map((skill: any) => ({ ...skill, declaredScope: '.', capabilityBindings: capabilityBindingsForSkill(workspaceGraph, skill.id) }));
}

function skillWriteIdentity(item: any): any  {
  return JSON.stringify([item.skillRelativePath, item.contentEncoding || 'utf8', item.content, item.mode ?? null]);
}

function projectionSource(skill: any): any  {
  return `${skill.declaredScope || skill.origin}:${skill.id}`;
}

function digestInventory(writes: any, source: any = false): any  {
  const inventory = writes.map((item: any) => ({
    path: item.skillRelativePath,
    integrity: sha256Integrity(runtimeWriteBuffer(item, source) || runtimeWriteBuffer(item)),
    executable: item.mode === 0o100,
  })).sort((left: any, right: any) => left.path.localeCompare(right.path));
  return sha256Integrity(Buffer.from(JSON.stringify(inventory), 'utf8'));
}

function buildSkillFileWrites(repoRoot: any, targetRoot: any, skill: any, runtime: any): any  {
  const runtimeSkill = skill.runtime ? skill : { ...skill, runtime };
  const runtimePath = skill.runtimePath ?? skill.id;
  const source = projectionSource(skill);
  const targetDir = buildRuntimeSkillDirectory(targetRoot, skill, runtime);
  const sourceFiles = skill.sourceDir ? enumerateSkillSourceFiles(skill.sourceDir) : [];
  const sourceEntry = sourceFiles.find((file: any) => file.relativePath === 'SKILL.md');
  const rawSource = skill.sourceContent ?? fs.readFileSync(skill.sourceFile, 'utf8');
  const writes: any[] = [{
    targetFile: path.join(targetDir, 'SKILL.md'),
    content: buildSkillContent(repoRoot, runtimeSkill),
    contentEncoding: 'utf8',
    sourceContent: rawSource,
    sourceContentEncoding: 'utf8',
    mode: sourceEntry?.executable ? 0o100 : 0,
    sourceFile: skill.sourceFile,
    source,
    skillId: skill.id,
    runtimePath,
    skillRelativePath: 'SKILL.md',
    kind: 'skill-entry',
    isManaged: hasManagedSkillMarker,
  }];
  for (const file of sourceFiles.filter((entry: any) => entry.relativePath !== 'SKILL.md')) {
    writes.push(buildCompanionWrite(
      path.join(targetDir, ...file.relativePath.split('/')),
      file.sourceFile,
      file.relativePath,
      file.content,
      file.executable,
      { source, skillId: skill.id, runtimePath, kind: 'skill-companion', isManaged: () => false },
    ));
  }
  return { runtimePath, targetDir, source, writes };
}

function addWrite(byTarget: any, item: any, conflicts: any): any  {
  const existing = byTarget.get(item.targetFile);
  if (existing && skillWriteIdentity(existing) !== skillWriteIdentity(item)) {
    conflicts.push(`${item.targetFile}: ${existing.source} 与 ${item.source} 内容不同`);
  } else if (!existing) {
    byTarget.set(item.targetFile, item);
  }
}

function receiptManaged(content: any): any  {
  try {
    parseSkillProjectionReceipt(Buffer.isBuffer(content) ? content.toString('utf8') : content);
    return true;
  } catch {
    return false;
  }
}

export function buildSkillRenderPlan(repoRoot: any, targetRoot: any, skills: any, runtime: any, options: any = {}): any  {
  const adapter = getRuntimeAdapter(runtime);
  const byTarget: any = new Map();
  const byRuntimePath: any = new Map();
  const removals: any[] = [];
  const conflicts: any[] = [];
  for (const skill of skills) {
    const runtimeSkill = skill.runtime ? skill : { ...skill, runtime };
    if (skill.installMode === 'agent') {
      addWrite(byTarget, {
        targetFile: buildAgentInstallPlanTarget(targetRoot, skill, runtime),
        content: buildAgentInstallPlanContent(runtimeSkill),
        source: projectionSource(skill),
        skillId: skill.id,
        runtimePath: skill.runtimePath ?? skill.id,
        kind: 'skill-install-plan',
        isManaged: (content: any) => content.includes('<!-- Generated by Buildr. Agent action required.'),
      }, conflicts);
      continue;
    }
    const projection = buildSkillFileWrites(repoRoot, targetRoot, skill, runtime);
    const existing = byRuntimePath.get(projection.runtimePath);
    if (!existing) {
      byRuntimePath.set(projection.runtimePath, { ...projection, skill, sources: [projection.source] });
      continue;
    }
    const existingByRelative: any = new Map(existing.writes.map((item: any) => [item.skillRelativePath, item]));
    const incomingByRelative: any = new Map(projection.writes.map((item: any) => [item.skillRelativePath, item]));
    const relatives = [...new Set([...existingByRelative.keys(), ...incomingByRelative.keys()])].sort();
    const different = relatives.some((relative: any) => {
      const left = existingByRelative.get(relative);
      const right = incomingByRelative.get(relative);
      return !left || !right || skillWriteIdentity(left) !== skillWriteIdentity(right);
    });
    if (different) {
      conflicts.push(`${projection.targetDir}: ${existing.sources.join(', ')} 与 ${projection.source} 的完整 Skill 内容不同`);
    } else {
      existing.sources.push(projection.source);
    }
  }

  for (const projection of byRuntimePath.values()) {
    const destination = options.destination || 'workspace';
    const receiptObservation = observeSkillProjectionOwnershipReceipt({
      targetRoot,
      runtimeRoot: adapter.traits.skills.root,
      destination,
      adapterId: runtime,
      runtimePath: projection.runtimePath,
      runtimeSkillDir: projection.targetDir,
    });
    const receiptFile = receiptObservation.canonicalFile;
    const previousReceipt = receiptObservation.receipt;
    const previousByPath: any = new Map((previousReceipt?.files || []).map((file: any) => [file.path, file]));
    const currentPaths: any = new Set();
    for (const item of projection.writes) {
      currentPaths.add(item.skillRelativePath);
      const previous = previousByPath.get(item.skillRelativePath);
      if (previous) {
        item.previousIntegrity = previous.integrity;
        item.previousExecutable = previous.executable;
      }
      addWrite(byTarget, item, conflicts);
    }
    for (const previous of previousByPath.values()) {
      if (currentPaths.has(previous.path)) continue;
      removals.push({
        targetFile: path.join(projection.targetDir, ...previous.path.split('/')),
        expectedIntegrity: previous.integrity,
        expectedExecutable: previous.executable,
        pruneEmptyRoot: projection.targetDir,
        source: projection.sources.join(', '),
        skillId: projection.writes[0].skillId,
        runtimePath: projection.runtimePath,
        skillRelativePath: previous.path,
        kind: 'skill-stale-file',
      });
    }
    const inventory = projection.writes.map((item: any) => ({
      path: item.skillRelativePath,
      integrity: sha256Integrity(runtimeWriteBuffer(item)),
      executable: item.mode === 0o100,
    }));
    const receipt = buildSkillProjectionReceipt({
      adapterId: runtime,
      destination,
      skillId: projection.skill.id,
      runtimePath: projection.runtimePath,
      assetIdentity: projection.skill.assetIdentity || `product:${projection.skill.id}`,
      sourceIdentity: projection.skill.sourceIdentity || `product:${projection.skill.displaySource || projection.skill.id}`,
      sourceWorkspaceId: projection.skill.workspaceId || options.sourceWorkspaceId || sha256Integrity(Buffer.from(path.resolve(repoRoot), 'utf8')),
      sourceDigest: digestInventory(projection.writes, true),
      renderDigest: digestInventory(projection.writes),
      capabilityBindings: capabilityBindingReceipt(projection.skill.capabilityBindings),
      sources: projection.sources,
      files: inventory,
    });
    const previousReceiptContent = fs.existsSync(receiptFile) ? fs.readFileSync(receiptFile, 'utf8') : undefined;
    addWrite(byTarget, {
      targetFile: receiptFile,
      content: renderSkillProjectionReceipt(receipt),
      contentEncoding: 'utf8',
      sourceContent: previousReceiptContent,
      sourceContentEncoding: 'utf8',
      previousIntegrity: previousReceiptContent ? sha256Integrity(Buffer.from(previousReceiptContent, 'utf8')) : undefined,
      source: projection.sources.join(', '),
      skillId: projection.writes[0].skillId,
      runtimePath: projection.runtimePath,
      kind: 'skill-projection-receipt',
      isManaged: receiptManaged,
      commitLast: true,
      diagnostic: {
        label: `Skill projection ownership receipt ${projection.runtimePath}`,
        codes: {
          ok: 'runtime.skill_projection_ownership_receipt_current',
          missing: 'runtime.skill_projection_ownership_receipt_missing',
          stale: 'runtime.skill_projection_ownership_receipt_stale',
          conflict: 'runtime.skill_projection_ownership_receipt_conflict',
        },
        repair: 'skills-render',
      },
    }, conflicts);
    if (receiptObservation.legacyReceipt) {
      removals.push({
        targetFile: receiptObservation.legacyFile,
        expectedIntegrity: sha256Integrity(fs.readFileSync(receiptObservation.legacyFile)),
        pruneEmptyRoot: legacySkillProjectionOwnershipReceiptRoot(targetRoot, adapter.traits.skills.root),
        source: projection.sources.join(', '),
        skillId: projection.writes[0].skillId,
        runtimePath: projection.runtimePath,
        kind: 'legacy-skill-projection-ownership-receipt',
        removeLast: true,
        diagnostic: {
          label: `legacy Skill projection ownership receipt ${projection.runtimePath}`,
          codes: { orphan: 'runtime.skill_projection_ownership_receipt_legacy' },
          repair: 'skills-render',
        },
      });
    }
  }

  if (Array.isArray(options.conflicts)) options.conflicts.push(...conflicts);
  if (conflicts.length && options.deferConflicts !== true) throw new Error(`运行时写入冲突：\n- ${conflicts.sort().join('\n- ')}`);
  return {
    runtime,
    writes: [...byTarget.values()].sort((left: any, right: any) => left.targetFile.localeCompare(right.targetFile)),
    removals: removals.sort((left: any, right: any) => left.targetFile.localeCompare(right.targetFile)),
  };
}

export function applySkillRenderPlan(plan: any, targetRoot: any): any  {
  for (const item of [...plan.writes, ...plan.removals]) assertRuntimeTargetPath(targetRoot, item.targetFile, 'Runtime Skill target');
  const runtimePlan = createRuntimePlan({
    adapterId: plan.runtime,
    targetRoot,
    scope: '.',
    writes: plan.writes,
    removals: plan.removals,
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability: any) => ({ capability, supported: true, adapterId: plan.runtime })),
  });
  reconcileRuntimePlan(runtimePlan);
  return [...plan.writes.map((item: any) => item.targetFile), ...plan.removals.map((item: any) => item.targetFile)];
}

function renderSkill(repoRoot: any, targetRoot: any, skill: any, runtime: any = 'claude-code'): any  {
  const target = skill.installMode === 'agent'
    ? buildAgentInstallPlanTarget(targetRoot, skill, runtime)
    : buildRuntimeSkillTarget(targetRoot, skill, runtime);
  applySkillRenderPlan(buildSkillRenderPlan(repoRoot, targetRoot, [skill], runtime), targetRoot);
  return target;
}
