import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from '../../src/infrastructure/process.ts';
import { checkClaudeCodeRuntime } from '../../src/modules/agent-assets/infrastructure/runtime/check-claude-code.ts';
import { checkCodexRuntime } from '../../src/modules/agent-assets/infrastructure/runtime/check-codex.ts';
import {
  buildRuleDiscoveryPlan,
  hasManagedRulesMarker,
  renderClaudeCodeRules,
  resolveRuleScope,
} from '../../src/modules/agent-assets/infrastructure/runtime/render-claude-code-rules.ts';
import { BUILDR_REQUIRED_BLOCK_START, GENERATED_USER_REGISTRY_RESOURCE_SOURCES, LEGACY_PACKAGE_PATHS, PACKAGE_RUNTIME_TARGET, RESOURCE_WORKSPACE_ROOT } from '../../src/infrastructure/product-layout.ts';
import { SUPPORTED_AGENT_IDS, getRuntimeAdapter } from '../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';
import { createPackageSmokeChecks } from './package-check/smoke-checks.ts';
import { createPackageStaticValidator } from './package-check/static-validation.ts';
import { PACKAGE_VERIFIER_ENV, selectPackageVerifiers } from './package-check/verification-registry.ts';
import { validateSkillPublication } from '../../src/modules/agent-assets/infrastructure/runtime/skills/publication.ts';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { AGENT_ASSETS_PACKAGE_CHECK_SUPPORT } from '../../src/modules/agent-assets/module.ts';

