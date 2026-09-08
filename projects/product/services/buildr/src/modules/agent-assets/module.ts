import { WORKSPACE_DOMAIN, WORKSPACE_ASSET_SUPPORT, type WorkspaceAssetSupport, WORKSPACE_ROOT_GITIGNORE_ENTRIES } from '../workspace/module.ts';
import { registerDomainsCommands } from './application/commands.ts';
import { registerDomainsComponents } from './application/components.ts';
import { registerApplicationPackageMaintenance } from './application/package-maintenance.ts';
import { registerAgentAssetsPackageAssets } from './application/package-maintenance/package-assets.ts';
import { registerDomainsRules } from './application/rules.ts';
import { registerApplicationRuntime } from './application/runtime-projection.ts';
import { registerDomainsRuntime } from './application/runtime.ts';
import { registerDomainsSkills } from './application/skills.ts';
import { createAgentAssetsCliContributions } from './interfaces/cli/agent-assets.ts';
import { createAgentAssetsHttpContribution } from './interfaces/http/agent-assets-http.ts';
import { registerAgentAssetsHttpQuery } from './application/http-query.ts';
import { checkClaudeCodeRuntime, printRuntimeCheckReport } from './infrastructure/runtime/check-claude-code.ts';
import { checkCodexRuntime, printCodexRuntimeCheckReport } from './infrastructure/runtime/check-codex.ts';
import { checkRuntimeAdapter, RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS } from './infrastructure/runtime/check-runtime.ts';
import { assembleRuntimeProjection } from './infrastructure/runtime/projection.ts';
import {
  RUNTIME_ADAPTERS,
  SUPPORTED_AGENT_IDS,
  UNSUPPORTED_AGENT_GUIDANCE,
  getRuntimeAdapter,
  isSupportedAgent,
  reconcileRuntimePlan,
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
} from './infrastructure/runtime/adapter-contract.ts';
import { hasManagedSkillMarker, parseInstallClaudeCodeBuildrSkillArgs } from './infrastructure/runtime/render-claude-code.ts';
import {
  buildRuleDiscoveryPlan,
  hasManagedRulesMarker,
  renderClaudeCodeRules,
  resolveRuleScope,
} from './infrastructure/runtime/render-claude-code-rules.ts';
import { resolveCapabilityRoute, resolveSkillCapabilityGraph } from './persistence/capability-graph-repository.ts';

export const AGENT_ASSETS_MODULE_ID = 'agent-assets';
export const AGENT_ASSETS_APPLICATION = 'agent-assets.application';
export const AGENT_ASSETS_RUNTIME = 'agent-assets.runtime';
export const AGENT_ASSETS_CAPABILITY_QUERY = 'agent-assets.capability-query';
export const AGENT_ASSETS_INTERNAL = 'agent-assets.internal';
export const AGENT_ASSETS_DIAGNOSTICS_READ = 'agent-assets.diagnostics-read';
export const AGENT_ASSETS_PACKAGE_CHECK_SUPPORT = 'agent-assets.package-check-support';
export const AGENT_ASSETS_DIAGNOSTICS_BINDER = 'agent-assets.diagnostics-binder';
export const AGENT_ASSETS_RUNTIME_MODULE_ID = 'agent-assets-runtime';

const APPLICATION_METHODS = Object.freeze([
  'rulesAdd', 'rulesRemove',
  'skillsAdd', 'skillsRemove', 'skillsBind', 'skillsUnbind',
  'commandsAdd', 'commandsRemove', 'commandsCheck',
  'componentListOrCheck', 'componentInstall', 'componentUninstall',
  'builtinList', 'builtinUninstall', 'builtinRestore',
  'packageBuild',
  'renderRuntime', 'renderSkillsRuntime', 'renderRulesRuntime', 'syncRuntime',
  'listAgentAssets',
]);

const INTERNAL_METHODS = Object.freeze([
  'readPackageManifest', 'parseManifestFileEntry',
  'syncPackageBuiltins', 'syncPackageComponents',
  'renderSkillsManifestYaml', 'renderProjectCapabilitiesYaml', 'renderProjectCommandsYaml', 'renderRulesManifestYaml', 'renderCommandsManifestYaml', 'renderComponentsManifestYaml',
  'assertName', 'assertAgentId',
  'componentDefinitionFile', 'readComponentDefinition', 'readComponentsManifestForWrite',
  'runCommandsCheck', 'diagnoseRules', 'componentRegistryPath', 'packageComponentsStatus',
  'managedRuntimeSkillOrphans', 'listManagedDirectories', 'runtimeImplementation',
  'assertRuntimeProjectionTarget', 'assertRuntimeSyncTarget', 'syncRuntime',
  'readSkillManifestSchemaVersion', 'skillsManifestPath',
]);

