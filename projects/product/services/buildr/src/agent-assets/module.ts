import { WORKSPACE_APPLICATION, WORKSPACE_QUERY, WORKSPACE_ROOT_GITIGNORE_ENTRIES } from '../workspace/module.ts';
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
import { resolveCapabilityRoute, resolveSkillCapabilityGraph } from './infrastructure/runtime/skills/capabilities.ts';

export const AGENT_ASSETS_MODULE_ID = 'agent-assets';
export const AGENT_ASSETS_APPLICATION = 'agent-assets.application';
export const AGENT_ASSETS_RUNTIME = 'agent-assets.runtime';
export const AGENT_ASSETS_CAPABILITY_QUERY = 'agent-assets.capability-query';
export const AGENT_ASSETS_RUNTIME_MODULE_ID = 'agent-assets-runtime';

const APPLICATION_METHODS = Object.freeze([
  'rulesAdd', 'rulesRemove',
  'skillsAdd', 'skillsRemove', 'skillsBind', 'skillsUnbind',
  'commandsAdd', 'commandsRemove', 'commandsCheck',
  'componentListOrCheck', 'componentInstall', 'componentUninstall',
  'builtinList', 'builtinUninstall', 'builtinRestore',
  'packageCheck', 'packageBuild',
  'renderRuntime', 'renderSkillsRuntime', 'renderRulesRuntime', 'syncRuntime',
  'listAgentAssets',
]);

function methodPort(runtime: any, methods: any): any  {
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => runtime[method](...args)])));
}

function installRuntimeAdapters(runtime: any): any  {
  Object.assign(runtime, {
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

function runtimePort(): any  {
  return Object.freeze({
    RUNTIME_ADAPTERS,
    RUNTIME_CHECKERS,
    RUNTIME_CHECK_PRINTERS,
    SUPPORTED_AGENT_IDS,
    UNSUPPORTED_AGENT_GUIDANCE,
    getRuntimeAdapter,
    isSupportedAgent,
    assembleRuntimeProjection,
    reconcileRuntimePlan,
    checkRuntimeAdapter,
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

export function createAgentAssetsRuntimeModule(runtime: any): any  {
  return Object.freeze({
    id: AGENT_ASSETS_RUNTIME_MODULE_ID,
    requires: Object.freeze([]),
    create(): any  {
      installRuntimeAdapters(runtime);
      const runtimeAdapters = runtimePort();
      const capabilityQuery = capabilityQueryPort();
      Object.assign(runtime, capabilityQuery, { resolveTaskEntryCapabilityRoute: resolveCapabilityRoute });
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
    requires: Object.freeze([WORKSPACE_APPLICATION, WORKSPACE_QUERY, AGENT_ASSETS_RUNTIME, AGENT_ASSETS_CAPABILITY_QUERY]),
    create(): any  {
      runtime.WORKSPACE_ROOT_GITIGNORE_ENTRIES = WORKSPACE_ROOT_GITIGNORE_ENTRIES;
      registerDomainsRuntime(runtime);
      registerDomainsComponents(runtime);
      registerDomainsCommands(runtime);
      registerDomainsRules(runtime);
      registerDomainsSkills(runtime);
      registerApplicationPackageMaintenance(runtime);
      registerAgentAssetsPackageAssets(runtime);
      registerApplicationRuntime(runtime);
      registerAgentAssetsHttpQuery(runtime);

      const application = methodPort(runtime, APPLICATION_METHODS);
      const runtimeAdapters = runtimeDiagnosticsReadModel();
      return Object.freeze({
        provides: {
          [AGENT_ASSETS_APPLICATION]: application,
        },
        contributions: {
          cli: createAgentAssetsCliContributions(),
          http: [createAgentAssetsHttpContribution(application)],
          diagnostics: [Object.freeze({ id: 'agent-assets.diagnostics', readModel: Object.freeze({ application, runtimeAdapters }) })],
        },
      });
    },
  });
}
