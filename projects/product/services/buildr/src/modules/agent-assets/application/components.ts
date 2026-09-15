import fs from 'node:fs';
import path from 'node:path';
import { runFinalDoctor } from '../../../infrastructure/final-doctor-process.ts';
import { hasManagedSkillMarker } from '../infrastructure/runtime/render-claude-code.ts';
import { getRuntimeAdapter, isSupportedAgent } from '../infrastructure/runtime/adapter-contract.ts';
import {
  legacySkillProjectionOwnershipReceiptRoot,
  legacySkillProjectionOwnershipReceiptTarget,
  readSkillProjectionReceipt,
  runtimeFileMatches,
  sha256Integrity,
  skillProjectionOwnershipReceiptRoot,
  skillProjectionOwnershipReceiptsEquivalent,
  skillProjectionOwnershipReceiptTarget,
} from '../infrastructure/runtime/skills/projection-files.ts';
import { createComponentDefinitionDomain } from '../domain/component-definition.ts';
import { createComponentRepository } from '../persistence/component-repository.ts';
import { assetIntegrity } from '../infrastructure/component-source.ts';

export interface ComponentsDependencies {
  renderRuntime: ReturnType<typeof import('./runtime-projection.ts').registerApplicationRuntime>['renderRuntime'];
  isPlainObject: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['isPlainObject'];
  readPackageManifest: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['readPackageManifest'];
  collectFiles: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['collectFiles'];
  builtinRuleEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['builtinRuleEntry'];
  builtinSkillEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['builtinSkillEntry'];
  sourcePathFromBuiltin: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['sourcePathFromBuiltin'];
  missingAncestorForMutation: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['missingAncestorForMutation'];
  mutationPathFingerprint: (...args: any[]) => any;
  assertSafeSyncMutationPaths: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['assertSafeSyncMutationPaths'];
  isValidAssetId: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['isValidAssetId'];
  listManagedDirectories: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['listManagedDirectories'];
  rulesManifestPath: ReturnType<typeof import('./rules.ts').registerDomainsRules>['rulesManifestPath'];
  readRulesManifestForWrite: ReturnType<typeof import('./rules.ts').registerDomainsRules>['readRulesManifestForWrite'];
  writeRulesManifest: ReturnType<typeof import('./rules.ts').registerDomainsRules>['writeRulesManifest'];
  assertAgentId: ReturnType<typeof import('./runtime.ts').registerDomainsRuntime>['assertAgentId'];
  normalizeRelativePathForBuildr: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['normalizeRelativePathForBuildr'];
  skillsManifestPath: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['skillsManifestPath'];
  readSkillsManifestForWrite: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['readSkillsManifestForWrite'];
  writeSkillsManifest: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['writeSkillsManifest'];
  quoteYaml: typeof import('../../../infrastructure/filesystem/yaml.ts').quoteYaml;
  ensureDirectory: (...args: any[]) => any;
  atomicWriteFile: typeof import('../../../infrastructure/filesystem/atomic-files.ts').atomicWriteFile;
  parseYamlDocument: typeof import('../../../infrastructure/filesystem/yaml.ts').parseYamlDocument;
  withWorkspaceMutation: (...args: any[]) => any;
  productRoot: () => string;
  resourceWorkspaceRoot: () => string;
  toPosixRelative: (...args: any[]) => any;
  existsDirectory: (file: string) => boolean;
  existsFile: (file: string) => boolean;
  assertInitializedBuildrWorkspace: typeof import('../../../infrastructure/filesystem/workspace-identity.ts').assertInitializedBuildrWorkspace;
  commandRemovalBlockers: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['commandRemovalBlockers'];
  parseCommandsManifestYaml: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['parseCommandsManifestYaml'];
  validateCommandsManifest: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['validateCommandsManifest'];
  workspaceSymlinkSegment: typeof import('../../../infrastructure/filesystem/workspace-path.ts').workspaceSymlinkSegment;
  currentProductInvocation: typeof import('../../../infrastructure/product-invocation/index.ts').currentProductInvocation;
}