function methodPort(runtime: any, methods: any): any  {
  for (const method of methods) {
    if (typeof runtime[method] !== 'function') throw new TypeError(`Agent Assets dependency is missing: ${method}`);
  }
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => runtime[method](...args)])));
}

function runtimeCompositionPort(): any  {
  return Object.freeze({
    checkClaudeCodeRuntime,
    printRuntimeCheckReport,
    checkCodexRuntime,
    printCodexRuntimeCheckReport,
    RUNTIME_CHECKERS,
    RUNTIME_CHECK_PRINTERS,
    checkRuntimeAdapter,
    hasManagedSkillMarker,
    parseInstallClaudeCodeBuildrSkillArgs,
    buildRuleDiscoveryPlan,
    hasManagedRulesMarker,
    renderClaudeCodeRules,
    resolveRuleScope,
    assembleRuntimeProjection,
    RUNTIME_ADAPTERS,
    SUPPORTED_AGENT_IDS,
    UNSUPPORTED_AGENT_GUIDANCE,
    getRuntimeAdapter,
    isSupportedAgent,
    reconcileRuntimePlan,
    runtimeDiscoveryPayload,
    selectAdapterImplementation,
  });
}

function capabilityQueryPort(): any  {
  return Object.freeze({
    resolveCapabilityRoute,
    resolveSkillCapabilityGraph,
  });
}

function runtimeDiagnosticsReadModel(): any  {
  return Object.freeze({
    adapters: RUNTIME_ADAPTERS,
    supportedAgentIds: SUPPORTED_AGENT_IDS,
    getRuntimeAdapter,
    isSupportedAgent,
    assembleRuntimeProjection,
    reconcileRuntimePlan,
  });
}

function bindCliContributions(composition: any): any {
  return createAgentAssetsCliContributions().map((contribution: any) => Object.freeze({
    ...contribution,
    run: (_runtime: any, context: any) => contribution.run(composition, context),
  }));
}

export function createAgentAssetsRuntimeModule(): any  {
  return Object.freeze({
    id: AGENT_ASSETS_RUNTIME_MODULE_ID,
    requires: Object.freeze([]),
    create(): any  {
      const runtimeAdapters = runtimeCompositionPort();
      const capabilityQuery = capabilityQueryPort();
      return Object.freeze({
        provides: {
          [AGENT_ASSETS_RUNTIME]: runtimeAdapters,
          [AGENT_ASSETS_CAPABILITY_QUERY]: capabilityQuery,
        },
      });
    },
  });
}

