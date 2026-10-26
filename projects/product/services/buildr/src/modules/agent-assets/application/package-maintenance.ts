import { adoptPackageResources, resolveSharedResource } from '../../../infrastructure/product-resources/shared-resources.ts';
import { SUPPORTED_AGENT_IDS, getRuntimeAdapter, resolveRuntimeAdapter } from '../infrastructure/runtime/adapter-contract.ts';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { BUILDR_REQUIRED_BLOCK_START, GENERATED_USER_REGISTRY_RESOURCE_SOURCES, LEGACY_PACKAGE_PATHS, PACKAGE_RUNTIME_TARGET, RESOURCE_WORKSPACE_ROOT } from '../../../infrastructure/product-layout.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import { createPackageOutput } from './package-maintenance/output.ts';
import { createBuiltinReceipts } from './package-maintenance/builtin-receipts.ts';
import { createBuiltinReplacement } from './package-maintenance/builtin-replacement.ts';
import { retireLegacyCoreRule, retireOrphanedBuiltinSkills } from './package-maintenance/builtin-retirement.ts';
import { createPackageSyncPlan } from './package-maintenance/sync-plan.ts';
import { createBuiltinLifecycle } from './package-maintenance/builtin-lifecycle.ts';
import { createCapabilityRetirement } from './package-maintenance/capability-retirement.ts';
import type { SkillConnectionImpactReader } from './connection-impact.ts';
export interface PackageMaintenanceDependencies {
  retirePackagedArchify: ReturnType<typeof import('./components.ts').registerDomainsComponents>['retirePackagedArchify'];
  connectionImpacts?: SkillConnectionImpactReader;
  WORKSPACE_ROOT_GITIGNORE_ENTRIES: readonly string[];
  isPlainObject: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['isPlainObject'];
  readCommandsManifestForWrite: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['readCommandsManifestForWrite'];
  writeCommandsManifest: ReturnType<typeof import('./commands.ts').registerDomainsCommands>['writeCommandsManifest'];
  assertNoUnknownOptions: typeof import('../../../infrastructure/cli-arguments.ts').assertNoUnknownOptions;
  positionalArgs: typeof import('../../../infrastructure/cli-arguments.ts').positionalArgs;
  packageComponentsStatus: ReturnType<typeof import('./components.ts').registerDomainsComponents>['packageComponentsStatus'];
  readPackageManifest: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['readPackageManifest'];
  parseManifestFileEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['parseManifestFileEntry'];
  collectFiles: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['collectFiles'];
  builtinRuleEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['builtinRuleEntry'];
  builtinSkillEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['builtinSkillEntry'];
  builtinCommandEntry: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['builtinCommandEntry'];
  sourcePathFromBuiltin: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['sourcePathFromBuiltin'];
  targetPathFromBuiltin: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['targetPathFromBuiltin'];
  missingAncestorForMutation: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['missingAncestorForMutation'];
  mutationPathFingerprint: (...args: any[]) => any;
  packageRegistryMutationPaths: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['packageRegistryMutationPaths'];
  assertSafeSyncMutationPaths: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['assertSafeSyncMutationPaths'];
  convergeRegistryManifests: ReturnType<typeof import('./package-maintenance/package-assets.ts').registerAgentAssetsPackageAssets>['convergeRegistryManifests'];
  readRulesManifestForWrite: ReturnType<typeof import('./rules.ts').registerDomainsRules>['readRulesManifestForWrite'];
  writeRulesManifest: ReturnType<typeof import('./rules.ts').registerDomainsRules>['writeRulesManifest'];
  readSkillsManifestForWrite: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['readSkillsManifestForWrite'];
  writeSkillsManifest: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['writeSkillsManifest'];
  manifestDocumentFor: ReturnType<typeof import('./skills.ts').registerDomainsSkills>['manifestDocumentFor'];
  optionValue: typeof import('../../../infrastructure/cli-arguments.ts').optionValue;
  ensureDirectory: (...args: any[]) => any;
  atomicWriteJson: typeof import('../../../infrastructure/filesystem/atomic-files.ts').atomicWriteJson;
  assertSafeAssetTarget: (targetRoot: string, target: string, containerRoot: string, label?: string) => string;
  withWorkspaceMutation: (...args: any[]) => any;
  buildRuntimeOrphanRemovalPlan: ReturnType<typeof import('./components.ts').registerDomainsComponents>['buildRuntimeOrphanRemovalPlan'];
  productRoot: () => string;
  resourcesRoot: () => string;
  appendGitignoreEntries: (...args: any[]) => any;
  hasFlag: typeof import('../../../infrastructure/cli-arguments.ts').hasFlag;
  toPosixRelative: (...args: any[]) => any;
  existsDirectory: (file: string) => boolean;
  existsFile: (file: string) => boolean;
  ensureRootRequiredBlock: typeof import('../../../infrastructure/filesystem/required-block.ts').ensureRootRequiredBlock;
  copyFileIfChanged: (...args: any[]) => any;
  copyDirectoryIfChanged: (...args: any[]) => any;
  removePath: (...args: any[]) => any;
  assertInitializedBuildrWorkspace: typeof import('../../../infrastructure/filesystem/workspace-identity.ts').assertInitializedBuildrWorkspace;
}

