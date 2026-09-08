import type { DoctorInput } from '../diagnostics/application/doctor-application.ts';
import { WORKSPACE_ASSET_SUPPORT, type WorkspaceAssetSupport, WORKSPACE_ROOT_GITIGNORE_ENTRIES } from '../workspace/module.ts';
import { registerDomainsCommands, type CommandsDependencies } from './application/commands.ts';
import { registerDomainsComponents, type ComponentsDependencies } from './application/components.ts';
import { registerApplicationPackageMaintenance, type PackageMaintenanceDependencies } from './application/package-maintenance.ts';
import { registerAgentAssetsPackageAssets } from './application/package-maintenance/package-assets.ts';
import { registerDomainsRules, type RulesDependencies } from './application/rules.ts';
import { registerApplicationRuntime } from './application/runtime-projection.ts';
import { registerDomainsRuntime, type RuntimeApplicationDependencies } from './application/runtime.ts';
import { registerDomainsSkills, type SkillsDependencies } from './application/skills.ts';
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
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
} from './infrastructure/runtime/adapter-contract.ts';
import { reconcileRuntimePlan } from './infrastructure/runtime/runtime-reconciler.ts';
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
export const AGENT_ASSETS_OPENSPEC_SUPPORT = 'agent-assets.openspec-support';
export const AGENT_ASSETS_DIAGNOSTICS_READ = 'agent-assets.diagnostics-read';
export const AGENT_ASSETS_PACKAGE_CHECK_SUPPORT = 'agent-assets.package-check-support';
export const AGENT_ASSETS_DIAGNOSTICS_BINDER = 'agent-assets.diagnostics-binder';
export const AGENT_ASSETS_RUNTIME_MODULE_ID = 'agent-assets-runtime';

type OpenSpecComponentEntry = { id: string; enabled?: boolean; state?: string; path?: string };
export type OpenSpecAssetSupport = {
  assertName(value: string, label: string): void;
  componentDefinitionFile(root: string, entry: OpenSpecComponentEntry): string;
  readComponentDefinition(file: string, id: string): { upstream?: { version?: string } };
  readComponentsManifestForWrite(root: string): { components: OpenSpecComponentEntry[] };
  runCommandsCheck(root: string): { commands: Array<{ id: string; status: string; version?: { current?: string }; executablePath: string; installHint?: string }> };
};

const OPENSPEC_SUPPORT_METHODS = ['assertName', 'componentDefinitionFile', 'readComponentDefinition', 'readComponentsManifestForWrite', 'runCommandsCheck'] as const satisfies readonly (keyof OpenSpecAssetSupport)[];

export function createOpenSpecAssetSupport(source: OpenSpecAssetSupport): Readonly<OpenSpecAssetSupport> {
  for (const method of OPENSPEC_SUPPORT_METHODS) {
    if (typeof source?.[method] !== 'function') throw new TypeError(`OpenSpec asset dependency is missing: ${method}`);
  }
  return Object.freeze({
    assertName: (...args: Parameters<OpenSpecAssetSupport['assertName']>) => source.assertName(...args),
    componentDefinitionFile: (...args: Parameters<OpenSpecAssetSupport['componentDefinitionFile']>) => source.componentDefinitionFile(...args),
    readComponentDefinition: (...args: Parameters<OpenSpecAssetSupport['readComponentDefinition']>) => source.readComponentDefinition(...args),
    readComponentsManifestForWrite: (...args: Parameters<OpenSpecAssetSupport['readComponentsManifestForWrite']>) => source.readComponentsManifestForWrite(...args),
    runCommandsCheck: (...args: Parameters<OpenSpecAssetSupport['runCommandsCheck']>) => source.runCommandsCheck(...args),
  });
}

