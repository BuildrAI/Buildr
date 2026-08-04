import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_RENDER_CAPABILITIES,
  assertRuntimeTargetPath,
  createRuntimePlan,
  getRuntimeAdapter,
  reconcileRuntimePlan,
} from '../adapter-contract.mjs';
import { FRONTMATTER_BOUNDARY, MANAGED_PREFIX, SKILL_CONTRIBUTION_MARKER, resolveSkillScope } from './primitives.mjs';
import { capabilityBindingsForSkill, resolveSkillCapabilityGraph } from './capabilities.mjs';
import { resolvePackageAgentSkill, resolveSkills } from './sources.mjs';
import {
  buildCompanionWrite,
  buildSkillProjectionReceipt,
  enumerateSkillSourceFiles,
  parseSkillProjectionReceipt,
  readSkillProjectionReceipt,
  renderSkillProjectionReceipt,
  runtimeWriteBuffer,
  sha256Integrity,
  skillProjectionReceiptTarget,
} from './projection-files.mjs';

export function hasManagedSkillMarker(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.startsWith(MANAGED_PREFIX)) {
    return true;
  }
  if (lines[0] !== FRONTMATTER_BOUNDARY) {
    return false;
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_BOUNDARY);
  return endIndex !== -1 && lines[endIndex + 1]?.startsWith(MANAGED_PREFIX);
}

function addManagedMarker(source, marker) {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_BOUNDARY) {
    return `${marker}\n${source}`;
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_BOUNDARY);
  if (endIndex === -1) {
    return `${marker}\n${source}`;
  }

  lines.splice(endIndex + 1, 0, marker);
  return lines.join('\n');
}

function contributionBlock(contribution) {
  const identity = contribution.placement === 'slot' ? contribution.slot : contribution.placement;
  return [
    `<!-- buildr:contribution ${contribution.componentId}#${identity} -->`,
    contribution.content,
    '<!-- /buildr:contribution -->',
  ].join('\n');
}

function prependAfterFrontmatter(source, block) {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_BOUNDARY) return `${block}\n\n${source}`;
  const endIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_BOUNDARY);
  if (endIndex === -1) throw new Error('Boundary Skill contribution requires valid closed frontmatter.');
  lines.splice(endIndex + 1, 0, '', block);
  return lines.join('\n');
}

function capabilityBindingBlock(skill) {
  const consumer = skill.capabilityBindings;
  const routing = skill.capabilityRoutingEvidence;
  if (!consumer && !routing?.length) return '';
  const lines = ['<!-- buildr:capability-bindings begin -->', '## Buildr Capability Bindings', ''];
  if (consumer) {
    lines.push(`Consumer readiness: \`${consumer.readiness}\`${consumer.reason ? ` (\`${consumer.reason}\`)` : ''}. \`ready\` 只表示结构可路由，不表示 provider 行为或本次执行已经成功。`, '');
    for (const dependency of consumer.dependencies) {
      const selected = dependency.selectedProvider;
      const providerPath = selected ? `${getRuntimeAdapter(skill.runtime).traits.skills.root}/skills/${selected.runtimePath}/SKILL.md` : null;
      lines.push(`### \`${dependency.capability}@${dependency.version}\``, '');
      lines.push(`- mode: \`${dependency.mode}\``);
      lines.push(`- readiness: \`${dependency.readiness}\``);
      lines.push(`- reason: \`${dependency.reason || 'none'}\``);
      lines.push(`- contract: \`${dependency.contract?.contractPath || 'unresolved'}\``);
      lines.push(`- contract SHA-256: \`${dependency.contract?.digest || 'unresolved'}\``);
      lines.push(`- selected provider: \`${selected?.id || 'none'}\``);
      lines.push(`- provider runtime: \`${providerPath || 'unresolved'}\``);
      lines.push(`- provider scope: \`${selected?.scope || 'unresolved'}\``);
      lines.push(`- provenance: \`${dependency.provenance}\``, '');
    }
    if (consumer.readiness === 'blocked') {
      lines.push('**Safety stop:** required capability 尚未 ready。不得执行 provider-dependent action；只能解释阻塞并按 doctor 的 nextActions 修复。', '');
    } else {
      lines.push('执行 provider-dependent action 前，必须读取上面已解析的 contract 与 selected provider；成功由 contract 要求的授权披露和 result evidence 判断。', '');
    }
  }
  if (routing?.length) {
    lines.push('### Workspace routing evidence', '');
    for (const group of routing) {
      lines.push(`- scope \`${group.scope}\``);
      for (const route of group.routes) {
        lines.push(`  - \`${route.capability}@${route.version}\` → \`${route.selectedProvider?.id || 'unresolved'}\` (consumer \`${route.consumer}\`, ${route.readiness}${route.reason ? `/${route.reason}` : ''}, contract SHA-256 \`${route.contract?.digest || 'unresolved'}\`)`);
      }
    }
    lines.push('', '若 evidence 不适用于当前 scope、runtime check 显示 stale，或当前 session 已知 manifest/contract/provider 已变化，先运行当前 workspace doctor 读取最新 capability graph；不得猜测 builtin，也不需要独立 dispatch 命令。', '');
  }
  lines.push('<!-- buildr:capability-bindings end -->');
  return lines.join('\n');
}