export function registerApplicationPackageMaintenance(dependencies: PackageMaintenanceDependencies) {
  const {
    WORKSPACE_ROOT_GITIGNORE_ENTRIES,
    isPlainObject,
    readCommandsManifestForWrite,
    writeCommandsManifest,
    assertNoUnknownOptions,
    positionalArgs,
    packageComponentsStatus,
    readPackageManifest,
    parseManifestFileEntry,
    collectFiles,
    builtinRuleEntry,
    builtinSkillEntry,
    builtinCommandEntry,
    sourcePathFromBuiltin,
    targetPathFromBuiltin,
    missingAncestorForMutation,
    mutationPathFingerprint,
    packageRegistryMutationPaths,
    assertSafeSyncMutationPaths,
    convergeRegistryManifests,
    readRulesManifestForWrite,
    writeRulesManifest,
    readSkillsManifestForWrite,
    writeSkillsManifest,
    manifestDocumentFor,
    optionValue,
    ensureDirectory,
    atomicWriteJson,
    assertSafeAssetTarget,
    withWorkspaceMutation,
    buildRuntimeOrphanRemovalPlan,
    productRoot,
    resourcesRoot,
    appendGitignoreEntries,
    hasFlag,
    toPosixRelative,
    existsDirectory,
    existsFile,
    ensureRootRequiredBlock,
    copyFileIfChanged,
    copyDirectoryIfChanged,
    removePath,
    assertInitializedBuildrWorkspace,
  } = dependencies;
  const {
    key: builtinReceiptKey,
    snapshot: builtinSnapshot,
    read: readBuiltinReceipts,
    write: writeBuiltinReceipts,
    fromSnapshot: receiptFromSnapshot,
    resolveState: resolveBuiltinState,
  } = createBuiltinReceipts({ atomicWriteJson, collectFiles, crypto, ensureDirectory, existsDirectory, existsFile, fs, isPlainObject, path, toPosixRelative });
  const { handleSkillReplacement } = createBuiltinReplacement({ builtinReceiptKey, builtinSnapshot, copyDirectoryIfChanged, existsDirectory, path });
  const { applyCapabilityRetirements } = createCapabilityRetirement({ assertSafeAssetTarget, crypto, existsFile, fs, path, removePath });
  const { packageBuiltinMutationPaths, builtinSyncPlanSignature } = createPackageSyncPlan({ assertSafeSyncMutationPaths, missingAncestorForMutation, mutationPathFingerprint, packageRegistryMutationPaths, path, readPackageManifest, targetPathFromBuiltin, toPosixRelative });

  function syncPackageBuiltins(targetRoot: any, options: any = {}): any  {
    const manifest = readPackageManifest();
    const changed: any[] = [];
    const findings: any[] = [];
    const restoreOutcomes: any[] = [];
    const restoreId = options.restoreId || null;
    const checkOnly = options.checkOnly === true;
    if (!checkOnly) adoptPackageResources(targetRoot);
    const retirement = manifest.components.some((entry: any) => entry.id === 'archify') ? { changed: [], findings: [] } : dependencies.retirePackagedArchify(targetRoot, checkOnly);
    changed.push(...retirement.changed); findings.push(...retirement.findings);
    const componentStatusById: any = new Map(packageComponentsStatus(targetRoot, manifest).components.map((item: any) => [item.id, item.status]));
    const receipts = readBuiltinReceipts(targetRoot);
    const receiptByKey: any = new Map(receipts.builtins.map((item: any) => [builtinReceiptKey(item.type, item.id), item]));
    let receiptsChanged = false;
    const updateReceipt = (type: any, builtin: any, snapshot: any) => {
      const key = builtinReceiptKey(type, builtin.id);
      const next = receiptFromSnapshot(type, builtin, snapshot);
      const existing = receiptByKey.get(key);
      if (JSON.stringify(existing) === JSON.stringify(next)) return;
      if (existing) receipts.builtins[receipts.builtins.indexOf(existing)] = next;
      else receipts.builtins.push(next);
      receiptByKey.set(key, next);
      receiptsChanged = true;
    };

    const removeReceipt = (type: any, builtin: any) => {
      const key = builtinReceiptKey(type, builtin.id);
      const existing = receiptByKey.get(key);
      if (!existing) return;
      receipts.builtins.splice(receipts.builtins.indexOf(existing), 1);
      receiptByKey.delete(key);
      receiptsChanged = true;
    };

    if (!checkOnly) {
      ensureRootRequiredBlock(targetRoot, changed);
      changed.push(...convergeRegistryManifests(targetRoot));
      if (appendGitignoreEntries(path.join(targetRoot, '.gitignore'), [...WORKSPACE_ROOT_GITIGNORE_ENTRIES])) {
        changed.push('.gitignore');
      }
    }

    const rulesManifest = readRulesManifestForWrite(targetRoot);
    retireLegacyCoreRule({ targetRoot, rulesManifest, receiptByKey, builtinSnapshot, removeReceipt, changed, findings, checkOnly });
    const rulesById: any = new Map(rulesManifest.rules.map((rule: any, index: any) => [rule.id, { rule, index }]));
    for (const builtin of manifest.builtins.rules) {
      if (builtin.component) {
        findings.push({ type: 'rule', id: builtin.id, required: builtin.required === true, status: componentStatusById.get(builtin.component) || 'missing', path: builtin.target, component: builtin.component, lifecycle: `buildr component check ${builtin.component} --target ${targetRoot} --json` });
        continue;
      }
      const sourceFile = sourcePathFromBuiltin(builtin);
      const targetFile = targetPathFromBuiltin(targetRoot, builtin);
      const existing = rulesById.get(builtin.id)?.rule || null;
      const isRestore = restoreId === builtin.id;
      const isNew = !existing;
      const isUninstalled = existing?.state === 'uninstalled' || existing?.enabled === false;
      const desired = builtinRuleEntry(builtin);
      const newSnapshot = builtinSnapshot(sourceFile, 'rule');
      const liveSnapshot = builtinSnapshot(targetFile, 'rule');
      const state = resolveBuiltinState({ type: 'rule', builtin, liveSnapshot, newSnapshot, oldReceipt: receiptByKey.get(builtinReceiptKey('rule', builtin.id)), isRestore, required: builtin.required === true });
      const status = isUninstalled && !isRestore ? 'uninstalled' : state.status;
      findings.push({ type: 'rule', id: builtin.id, required: builtin.required === true, status, path: builtin.target, ...(liveSnapshot ? { liveIntegrity: liveSnapshot.integrity } : {}), converge: state.converge === true || (isNew && !liveSnapshot) });

      if (checkOnly) {
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'rule', status: 'ready', replacementFrom: null, path: builtin.target, reason: null });
        continue;
      }
      if (isUninstalled && !isRestore && !builtin.required) {
        removeReceipt('rule', builtin);
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'modified') {
        const updated: any = { ...existing, state: 'modified' };
        rulesManifest.rules[rulesById.get(builtin.id).index] = updated;
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'missing') {
        const updated: any = { ...existing, state: 'missing' };
        rulesManifest.rules[rulesById.get(builtin.id).index] = updated;
        continue;
      }
      if (builtin.required || isNew || isRestore || state.converge || state.adopt) {
        if (copyFileIfChanged(sourceFile, targetFile)) changed.push(builtin.target);
        if (rulesById.has(builtin.id)) {
          rulesManifest.rules[rulesById.get(builtin.id).index] = desired;
        } else {
          rulesManifest.rules.push(desired);
        }
        updateReceipt('rule', builtin, newSnapshot);
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'rule', status: 'restored', replacementFrom: null, path: builtin.target, reason: null });
      }
    }
    if (!checkOnly) {
      const rulesPath = writeRulesManifest(targetRoot, rulesManifest);
      changed.push(toPosixRelative(targetRoot, rulesPath));
    }
    const skillsManifest = readSkillsManifestForWrite(targetRoot);
    const skillsDocument = manifestDocumentFor(skillsManifest);
    retireOrphanedBuiltinSkills({ manifest, receipts, receiptByKey, skillsManifest, targetRoot, builtinReceiptKey, builtinSnapshot, existsDirectory, path, removeDirectory: removePath, removeReceipt, changed, findings, checkOnly });
    const skillsById: any = new Map(skillsManifest.map((skill: any, index: any) => [skill.id, { skill, index }]));
    const contracts: any[] = [...(skillsDocument.contracts || [])];
    const bindings: any[] = [...(skillsDocument.bindings || [])];
    applyCapabilityRetirements({ targetRoot, manifest, contracts, bindings, findings, changed, checkOnly });
    for (const contract of manifest.capabilityContracts || []) {
      const sourceFile = path.join(productRoot(), contract.path);
      const targetFile = path.join(targetRoot, contract.target);
      const index = contracts.findIndex((item:any)=>item.id===contract.id&&item.version===contract.version);
      const existing = index>=0 ? contracts[index] : null;
      const identity = `contract:${contract.id}@${contract.version}`;
      if(existing?.customizedFrom===identity) {findings.push({type:'contract',id:identity,status:'customized',path:contract.target});continue;}
      const bytes = existsFile(targetFile) ? fs.readFileSync(targetFile) : null;
      const isOfficial = !bytes || bytes.equals(fs.readFileSync(sourceFile));
      findings.push({type:'contract',id:identity,status:isOfficial?'installed':'modified',path:contract.target,converge:isOfficial&&!existing?.resource,...(bytes?{liveIntegrity:`sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`}:{})});
      if(checkOnly)continue;
      const desired:any={id:contract.id,version:contract.version,path:contract.target.replace(/^skills\//,''),description:contract.description,...(isOfficial?{resource:contract.path}:{})};
      if(isOfficial&&bytes){fs.rmSync(targetFile);changed.push(contract.target);}
      if(index===-1)contracts.push(desired);else contracts[index]=desired;
    }
    if (!checkOnly) {
      if (contracts.length) skillsDocument.contracts = contracts;
      for (const binding of manifest.initialSkillBindings || []) {
        if (bindings.some((item: any) => item.capability === binding.capability && item.version === binding.version)) continue;
        const provider = skillsById.get(binding.provider)?.skill;
        if (provider?.state === 'uninstalled' || provider?.enabled === false) continue;
        bindings.push({ ...binding });
      }
      if (bindings.length) skillsDocument.bindings = bindings;
    }
    for (const builtin of manifest.builtins.skills) {
      // Retired builtins are migration declarations only; orphaned entries are
      // converged by retireOrphanedBuiltinSkills using their ownership receipts.
      if (builtin.retired === true) continue;
      if (builtin.component) {
        findings.push({ type: 'skill', id: builtin.id, required: builtin.required === true, status: componentStatusById.get(builtin.component) || 'missing', path: builtin.target, component: builtin.component, lifecycle: `buildr component check ${builtin.component} --target ${targetRoot} --json` });
        continue;
      }
      const sourceDir = sourcePathFromBuiltin(builtin);
      const targetDir = targetPathFromBuiltin(targetRoot, builtin);
      const existing = skillsById.get(builtin.id)?.skill || null;
      const isRestore = restoreId === builtin.id;
      if (existing?.customizedFrom === builtin.id && existing.source === 'workspace' && !existing.resource && !isRestore) { if(!checkOnly)removeReceipt('skill',builtin); findings.push({type:'skill',id:builtin.id,status:'customized',path:builtin.target}); continue; }
      const isNew = !existing;
      const isUninstalled = existing?.state === 'uninstalled' || existing?.enabled === false;
      const predecessor = builtin.replaces ? skillsById.get(builtin.replaces.id)?.skill : null;
      const desired = builtinSkillEntry(builtin, existing || predecessor);
      const newSnapshot = builtinSnapshot(sourceDir, 'skill');
      // A stale manifest may still reference a shared source that no longer exists;
      // treat it as missing local content instead of failing the whole convergence.
      let liveSkillPath = targetDir;
      if (existing?.resource) {
        try { liveSkillPath = path.dirname(resolveSharedResource(targetRoot, `${existing.resource}/SKILL.md`)); }
        catch { liveSkillPath = targetDir; }
      }
      const liveSnapshot = builtinSnapshot(liveSkillPath, 'skill');
      if (handleSkillReplacement({ builtin, changed, checkOnly, desired, existing, findings, isRestore, liveSnapshot, newSnapshot, receiptByKey, removeDirectory: (directory: any) => fs.rmSync(directory, { recursive: true, force: true }), removeReceipt, restoreOutcomes, skillsById, skillsManifest, sourceDir, targetDir, updateReceipt, targetRoot,
        onReplaced: ({ predecessor: previous, builtin: replacement }: any) => {
          // Only migrate a binding that still selects the recognized official
          // predecessor for an unchanged capability/version and default provider.
          for (const binding of bindings) {
            if (binding.provider !== previous.id) continue;
            const sameCapability = (item: any) => item.capability === binding.capability && item.version === binding.version;
            if (!(previous.provides ?? []).some(sameCapability) || !(replacement.provides ?? []).some(sameCapability)) continue;
            if (!(manifest.initialSkillBindings ?? []).some((item: any) => sameCapability(item) && item.provider === replacement.id)) continue;
            binding.provider = replacement.id;
          }
        },
      })) continue;
      const state = resolveBuiltinState({ type: 'skill', builtin, liveSnapshot, newSnapshot, oldReceipt: receiptByKey.get(builtinReceiptKey('skill', builtin.id)), isRestore, required: builtin.required === true });
      const status = isUninstalled && !isRestore ? 'uninstalled' : state.status;
      findings.push({ type: 'skill', id: builtin.id, required: builtin.required === true, status, path: builtin.target, ...(liveSnapshot ? { liveIntegrity: liveSnapshot.integrity } : {}), converge: state.converge === true || (isNew && !liveSnapshot) });

      if (checkOnly) {
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'skill', status: 'ready', replacementFrom: null, path: builtin.target, reason: null });
        continue;
      }
      if (isUninstalled && !isRestore && !builtin.required) {
        removeReceipt('skill', builtin);
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'modified') {
        skillsManifest[skillsById.get(builtin.id).index] = { ...existing, state: 'modified' };
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'missing') {
        skillsManifest[skillsById.get(builtin.id).index] = { ...existing, state: 'missing' };
        continue;
      }
      if (builtin.required || isNew || isRestore || state.converge || state.adopt) {
        // Only receipts or exact official bytes authorize retiring the old source.
        const local = builtinSnapshot(targetDir, 'skill');
        const trusted = !local || local.integrity === newSnapshot.integrity || local.integrity === receiptByKey.get(builtinReceiptKey('skill', builtin.id))?.integrity || (isNew && local.files.every((file:any)=>newSnapshot.files.some((official:any)=>official.path===file.path&&official.integrity===file.integrity)));
        if (!trusted && !isRestore) { findings.push({ type: 'skill', id: builtin.id, status: 'modified', path: builtin.target }); continue; }
        if (local) { fs.rmSync(targetDir, { recursive: true, force: true }); changed.push(builtin.target); }
        desired.resource = builtin.path;
        // An explicit restore also lifts the uninstall's enabled=false; plain sync keeps user choices.
        desired.enabled = isRestore ? true : existing?.enabled ?? desired.enabled;
        // The path remains a portable ownership/display label; resource selects the source.

        if (skillsById.has(builtin.id)) {
          skillsManifest[skillsById.get(builtin.id).index] = desired;
        } else {
          skillsManifest.push(desired);
        }
        updateReceipt('skill', builtin, newSnapshot);
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'skill', status: 'restored', replacementFrom: null, path: builtin.target, reason: null });
      }
    }
    if (!checkOnly) {
      const skillsPath = writeSkillsManifest(targetRoot, skillsManifest);
      changed.push(toPosixRelative(targetRoot, skillsPath));
    }

    const commandsManifest = readCommandsManifestForWrite(targetRoot);
    const commandsById: any = new Map(commandsManifest.commands.map((command: any, index: any) => [command.id, { command, index }]));
    for (const builtin of manifest.builtins.commands) {
      if (builtin.component) {
        findings.push({ type: 'command', id: builtin.id, required: builtin.required === true, status: componentStatusById.get(builtin.component) || 'missing', path: 'commands/manifest.yml', component: builtin.component, lifecycle: `buildr component check ${builtin.component} --target ${targetRoot} --json` });
        continue;
      }
      const existing = commandsById.get(builtin.id)?.command || null;
      const isRestore = restoreId === builtin.id;
      const isNew = !existing;
      const isUninstalled = existing?.state === 'uninstalled' || existing?.enabled === false;
      const desired = builtinCommandEntry(builtin);
      const newSnapshot = builtinSnapshot(desired, 'command');
      const liveSnapshot = existing ? builtinSnapshot(existing, 'command') : null;
      const state = resolveBuiltinState({ type: 'command', builtin, liveSnapshot, newSnapshot, oldReceipt: receiptByKey.get(builtinReceiptKey('command', builtin.id)), isRestore, required: builtin.required === true });
      const status = isUninstalled && !isRestore ? 'uninstalled' : state.status;
      findings.push({ type: 'command', id: builtin.id, required: builtin.required === true, status, path: 'commands/manifest.yml', converge: state.converge === true || (isNew && !liveSnapshot) });
      if (checkOnly) {
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'command', status: 'ready', replacementFrom: null, path: 'commands/manifest.yml', reason: null });
        continue;
      }
      if (isUninstalled && !isRestore && !builtin.required) {
        removeReceipt('command', builtin);
        continue;
      }
      if (commandsById.has(builtin.id) && (builtin.required || isRestore || state.converge || state.adopt)) {
        commandsManifest.commands[commandsById.get(builtin.id).index] = desired;
      } else if (isNew || isRestore || builtin.required) {
        commandsManifest.commands.push(desired);
      }
      if (builtin.required || isNew || isRestore || state.converge || state.adopt) {
        updateReceipt('command', builtin, newSnapshot);
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'command', status: 'restored', replacementFrom: null, path: 'commands/manifest.yml', reason: null });
      }
    }
    if (!checkOnly) {
      const commandsPath = writeCommandsManifest(targetRoot, commandsManifest);
      changed.push(toPosixRelative(targetRoot, commandsPath));
      if (receiptsChanged) changed.push(writeBuiltinReceipts(targetRoot, receipts));
    }

    const affectedPaths = checkOnly ? packageBuiltinMutationPaths(targetRoot, manifest, receipts, findings) : [];
    return { targetRoot, changed: [...new Set(changed)], findings, ...(restoreId ? { restoreOutcomes } : {}), affectedPaths, signature: checkOnly ? builtinSyncPlanSignature(targetRoot, findings, affectedPaths) : null };
  }

  function keepPackageCustomizations(targetRoot: string, expected: Array<{id:string;integrity:string}>) {
    const status = syncPackageBuiltins(targetRoot,{checkOnly:true});
    const current = status.findings.filter((item:any)=>['skill','contract'].includes(item.type)&&!item.component&&item.status==='modified');
    if (!expected.length || expected.some(item=>!current.some((live:any)=>live.id===item.id&&live.liveIntegrity===item.integrity))) throw new Error('定制内容已变化，请重新准备后核对。');
    return withWorkspaceMutation(targetRoot,'builtin.keep-customizations',[path.join(targetRoot,'skills/manifest.yml'),path.join(targetRoot,'.buildr/builtin-receipts.json')],()=>{
      const skills = readSkillsManifestForWrite(targetRoot);
      for (const item of expected) {
        if(item.id.startsWith('contract:')) {
          const contract=manifestDocumentFor(skills).contracts.find((entry:any)=>`contract:${entry.id}@${entry.version}`===item.id);
          const file=contract?path.join(targetRoot,'skills',contract.path):null;
          if(!file||contract.resource||fs.lstatSync(file).isSymbolicLink()||`sha256-${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`!==item.integrity)throw new Error('定制约定已变化，未修改。');
          contract.customizedFrom=item.id;continue;
        }
        const entry = skills.find((skill:any)=>skill.id===item.id);
        if (!entry || entry.resource || builtinSnapshot(path.join(targetRoot,'skills',entry.path),'skill')?.integrity!==item.integrity) throw new Error('定制来源已变化，未修改。');
        entry.customizedFrom=entry.id;entry.customizedSourceIdentity=entry.sourceIdentity;entry.source='workspace';entry.sourceIdentity=`workspace:${manifestDocumentFor(skills).workspaceId}:${entry.path}`;entry.state='installed';
      }
      const receipts = readBuiltinReceipts(targetRoot);receipts.builtins=receipts.builtins.filter((item:any)=>!(item.type==='skill'&&expected.some(custom=>custom.id===item.id)));
      writeSkillsManifest(targetRoot,skills);writeBuiltinReceipts(targetRoot,receipts);
    });
  }

  function builtinList(args: any): any  {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const json = hasFlag(args, '--json');
    const result = syncPackageBuiltins(targetRoot, { checkOnly: true });
    if (json) {
      console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.builtinList, result), null, 2));
    } else {
      console.log(`Buildr builtins for ${targetRoot}`);
      for (const finding of result.findings) {
        console.log(`[${finding.status}] ${finding.type}:${finding.id} ${finding.path}${finding.component ? ` component=${finding.component}` : ''}`);
        if (finding.lifecycle) console.log(`  lifecycle: ${finding.lifecycle}`);
      }
    }
  }

  const { builtinUninstall, builtinRestore } = createBuiltinLifecycle({
    connectionImpacts: dependencies.connectionImpacts,
    assertInitializedBuildrWorkspace,
    assertNoUnknownOptions,
    buildRuntimeOrphanRemovalPlan,
    existsDirectory,
    existsFile,
    fs,
    getRuntimeAdapter,
    resolveRuntimeAdapter,
    optionValue,
    path,
    positionalArgs,
    process,
    readBuiltinReceipts,
    readCommandsManifestForWrite,
    readPackageManifest,
    readRulesManifestForWrite,
    readSkillsManifestForWrite,
    SUPPORTED_AGENT_IDS,
    syncPackageBuiltins,
    toPosixRelative,
    withWorkspaceMutation,
    writeBuiltinReceipts,
    writeCommandsManifest,
    writeRulesManifest,
    writeSkillsManifest,
  });

  const {
    packageBuild,
  } = createPackageOutput({
    assertSafeAssetTarget,
    atomicWriteJson,
    collectFiles,
    crypto,
    ensureDirectory,
    existsDirectory,
    existsFile,
    fs,
    optionValue,
    resourcesRoot,
    parseManifestFileEntry,
    path,
    productRoot,
    readPackageManifest,
    toPosixRelative,
  });

  return Object.freeze({
    builtinManagedFiles: (targetRoot: string): string[] => {
      const directory = fs.lstatSync(path.join(targetRoot, '.buildr'), { throwIfNoEntry: false });
      const receipt = fs.lstatSync(path.join(targetRoot, '.buildr', 'builtin-receipts.json'), { throwIfNoEntry: false });
      if (directory?.isSymbolicLink() || receipt && (!receipt.isFile() || receipt.isSymbolicLink() || receipt.size > 1024 * 1024)) throw new Error('Builtin ownership receipt cannot be inspected safely.');
      // Command receipts prove individual registry records, not ownership of the whole mixed manifest.
      return readBuiltinReceipts(targetRoot).builtins.flatMap((item: any) => item.type === 'skill' ? item.files.map((file: any) => path.posix.join(item.target, file.path)) : item.type === 'rule' ? [item.target] : []);
    },
    syncPackageBuiltins,
    keepPackageCustomizations,
    builtinList,
    builtinUninstall,
    builtinRestore,
    packageBuild,
  });
}