function runtimeCompositionPort() {
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

function capabilityQueryPort() {
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

export interface AgentAssetsInfrastructure {
  addDoctorFinding: typeof import('../../infrastructure/contracts/diagnostic-finding.ts').addDoctorFinding;
  appendGitignoreEntries: (...args: any[]) => any;
  assertInitializedBuildrWorkspace: typeof import('../../infrastructure/filesystem/workspace-identity.ts').assertInitializedBuildrWorkspace;
  assertNoUnknownOptions: typeof import('../../infrastructure/cli-arguments.ts').assertNoUnknownOptions;
  assertSafeAssetTarget: (targetRoot: string, target: string, containerRoot: string, label?: string) => string;
  atomicWriteFile: typeof import('../../infrastructure/filesystem/atomic-files.ts').atomicWriteFile;
  atomicWriteJson: typeof import('../../infrastructure/filesystem/atomic-files.ts').atomicWriteJson;
  bootstrapContractPath: () => string;

  copyDirectoryIfChanged: (...args: any[]) => any;
  copyFileIfChanged: (...args: any[]) => any;
  currentProductInvocation: typeof import('../../infrastructure/product-invocation/index.ts').currentProductInvocation;
  developmentWorkspaceRoot: () => string;
  ensureDirectory: (...args: any[]) => any;
  ensureRootRequiredBlock: typeof import('../../infrastructure/filesystem/required-block.ts').ensureRootRequiredBlock;
  existsDirectory: (file: string) => boolean;
  existsFile: (file: string) => boolean;
  hasFlag: typeof import('../../infrastructure/cli-arguments.ts').hasFlag;
  mutationPathFingerprint: (...args: any[]) => any;
  openWorkspaceStructuredStore: (...args: any[]) => any;
  optionValue: typeof import('../../infrastructure/cli-arguments.ts').optionValue;
  parseYamlDocument: typeof import('../../infrastructure/filesystem/yaml.ts').parseYamlDocument;
  parseYamlValue: typeof import('../../infrastructure/filesystem/yaml.ts').parseYamlValue;
  positionalArgs: typeof import('../../infrastructure/cli-arguments.ts').positionalArgs;
  productInvocationArgs: typeof import('../../infrastructure/product-invocation/index.ts').productInvocationArgs;
  productRoot: () => string;
  quoteYaml: typeof import('../../infrastructure/filesystem/yaml.ts').quoteYaml;
  removePath: (...args: any[]) => any;
  resourceWorkspaceRoot: () => string;
  resourcesRoot: () => string;
  rootRequiredBlockStatus: typeof import('../../infrastructure/filesystem/required-block.ts').rootRequiredBlockStatus;
  toPosixRelative: (...args: any[]) => any;
  usage: (...args: any[]) => any;
  withResolvedTarget: typeof import('../../infrastructure/cli-arguments.ts').withResolvedTarget;
  withWorkspaceMutation: (...args: any[]) => any;
  workspaceStructuredStorePath: (...args: any[]) => any;
  workspaceSymlinkSegment: typeof import('../../infrastructure/filesystem/workspace-path.ts').workspaceSymlinkSegment;
  writeMappedFileIfMissing: (...args: any[]) => any;
}

export function createAgentAssetsModule(infrastructure: AgentAssetsInfrastructure): any  {
  return Object.freeze({
    id: AGENT_ASSETS_MODULE_ID,
    requires: Object.freeze([WORKSPACE_ASSET_SUPPORT, AGENT_ASSETS_RUNTIME]),
    create(requires: { [WORKSPACE_ASSET_SUPPORT]: WorkspaceAssetSupport; [AGENT_ASSETS_RUNTIME]: ReturnType<typeof runtimeCompositionPort> }): any {
      let diagnosticsApplication: { doctor(input: DoctorInput): any } | null = null;
      const doctor = (input: DoctorInput) => {
        if (!diagnosticsApplication) throw new Error('Agent Assets diagnostics dependency has not been bound.');
        return diagnosticsApplication.doctor(input);
      };
      const workspace = requires[WORKSPACE_ASSET_SUPPORT];
      const adapters = requires[AGENT_ASSETS_RUNTIME];
      const runtimeApplication: ReturnType<typeof registerDomainsRuntime> = registerDomainsRuntime({
        assertNoUnknownOptions: infrastructure.assertNoUnknownOptions,
        isValidAssetId: (...args: Parameters<RuntimeApplicationDependencies['isValidAssetId']>) => packageAssets.isValidAssetId(...args),
        hasFlag: infrastructure.hasFlag,
        existsDirectory: infrastructure.existsDirectory,
      });
      const components: ReturnType<typeof registerDomainsComponents> = registerDomainsComponents({
        renderRuntime: (...args: Parameters<ComponentsDependencies['renderRuntime']>) => projection.renderRuntime(...args),
        isPlainObject: (...args: Parameters<ComponentsDependencies['isPlainObject']>) => commands.isPlainObject(...args),
        readPackageManifest: (...args: Parameters<ComponentsDependencies['readPackageManifest']>) => packageAssets.readPackageManifest(...args),
        collectFiles: (...args: Parameters<ComponentsDependencies['collectFiles']>) => packageAssets.collectFiles(...args),
        builtinRuleEntry: (...args: Parameters<ComponentsDependencies['builtinRuleEntry']>) => packageAssets.builtinRuleEntry(...args),
        builtinSkillEntry: (...args: Parameters<ComponentsDependencies['builtinSkillEntry']>) => packageAssets.builtinSkillEntry(...args),
        sourcePathFromBuiltin: (...args: Parameters<ComponentsDependencies['sourcePathFromBuiltin']>) => packageAssets.sourcePathFromBuiltin(...args),
        missingAncestorForMutation: (...args: Parameters<ComponentsDependencies['missingAncestorForMutation']>) => packageAssets.missingAncestorForMutation(...args),
        mutationPathFingerprint: infrastructure.mutationPathFingerprint,
        assertSafeSyncMutationPaths: (...args: Parameters<ComponentsDependencies['assertSafeSyncMutationPaths']>) => packageAssets.assertSafeSyncMutationPaths(...args),
        isValidAssetId: (...args: Parameters<ComponentsDependencies['isValidAssetId']>) => packageAssets.isValidAssetId(...args),
        listManagedDirectories: (...args: Parameters<ComponentsDependencies['listManagedDirectories']>) => packageAssets.listManagedDirectories(...args),
        rulesManifestPath: (...args: Parameters<ComponentsDependencies['rulesManifestPath']>) => rules.rulesManifestPath(...args),
        readRulesManifestForWrite: (...args: Parameters<ComponentsDependencies['readRulesManifestForWrite']>) => rules.readRulesManifestForWrite(...args),
        writeRulesManifest: (...args: Parameters<ComponentsDependencies['writeRulesManifest']>) => rules.writeRulesManifest(...args),
        assertAgentId: runtimeApplication.assertAgentId,
        normalizeRelativePathForBuildr: (...args: Parameters<ComponentsDependencies['normalizeRelativePathForBuildr']>) => skills.normalizeRelativePathForBuildr(...args),
        skillsManifestPath: (...args: Parameters<ComponentsDependencies['skillsManifestPath']>) => skills.skillsManifestPath(...args),
        readSkillsManifestForWrite: (...args: Parameters<ComponentsDependencies['readSkillsManifestForWrite']>) => skills.readSkillsManifestForWrite(...args),
        writeSkillsManifest: (...args: Parameters<ComponentsDependencies['writeSkillsManifest']>) => skills.writeSkillsManifest(...args),
        quoteYaml: infrastructure.quoteYaml,
        ensureDirectory: infrastructure.ensureDirectory,
        atomicWriteFile: infrastructure.atomicWriteFile,
        parseYamlDocument: infrastructure.parseYamlDocument,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        productRoot: infrastructure.productRoot,
        resourceWorkspaceRoot: infrastructure.resourceWorkspaceRoot,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
        commandRemovalBlockers: (...args: Parameters<ComponentsDependencies['commandRemovalBlockers']>) => commands.commandRemovalBlockers(...args),
        parseCommandsManifestYaml: (...args: Parameters<ComponentsDependencies['parseCommandsManifestYaml']>) => commands.parseCommandsManifestYaml(...args),
        validateCommandsManifest: (...args: Parameters<ComponentsDependencies['validateCommandsManifest']>) => commands.validateCommandsManifest(...args),
        workspaceSymlinkSegment: infrastructure.workspaceSymlinkSegment,
        currentProductInvocation: infrastructure.currentProductInvocation,
      });
      const commands: ReturnType<typeof registerDomainsCommands> = registerDomainsCommands({
        workspaceSymlinkSegment: infrastructure.workspaceSymlinkSegment,
        componentOwnerForMember: components.componentOwnerForMember,
        isValidAssetId: (...args: Parameters<CommandsDependencies['isValidAssetId']>) => packageAssets.isValidAssetId(...args),
        assertName: runtimeApplication.assertName,
        normalizeRelativePathForBuildr: (...args: Parameters<CommandsDependencies['normalizeRelativePathForBuildr']>) => skills.normalizeRelativePathForBuildr(...args),
        quoteYaml: infrastructure.quoteYaml,
        atomicWriteFile: infrastructure.atomicWriteFile,
        parseYamlDocument: infrastructure.parseYamlDocument,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
        parseProjectsYaml: workspace.parseProjectsYaml,
        projectsManifestPath: workspace.projectsManifestPath,
      });
      const rules: ReturnType<typeof registerDomainsRules> = registerDomainsRules({
        isPlainObject: commands.isPlainObject,
        componentOwnerForMember: components.componentOwnerForMember,
        isValidAssetId: (...args: Parameters<RulesDependencies['isValidAssetId']>) => packageAssets.isValidAssetId(...args),
        assertName: runtimeApplication.assertName,
        normalizeRelativePathForBuildr: (...args: Parameters<RulesDependencies['normalizeRelativePathForBuildr']>) => skills.normalizeRelativePathForBuildr(...args),
        quoteYaml: infrastructure.quoteYaml,
        atomicWriteFile: infrastructure.atomicWriteFile,
        parseYamlDocument: infrastructure.parseYamlDocument,
        assertSafeAssetTarget: infrastructure.assertSafeAssetTarget,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        rootRequiredBlockStatus: infrastructure.rootRequiredBlockStatus,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
        addDoctorFinding: infrastructure.addDoctorFinding,
      });
      const skills: ReturnType<typeof registerDomainsSkills> = registerDomainsSkills({
        isPlainObject: commands.isPlainObject,
        componentOwnerForMember: components.componentOwnerForMember,
        isValidAssetId: (...args: Parameters<SkillsDependencies['isValidAssetId']>) => packageAssets.isValidAssetId(...args),
        assertName: runtimeApplication.assertName,
        ensureDirectory: infrastructure.ensureDirectory,
        atomicWriteFile: infrastructure.atomicWriteFile,
        parseYamlDocument: infrastructure.parseYamlDocument,
        assertSafeAssetTarget: infrastructure.assertSafeAssetTarget,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
      });
      const packageMaintenance: ReturnType<typeof registerApplicationPackageMaintenance> = registerApplicationPackageMaintenance({
        WORKSPACE_ROOT_GITIGNORE_ENTRIES: WORKSPACE_ROOT_GITIGNORE_ENTRIES,
        isPlainObject: commands.isPlainObject,
        readCommandsManifestForWrite: commands.readCommandsManifestForWrite,
        writeCommandsManifest: commands.writeCommandsManifest,
        assertNoUnknownOptions: infrastructure.assertNoUnknownOptions,
        positionalArgs: infrastructure.positionalArgs,
        packageComponentsStatus: components.packageComponentsStatus,
        readPackageManifest: (...args: Parameters<PackageMaintenanceDependencies['readPackageManifest']>) => packageAssets.readPackageManifest(...args),
        parseManifestFileEntry: (...args: Parameters<PackageMaintenanceDependencies['parseManifestFileEntry']>) => packageAssets.parseManifestFileEntry(...args),
        collectFiles: (...args: Parameters<PackageMaintenanceDependencies['collectFiles']>) => packageAssets.collectFiles(...args),
        builtinRuleEntry: (...args: Parameters<PackageMaintenanceDependencies['builtinRuleEntry']>) => packageAssets.builtinRuleEntry(...args),
        builtinSkillEntry: (...args: Parameters<PackageMaintenanceDependencies['builtinSkillEntry']>) => packageAssets.builtinSkillEntry(...args),
        builtinCommandEntry: (...args: Parameters<PackageMaintenanceDependencies['builtinCommandEntry']>) => packageAssets.builtinCommandEntry(...args),
        sourcePathFromBuiltin: (...args: Parameters<PackageMaintenanceDependencies['sourcePathFromBuiltin']>) => packageAssets.sourcePathFromBuiltin(...args),
        targetPathFromBuiltin: (...args: Parameters<PackageMaintenanceDependencies['targetPathFromBuiltin']>) => packageAssets.targetPathFromBuiltin(...args),
        missingAncestorForMutation: (...args: Parameters<PackageMaintenanceDependencies['missingAncestorForMutation']>) => packageAssets.missingAncestorForMutation(...args),
        mutationPathFingerprint: infrastructure.mutationPathFingerprint,
        packageRegistryMutationPaths: (...args: Parameters<PackageMaintenanceDependencies['packageRegistryMutationPaths']>) => packageAssets.packageRegistryMutationPaths(...args),
        assertSafeSyncMutationPaths: (...args: Parameters<PackageMaintenanceDependencies['assertSafeSyncMutationPaths']>) => packageAssets.assertSafeSyncMutationPaths(...args),
        convergeRegistryManifests: (...args: Parameters<PackageMaintenanceDependencies['convergeRegistryManifests']>) => packageAssets.convergeRegistryManifests(...args),
        readRulesManifestForWrite: rules.readRulesManifestForWrite,
        writeRulesManifest: rules.writeRulesManifest,
        readSkillsManifestForWrite: skills.readSkillsManifestForWrite,
        writeSkillsManifest: skills.writeSkillsManifest,
        manifestDocumentFor: skills.manifestDocumentFor,
        optionValue: infrastructure.optionValue,
        ensureDirectory: infrastructure.ensureDirectory,
        atomicWriteJson: infrastructure.atomicWriteJson,
        assertSafeAssetTarget: infrastructure.assertSafeAssetTarget,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        buildRuntimeOrphanRemovalPlan: components.buildRuntimeOrphanRemovalPlan,
        productRoot: infrastructure.productRoot,
        resourcesRoot: infrastructure.resourcesRoot,
        appendGitignoreEntries: infrastructure.appendGitignoreEntries,
        hasFlag: infrastructure.hasFlag,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        ensureRootRequiredBlock: infrastructure.ensureRootRequiredBlock,
        copyFileIfChanged: infrastructure.copyFileIfChanged,
        copyDirectoryIfChanged: infrastructure.copyDirectoryIfChanged,
        removePath: infrastructure.removePath,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
      });
      const packageAssets: ReturnType<typeof registerAgentAssetsPackageAssets> = registerAgentAssetsPackageAssets({
        readSkillManifest: skills.readSkillManifest,
        readSkillManifestSchemaVersion: skills.readSkillManifestSchemaVersion,
        renderSkillsManifestYaml: skills.renderSkillsManifestYaml,
        renderProjectCapabilitiesYaml: skills.renderProjectCapabilitiesYaml,
        renderProjectCommandsYaml: commands.renderProjectCommandsYaml,
        skillsManifestPath: skills.skillsManifestPath,
        parseYamlValue: infrastructure.parseYamlValue,
        projectsManifestPath: workspace.projectsManifestPath,
        servicesManifestPath: workspace.servicesManifestPath,
        gitBoundaryFor: workspace.gitBoundaryFor,
        ensureDirectory: infrastructure.ensureDirectory,
        atomicWriteFile: infrastructure.atomicWriteFile,
        parseYamlDocument: infrastructure.parseYamlDocument,
        productRoot: infrastructure.productRoot,
        resourcesRoot: infrastructure.resourcesRoot,
        bootstrapContractPath: infrastructure.bootstrapContractPath,
        writeMappedFileIfMissing: infrastructure.writeMappedFileIfMissing,
        toPosixRelative: infrastructure.toPosixRelative,
        existsDirectory: infrastructure.existsDirectory,
        existsFile: infrastructure.existsFile,
        convergeRegistryManifests: workspace.convergeRegistryManifests,
      });
      const projection: ReturnType<typeof registerApplicationRuntime> = registerApplicationRuntime({
        syncPackageBuiltins: packageMaintenance.syncPackageBuiltins,
        syncPackageComponents: components.syncPackageComponents,
        buildRuntimeOrphanRemovalPlan: components.buildRuntimeOrphanRemovalPlan,
        optionValue: infrastructure.optionValue,
        withResolvedTarget: infrastructure.withResolvedTarget,
        withWorkspaceMutation: infrastructure.withWorkspaceMutation,
        assertSafeSyncMutationPaths: packageAssets.assertSafeSyncMutationPaths,
        productRoot: infrastructure.productRoot,
        toPosixRelative: infrastructure.toPosixRelative,
        assertInitializedBuildrWorkspace: infrastructure.assertInitializedBuildrWorkspace,
        workspaceMigrationPlan: workspace.workspaceMigrationPlan,
        migrateWorkspaceMetadata: workspace.migrateWorkspaceMetadata,
        openWorkspaceStructuredStore: infrastructure.openWorkspaceStructuredStore,
        workspaceStructuredStorePath: infrastructure.workspaceStructuredStorePath,
        projectMigrationPlan: workspace.projectMigrationPlan,
        migrateProjectRegistry: workspace.migrateProjectRegistry,
        currentProductInvocation: infrastructure.currentProductInvocation,
      });
      const httpQuery: ReturnType<typeof registerAgentAssetsHttpQuery> = registerAgentAssetsHttpQuery({
        readRulesManifestForWrite: rules.readRulesManifestForWrite,
        readSkillsManifestForWrite: skills.readSkillsManifestForWrite,
        readCommandsManifestForWrite: commands.readCommandsManifestForWrite,
        readPackageManifest: packageAssets.readPackageManifest,
        packageComponentsStatus: components.packageComponentsStatus,
        syncPackageBuiltins: packageMaintenance.syncPackageBuiltins,
        SUPPORTED_AGENT_IDS: adapters.SUPPORTED_AGENT_IDS,
        runtimeDiscoveryPayload: adapters.runtimeDiscoveryPayload,
      });
      const application = Object.freeze({
        rulesAdd: rules.rulesAdd,
        rulesRemove: rules.rulesRemove,
        skillsAdd: skills.skillsAdd,
        skillsRemove: skills.skillsRemove,
        skillsBind: skills.skillsBind,
        skillsUnbind: skills.skillsUnbind,
        commandsAdd: commands.commandsAdd,
        commandsRemove: commands.commandsRemove,
        commandsCheck: commands.commandsCheck,
        componentListOrCheck: components.componentListOrCheck,
        componentInstall: components.componentInstall,
        componentUninstall: components.componentUninstall,
        builtinList: packageMaintenance.builtinList,
        builtinUninstall: packageMaintenance.builtinUninstall,
        builtinRestore: packageMaintenance.builtinRestore,
        packageBuild: packageMaintenance.packageBuild,
        renderRuntime: projection.renderRuntime,
        renderSkillsRuntime: projection.renderSkillsRuntime,
        renderRulesRuntime: projection.renderRulesRuntime,
        syncRuntime: projection.syncRuntime,
        listAgentAssets: httpQuery.listAgentAssets,
      });
      const internal = Object.freeze({
        readPackageManifest: packageAssets.readPackageManifest,
        parseManifestFileEntry: packageAssets.parseManifestFileEntry,
        syncPackageBuiltins: packageMaintenance.syncPackageBuiltins,
        syncPackageComponents: components.syncPackageComponents,
        renderSkillsManifestYaml: skills.renderSkillsManifestYaml,
        renderProjectCapabilitiesYaml: skills.renderProjectCapabilitiesYaml,
        renderProjectCommandsYaml: commands.renderProjectCommandsYaml,
        renderRulesManifestYaml: rules.renderRulesManifestYaml,
        renderCommandsManifestYaml: commands.renderCommandsManifestYaml,
        renderComponentsManifestYaml: components.renderComponentsManifestYaml,
        assertName: runtimeApplication.assertName,
        assertAgentId: runtimeApplication.assertAgentId,
        componentDefinitionFile: components.componentDefinitionFile,
        readComponentDefinition: components.readComponentDefinition,
        readComponentsManifestForWrite: components.readComponentsManifestForWrite,
        runCommandsCheck: commands.runCommandsCheck,
        diagnoseRules: rules.diagnoseRules,
        componentRegistryPath: components.componentRegistryPath,
        packageComponentsStatus: components.packageComponentsStatus,
        managedRuntimeSkillOrphans: components.managedRuntimeSkillOrphans,
        listManagedDirectories: packageAssets.listManagedDirectories,
        runtimeImplementation: runtimeApplication.runtimeImplementation,
        assertRuntimeProjectionTarget: projection.assertRuntimeProjectionTarget,
        assertRuntimeSyncTarget: projection.assertRuntimeSyncTarget,
        syncRuntime: projection.syncRuntime,
        readSkillManifestSchemaVersion: skills.readSkillManifestSchemaVersion,
        skillsManifestPath: skills.skillsManifestPath,
      });
      const runtimeAdapters = runtimeDiagnosticsReadModel();
      const diagnosticsRead = Object.freeze({
        assertAgentId: runtimeApplication.assertAgentId,
        diagnoseRules: rules.diagnoseRules,
        runCommandsCheck: commands.runCommandsCheck,
        componentRegistryPath: components.componentRegistryPath,
        packageComponentsStatus: components.packageComponentsStatus,
        managedRuntimeSkillOrphans: components.managedRuntimeSkillOrphans,
        listManagedDirectories: packageAssets.listManagedDirectories,
        runtimeImplementation: runtimeApplication.runtimeImplementation,
        readSkillManifestSchemaVersion: skills.readSkillManifestSchemaVersion,
        skillsManifestPath: skills.skillsManifestPath,
        inspectPackageBuiltins: (targetRoot: string) => packageMaintenance.syncPackageBuiltins(targetRoot, { checkOnly: true }),
      });
      const diagnosticsBinder = Object.freeze({
        bindDiagnostics(application: { doctor(input: DoctorInput): any }) {
          if (diagnosticsApplication) throw new Error('Agent Assets diagnostics dependency is already bound.');
          if (typeof application?.doctor !== 'function') throw new Error('Agent Assets diagnostics dependency is invalid.');
          diagnosticsApplication = application;
        },
      });
      const cliApplication = Object.freeze({
        ...application,
        doctor,
        getRuntimeAdapter: adapters.getRuntimeAdapter,
        usage: (...args: any[]) => infrastructure.usage(...args),
        withResolvedTarget: infrastructure.withResolvedTarget,
        optionValue: infrastructure.optionValue,
        toPosixRelative: infrastructure.toPosixRelative,
        productRoot: infrastructure.productRoot,
        runtimeList: runtimeApplication.runtimeList,
        installProductRuntimeSkill: runtimeApplication.installProductRuntimeSkill,
        runtimeImplementation: runtimeApplication.runtimeImplementation,
        RUNTIME_CHECKERS: runtimeApplication.RUNTIME_CHECKERS,
        RUNTIME_CHECK_PRINTERS: runtimeApplication.RUNTIME_CHECK_PRINTERS,
      });
      return Object.freeze({
        provides: {
          [AGENT_ASSETS_APPLICATION]: application,
          [AGENT_ASSETS_INTERNAL]: internal,
          [AGENT_ASSETS_OPENSPEC_SUPPORT]: createOpenSpecAssetSupport(Object.freeze({
              assertName: runtimeApplication.assertName,
              componentDefinitionFile: components.componentDefinitionFile,
              readComponentDefinition: components.readComponentDefinition,
              readComponentsManifestForWrite: components.readComponentsManifestForWrite,
              runCommandsCheck: commands.runCommandsCheck,
            })),
          [AGENT_ASSETS_DIAGNOSTICS_READ]: diagnosticsRead,
          [AGENT_ASSETS_PACKAGE_CHECK_SUPPORT]: Object.freeze({
            parseCommandsManifestYaml: commands.parseCommandsManifestYaml,
            parseProjectCommandsYaml: commands.parseProjectCommandsYaml,
            isPlainObject: commands.isPlainObject,
            validateCommandsManifest: commands.validateCommandsManifest,
            componentMemberPaths: components.componentMemberPaths,
            packageComponentDefinition: components.packageComponentDefinition,
            packageComponentSourcePath: components.packageComponentSourcePath,
            validatePackageComponentMembers: components.validatePackageComponentMembers,
            readPackageManifest: packageAssets.readPackageManifest,
            parseManifestFileEntry: packageAssets.parseManifestFileEntry,
            collectFiles: packageAssets.collectFiles,
            validateBootstrapContract: packageAssets.validateBootstrapContract,
            builtinRuleEntry: packageAssets.builtinRuleEntry,
            builtinSkillEntry: packageAssets.builtinSkillEntry,
            sourcePathFromBuiltin: packageAssets.sourcePathFromBuiltin,
            parseRulesManifestYaml: rules.parseRulesManifestYaml,
            readSkillManifest: skills.readSkillManifest,
            validateSkillManifestEntries: skills.validateSkillManifestEntries,
            isManifestSourceLabel: skills.isManifestSourceLabel,
            normalizeRelativePathForBuildr: skills.normalizeRelativePathForBuildr,
            parseSkillSourceRef: skills.parseSkillSourceRef,
            parseSkillFrontmatter: skills.parseSkillFrontmatter,
            parseProjectsYaml: workspace.parseProjectsYaml,
            validateProjectsRegistry: workspace.validateProjectsRegistry,
            writeServicesManifest: workspace.writeServicesManifest,
            ensureDirectory: infrastructure.ensureDirectory,
            productRoot: infrastructure.productRoot,
            resourcesRoot: infrastructure.resourcesRoot,
            resourceWorkspaceRoot: infrastructure.resourceWorkspaceRoot,
            developmentWorkspaceRoot: infrastructure.developmentWorkspaceRoot,
            toPosixRelative: infrastructure.toPosixRelative,
            existsDirectory: infrastructure.existsDirectory,
            existsFile: infrastructure.existsFile,
            renderRulesManifestYaml: rules.renderRulesManifestYaml,
            rootRequiredBlockStatus: infrastructure.rootRequiredBlockStatus,
            currentProductInvocation: infrastructure.currentProductInvocation,
            productInvocationArgs: infrastructure.productInvocationArgs,
          }),
          [AGENT_ASSETS_DIAGNOSTICS_BINDER]: diagnosticsBinder,
        },
        contributions: {
          cli: createAgentAssetsCliContributions().map((contribution: any) => Object.freeze({
            ...contribution,
            run: (_runtime: unknown, context: any) => contribution.run(cliApplication, context),
          })),
          http: [createAgentAssetsHttpContribution(application)],
          diagnostics: [Object.freeze({ id: 'agent-assets.diagnostics', readModel: Object.freeze({ application: diagnosticsRead, runtimeAdapters }) })],
        },
      });
    },
  });
}