export function buildSkillTarget(targetRoot, skill, runtime = 'claude-code') {
  return buildRuntimeSkillTarget(targetRoot, skill, runtime);
}

export function buildRuntimeSkillTarget(targetRoot, skill, runtime) {
  return path.join(buildRuntimeSkillDirectory(targetRoot, skill, runtime), 'SKILL.md');
}

export function buildRuntimeSkillDirectory(targetRoot, skill, runtime) {
  const runtimePath = skill.runtimePath ?? skill.id;
  const root = getRuntimeAdapter(runtime).traits.skills.root;
  return path.join(targetRoot, root, 'skills', ...runtimePath.split('/'));
}

function sourceHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildAdapterRuntimeContext(skill) {
  if (skill.origin !== 'product' || skill.id !== 'buildr') {
    return '';
  }
  const adapter = getRuntimeAdapter(skill.runtime);
  const commands = adapter.recommendedCommands;
  const ruleGuidance = adapter.renderCapabilities['rules-entry'].mode === 'native'
    ? `${adapter.displayName} 原生读取 scope \`AGENTS.md\``
    : `${adapter.displayName} 使用 ${adapter.renderCapabilities['rules-entry'].projection.targetPattern} Rule bridge`;
  const maintenanceCommands = adapter.renderCapabilities['rules-entry'].writesFiles
    ? ['buildr update', commands.installProductSkill, commands.runtimeCheckScope.replace('<workspace-relative-path>', '<scope>'), commands.renderRulesScope, commands.renderSkillsScope, commands.syncWorkspaceEntry]
    : ['buildr update', commands.installProductSkill, commands.syncWorkspaceEntry];
  return [
    '## 当前 Agent Adapter',
    '',
    `当前安装 adapter：\`${adapter.id}\`。`,
    '',
    '默认先确认支持矩阵，再用带当前 adapter 的 doctor 判断 workspace 和 runtime 状态：',
    '',
    '```bash',
    'buildr runtime list --json',
    commands.doctor,
    '```',
    '',
    adapter.renderCapabilities['rules-entry'].writesFiles
      ? '用户要求更新或同步 Buildr 时依次运行 update 与 Skill install；更新或同步 workspace 时，Git 管理的 workspace 先解析 `buildr.git-operations/v1` selected provider，并由 Buildr Skill 提供明确 workspace、upstream 和 update operation，安全更新本地 checkout 后运行 sync，非 Git workspace 直接运行 sync。doctor 指向具体 runtime 问题后，再使用其余专项维护命令：'
      : '用户要求更新或同步 Buildr 时依次运行 update 与 Skill install；更新或同步 workspace 时，Git 管理的 workspace 先解析 `buildr.git-operations/v1` selected provider，并由 Buildr Skill 提供明确 workspace、upstream 和 update operation，安全更新本地 checkout 后运行 sync，非 Git workspace 直接运行 sync：',
    '',
    '```bash',
    ...maintenanceCommands,
    '```',
    '',
    `当前 adapter 的 runtime 入口：${ruleGuidance}；Skills 渲染到当前项目根目录 \`${adapter.traits.skills.root}/skills/\`。如果当前 Agent 不是该 adapter，停止当前 Buildr 操作；请联系 Buildr 作者反馈该 Agent。`,
    '',
  ].join('\n');
}