export function createAgentAssetsModule(runtime: any): any  {
  return Object.freeze({
    id: AGENT_ASSETS_MODULE_ID,
    requires: Object.freeze([WORKSPACE_ASSET_SUPPORT, WORKSPACE_DOMAIN, AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY]),
    create(requires: { [WORKSPACE_ASSET_SUPPORT]: WorkspaceAssetSupport } & Record<string, any>): any {
      let diagnosticsApplication: Record<string, any> | null = null;
      const composition = Object.assign(
        Object.create(runtime),
        requires[WORKSPACE_ASSET_SUPPORT],
        requires[WORKSPACE_DOMAIN],
        requires[AGENT_ASSETS_RUNTIME],
        requires[AGENT_ASSETS_CAPABILITY_QUERY],
        { WORKSPACE_ROOT_GITIGNORE_ENTRIES },
      );
      composition.doctor = (...args: any[]) => {
        if (typeof diagnosticsApplication?.doctor !== 'function') throw new Error('Agent Assets diagnostics dependency has not been bound.');
        return diagnosticsApplication.doctor(...args);
      };
      for (const register of [
        registerDomainsRuntime,
        registerDomainsComponents,
        registerDomainsCommands,
        registerDomainsRules,
        registerDomainsSkills,
        registerApplicationPackageMaintenance,
        registerAgentAssetsPackageAssets,
        registerApplicationRuntime,
        registerAgentAssetsHttpQuery,
      ]) Object.assign(composition, register(composition));

      const application = methodPort(composition, APPLICATION_METHODS);
      const internal = methodPort(composition, INTERNAL_METHODS);
      const runtimeAdapters = runtimeDiagnosticsReadModel();
      const diagnosticsRead = Object.freeze({
        ...methodPort(composition, ['assertAgentId', 'diagnoseRules', 'runCommandsCheck', 'componentRegistryPath',
          'packageComponentsStatus', 'managedRuntimeSkillOrphans', 'listManagedDirectories', 'runtimeImplementation',
          'readSkillManifestSchemaVersion', 'skillsManifestPath']),
        inspectPackageBuiltins: (targetRoot: string) => composition.syncPackageBuiltins(targetRoot, { checkOnly: true }),
      });
      const diagnosticsBinder = Object.freeze({
        bindDiagnostics(application: Record<string, any>) {
          if (diagnosticsApplication) throw new Error('Agent Assets diagnostics dependency is already bound.');
          if (typeof application?.doctor !== 'function') throw new Error('Agent Assets diagnostics dependency is invalid.');
          diagnosticsApplication = application;
        },
      });
      return Object.freeze({
        provides: {
          [AGENT_ASSETS_APPLICATION]: application,
          [AGENT_ASSETS_INTERNAL]: internal,
          [AGENT_ASSETS_DIAGNOSTICS_READ]: diagnosticsRead,
          [AGENT_ASSETS_PACKAGE_CHECK_SUPPORT]: Object.freeze({
            parseCommandsManifestYaml: composition.parseCommandsManifestYaml,
            parseProjectCommandsYaml: composition.parseProjectCommandsYaml,
            isPlainObject: composition.isPlainObject,
            validateCommandsManifest: composition.validateCommandsManifest,
            componentMemberPaths: composition.componentMemberPaths,
            packageComponentDefinition: composition.packageComponentDefinition,
            packageComponentSourcePath: composition.packageComponentSourcePath,
            validatePackageComponentMembers: composition.validatePackageComponentMembers,
            readPackageManifest: composition.readPackageManifest,
            parseManifestFileEntry: composition.parseManifestFileEntry,
            collectFiles: composition.collectFiles,
            validateBootstrapContract: composition.validateBootstrapContract,
            builtinRuleEntry: composition.builtinRuleEntry,
            builtinSkillEntry: composition.builtinSkillEntry,
            sourcePathFromBuiltin: composition.sourcePathFromBuiltin,
            parseRulesManifestYaml: composition.parseRulesManifestYaml,
            readSkillManifest: composition.readSkillManifest,
            validateSkillManifestEntries: composition.validateSkillManifestEntries,
            isManifestSourceLabel: composition.isManifestSourceLabel,
            normalizeRelativePathForBuildr: composition.normalizeRelativePathForBuildr,
            parseSkillSourceRef: composition.parseSkillSourceRef,
            parseSkillFrontmatter: composition.parseSkillFrontmatter,
            parseProjectsYaml: composition.parseProjectsYaml,
            validateProjectsRegistry: composition.validateProjectsRegistry,
            writeServicesManifest: composition.writeServicesManifest,
            ensureDirectory: composition.ensureDirectory,
            productRoot: composition.productRoot,
            resourcesRoot: composition.resourcesRoot,
            resourceWorkspaceRoot: composition.resourceWorkspaceRoot,
            developmentWorkspaceRoot: composition.developmentWorkspaceRoot,
            toPosixRelative: composition.toPosixRelative,
            existsDirectory: composition.existsDirectory,
            existsFile: composition.existsFile,
            renderRulesManifestYaml: composition.renderRulesManifestYaml,
            rootRequiredBlockStatus: composition.rootRequiredBlockStatus,
            currentProductInvocation: composition.currentProductInvocation,
            productInvocationArgs: composition.productInvocationArgs,
          }),
          [AGENT_ASSETS_DIAGNOSTICS_BINDER]: diagnosticsBinder,
        },
        contributions: {
          cli: bindCliContributions(composition),
          http: [createAgentAssetsHttpContribution(application)],
          diagnostics: [Object.freeze({ id: 'agent-assets.diagnostics', readModel: Object.freeze({ application: diagnosticsRead, runtimeAdapters }) })],
        },
      });
    },
  });
}
