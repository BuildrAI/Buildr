import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from '../infrastructure/process.mjs';
import { checkClaudeCodeRuntime } from '../infrastructure/runtime/check-claude-code.mjs';
import { checkCodexRuntime } from '../infrastructure/runtime/check-codex.mjs';
import {
  buildRuleDiscoveryPlan,
  hasManagedRulesMarker,
  renderClaudeCodeRules,
  resolveRuleScope,
} from '../infrastructure/runtime/render-claude-code-rules.mjs';
import { BUILDR_REQUIRED_BLOCK_START, LEGACY_PACKAGE_PATHS, PACKAGE_RUNTIME_TARGET, PACKAGE_WORKSPACE_TARGET } from '../infrastructure/product-layout.mjs';
import { SUPPORTED_AGENT_IDS, getRuntimeAdapter } from '../infrastructure/runtime/adapter-contract.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from './json-contracts.mjs';
import { createPackageOutput } from './package-maintenance/output.mjs';
import { createPackageSmokeChecks } from './package-maintenance/smoke-checks.mjs';
import { createPackageStaticValidator } from './package-maintenance/static-validation.mjs';
import { createBuiltinReceipts } from './package-maintenance/builtin-receipts.mjs';
import { createBuiltinReplacement } from './package-maintenance/builtin-replacement.mjs';
import { createPackageSyncPlan } from './package-maintenance/sync-plan.mjs';
import { createBuiltinLifecycle } from './package-maintenance/builtin-lifecycle.mjs';
import { PACKAGE_VERIFIER_ENV, selectPackageVerifiers } from './package-maintenance/verification-registry.mjs';
import { validateSkillPublication } from '../infrastructure/runtime/skills/publication.mjs';