export function registerDomainsComponents(dependencies: ComponentsDependencies) {
  const {
    renderRuntime,
    isPlainObject,
    readPackageManifest,
    collectFiles,
    builtinRuleEntry,
    builtinSkillEntry,
    sourcePathFromBuiltin,
    missingAncestorForMutation,
    mutationPathFingerprint,
    assertSafeSyncMutationPaths,
    isValidAssetId,
    listManagedDirectories,
    rulesManifestPath,
    readRulesManifestForWrite,
    writeRulesManifest,
    assertAgentId,
    normalizeRelativePathForBuildr,
    skillsManifestPath,
    readSkillsManifestForWrite,
    writeSkillsManifest,
    quoteYaml,
    ensureDirectory,
    atomicWriteFile,
    parseYamlDocument,
    withWorkspaceMutation,
    productRoot,
    resourceWorkspaceRoot,
    toPosixRelative,
    existsDirectory,
    existsFile,
    assertInitializedBuildrWorkspace,
    commandRemovalBlockers,
    parseCommandsManifestYaml,
    validateCommandsManifest,
    workspaceSymlinkSegment,
  } = dependencies;
  const {
    parseComponentDefinitionYaml,
    componentIntegrityMap,
    componentMemberPaths,
    parseSkillContributionDeclaration,
    parseSkillDependencyContribution,
    validateComponentDefinition,
  } = createComponentDefinitionDomain({ isPlainObject, isValidAssetId, normalizeRelativePathForBuildr, parseYamlDocument, quoteYaml });
  const {
    componentRegistryPath,
    renderComponentsManifestYaml,
    readComponentsManifestForWrite,
    writeComponentsManifest,
    readComponentDefinition,
    componentDefinitionFile,
  } = createComponentRepository({
    atomicWriteFile, existsFile, isValidAssetId, normalizeRelativePathForBuildr, parseYamlDocument, parseComponentDefinitionYaml, quoteYaml, validateComponentDefinition,
    workspaceSymlinkSegment: (...args) => workspaceSymlinkSegment(...args),
  });

  function componentInventory(targetRoot: any, options: any = {}): any  {
    const manifest = readComponentsManifestForWrite(targetRoot);
    const components: any[] = [];
    const ownership: any = new Map();
    const findings: any[] = [];
    for (const entry of manifest.components) {
      const item: any = { entry, definition: null, members: [], status: entry.enabled === false || entry.state === 'uninstalled' ? 'uninstalled' : 'installed' };
      try {
        const definitionLink = workspaceSymlinkSegment(targetRoot, entry.path);
        if (definitionLink) throw new Error(`Component definition path crosses a symbolic link: ${definitionLink}`);
        item.definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), entry.id);
        const integrity = componentIntegrityMap(item.definition);
        for (const member of componentMemberPaths(item.definition)) {
          const memberLink = workspaceSymlinkSegment(targetRoot, member);
          if (memberLink) throw new Error(`Component member path crosses a symbolic link: ${memberLink}`);
          const actual = assetIntegrity(path.join(targetRoot, member));
          const status = actual === null ? 'missing' : actual === integrity.get(member) ? 'installed' : 'modified';
          item.members.push({ path: member, expected: integrity.get(member), actual, status });
          if (item.status !== 'uninstalled' && status !== 'installed') item.status = status;
          if (item.status !== 'uninstalled') {
            if (ownership.has(member)) findings.push({ status: 'error', code: 'components.ownership_conflict', member, owners: [ownership.get(member), entry.id] });
            else ownership.set(member, entry.id);
          }
        }
      } catch (error: any) {
        item.status = entry.enabled === false ? 'uninstalled' : 'invalid';
        item.error = error.message;
        if (entry.enabled !== false || options.includeUninstalled) findings.push({ status: 'error', code: 'components.definition_invalid', componentId: entry.id, message: error.message });
      }
      components.push(item);
    }
    return { manifest, components, ownership, findings };
  }

  function componentOwnerForMember(targetRoot: any, member: any): any  {
    return componentInventory(targetRoot).ownership.get(member) || null;
  }

  function packageComponentEntry(manifest: any, id: any): any  {
    return manifest.components.find((entry: any) => entry.id === id) || null;
  }

  function packageComponentDefinition(entry: any): any  {
    if (!entry?.path || path.isAbsolute(entry.path) || entry.path.startsWith('..')) throw new Error(`Package Component path is invalid: ${entry?.path || '<missing>'}`);
    const file = path.resolve(productRoot(), entry.path);
    const definition = readComponentDefinition(file, entry.id);
    if (definition.source !== 'buildr') throw new Error(`Package Component source must be buildr: ${entry.id}`);
    return { entry, file, definition };
  }

  function componentMemberKind(definition: any, member: any): any  {
    if (definition.members.rules.includes(member)) return 'rule';
    if (definition.members.skills.includes(member)) return 'skill';
    if (definition.members.commandCollections.includes(member)) return 'commandCollection';
    if (definition.members.skillContributions.includes(member)) return 'skillContribution';
    return null;
  }

  function componentBuiltinForMember(manifest: any, definition: any, member: any): any  {
    const kind = componentMemberKind(definition, member);
    if (kind === 'rule') return { kind, builtin: manifest.builtins.rules.find((item: any) => item.target === member) || null };
    if (kind === 'skill') return { kind, builtin: manifest.builtins.skills.find((item: any) => item.target === member) || null };
    return { kind, builtin: null };
  }

  function packageComponentSourcePath(member: any): any  {
    return path.join(resourceWorkspaceRoot(), member);
  }

  function validatePackageComponentMembers(manifest: any, record: any): any  {
    const errors: any[] = [];
    const integrity = componentIntegrityMap(record.definition);
    for (const member of componentMemberPaths(record.definition)) {
      const source = packageComponentSourcePath(member);
      const actual = assetIntegrity(source);
      if (!actual) errors.push(`Package Component member source is missing: ${member}.`);
      else if (actual !== integrity.get(member)) errors.push(`Package Component member integrity differs: ${member}.`);
      const { kind, builtin } = componentBuiltinForMember(manifest, record.definition, member);
      if ((kind === 'rule' || kind === 'skill') && (!builtin || builtin.component !== record.entry.id)) {
        errors.push(`Package Component ${kind} member must have a matching builtin descriptor with component: ${record.entry.id}: ${member}.`);
      }
    }
    for (const declaration of record.definition.contributions?.skillFragments || []) {
      let parsed;
      try {
        parsed = parseSkillContributionDeclaration(declaration);
      } catch (error: any) {
        errors.push(error.message);
        continue;
      }
      const target = manifest.builtins.skills.find((item: any) => item.id === parsed.skillId);
      if (!target) {
        errors.push(`Package Skill contribution target is not a declared builtin Skill: ${parsed.skillId}.`);
        continue;
      }
      const targetFile = path.join(sourcePathFromBuiltin(target), 'SKILL.md');
      if (parsed.placement === 'slot') {
        const slotMarker = `<!-- buildr:skill-contributions ${parsed.slot} -->`;
        const targetContent = existsFile(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
        if (targetContent.split(slotMarker).length - 1 !== 1) {
          errors.push(`Package Skill contribution target does not declare slot ${parsed.slot}: ${parsed.skillId}.`);
        }
      }
      const fragmentFile = packageComponentSourcePath(parsed.fragment);
      if (existsFile(fragmentFile) && !fs.readFileSync(fragmentFile, 'utf8').trim()) {
        errors.push(`Package Skill contribution fragment must not be empty: ${parsed.fragment}.`);
      }
    }
    for (const [index, dependency] of (record.definition.contributions?.skillDependencies || []).entries()) {
      let parsed;
      try {
        parsed = parseSkillDependencyContribution(dependency, `Component ${record.entry.id} contributions.skillDependencies[${index}]`);
      } catch (error: any) {
        errors.push(error.message);
        continue;
      }
      if (!manifest.builtins.skills.some((item: any) => item.id === parsed.skillId)) errors.push(`Package Skill dependency target is not a declared builtin Skill: ${parsed.skillId}.`);
    }
    if (record.entry.id === 'openspec') {
      const contributionContent = (record.definition.contributions?.skillFragments || []).map((declaration: any) => {
        try {
          const { fragment } = parseSkillContributionDeclaration(declaration);
          const file = packageComponentSourcePath(fragment);
          return existsFile(file) ? fs.readFileSync(file, 'utf8') : '';
        } catch {
          return '';
        }
      }).join('\n');
      for (const requiredText of ['openspec validate <change> --strict', 'buildr openspec convergence preflight', 'Planning Review']) {
        if (!contributionContent.includes(requiredText)) errors.push(`OpenSpec Component Skill contributions must include ${JSON.stringify(requiredText)}.`);
      }
    }
    return errors;
  }

  function legacyComponentMemberDecision(targetRoot: any, manifest: any, definition: any, member: any, oldDefinition: any = null): any  {
    const { kind, builtin } = componentBuiltinForMember(manifest, definition, member);
    if (kind === 'skill' && builtin) {
      const entry = readSkillsManifestForWrite(targetRoot).find((item: any) => item.id === builtin.id);
      const desiredSource = member.startsWith('skills/openspec/') ? 'openspec' : 'buildr';
      const desiredPath = member.replace(/^skills\//, '');
      const knownOldFork = oldDefinition?.members?.skills?.includes(`skills/buildr/${builtin.id}`)
        && entry?.source === 'buildr'
        && entry?.path === `buildr/${builtin.id}`;
      if (entry && !knownOldFork && (entry.source !== desiredSource || entry.path !== desiredPath)) return `${kind}:${builtin.id} has a conflicting source or path`;
      if (entry && (entry.enabled === false || ['modified', 'missing', 'uninstalled'].includes(entry.state))) return `${kind}:${builtin.id} is ${entry.state || 'uninstalled'}`;
      if (entry && !knownOldFork && !assetIntegrity(path.join(targetRoot, member))) return `${kind}:${builtin.id} is missing`;
    }
    if (kind === 'rule' && builtin) {
      const entry = readRulesManifestForWrite(targetRoot).rules.find((item: any) => item.id === builtin.id);
      if (entry && (entry.source !== 'buildr' || entry.path !== member)) return `${kind}:${builtin.id} has a conflicting source or path`;
      if (entry && (entry.enabled === false || ['modified', 'missing', 'uninstalled'].includes(entry.state))) return `${kind}:${builtin.id} is ${entry.state || 'uninstalled'}`;
      if (entry && !assetIntegrity(path.join(targetRoot, member))) return `${kind}:${builtin.id} is missing`;
    }
    return null;
  }

  function isAdoptableLegacyComponentMember(targetRoot: any, manifest: any, definition: any, member: any): any  {
    const { kind, builtin } = componentBuiltinForMember(manifest, definition, member);
    if (!builtin) return false;
    if (kind === 'skill') {
      const expectedSource = member.startsWith('skills/openspec/') ? 'openspec' : 'buildr';
      return readSkillsManifestForWrite(targetRoot).some((entry: any) => entry.id === builtin.id && entry.source === expectedSource && entry.path === member.replace(/^skills\//, ''));
    }
    if (kind === 'rule') {
      return readRulesManifestForWrite(targetRoot).rules.some((entry: any) => entry.id === builtin.id && entry.source === 'buildr' && entry.path === member);
    }
    return false;
  }

  function buildComponentReconcilePlan(targetRoot: any, packageManifest: any, record: any): any  {
    const registry = readComponentsManifestForWrite(targetRoot);
    const existingEntry = registry.components.find((entry: any) => entry.id === record.entry.id) || null;
    const restoring = existingEntry?.enabled === false || existingEntry?.state === 'uninstalled';
    let oldDefinition: any = null;
    if (existingEntry && existsFile(componentDefinitionFile(targetRoot, existingEntry))) oldDefinition = readComponentDefinition(componentDefinitionFile(targetRoot, existingEntry), existingEntry.id);
    const inventory = componentInventory(targetRoot, { includeUninstalled: true });
    const issues: any[] = [...validatePackageComponentMembers(packageManifest, record)];
    const nextIntegrity = componentIntegrityMap(record.definition);
    const oldIntegrity = oldDefinition ? componentIntegrityMap(oldDefinition) : new Map();
    const nextMembers: any = new Set(componentMemberPaths(record.definition));
    const oldMembers: any = new Set(oldDefinition ? componentMemberPaths(oldDefinition) : []);

    for (const member of nextMembers) {
      const symlink = workspaceSymlinkSegment(targetRoot, member);
      if (symlink) issues.push(`Component member path crosses a symbolic link: ${symlink}.`);
      const owner = inventory.ownership.get(member);
      if (owner && owner !== record.entry.id) issues.push(`Member is owned by Component ${owner}: ${member}.`);
      const live = assetIntegrity(path.join(targetRoot, member));
      const expectedNew = nextIntegrity.get(member);
      if (restoring) {
        if (live && live !== expectedNew) issues.push(`Restore target conflicts with existing content: ${member}.`);
        continue;
      }
      if (oldMembers.has(member)) {
        const expectedOld = oldIntegrity.get(member);
        if (!live) issues.push(`Installed Component member is missing: ${member}.`);
        else if (live !== expectedOld && live !== expectedNew) issues.push(`Installed Component member is modified: ${member}.`);
      } else {
        const legacyDecision = legacyComponentMemberDecision(targetRoot, packageManifest, record.definition, member, oldDefinition);
        if (legacyDecision) issues.push(`Legacy Component migration requires a user decision: ${legacyDecision}.`);
        const adoptableLegacy = !existingEntry && isAdoptableLegacyComponentMember(targetRoot, packageManifest, record.definition, member);
        if (live && adoptableLegacy && live !== expectedNew) issues.push(`Legacy Component migration requires a user decision: modified member ${member}.`);
        else if (live && !adoptableLegacy) issues.push(`Component target conflicts with existing content: ${member}.`);
      }
    }
    for (const member of oldMembers) {
      if (nextMembers.has(member) || restoring) continue;
      const live = assetIntegrity(path.join(targetRoot, member));
      if (live && live !== oldIntegrity.get(member)) issues.push(`Removed Component member is modified: ${member}.`);
    }
    issues.push(...commandCollectionReferenceIssues(targetRoot, [...oldMembers].filter((member: any) => !nextMembers.has(member) && member.startsWith('commands/'))));
    const receiptPath = `components/buildr/${record.entry.id}/component.yml`;
    const receiptSymlink = workspaceSymlinkSegment(targetRoot, receiptPath);
    if (receiptSymlink) issues.push(`Component receipt path crosses a symbolic link: ${receiptSymlink}.`);
    return { registry, existingEntry, oldDefinition, restoring, issues, nextMembers, oldMembers };
  }

  function commandCollectionReferenceIssues(targetRoot: any, members: any): any  {
    const issues: any[] = [];
    for (const member of members) {
      const file = path.join(targetRoot, member);
      if (!existsFile(file)) continue;
      let manifest;
      try {
        manifest = parseCommandsManifestYaml(fs.readFileSync(file, 'utf8'));
      } catch (error: any) {
        issues.push(`Command collection cannot be parsed before removal: ${member}: ${error.message}`);
        continue;
      }
      const validationErrors = validateCommandsManifest(manifest);
      if (validationErrors.length) {
        issues.push(`Command collection is invalid before removal: ${member}: ${validationErrors.join('; ')}`);
        continue;
      }
      for (const command of manifest.commands) {
        // A legacy workspace default stored on the Component-owned definition
        // disappears with that definition. Component lifecycle only needs to
        // protect independent Project references (and unverifiable contexts).
        const blockers = commandRemovalBlockers(targetRoot, command.id, [file])
          .filter((item: any) => item.kind !== 'workspace-default');
        if (blockers.length) issues.push(`Command definition ${command.id} from ${member} is still referenced or cannot be safely checked: ${blockers.map((item: any) => {
          if (item.kind === 'project') return `Project ${item.project} (${item.path})`;
          if (item.kind === 'invalid-project-context') return `unverifiable Project context${item.project ? ` ${item.project}` : ''} (${item.path})`;
          return `workspace default (${item.path})`;
        }).join(', ')}.`);
      }
    }
    return issues;
  }

  function removeEmptyCommandCollectionParents(targetRoot: any, file: any): any  {
    let current = path.dirname(file);
    const commandsRoot = path.join(targetRoot, 'commands');
    while (current !== commandsRoot && current.startsWith(`${commandsRoot}${path.sep}`)) {
      if (!existsDirectory(current) || fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }

  function removeComponentMember(targetRoot: any, packageManifest: any, definition: any, member: any, rulesManifest: any, skillsManifest: any, changed: any): any  {
    const { kind, builtin } = componentBuiltinForMember(packageManifest, definition, member);
    const target = path.join(targetRoot, member);
    if (kind === 'rule') {
      const pathKey = builtin?.target || member;
      rulesManifest.rules = rulesManifest.rules.filter((entry: any) => entry.path !== pathKey && (!builtin || entry.id !== builtin.id));
      if (existsFile(target)) fs.rmSync(target, { force: true });
    } else if (kind === 'skill') {
      const skillPath = member.replace(/^skills\//, '');
      skillsManifest.splice(0, skillsManifest.length, ...skillsManifest.filter((entry: any) => entry.path !== skillPath && (!builtin || entry.id !== builtin.id)));
      if (existsDirectory(target)) fs.rmSync(target, { recursive: true, force: true });
    } else if (kind === 'commandCollection') {
      if (existsFile(target)) fs.rmSync(target, { force: true });
      removeEmptyCommandCollectionParents(targetRoot, target);
    } else if (kind === 'skillContribution') {
      if (existsFile(target)) fs.rmSync(target, { force: true });
      const componentRoot = path.join(targetRoot, 'components', definition.source, definition.id);
      let current = path.dirname(target);
      while (current !== componentRoot && current.startsWith(`${componentRoot}${path.sep}`)) {
        if (!existsDirectory(current) || fs.readdirSync(current).length > 0) break;
        fs.rmdirSync(current);
        current = path.dirname(current);
      }
    }
    changed.push(member);
  }

  function installComponentMember(targetRoot: any, packageManifest: any, definition: any, member: any, rulesManifest: any, skillsManifest: any, changed: any): any  {
    const { kind, builtin } = componentBuiltinForMember(packageManifest, definition, member);
    const source = packageComponentSourcePath(member);
    const target = path.join(targetRoot, member);
    if (kind === 'rule') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
      const desired = builtinRuleEntry(builtin);
      const index = rulesManifest.rules.findIndex((entry: any) => entry.id === desired.id);
      if (index === -1) rulesManifest.rules.push(desired);
      else rulesManifest.rules[index] = desired;
    } else if (kind === 'skill') {
      if (existsDirectory(target)) fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      const desired = builtinSkillEntry(builtin);
      const index = skillsManifest.findIndex((entry: any) => entry.id === desired.id);
      if (index === -1) skillsManifest.push(desired);
      else skillsManifest[index] = desired;
    } else if (kind === 'commandCollection') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
    } else if (kind === 'skillContribution') {
      ensureDirectory(path.dirname(target));
      fs.copyFileSync(source, target);
    }
    changed.push(member);
  }

  function componentReconcileAffectedPaths(targetRoot: any, record: any, plan: any): any  {
    const componentPath = `components/buildr/${record.entry.id}`;
    const definitionTarget = path.join(targetRoot, componentPath, 'component.yml');
    const affected: any[] = [
      ...new Set([...plan.oldMembers, ...plan.nextMembers].map((member: any) => path.join(targetRoot, member))),
      rulesManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      componentRegistryPath(targetRoot),
      definitionTarget,
    ];
    for (const target of [...affected]) {
      const missingParent = missingAncestorForMutation(targetRoot, path.dirname(target));
      if (missingParent) affected.push(missingParent);
    }
    return assertSafeSyncMutationPaths(targetRoot, affected);
  }

  function applyPackageComponent(targetRoot: any, packageManifest: any, record: any, preparedPlan: any = null): any  {
    const plan = preparedPlan || buildComponentReconcilePlan(targetRoot, packageManifest, record);
    if (plan.issues.length) throw new Error(`Component ${record.entry.id} cannot be reconciled:\n- ${plan.issues.join('\n- ')}`);
    const componentPath = `components/buildr/${record.entry.id}`;
    const definitionTarget = path.join(targetRoot, componentPath, 'component.yml');
    const affected = componentReconcileAffectedPaths(targetRoot, record, plan);
    return withWorkspaceMutation(targetRoot, `component.reconcile:${record.entry.id}`, affected, () => {
      const changed: any[] = [];
      const rulesManifest = readRulesManifestForWrite(targetRoot);
      const skillsManifest = readSkillsManifestForWrite(targetRoot);
      for (const member of plan.oldMembers) {
        if (!plan.nextMembers.has(member) && !plan.restoring) removeComponentMember(targetRoot, packageManifest, plan.oldDefinition, member, rulesManifest, skillsManifest, changed);
      }
      for (const member of plan.nextMembers) installComponentMember(targetRoot, packageManifest, record.definition, member, rulesManifest, skillsManifest, changed);
      if (record.definition.members.rules.length || plan.oldDefinition?.members.rules.length) changed.push(toPosixRelative(targetRoot, writeRulesManifest(targetRoot, rulesManifest)));
      if (record.definition.members.skills.length || plan.oldDefinition?.members.skills.length) changed.push(toPosixRelative(targetRoot, writeSkillsManifest(targetRoot, skillsManifest)));
      const nextEntry: any = { id: record.entry.id, source: 'buildr', path: componentPath, enabled: true, required: record.entry.required === true, state: 'installed' };
      const registryIndex = plan.registry.components.findIndex((entry: any) => entry.id === record.entry.id);
      if (registryIndex === -1) plan.registry.components.push(nextEntry);
      else plan.registry.components[registryIndex] = nextEntry;
      changed.push(toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, plan.registry)));
      atomicWriteFile(definitionTarget, fs.readFileSync(record.file));
      changed.push(toPosixRelative(targetRoot, definitionTarget));
      return { id: record.entry.id, status: 'installed', changed: [...new Set(changed)] };
    });
  }

  function packageComponentsStatus(targetRoot: any, packageManifest: any = readPackageManifest()): any  {
    let inventory;
    try {
      inventory = componentInventory(targetRoot, { includeUninstalled: true });
    } catch (error: any) {
      return { targetRoot, components: [], findings: [{ status: 'invalid', id: null, error: error.message }], ownership: new Map() };
    }
    const byId: any = new Map(inventory.components.map((item: any) => [item.entry.id, item]));
    const components: any[] = [];
    for (const entry of packageManifest.components) {
      const existing = byId.get(entry.id);
      let status = existing?.status || (entry.defaultEnabled === true ? 'missing' : 'available');
      let availableVersion: any = null;
      let installedVersion = existing?.definition?.version || null;
      try {
        const record = packageComponentDefinition(entry);
        availableVersion = record.definition.version;
        if (status === 'installed' && installedVersion !== availableVersion) status = 'update-available';
      } catch (error: any) {
        status = 'invalid';
        components.push({ id: entry.id, source: existing?.entry.source || 'buildr', expectedState: existing?.entry.state || (entry.defaultEnabled === true ? 'installed' : 'available'), enabled: existing ? existing.entry.enabled !== false : entry.defaultEnabled === true, status, required: entry.required === true, defaultEnabled: entry.defaultEnabled === true, installedVersion, availableVersion, error: error.message, members: existing?.members || [], nextAction: `buildr component check ${entry.id} --target ${targetRoot} --json` });
        continue;
      }
      components.push({ id: entry.id, source: existing?.entry.source || 'buildr', expectedState: existing?.entry.state || (entry.defaultEnabled === true ? 'installed' : 'available'), enabled: existing ? existing.entry.enabled !== false : entry.defaultEnabled === true, status, required: entry.required === true, defaultEnabled: entry.defaultEnabled === true, installedVersion, availableVersion, members: existing?.members || [], nextAction: status === 'uninstalled' || status === 'missing' ? `buildr component install ${entry.id} --agent <agent> --target ${targetRoot}` : `buildr component check ${entry.id} --target ${targetRoot} --json` });
    }
    for (const existing of inventory.components) {
      if (!packageManifest.components.some((entry: any) => entry.id === existing.entry.id)) components.push({ id: existing.entry.id, source: existing.entry.source, expectedState: existing.entry.state || 'installed', enabled: existing.entry.enabled !== false, status: existing.status, required: existing.entry.required === true, installedVersion: existing.definition?.version || null, availableVersion: null, members: existing.members, nextAction: `buildr component check ${existing.entry.id} --target ${targetRoot} --json` });
    }
    return { targetRoot, components, findings: inventory.findings, ownership: inventory.ownership };
  }

  function planPackageComponentsSync(targetRoot: any, options: any = {}): any  {
    const packageManifest = readPackageManifest();
    const onlyId = options.onlyId || null;
    const status = packageComponentsStatus(targetRoot, packageManifest);
    const findings: any[] = [];
    const componentStatus: any = new Map(status.components.map((item: any) => [item.id, item]));
    const errors = status.findings.map((item: any) => {
      const owners = [item.id, item.componentId, ...(item.owners || [])].filter(Boolean);
      return { id: item.id || item.componentId || null, required: owners.some((id: any) => componentStatus.get(id)?.required === true), error: item.error || item.message || item.code || 'Component inventory is invalid.' };
    });
    const plans: any[] = [];
    const affectedPaths: any[] = [];
    const registry = readComponentsManifestForWrite(targetRoot);
    for (const entry of packageManifest.components) {
      if (onlyId && entry.id !== onlyId) continue;
      const installed = registry.components.find((item: any) => item.id === entry.id);
      if (installed && (installed.enabled === false || installed.state === 'uninstalled') && !options.restore) {
        findings.push({ id: entry.id, status: 'uninstalled', required: entry.required === true });
        continue;
      }
      if (!installed && entry.defaultEnabled !== true && !options.restore) {
        findings.push({ id: entry.id, status: 'available', required: entry.required === true });
        continue;
      }
      try {
        const record = packageComponentDefinition(entry);
        const plan = buildComponentReconcilePlan(targetRoot, packageManifest, record);
        if (plan.issues.length) throw new Error(`Component ${entry.id} cannot be reconciled:\n- ${plan.issues.join('\n- ')}`);
        const componentAffectedPaths = componentReconcileAffectedPaths(targetRoot, record, plan);
        plans.push({ id: entry.id, record, plan, affectedPaths: componentAffectedPaths });
        affectedPaths.push(...componentAffectedPaths);
        findings.push({ id: entry.id, status: 'installed', required: entry.required === true });
      } catch (error: any) {
        const finding: any = { id: entry.id, status: 'blocked', required: entry.required === true, error: error.message };
        findings.push(finding);
        errors.push(finding);
      }
    }
    const safeAffectedPaths = assertSafeSyncMutationPaths(targetRoot, affectedPaths);
    const signature = JSON.stringify({
      findings,
      errors: errors.map(({ id, required, error }: any) => ({ id, required, error })),
      affectedPaths: safeAffectedPaths.map((item: any) => ({ path: toPosixRelative(targetRoot, item), fingerprint: mutationPathFingerprint(item) })).sort((left: any, right: any) => left.path.localeCompare(right.path)),
    });
    return { targetRoot, changed: [], findings, errors, plans, affectedPaths: safeAffectedPaths, signature };
  }

  function syncPackageComponents(targetRoot: any, options: any = {}): any  {
    const packageManifest = readPackageManifest();
    const checkOnly = options.checkOnly === true;
    const onlyId = options.onlyId || null;
    if (checkOnly) return planPackageComponentsSync(targetRoot, options);
    const changed: any[] = [];
    const findings: any[] = [];
    const registry = readComponentsManifestForWrite(targetRoot);
    const preparedPlans: any = new Map((options.plans || []).map((item: any) => [item.id, item]));
    const preparedFindings: any = new Map((options.preparedFindings || []).map((item: any) => [item.id, item]));
    for (const entry of packageManifest.components) {
      if (onlyId && entry.id !== onlyId) continue;
      const installed = registry.components.find((item: any) => item.id === entry.id);
      if (installed && (installed.enabled === false || installed.state === 'uninstalled') && !options.restore) {
        findings.push({ id: entry.id, status: 'uninstalled', required: entry.required === true });
        continue;
      }
      if (!installed && entry.defaultEnabled !== true && !options.restore) {
        findings.push({ id: entry.id, status: 'available', required: entry.required === true });
        continue;
      }
      if (options.strictPreparedPlans === true && !preparedPlans.has(entry.id)) {
        const preparedFinding = preparedFindings.get(entry.id);
        findings.push(preparedFinding || { id: entry.id, status: 'blocked', required: entry.required === true, error: 'Component was not independently ready in the locked sync plan.' });
        continue;
      }
      try {
        const prepared = preparedPlans.get(entry.id);
        const record = prepared?.record || packageComponentDefinition(entry);
        const result = applyPackageComponent(targetRoot, packageManifest, record, prepared?.plan || null);
        changed.push(...result.changed);
        findings.push({ id: entry.id, status: 'installed', required: entry.required === true });
      } catch (error: any) {
        findings.push({ id: entry.id, status: 'blocked', required: entry.required === true, error: error.message });
      }
    }
    return { targetRoot, changed: [...new Set(changed)], findings, errors: findings.filter((item: any) => item.status === 'blocked') };
  }

  function assertWorkspaceComponentScope(scope: any = '.'): any  {
    if (scope !== '.') throw new Error(`Components currently support only workspace scope "."; Project and Service Components are not supported: ${scope}`);
  }

  function componentListOrCheck(input: any): any  {
    const { targetRoot, id = null, checkOnlyOne = false } = input;
    assertWorkspaceComponentScope(input.scope);
    if (!checkOnlyOne && id) throw new Error('component list does not accept a Component id.');
    assertInitializedBuildrWorkspace(targetRoot);
    const result = packageComponentsStatus(targetRoot);
    if (id) result.components = result.components.filter((item: any) => item.id === id);
    if (id && result.components.length === 0) throw new Error(`Component not found: ${id}`);
    result.ok = result.findings.length === 0 && result.components.every((item: any) => !['invalid', 'modified', 'missing', 'blocked'].includes(item.status));
    return result;
  }

  function installWorkspaceComponent(targetRoot: any, id: any): any  {
    const registry = readComponentsManifestForWrite(targetRoot);
    const index = registry.components.findIndex((entry: any) => entry.id === id);
    if (index === -1 || registry.components[index].source !== 'workspace') return null;
    const entry = registry.components[index];
    const definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), id);
    if (definition.source !== 'workspace') throw new Error(`Workspace Component definition source must be workspace: ${id}`);
    const inventory = componentInventory(targetRoot, { includeUninstalled: true });
    const integrity = componentIntegrityMap(definition);
    const issues: any[] = [];
    for (const member of componentMemberPaths(definition)) {
      const owner = inventory.ownership.get(member);
      if (owner && owner !== id) issues.push(`Member is owned by Component ${owner}: ${member}.`);
      const actual = assetIntegrity(path.join(targetRoot, member));
      if (!actual) issues.push(`Workspace Component member is missing: ${member}.`);
      else if (actual !== integrity.get(member)) issues.push(`Workspace Component member integrity differs: ${member}.`);
    }
    if (issues.length) throw new Error(`Component ${id} cannot be installed:\n- ${issues.join('\n- ')}`);
    registry.components[index] = { ...entry, enabled: true, state: 'installed' };
    delete registry.components[index].reason;
    return { id, status: 'installed', changed: [toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, registry))] };
  }

  function declaredRuntimeSkillPaths(targetRoot: any, agent: any): any  {
    const declared: any = new Set(['buildr']);
    const scopeRoots: any[] = [targetRoot, ...listManagedDirectories(path.join(targetRoot, 'projects')).map((project: any) => path.join(targetRoot, 'projects', project))];
    for (const scopeRoot of scopeRoots) {
      let skills;
      try {
        skills = readSkillsManifestForWrite(scopeRoot);
      } catch {
        continue;
      }
      for (const skill of skills) {
        if (skill.enabled === false || skill.state === 'uninstalled' || skill.install?.mode === 'agent') continue;
        if (Array.isArray(skill.runtimes) && !skill.runtimes.includes(agent)) continue;
        declared.add(skill.runtimePath || skill.id);
      }
    }
    return declared;
  }

  function declaredRuntimeInstallPlanIds(targetRoot: any, agent: any): any  {
    const declared: any = new Set();
    const scopeRoots: any[] = [targetRoot, ...listManagedDirectories(path.join(targetRoot, 'projects')).map((project: any) => path.join(targetRoot, 'projects', project))];
    for (const scopeRoot of scopeRoots) {
      let skills;
      try {
        skills = readSkillsManifestForWrite(scopeRoot);
      } catch {
        continue;
      }
      for (const skill of skills) {
        if (skill.enabled === false || skill.state === 'uninstalled' || skill.install?.mode !== 'agent') continue;
        if (Array.isArray(skill.runtimes) && !skill.runtimes.includes(agent)) continue;
        declared.add(skill.id);
      }
    }
    return declared;
  }

  function managedRuntimeSkillOrphans(targetRoot: any, agent: any, options: any = {}): any  {
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const skillsRoot = path.join(targetRoot, runtimeRoot, 'skills');
    const declared = declaredRuntimeSkillPaths(targetRoot, agent);
    const orphans: any[] = [];
    const receiptRuntimePaths: any = new Set();
    const receiptsByRuntimePath: any = new Map();
    const receiptRoots: any[] = [
      { root: skillProjectionOwnershipReceiptRoot(targetRoot, 'workspace', agent), target: (runtimePath: any) => skillProjectionOwnershipReceiptTarget(targetRoot, 'workspace', agent, runtimePath) },
      { root: legacySkillProjectionOwnershipReceiptRoot(targetRoot, runtimeRoot, agent), target: (runtimePath: any) => legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, agent, runtimePath) },
    ];
    for (const location of receiptRoots) {
      for (const receiptFile of existsDirectory(location.root) ? collectFiles(location.root) : []) {
        if (!receiptFile.endsWith('.json')) continue;
        const receipt = readSkillProjectionReceipt(receiptFile, { adapterId: agent, destination: 'workspace' });
        const expectedReceipt = location.target(receipt.runtimePath);
        if (path.resolve(expectedReceipt) !== path.resolve(receiptFile)) throw new Error(`Runtime Skill projection ownership receipt target mismatch: ${receiptFile}`);
        const existing = receiptsByRuntimePath.get(receipt.runtimePath);
        if (existing && !skillProjectionOwnershipReceiptsEquivalent(existing.receipt, receipt)) {
          throw new Error(`Skill projection ownership receipt conflict; canonical and legacy receipts differ, so no files were changed: ${receipt.runtimePath}`);
        }
        receiptsByRuntimePath.set(receipt.runtimePath, { receipt, receiptFiles: [...(existing?.receiptFiles || []), receiptFile] });
      }
    }
    for (const [runtimePath, receiptEntry] of receiptsByRuntimePath) {
      receiptRuntimePaths.add(runtimePath);
      if (declared.has(runtimePath) && options.runtimePath !== runtimePath) continue;
      const targetDir = path.join(skillsRoot, ...runtimePath.split('/'));
      orphans.push({ runtimePath, path: toPosixRelative(targetRoot, targetDir), targetDir, ...receiptEntry });
    }
    for (const runtimePath of listManagedDirectories(skillsRoot)) {
      if (receiptRuntimePaths.has(runtimePath)) continue;
      if (declared.has(runtimePath) && options.runtimePath !== runtimePath) continue;
      const targetDir = path.join(skillsRoot, runtimePath);
      if (fs.lstatSync(targetDir).isSymbolicLink()) continue;
      const skillFile = path.join(targetDir, 'SKILL.md');
      if (!existsFile(skillFile) || !hasManagedSkillMarker(fs.readFileSync(skillFile, 'utf8'))) continue;
      orphans.push({ runtimePath, path: toPosixRelative(targetRoot, targetDir), targetDir });
    }
    return orphans;
  }

  function buildRuntimeOrphanRemovalPlan(targetRoot: any, agent: any, scope: any = '.', options: any = {}): any  {
    if (scope !== '.') return [];
    const removals: any[] = [];
    const conflicts: any[] = [];
    for (const orphan of managedRuntimeSkillOrphans(targetRoot, agent, options)) {
      if (options.runtimePath && orphan.runtimePath !== options.runtimePath) continue;
      if (orphan.receipt) {
        const actualFiles = existsDirectory(orphan.targetDir) ? collectFiles(orphan.targetDir) : [];
        const expectedByPath: any = new Map(orphan.receipt.files.map((file: any) => [file.path, file]));
        const unknown = actualFiles.filter((file: any) => !expectedByPath.has(toPosixRelative(orphan.targetDir, file)));
        const modified = actualFiles.filter((file: any) => {
          const expected = expectedByPath.get(toPosixRelative(orphan.targetDir, file));
          return expected && !runtimeFileMatches(file, expected.integrity, expected.executable);
        });
        if (unknown.length || modified.length) {
          conflicts.push(`${orphan.path}: ${unknown.length ? `包含非 Buildr 管理的额外文件 ${unknown.map((file: any) => toPosixRelative(orphan.targetDir, file)).join(', ')}` : ''}${unknown.length && modified.length ? '；' : ''}${modified.length ? `受管文件已修改 ${modified.map((file: any) => toPosixRelative(orphan.targetDir, file)).join(', ')}` : ''}`);
          continue;
        }
        for (const [relative, expected] of expectedByPath) {
          const file = path.join(orphan.targetDir, ...relative.split('/'));
          if (!existsFile(file)) continue;
          removals.push({
            type: 'file',
            path: file,
            expectedIntegrity: expected.integrity,
            expectedExecutable: expected.executable,
            pruneEmptyRoot: orphan.targetDir,
            source: `runtime Skill ${orphan.runtimePath}`,
          });
        }
        for (const receiptFile of orphan.receiptFiles) {
          removals.push({
            type: 'file',
            path: receiptFile,
            expectedIntegrity: sha256Integrity(fs.readFileSync(receiptFile)),
            pruneEmptyRoot: path.dirname(receiptFile),
            source: `Skill projection ownership receipt ${orphan.runtimePath}`,
          });
        }
        continue;
      }
      const files = collectFiles(orphan.targetDir);
      if (files.length !== 1 || files[0] !== path.join(orphan.targetDir, 'SKILL.md')) {
        conflicts.push(`${orphan.path}: 包含非 Buildr 管理的额外文件`);
      } else {
        removals.push({ type: 'directory', path: orphan.targetDir });
      }
    }
    const runtimeRoot = getRuntimeAdapter(agent).traits.skills.root;
    const plansRoot = path.join(targetRoot, runtimeRoot, 'buildr', 'skill-install-plans');
    const declaredPlans = declaredRuntimeInstallPlanIds(targetRoot, agent);
    if (!options.runtimePath && existsDirectory(plansRoot)) {
      for (const name of fs.readdirSync(plansRoot).sort()) {
        if (!name.endsWith('.md') || declaredPlans.has(name.slice(0, -3))) continue;
        const file = path.join(plansRoot, name);
        if (!existsFile(file)) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes('<!-- Generated by Buildr. Agent action required.')) continue;
        removals.push({ type: 'file', path: file });
      }
    }
    if (conflicts.length) throw new Error(`无法清理旧运行时文件：\n- ${conflicts.join('\n- ')}`);
    return removals.sort((left: any, right: any) => left.path.localeCompare(right.path));
  }

  function reconcileComponentRuntime(targetRoot: any, agent: any): any  {
    let rendered;
    try {
      rendered = renderRuntime(agent, ['--target', targetRoot, '--scope', '.']);
    } catch (error: any) {
      throw new Error(`Component 源资产已提交，但 ${agent} runtime reconcile 失败：${error.message}\n修复后运行：buildr sync ${agent} --target ${targetRoot}`);
    }
    const finalDoctor = (runFinalDoctor as any)({
      invocation: dependencies.currentProductInvocation(),
      agent,
      targetRoot,
      cwd: productRoot(),
    });
    if (finalDoctor.classification.status !== 'passed') {
      const detail = finalDoctor.classification.diagnostic ? `\n${finalDoctor.classification.diagnostic}` : '';
      throw new Error(`Component 源资产和 runtime 已 reconcile，但 ${finalDoctor.classification.message}${detail}\n修复后运行：buildr doctor --agent ${agent} --target ${targetRoot} --json`);
    }
    return rendered;
  }

  function componentInstall(input: any): any  {
    const { id, agent, targetRoot } = input;
    assertWorkspaceComponentScope(input.scope);
    assertAgentId(agent);
    if (!isSupportedAgent(agent)) throw new Error(`Unsupported Agent runtime: ${agent}`);
    assertInitializedBuildrWorkspace(targetRoot);
    const packageManifest = readPackageManifest();
    const entry = packageComponentEntry(packageManifest, id);
    let synced;
    if (entry) {
      synced = syncPackageComponents(targetRoot, { onlyId: id, restore: true });
      if (synced.errors.length) throw new Error(synced.errors[0].error);
    } else {
      synced = installWorkspaceComponent(targetRoot, id);
      if (!synced) throw new Error(`Component not found in package or workspace registry: ${id}`);
    }
    const rendered = reconcileComponentRuntime(targetRoot, agent);
    return { operation: 'install', id, targetRoot, changed: synced.changed, renderedFiles: rendered.files };
  }

  function componentUninstall(input: any): any  {
    const { id, agent, targetRoot, reason = null } = input;
    assertWorkspaceComponentScope(input.scope);
    assertAgentId(agent);
    if (!isSupportedAgent(agent)) throw new Error(`Unsupported Agent runtime: ${agent}`);
    assertInitializedBuildrWorkspace(targetRoot);
    const registry = readComponentsManifestForWrite(targetRoot);
    const index = registry.components.findIndex((entry: any) => entry.id === id);
    if (index === -1) throw new Error(`Installed Component not found: ${id}`);
    const entry = registry.components[index];
    if (entry.required === true) throw new Error(`Required Component cannot be uninstalled: ${id}`);
    if (entry.enabled === false || entry.state === 'uninstalled') throw new Error(`Component is already uninstalled: ${id}`);
    const definition = readComponentDefinition(componentDefinitionFile(targetRoot, entry), id);
    const integrity = componentIntegrityMap(definition);
    const modified = componentMemberPaths(definition).filter((member: any) => assetIntegrity(path.join(targetRoot, member)) !== integrity.get(member));
    if (modified.length) throw new Error(`Component ${id} has modified or missing members and cannot be uninstalled:\n- ${modified.join('\n- ')}`);
    const commandReferenceIssues = commandCollectionReferenceIssues(targetRoot, componentMemberPaths(definition).filter((member: any) => member.startsWith('commands/')));
    if (commandReferenceIssues.length) throw new Error(`Component ${id} cannot be uninstalled while Command definitions are referenced:\n- ${commandReferenceIssues.join('\n- ')}`);
    const packageManifest = readPackageManifest();
    const affected: any[] = [
      ...componentMemberPaths(definition).map((member: any) => path.join(targetRoot, member)),
      rulesManifestPath(targetRoot),
      skillsManifestPath(targetRoot),
      componentRegistryPath(targetRoot),
    ];
    const { changed } = withWorkspaceMutation(targetRoot, `component.uninstall:${id}`, affected, () => {
      const changed: any[] = [];
      const rulesManifest = readRulesManifestForWrite(targetRoot);
      const skillsManifest = readSkillsManifestForWrite(targetRoot);
      for (const member of componentMemberPaths(definition)) removeComponentMember(targetRoot, packageManifest, definition, member, rulesManifest, skillsManifest, changed);
      if (definition.members.rules.length) changed.push(toPosixRelative(targetRoot, writeRulesManifest(targetRoot, rulesManifest)));
      if (definition.members.skills.length) changed.push(toPosixRelative(targetRoot, writeSkillsManifest(targetRoot, skillsManifest)));
      registry.components[index] = { ...entry, enabled: false, state: 'uninstalled' };
      if (reason) registry.components[index].reason = reason;
      changed.push(toPosixRelative(targetRoot, writeComponentsManifest(targetRoot, registry)));
      return { changed };
    });
    const rendered = reconcileComponentRuntime(targetRoot, agent);
    return { operation: 'uninstall', id, targetRoot, changed: [...new Set(changed)], renderedFiles: rendered.files };
  }

  return Object.freeze({
    componentRegistryPath,
    renderComponentsManifestYaml,
    readComponentsManifestForWrite,
    componentMemberPaths,
    readComponentDefinition,
    componentDefinitionFile,
    componentOwnerForMember,
    packageComponentDefinition,
    packageComponentSourcePath,
    validatePackageComponentMembers,
    packageComponentsStatus,
    syncPackageComponents,
    componentListOrCheck,
    managedRuntimeSkillOrphans,
    buildRuntimeOrphanRemovalPlan,
    componentInstall,
    componentUninstall,
  });
}