export function buildSkillContent(repoRoot, skill) {
  const rawSource = skill.sourceContent ?? fs.readFileSync(skill.sourceFile, 'utf8');
  const contributionsBySlot = new Map();
  const prepended = [];
  const appended = [];
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
  let source = rawSource.replace(SKILL_CONTRIBUTION_MARKER, (_marker, slot) => {
    const contributions = contributionsBySlot.get(slot) || [];
    return contributions.map(contributionBlock).join('\n\n');
  });
  if (prepended.length) source = prependAfterFrontmatter(source, prepended.map(contributionBlock).join('\n\n'));
  if (appended.length) source = `${source.trimEnd()}\n\n${appended.map(contributionBlock).join('\n\n')}\n`;
  const bindingBlock = capabilityBindingBlock(skill);
  if (bindingBlock) source = prependAfterFrontmatter(source, bindingBlock);
  const runtimeContext = buildAdapterRuntimeContext(skill);
  const content = runtimeContext ? `${source.trimEnd()}\n\n${runtimeContext}` : source;
  const marker = `<!-- Generated by Buildr. Hash: ${sourceHash(content)}. Do not edit. -->`;
  return addManagedMarker(content, marker);
}

export function buildAgentInstallPlanTarget(targetRoot, skill, runtime = 'claude-code') {
  return path.join(targetRoot, getRuntimeAdapter(runtime).traits.skills.root, 'buildr', 'skill-install-plans', `${skill.id}.md`);
}