export function registerApplicationPackageMaintenance(runtime) {
  const doctor = (...args) => runtime.doctor(...args);
  const parseCommandsManifestYaml = (...args) => runtime.parseCommandsManifestYaml(...args);
  const parseProjectCommandsYaml = (...args) => runtime.parseProjectCommandsYaml(...args);
  const isPlainObject = (...args) => runtime.isPlainObject(...args);
  const validateCommandsManifest = (...args) => runtime.validateCommandsManifest(...args);
  const readCommandsManifestForWrite = (...args) => runtime.readCommandsManifestForWrite(...args);
  const writeCommandsManifest = (...args) => runtime.writeCommandsManifest(...args);
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const commandsCheck = (...args) => runtime.commandsCheck(...args);
  const componentMemberPaths = (...args) => runtime.componentMemberPaths(...args);
  const packageComponentDefinition = (...args) => runtime.packageComponentDefinition(...args);
  const packageComponentSourcePath = (...args) => runtime.packageComponentSourcePath(...args);
  const validatePackageComponentMembers = (...args) => runtime.validatePackageComponentMembers(...args);
  const packageComponentsStatus = (...args) => runtime.packageComponentsStatus(...args);
  const readPackageManifest = (...args) => runtime.readPackageManifest(...args);
  const parseManifestFileEntry = (...args) => runtime.parseManifestFileEntry(...args);
  const collectFiles = (...args) => runtime.collectFiles(...args);
  const validateBootstrapContract = (...args) => runtime.validateBootstrapContract(...args);
  const builtinRuleEntry = (...args) => runtime.builtinRuleEntry(...args);
  const builtinSkillEntry = (...args) => runtime.builtinSkillEntry(...args);
  const builtinCommandEntry = (...args) => runtime.builtinCommandEntry(...args);
  const sourcePathFromBuiltin = (...args) => runtime.sourcePathFromBuiltin(...args);
  const targetPathFromBuiltin = (...args) => runtime.targetPathFromBuiltin(...args);
  const missingAncestorForMutation = (...args) => runtime.missingAncestorForMutation(...args);
  const mutationPathFingerprint = (...args) => runtime.mutationPathFingerprint(...args);
  const packageRegistryMutationPaths = (...args) => runtime.packageRegistryMutationPaths(...args);
  const assertSafeSyncMutationPaths = (...args) => runtime.assertSafeSyncMutationPaths(...args);
  const convergeRegistryManifests = (...args) => runtime.convergeRegistryManifests(...args);
  const parseRulesManifestYaml = (...args) => runtime.parseRulesManifestYaml(...args);
  const readRulesManifestForWrite = (...args) => runtime.readRulesManifestForWrite(...args);
  const writeRulesManifest = (...args) => runtime.writeRulesManifest(...args);
  const readSkillManifest = (...args) => runtime.readSkillManifest(...args);
  const validateSkillManifestEntries = (...args) => runtime.validateSkillManifestEntries(...args);
  const isManifestSourceLabel = (...args) => runtime.isManifestSourceLabel(...args);
  const normalizeRelativePathForBuildr = (...args) => runtime.normalizeRelativePathForBuildr(...args);
  const parseSkillSourceRef = (...args) => runtime.parseSkillSourceRef(...args);
  const readSkillsManifestForWrite = (...args) => runtime.readSkillsManifestForWrite(...args);
  const writeSkillsManifest = (...args) => runtime.writeSkillsManifest(...args);
  const manifestDocumentFor = (...args) => runtime.manifestDocumentFor(...args);
  const parseSkillFrontmatter = (...args) => runtime.parseSkillFrontmatter(...args);
  const parseProjectsYaml = (...args) => runtime.parseProjectsYaml(...args);
  const validateProjectsRegistry = (...args) => runtime.validateProjectsRegistry(...args);
  const writeServicesManifest = (...args) => runtime.writeServicesManifest(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const ensureDirectory = (...args) => runtime.ensureDirectory(...args);
  const atomicWriteJson = (...args) => runtime.atomicWriteJson(...args);
  const assertSafeAssetTarget = (...args) => runtime.assertSafeAssetTarget(...args);
  const withWorkspaceMutation = (...args) => runtime.withWorkspaceMutation(...args);
  const buildRuntimeOrphanRemovalPlan = (...args) => runtime.buildRuntimeOrphanRemovalPlan(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const packageRoot = (...args) => runtime.packageRoot(...args);
  const packageWorkspaceTargetRoot = (...args) => runtime.packageWorkspaceTargetRoot(...args);
  const developmentWorkspaceRoot = (...args) => runtime.developmentWorkspaceRoot(...args);
  const appendGitignoreEntries = (...args) => runtime.appendGitignoreEntries(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const ensureRootRequiredBlock = (...args) => runtime.ensureRootRequiredBlock(...args);
  const copyFileIfChanged = (...args) => runtime.copyFileIfChanged(...args);
  const copyDirectoryIfChanged = (...args) => runtime.copyDirectoryIfChanged(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);

  const {
    key: builtinReceiptKey,
    snapshot: builtinSnapshot,
    read: readBuiltinReceipts,
    write: writeBuiltinReceipts,
    fromSnapshot: receiptFromSnapshot,
    resolveState: resolveBuiltinState,
  } = createBuiltinReceipts({ atomicWriteJson, collectFiles, crypto, ensureDirectory, existsDirectory, existsFile, fs, isPlainObject, path, toPosixRelative });
  const { handleSkillReplacement } = createBuiltinReplacement({ builtinReceiptKey, builtinSnapshot, copyDirectoryIfChanged, existsDirectory, path });

  const { packageBuiltinMutationPaths, builtinSyncPlanSignature } = createPackageSyncPlan({ assertSafeSyncMutationPaths, missingAncestorForMutation, mutationPathFingerprint, packageRegistryMutationPaths, path, readPackageManifest, targetPathFromBuiltin, toPosixRelative });

  function syncPackageBuiltins(targetRoot, options = {}) {
    const manifest = readPackageManifest();
    const changed = [];
    const findings = [];
    const restoreOutcomes = [];
    const restoreId = options.restoreId || null;
    const checkOnly = options.checkOnly === true;
    const componentStatusById = new Map(packageComponentsStatus(targetRoot, manifest).components.map((item) => [item.id, item.status]));
    const receipts = readBuiltinReceipts(targetRoot);
    const receiptByKey = new Map(receipts.builtins.map((item) => [builtinReceiptKey(item.type, item.id), item]));
    let receiptsChanged = false;

    const updateReceipt = (type, builtin, snapshot) => {
      const key = builtinReceiptKey(type, builtin.id);
      const next = receiptFromSnapshot(type, builtin, snapshot);
      const existing = receiptByKey.get(key);
      if (JSON.stringify(existing) === JSON.stringify(next)) return;
      if (existing) receipts.builtins[receipts.builtins.indexOf(existing)] = next;
      else receipts.builtins.push(next);
      receiptByKey.set(key, next);
      receiptsChanged = true;
    };

    const removeReceipt = (type, builtin) => {
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
      if (appendGitignoreEntries(path.join(targetRoot, '.gitignore'), [
        '# Agent runtime directories generated by Buildr',
        'CLAUDE.md',
        '.claude/',
        '.agents/',
        '.trae/',
        '.cursor/',
        '.qoder/',
        '# Buildr transaction state',
        '/.buildr/mutations/',
        '# Task asset review runtime state',
        '/.buildr/asset-review/',
        '# Task worktrees',
        '/.worktrees/',
      ])) {
        changed.push('.gitignore');
      }
    }

    const rulesManifest = readRulesManifestForWrite(targetRoot);
    const rulesById = new Map(rulesManifest.rules.map((rule, index) => [rule.id, { rule, index }]));
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
      findings.push({ type: 'rule', id: builtin.id, required: builtin.required === true, status, path: builtin.target });

      if (checkOnly) {
        if (isRestore) restoreOutcomes.push({ id: builtin.id, type: 'rule', status: 'ready', replacementFrom: null, path: builtin.target, reason: null });
        continue;
      }
      if (isUninstalled && !isRestore && !builtin.required) {
        removeReceipt('rule', builtin);
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'modified') {
        const updated = { ...existing, state: 'modified' };
        rulesManifest.rules[rulesById.get(builtin.id).index] = updated;
        continue;
      }
      if (!builtin.required && !isNew && !isRestore && status === 'missing') {
        const updated = { ...existing, state: 'missing' };
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
    const skillsById = new Map(skillsManifest.map((skill, index) => [skill.id, { skill, index }]));
    if (!checkOnly) {
      const contracts = [...(skillsDocument.contracts || [])];
      for (const contract of manifest.capabilityContracts || []) {
        const sourceFile = path.join(productRoot(), contract.path);
        const targetFile = path.join(targetRoot, contract.target);
        if (copyFileIfChanged(sourceFile, targetFile)) changed.push(contract.target);
        const desired = { id: contract.id, version: contract.version, path: contract.target.replace(/^skills\//, ''), description: contract.description };
        const index = contracts.findIndex((item) => item.id === contract.id && item.version === contract.version);
        if (index === -1) contracts.push(desired);
        else contracts[index] = desired;
      }
      if (contracts.length) skillsDocument.contracts = contracts;
      const bindings = [...(skillsDocument.bindings || [])];
      for (const binding of manifest.initialSkillBindings || []) {
        if (bindings.some((item) => item.capability === binding.capability && item.version === binding.version)) continue;
        const provider = skillsById.get(binding.provider)?.skill;
        if (provider?.state === 'uninstalled' || provider?.enabled === false) continue;
        bindings.push({ ...binding });
      }
      if (bindings.length) skillsDocument.bindings = bindings;
    }
    for (const builtin of manifest.builtins.skills) {
      if (builtin.component) {
        findings.push({ type: 'skill', id: builtin.id, required: builtin.required === true, status: componentStatusById.get(builtin.component) || 'missing', path: builtin.target, component: builtin.component, lifecycle: `buildr component check ${builtin.component} --target ${targetRoot} --json` });
        continue;
      }
      const sourceDir = sourcePathFromBuiltin(builtin);
      const targetDir = targetPathFromBuiltin(targetRoot, builtin);
      const existing = skillsById.get(builtin.id)?.skill || null;
      const isRestore = restoreId === builtin.id;
      const isNew = !existing;
      const isUninstalled = existing?.state === 'uninstalled' || existing?.enabled === false;
      const desired = builtinSkillEntry(builtin);
      const newSnapshot = builtinSnapshot(sourceDir, 'skill');
      const liveSnapshot = builtinSnapshot(targetDir, 'skill');
      if (handleSkillReplacement({ builtin, changed, checkOnly, desired, existing, findings, isRestore, liveSnapshot, newSnapshot, receiptByKey, removeDirectory: (directory) => fs.rmSync(directory, { recursive: true, force: true }), removeReceipt, restoreOutcomes, skillsById, skillsManifest, sourceDir, targetDir, updateReceipt, targetRoot })) continue;
      const state = resolveBuiltinState({ type: 'skill', builtin, liveSnapshot, newSnapshot, oldReceipt: receiptByKey.get(builtinReceiptKey('skill', builtin.id)), isRestore, required: builtin.required === true });
      const status = isUninstalled && !isRestore ? 'uninstalled' : state.status;
      findings.push({ type: 'skill', id: builtin.id, required: builtin.required === true, status, path: builtin.target });

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
        if (state.converge && existsDirectory(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
        if (copyDirectoryIfChanged(sourceDir, targetDir)) changed.push(builtin.target);
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
    const commandsById = new Map(commandsManifest.commands.map((command, index) => [command.id, { command, index }]));
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
      findings.push({ type: 'command', id: builtin.id, required: builtin.required === true, status, path: 'commands/manifest.yml' });
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

    const affectedPaths = checkOnly ? packageBuiltinMutationPaths(targetRoot, manifest) : [];
    return { targetRoot, changed: [...new Set(changed)], findings, ...(restoreId ? { restoreOutcomes } : {}), affectedPaths, signature: checkOnly ? builtinSyncPlanSignature(targetRoot, findings, affectedPaths) : null };
  }

  function builtinList(args) {
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

  const { packageBuiltinComponent, findBuiltinManifestEntry, builtinUninstallUnsafe, builtinUninstall, builtinRestoreUnsafe, builtinRestore } = createBuiltinLifecycle({
    assertInitializedBuildrWorkspace,
    assertNoUnknownOptions,
    buildRuntimeOrphanRemovalPlan,
    doctor,
    existsDirectory,
    existsFile,
    fs,
    getRuntimeAdapter,
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
    validateWorkspaceSkillsBaseline,
    validateWorkspaceRulesBaseline,
    validatePackageStatic,
  } = createPackageStaticValidator({
    LEGACY_PACKAGE_PATHS,
    PACKAGE_RUNTIME_TARGET,
    PACKAGE_WORKSPACE_TARGET,
    SUPPORTED_AGENT_IDS,
    collectFiles,
    componentMemberPaths,
    existsDirectory,
    existsFile,
    fs,
    isManifestSourceLabel,
    isPlainObject,
    normalizeRelativePathForBuildr,
    packageComponentDefinition,
    packageComponentSourcePath,
    packageWorkspaceTargetRoot,
    parseCommandsManifestYaml,
    parseProjectCommandsYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseSkillFrontmatter,
    parseSkillSourceRef,
    path,
    readPackageManifest,
    readSkillManifest,
    toPosixRelative,
    validateBootstrapContract,
    validateCommandsManifest,
    validatePackageComponentMembers,
    validateProjectsRegistry,
    validateSkillManifestEntries,
    getRuntimeAdapter,
    validateSkillPublication,
  });
  const {
    runPackageWorkspaceSmoke,
    runPackageDomainIntegration,
    runPackageRuntimeIntegration,
    runPackageAggregateSmoke,
    validatePackageSupportTools,
  } = createPackageSmokeChecks({
    BUILDR_REQUIRED_BLOCK_START,
    buildRuleDiscoveryPlan,
    checkClaudeCodeRuntime,
    checkCodexRuntime,
    collectFiles,
    commandsCheck,
    ensureDirectory,
    execFileSync,
    existsDirectory,
    existsFile,
    fs,
    hasManagedRulesMarker,
    os,
    parseCommandsManifestYaml,
    parseProjectCommandsYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseRulesManifestYaml,
    path,
    process,
    readSkillManifest,
    renderClaudeCodeRules,
    resolveRuleScope,
    spawnSync,
    toPosixRelative,
    writeServicesManifest,
  });

  function packageCheck() {
    const root = productRoot();
    const workspaceRoot = developmentWorkspaceRoot();
    const manifestPath = path.join(packageRoot(), 'manifest.yml');
    const manifest = readPackageManifest();
    const allowedVariables = new Set(manifest.templateVariables);
    const files = [];
    const problems = [];
    const mappedEntries = [];

    const context = { root, workspaceRoot, manifestPath, manifest, allowedVariables, files, problems, mappedEntries };
    const selector = process.env[PACKAGE_VERIFIER_ENV] || '';
    const selected = selectPackageVerifiers(selector);
    let smokeContext = null;
    const prepareSmokeContext = () => {
      if (smokeContext) return smokeContext;
      const prepared = validatePackageStatic(context);
      smokeContext = { ...context, ...prepared };
      return smokeContext;
    };
    const runners = {
      static: () => {
        const prepared = prepareSmokeContext();
        validatePackageSupportTools(prepared);
      },
      workspace: () => runPackageWorkspaceSmoke(prepareSmokeContext()),
      commands: () => runPackageDomainIntegration(prepareSmokeContext(), 'commands'),
      rules: () => runPackageDomainIntegration(prepareSmokeContext(), 'rules'),
      skills: () => runPackageDomainIntegration(prepareSmokeContext(), 'skills'),
      runtime: () => runPackageRuntimeIntegration(prepareSmokeContext()),
    };
    if (!selector) {
      runners.static();
      runPackageAggregateSmoke(prepareSmokeContext());
    } else {
      for (const step of selected) runners[step.runner]();
    }

    if (problems.length > 0) {
      console.error('Buildr package check failed:');
      for (const problem of problems) console.error(`- ${problem}`);
      process.exit(1);
    }

    console.log(`Buildr package check passed. Checked ${manifest.include.length} include entries and ${files.length} files across ${selected.map((step) => step.id).join(', ')}.`);
  }

  const {
    packageOutputInventory,
    packageOutputIntegrity,
    readPackageOutputReceipt,
    assertSafePackageOutput,
    validateReplaceablePackageOutput,
    buildPackageOutput,
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
    packageRoot,
    parseManifestFileEntry,
    path,
    productRoot,
    readPackageManifest,
    toPosixRelative,
  });

  Object.assign(runtime, {
    packageBuiltinMutationPaths,
    builtinSyncPlanSignature,
    syncPackageBuiltins,
    builtinList,
    packageBuiltinComponent,
    findBuiltinManifestEntry,
    builtinUninstallUnsafe,
    builtinUninstall,
    builtinRestoreUnsafe,
    builtinRestore,
    validateWorkspaceSkillsBaseline,
    validateWorkspaceRulesBaseline,
    packageCheck,
    packageOutputInventory,
    packageOutputIntegrity,
    readPackageOutputReceipt,
    assertSafePackageOutput,
    validateReplaceablePackageOutput,
    buildPackageOutput,
    packageBuild,
  });
  return runtime;
}