export function runPackageCheck(runtime: any) {
  const parseCommandsManifestYaml = (...args: any[]) => runtime.parseCommandsManifestYaml(...args);
  const parseProjectCommandsYaml = (...args: any[]) => runtime.parseProjectCommandsYaml(...args);
  const isPlainObject = (...args: any[]) => runtime.isPlainObject(...args);
  const validateCommandsManifest = (...args: any[]) => runtime.validateCommandsManifest(...args);
  const componentMemberPaths = (...args: any[]) => runtime.componentMemberPaths(...args);
  const packageComponentDefinition = (...args: any[]) => runtime.packageComponentDefinition(...args);
  const packageComponentSourcePath = (...args: any[]) => runtime.packageComponentSourcePath(...args);
  const validatePackageComponentMembers = (...args: any[]) => runtime.validatePackageComponentMembers(...args);
  const readPackageManifest = (...args: any[]) => runtime.readPackageManifest(...args);
  const parseManifestFileEntry = (...args: any[]) => runtime.parseManifestFileEntry(...args);
  const collectFiles = (...args: any[]) => runtime.collectFiles(...args);
  const validateBootstrapContract = (...args: any[]) => runtime.validateBootstrapContract(...args);
  const builtinRuleEntry = (...args: any[]) => runtime.builtinRuleEntry(...args);
  const builtinSkillEntry = (...args: any[]) => runtime.builtinSkillEntry(...args);
  const sourcePathFromBuiltin = (...args: any[]) => runtime.sourcePathFromBuiltin(...args);
  const parseRulesManifestYaml = (...args: any[]) => runtime.parseRulesManifestYaml(...args);
  const readSkillManifest = (...args: any[]) => runtime.readSkillManifest(...args);
  const validateSkillManifestEntries = (...args: any[]) => runtime.validateSkillManifestEntries(...args);
  const isManifestSourceLabel = (...args: any[]) => runtime.isManifestSourceLabel(...args);
  const normalizeRelativePathForBuildr = (...args: any[]) => runtime.normalizeRelativePathForBuildr(...args);
  const parseSkillSourceRef = (...args: any[]) => runtime.parseSkillSourceRef(...args);
  const parseSkillFrontmatter = (...args: any[]) => runtime.parseSkillFrontmatter(...args);
  const parseProjectsYaml = (...args: any[]) => runtime.parseProjectsYaml(...args);
  const validateProjectsRegistry = (...args: any[]) => runtime.validateProjectsRegistry(...args);
  const writeServicesManifest = (...args: any[]) => runtime.writeServicesManifest(...args);
  const ensureDirectory = (...args: any[]) => runtime.ensureDirectory(...args);
  const productRoot = (...args: any[]) => runtime.productRoot(...args);
  const resourcesRoot = (...args: any[]) => runtime.resourcesRoot(...args);
  const resourceWorkspaceRoot = (...args: any[]) => runtime.resourceWorkspaceRoot(...args);
  const developmentWorkspaceRoot = (...args: any[]) => runtime.developmentWorkspaceRoot(...args);
  const toPosixRelative = (...args: any[]) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args: any[]) => runtime.existsDirectory(...args);
  const existsFile = (...args: any[]) => runtime.existsFile(...args);
  const {
    validateWorkspaceSkillsBaseline,
    validateWorkspaceRulesBaseline,
    validatePackageStatic,
    parseJsonOutput,
  } = createPackageStaticValidator({
    GENERATED_USER_REGISTRY_RESOURCE_SOURCES,
    LEGACY_PACKAGE_PATHS,
    PACKAGE_RUNTIME_TARGET,
    RESOURCE_WORKSPACE_ROOT,
    SUPPORTED_AGENT_IDS,
    collectFiles, builtinRuleEntry, builtinSkillEntry,
    componentMemberPaths,
    existsDirectory,
    existsFile,
    fs,
    isManifestSourceLabel,
    isPlainObject,
    normalizeRelativePathForBuildr,
    packageComponentDefinition,
    packageComponentSourcePath,
    resourceWorkspaceRoot,
    parseCommandsManifestYaml,
    parseProjectCommandsYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseRulesManifestYaml,
    parseSkillFrontmatter,
    parseSkillSourceRef,
    path,
    readPackageManifest, readSkillManifest, sourcePathFromBuiltin,
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
    renderRulesManifestYaml: runtime.renderRulesManifestYaml,
    rootRequiredBlockStatus: runtime.rootRequiredBlockStatus,
    BUILDR_REQUIRED_BLOCK_START,
    buildRuleDiscoveryPlan,
    checkClaudeCodeRuntime,
    checkCodexRuntime,
    collectFiles,
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
    currentProductInvocation: runtime.currentProductInvocation, productInvocationArgs: runtime.productInvocationArgs,
    readSkillManifest,
    renderClaudeCodeRules,
    resolveRuleScope,
    spawnSync,
    toPosixRelative,
    writeServicesManifest,
  });

  function packageCheck(): any  {
    const root = productRoot();
    const workspaceRoot = developmentWorkspaceRoot();
    const manifestPath = path.join(resourcesRoot(), 'manifest.yml');
    const manifest = readPackageManifest();
    const allowedVariables: any = new Set(manifest.templateVariables);
    const files: any[] = [];
    const problems: any[] = [];
    const mappedEntries: any[] = [];

    const context: any = { root, workspaceRoot, manifestPath, manifest, allowedVariables, files, problems, mappedEntries };
    const selector = process.env[PACKAGE_VERIFIER_ENV] || '';
    const selected = selectPackageVerifiers(selector);
    const smokeContext: any = { ...context, parseJsonOutput };
    const runners: any = {
      static: () => {
        validatePackageStatic(context);
        validatePackageSupportTools(smokeContext);
      },
      workspace: () => runPackageWorkspaceSmoke(smokeContext),
      commands: () => runPackageDomainIntegration(smokeContext, 'commands'),
      rules: () => runPackageDomainIntegration(smokeContext, 'rules'),
      skills: () => runPackageDomainIntegration(smokeContext, 'skills'),
      runtime: () => runPackageRuntimeIntegration(smokeContext),
    };
    if (!selector) {
      runners.static();
      runPackageAggregateSmoke(smokeContext);
    } else {
      for (const step of selected) runners[step.runner]();
    }

    if (problems.length > 0) {
      console.error('Buildr package check failed:');
      for (const problem of problems) console.error(`- ${problem}`);
      process.exit(1);
    }

    const selectorSummary = selected.map((step: any) => step.id).join(', ');
    if (selected.some((step: any) => step.id === 'static')) {
      console.log(`Buildr package check passed. Static validation checked ${manifest.include.length} include entries and ${files.length} files; ran ${selectorSummary}.`);
    } else {
      console.log(`Buildr package integration check passed. Ran ${selectorSummary}; static package validation is owned by selector static.`);
    }
  }

  return packageCheck();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  // Direct engineering entry must also re-enter the product CLI, never this runner.
  process.env.BUILDR_NPM_ENTRY_PATH ||= path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  runPackageCheck(runtimeProvide(createRuntime(), AGENT_ASSETS_PACKAGE_CHECK_SUPPORT));
}