function formatSkillSourceDetails(skill) {
  const lines = [];
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

export function buildAgentInstallPlanContent(skill) {
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

export function resolveRenderSkills(repoRoot, scope, runtime) {
  const { organizationRoot, projectRoot } = resolveSkillScope(repoRoot, scope);
  if (projectRoot) {
    const error = new Error(`Legacy Project Skill render scope is no longer supported: ${scope}. Use --destination workspace or --destination user from the workspace source authority.`);
    error.code = 'skills.project_scope_unsupported';
    error.reason = 'project_scope_removed';
    error.nextActions = [`buildr skills migrate-project-assets --target ${organizationRoot} --check`, `buildr skills render ${runtime} --destination workspace --target ${organizationRoot}`];
    throw error;
  }
  const workspaceGraph = resolveSkillCapabilityGraph(organizationRoot, null, { runtime });
  return resolveSkills(organizationRoot, null, { runtime }).map((skill) => ({ ...skill, declaredScope: '.', capabilityBindings: capabilityBindingsForSkill(workspaceGraph, skill.id) }));
}

function skillWriteIdentity(item) {
  return JSON.stringify([item.skillRelativePath, item.contentEncoding || 'utf8', item.content, item.mode ?? null]);
}

function projectionSource(skill) {
  return `${skill.declaredScope || skill.origin}:${skill.id}`;
}

function digestInventory(writes, source = false) {
  const inventory = writes.map((item) => ({
    path: item.skillRelativePath,
    integrity: sha256Integrity(runtimeWriteBuffer(item, source) || runtimeWriteBuffer(item)),
    executable: item.mode === 0o100,
  })).sort((left, right) => left.path.localeCompare(right.path));
  return sha256Integrity(Buffer.from(JSON.stringify(inventory), 'utf8'));
}

function buildSkillFileWrites(repoRoot, targetRoot, skill, runtime) {
  const runtimeSkill = skill.runtime ? skill : { ...skill, runtime };
  const runtimePath = skill.runtimePath ?? skill.id;
  const source = projectionSource(skill);
  const targetDir = buildRuntimeSkillDirectory(targetRoot, skill, runtime);
  const sourceFiles = skill.sourceDir ? enumerateSkillSourceFiles(skill.sourceDir) : [];
  const sourceEntry = sourceFiles.find((file) => file.relativePath === 'SKILL.md');
  const rawSource = skill.sourceContent ?? fs.readFileSync(skill.sourceFile, 'utf8');
  const writes = [{
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
  for (const file of sourceFiles.filter((entry) => entry.relativePath !== 'SKILL.md')) {
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

function addWrite(byTarget, item, conflicts) {
  const existing = byTarget.get(item.targetFile);
  if (existing && skillWriteIdentity(existing) !== skillWriteIdentity(item)) {
    conflicts.push(`${item.targetFile}: ${existing.source} 与 ${item.source} 内容不同`);
  } else if (!existing) {
    byTarget.set(item.targetFile, item);
  }
}

function receiptManaged(content) {
  try {
    parseSkillProjectionReceipt(Buffer.isBuffer(content) ? content.toString('utf8') : content);
    return true;
  } catch {
    return false;
  }
}

export function buildSkillRenderPlan(repoRoot, targetRoot, skills, runtime, options = {}) {
  const adapter = getRuntimeAdapter(runtime);
  const byTarget = new Map();
  const byRuntimePath = new Map();
  const removals = [];
  const conflicts = [];
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
        isManaged: (content) => content.includes('<!-- Generated by Buildr. Agent action required.'),
      }, conflicts);
      continue;
    }
    const projection = buildSkillFileWrites(repoRoot, targetRoot, skill, runtime);
    const existing = byRuntimePath.get(projection.runtimePath);
    if (!existing) {
      byRuntimePath.set(projection.runtimePath, { ...projection, skill, sources: [projection.source] });
      continue;
    }
    const existingByRelative = new Map(existing.writes.map((item) => [item.skillRelativePath, item]));
    const incomingByRelative = new Map(projection.writes.map((item) => [item.skillRelativePath, item]));
    const relatives = [...new Set([...existingByRelative.keys(), ...incomingByRelative.keys()])].sort();
    const different = relatives.some((relative) => {
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
    const receiptFile = skillProjectionReceiptTarget(targetRoot, adapter.traits.skills.root, runtime, projection.runtimePath);
    const previousReceipt = readSkillProjectionReceipt(receiptFile, { adapterId: runtime, runtimePath: projection.runtimePath });
    const previousByPath = new Map((previousReceipt?.files || []).map((file) => [file.path, file]));
    const currentPaths = new Set();
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
    const inventory = projection.writes.map((item) => ({
      path: item.skillRelativePath,
      integrity: sha256Integrity(runtimeWriteBuffer(item)),
      executable: item.mode === 0o100,
    }));
    const receipt = buildSkillProjectionReceipt({
      adapterId: runtime,
      destination: options.destination || 'workspace',
      skillId: projection.skill.id,
      runtimePath: projection.runtimePath,
      assetIdentity: projection.skill.assetIdentity || `product:${projection.skill.id}`,
      sourceIdentity: projection.skill.sourceIdentity || `product:${projection.skill.displaySource || projection.skill.id}`,
      sourceWorkspaceId: projection.skill.workspaceId || options.sourceWorkspaceId || sha256Integrity(Buffer.from(path.resolve(repoRoot), 'utf8')),
      sourceDigest: digestInventory(projection.writes, true),
      renderDigest: digestInventory(projection.writes),
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
    }, conflicts);
  }

  if (Array.isArray(options.conflicts)) options.conflicts.push(...conflicts);
  if (conflicts.length && options.deferConflicts !== true) throw new Error(`运行时写入冲突：\n- ${conflicts.sort().join('\n- ')}`);
  return {
    runtime,
    writes: [...byTarget.values()].sort((left, right) => left.targetFile.localeCompare(right.targetFile)),
    removals: removals.sort((left, right) => left.targetFile.localeCompare(right.targetFile)),
  };
}

export function applySkillRenderPlan(plan, targetRoot) {
  for (const item of [...plan.writes, ...plan.removals]) assertRuntimeTargetPath(targetRoot, item.targetFile, 'Runtime Skill target');
  const runtimePlan = createRuntimePlan({
    adapterId: plan.runtime,
    targetRoot,
    scope: '.',
    writes: plan.writes,
    removals: plan.removals,
    capabilityEvidence: REQUIRED_RENDER_CAPABILITIES.map((capability) => ({ capability, supported: true, adapterId: plan.runtime })),
  });
  reconcileRuntimePlan(runtimePlan);
  return [...plan.writes.map((item) => item.targetFile), ...plan.removals.map((item) => item.targetFile)];
}

function renderSkill(repoRoot, targetRoot, skill, runtime = 'claude-code') {
  const target = skill.installMode === 'agent'
    ? buildAgentInstallPlanTarget(targetRoot, skill, runtime)
    : buildRuntimeSkillTarget(targetRoot, skill, runtime);
  applySkillRenderPlan(buildSkillRenderPlan(repoRoot, targetRoot, [skill], runtime), targetRoot);
  return target;
}
