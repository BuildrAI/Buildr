import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../workspace/module.mjs';
import { registerDomainsCommands } from './application/commands.mjs';
import { registerDomainsComponents } from './application/components.mjs';
import { registerApplicationPackageMaintenance } from './application/package-maintenance.mjs';
import { registerAgentAssetsPackageAssets } from './application/package-maintenance/package-assets.mjs';
import { registerDomainsRules } from './application/rules.mjs';
import { registerApplicationRuntime } from './application/runtime-projection.mjs';
import { registerDomainsRuntime } from './application/runtime.mjs';
import { registerDomainsSkills } from './application/skills.mjs';
import { createAgentAssetsCliContributions } from './interfaces/cli/agent-assets.mjs';
import { checkClaudeCodeRuntime, printRuntimeCheckReport } from './infrastructure/runtime/check-claude-code.mjs';
import { checkCodexRuntime, printCodexRuntimeCheckReport } from './infrastructure/runtime/check-codex.mjs';
import { RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS } from './infrastructure/runtime/check-runtime.mjs';
import { assembleRuntimeProjection } from './infrastructure/runtime/projection.mjs';
import {
  RUNTIME_ADAPTERS,
  SUPPORTED_AGENT_IDS,
  UNSUPPORTED_AGENT_GUIDANCE,
  getRuntimeAdapter,
  isSupportedAgent,
  reconcileRuntimePlan,
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
} from './infrastructure/runtime/adapter-contract.mjs';
import { hasManagedSkillMarker, parseInstallClaudeCodeBuildrSkillArgs } from './infrastructure/runtime/render-claude-code.mjs';
import {
  buildRuleDiscoveryPlan,
  hasManagedRulesMarker,
  renderClaudeCodeRules,
  resolveRuleScope,
} from './infrastructure/runtime/render-claude-code-rules.mjs';

export const AGENT_ASSETS_MODULE_ID = 'agent-assets';
export const AGENT_ASSETS_APPLICATION = 'agent-assets.application';
export const AGENT_ASSETS_RUNTIME = 'agent-assets.runtime';

const APPLICATION_METHODS = Object.freeze([
  'rulesAdd', 'rulesRemove',
  'skillsAdd', 'skillsRemove', 'skillsBind', 'skillsUnbind',
  'commandsAdd', 'commandsRemove', 'commandsCheck',
  'componentListOrCheck', 'componentInstall', 'componentUninstall',
  'builtinList', 'builtinUninstall', 'builtinRestore',
  'packageCheck', 'packageBuild',
  'renderRuntime', 'renderSkillsRuntime', 'renderRulesRuntime', 'syncRuntime',
]);

function methodPort(runtime, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (...args) => runtime[method](...args)])));
}

function installRuntimeAdapters(runtime) {
  Object.assign(runtime, {
    checkClaudeCodeRuntime,
    printRuntimeCheckReport,
    checkCodexRuntime,
    printCodexRuntimeCheckReport,
    RUNTIME_CHECKERS,
    RUNTIME_CHECK_PRINTERS,
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

export function createAgentAssetsModule(runtime) {
  return Object.freeze({
    id: AGENT_ASSETS_MODULE_ID,
    requires: Object.freeze([WORKSPACE_APPLICATION, WORKSPACE_QUERY]),
    create() {
      installRuntimeAdapters(runtime);
      registerDomainsRuntime(runtime);
      registerDomainsComponents(runtime);
      registerDomainsCommands(runtime);
      registerDomainsRules(runtime);
      registerDomainsSkills(runtime);
      registerApplicationPackageMaintenance(runtime);
      registerAgentAssetsPackageAssets(runtime);
      registerApplicationRuntime(runtime);

      const application = methodPort(runtime, APPLICATION_METHODS);
      const runtimeAdapters = Object.freeze({
        adapters: RUNTIME_ADAPTERS,
        supportedAgentIds: SUPPORTED_AGENT_IDS,
        getRuntimeAdapter,
        isSupportedAgent,
        assembleRuntimeProjection,
        reconcileRuntimePlan,
      });
      return Object.freeze({
        provides: {
          [AGENT_ASSETS_APPLICATION]: application,
          [AGENT_ASSETS_RUNTIME]: runtimeAdapters,
        },
        contributions: {
          cli: createAgentAssetsCliContributions(),
          diagnostics: [Object.freeze({ id: 'agent-assets.diagnostics', readModel: Object.freeze({ application, runtimeAdapters }) })],
        },
      });
    },
  });
}
