import path from 'node:path';

import { observeGitCheckoutIdentity } from '../../../infrastructure/git/checkout-identity.ts';
import { DOCTOR_DIAGNOSTIC_PROFILE } from './result-model.ts';

export type DoctorInput = {
  targetRoot: string;
  scope?: string | null;
  agent?: string | null;
  includeInfo?: boolean;
  skipRuntime?: boolean;
  releaseAwarenessOptions?: Record<string, unknown>;
};

export interface DoctorDependencies {
  discoverDoctorScopes: (...args: any[]) => any;
  diagnoseProjectRegistry: (...args: any[]) => any;
  diagnoseWorkspace: (...args: any[]) => any;
  diagnoseLegacyPractices: (...args: any[]) => any;
  diagnoseHierarchy: (...args: any[]) => any;
  diagnoseServices: (...args: any[]) => any;
  diagnoseRuntime: (...args: any[]) => any;
  detectManagedRuntimeAgents: (...args: any[]) => any;
  diagnoseCommands: (...args: any[]) => any;
  diagnoseComponents: (...args: any[]) => any;
  diagnoseSkillsManifestSchemas: (...args: any[]) => any;
  diagnoseSkillCapabilities: (...args: any[]) => any;
  diagnoseProjectVerification: (...args: any[]) => any;
  inspectPackageBuiltins: (...args: any[]) => any;
  finalizeDoctorResult: (...args: any[]) => any;
  releaseAwareness: (...args: any[]) => any;
  assertAgentId: (...args: any[]) => any;
  addDoctorFinding: (...args: any[]) => any;
  diagnoseRules: (...args: any[]) => any;
  diagnoseWorkspaceMetadata: (...args: any[]) => any;
  diagnoseMutations: (...args: any[]) => any;
  buildInstallationInventory: (...args: any[]) => any;
  inspectWorkspaceStructuredStore: (...args: any[]) => any;
  RUNTIME_ADAPTERS: typeof import('../../agent-assets/infrastructure/runtime/adapter-contract.ts').RUNTIME_ADAPTERS;
  SUPPORTED_AGENT_IDS: typeof import('../../agent-assets/infrastructure/runtime/adapter-contract.ts').SUPPORTED_AGENT_IDS;
  isSupportedAgent: typeof import('../../agent-assets/infrastructure/runtime/adapter-contract.ts').isSupportedAgent;
}

export function registerSystemDoctorApplication(dependencies: DoctorDependencies) {
  const { RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, isSupportedAgent } = dependencies;
  const discoverDoctorScopes = dependencies.discoverDoctorScopes;
  const diagnoseProjectRegistry = dependencies.diagnoseProjectRegistry;
  const diagnoseWorkspace = dependencies.diagnoseWorkspace;
  const diagnoseLegacyPractices = dependencies.diagnoseLegacyPractices;
  const diagnoseHierarchy = dependencies.diagnoseHierarchy;
  const diagnoseServices = dependencies.diagnoseServices;
  const diagnoseRuntime = dependencies.diagnoseRuntime;
  const detectManagedRuntimeAgents = dependencies.detectManagedRuntimeAgents;
  const diagnoseCommands = dependencies.diagnoseCommands;
  const diagnoseComponents = dependencies.diagnoseComponents;
  const diagnoseSkillsManifestSchemas = dependencies.diagnoseSkillsManifestSchemas;
  const diagnoseSkillCapabilities = dependencies.diagnoseSkillCapabilities;
  const diagnoseProjectVerification = dependencies.diagnoseProjectVerification;
  const inspectPackageBuiltins = (targetRoot: string) => dependencies.inspectPackageBuiltins(targetRoot);
  const finalizeDoctorResult = dependencies.finalizeDoctorResult;
  const releaseAwareness = dependencies.releaseAwareness;
  const assertAgentId = dependencies.assertAgentId;
  const addDoctorFinding = dependencies.addDoctorFinding;
  const diagnoseRules = dependencies.diagnoseRules;
  const diagnoseWorkspaceMetadata = dependencies.diagnoseWorkspaceMetadata;
  const diagnoseMutations = dependencies.diagnoseMutations;

  function diagnoseProductInstallation(result: any) {
    result.productInstallation = dependencies.buildInstallationInventory();
  }

  function diagnoseReleaseAwareness(result: any, options: any = {}) {
    try {
      result.releaseAwareness = releaseAwareness({
        allowDevelopmentQuery: false,
        persistState: true,
        notify: true,
        ...options,
      });
      result.notices = result.releaseAwareness.notices.filter((notice: any) => notice.notify === true);
    } catch (error: any) {
      result.releaseAwareness = {
        schemaVersion: 'buildr.release-awareness/v1',
        status: 'blocked',
        freshness: { status: 'unavailable', source: 'doctor', checkedAt: null },
        blockingReasons: [`版本发布感知暂不可用：${error.message}`],
        notices: [],
      };
      result.notices = [];
    }
  }

  function diagnoseWorkspaceStructuredStore(result: any, targetRoot: any, includeInfo: any = false) {
    if (observeGitCheckoutIdentity(targetRoot)?.linkedWorktree) {
      result.structuredStore = { status: 'not-applicable', version: null, integrity: null };
      if (includeInfo) addDoctorFinding(result, 'info', 'workspace.structured_store_not_applicable', 'Linked task worktree 不持有 Workspace structured store；数据库只属于 canonical Workspace。');
      return;
    }
    try {
      const observation = dependencies.inspectWorkspaceStructuredStore(targetRoot);
      result.structuredStore = observation;
      if (observation.status === 'uninitialized' && includeInfo) {
        addDoctorFinding(result, 'info', 'workspace.structured_store_uninitialized', 'Workspace structured store 尚未初始化；首次合法结构化写入会创建数据库。');
      }
    } catch (error: any) {
      result.structuredStore = { status: 'unavailable', version: null, integrity: null };
      addDoctorFinding(result, 'error', error.code || 'workspace.structured_store_failed', error.message, {
        suggestion: error.nextAction || '保留数据库现场并检查 migration 与 integrity 诊断；不要自动删除或从旧 Task 文件恢复。',
        userActionRequired: true,
      });
    }
  }

  function doctor(input: DoctorInput) {
    const targetRoot = path.resolve(input.targetRoot);
    const requestedScope = input.scope ?? null;
    const requestedAgent = input.agent ?? null;
    if (requestedAgent !== null) assertAgentId(requestedAgent);
    const includeInfo = input.includeInfo === true;
    const result: any = {
      targetRoot,
      scope: requestedScope || null,
      agentRuntime: requestedAgent
        ? {
          requested: requestedAgent,
          supported: isSupportedAgent(requestedAgent),
          selected: isSupportedAgent(requestedAgent) ? requestedAgent : null,
          supportedAgents: SUPPORTED_AGENT_IDS,
          mustNotUseFallbackAdapter: !isSupportedAgent(requestedAgent) || undefined,
        }
        : {
          requested: null,
          supported: null,
          selected: null,
          supportedAgents: SUPPORTED_AGENT_IDS,
          compatibilityMode: true,
        },
      ok: true,
      summary: { ok: 0, info: 0, warning: 0, error: 0 },
      workspace: null,
      structuredStore: null,
      projectRegistry: null,
      projectVerification: [],
      projectEnvironmentPreparation: [],
      organizations: [],
      projects: [],
      services: [],
      components: { items: [], ownership: {}, findings: [] },
      capabilities: { structurallyRoutableOnly: true, graphs: [], items: [] },
      builtins: { items: [] },
      commandLineTools: null,
      productInstallation: null,
      releaseAwareness: null,
      notices: [],
      runtime: Object.fromEntries(SUPPORTED_AGENT_IDS.map((agent: any) => [RUNTIME_ADAPTERS[agent].traits.checker.resultKey ?? agent.replace(/-([a-z])/g, (_match: any, letter: any) => letter.toUpperCase()), []])),
      mutations: { blocked: false, lock: null, transactions: [] },
      diagnosticProfile: DOCTOR_DIAGNOSTIC_PROFILE,
      health: { workspaceValid: false, ready: false, actionRequired: false, actionableCount: 0 },
      domainHealth: [],
      findings: [],
      repairPlan: [],
      nextSteps: [],
    };

    diagnoseWorkspace(result, targetRoot);
    diagnoseProductInstallation(result);
    diagnoseReleaseAwareness(result, input.releaseAwarenessOptions);
    if (result.workspace?.initialized) diagnoseWorkspaceMetadata(result, targetRoot);
    if (result.workspace?.initialized) diagnoseWorkspaceStructuredStore(result, targetRoot, includeInfo);
    diagnoseMutations(result, targetRoot);
    if (result.workspace?.initialized) diagnoseRules(result, targetRoot);
    const registry = diagnoseProjectRegistry(result, targetRoot);
    const scopes = discoverDoctorScopes(targetRoot, requestedScope, registry);
    if (result.workspace?.initialized && scopes.length === 0) {
      addDoctorFinding(result, 'warning', 'workspace.empty', 'Buildr root 尚未创建项目。', {
        path: targetRoot,
        suggestion: '按需创建项目；共享或基础服务也应放入某个项目，例如 foundation。',
      });
    }
    diagnoseLegacyPractices(result, targetRoot, scopes, includeInfo);
    diagnoseHierarchy(result, targetRoot, scopes, registry);
    diagnoseProjectVerification(result, targetRoot, registry);
    diagnoseServices(result, targetRoot, scopes, registry);
    diagnoseSkillsManifestSchemas(result, targetRoot, scopes);
    if (result.workspace?.initialized) diagnoseSkillCapabilities(result, targetRoot, scopes, requestedAgent);
    if (result.workspace?.initialized) {
      try {
        const builtinStatus = inspectPackageBuiltins(targetRoot);
        result.builtins.items = builtinStatus.findings;
        for (const finding of builtinStatus.findings.filter((item: any) => !item.component)) {
          if (finding.type === 'rule' && finding.id === 'buildr-core') {
            addDoctorFinding(result, 'warning', 'rules.legacy_core', finding.reason || '独立核心规则已退役，可通过同步清理受管旧文件。', {
              path: finding.path,
              suggestion: finding.status === 'retired'
                ? '运行 buildr sync <agent> 更新入口并清理已确认归属的旧核心规则。'
                : '核心规则现位于 AGENTS.md。请审阅保留的遗留内容，按需迁到用户规则后再明确删除；不影响其他安全同步。',
              userActionRequired: false,
            });
            continue;
          }
          if (finding.status === 'installed' || (finding.status === 'uninstalled' && !includeInfo)) continue;
          const status = finding.status === 'uninstalled' ? 'info' : 'warning';
          addDoctorFinding(result, status, `builtin.${finding.status}`, `Buildr builtin ${finding.type}:${finding.id} 状态为 ${finding.status}。`, {
            path: finding.path,
            suggestion: finding.status === 'uninstalled' ? '这是显式卸载状态；需要恢复时运行 builtin restore。' : `检查差异；确认放弃本地内容时运行 buildr builtin restore ${finding.id} --target ${targetRoot}。`,
            command: finding.status === 'uninstalled' ? `buildr builtin restore ${finding.id} --target ${targetRoot}` : undefined,
            userActionRequired: finding.status !== 'uninstalled',
          });
        }
      } catch (error: any) {
        addDoctorFinding(result, 'error', 'builtin.receipt_invalid', `Builtin 安装回执无效：${error.message}`, {
          path: '.buildr/builtin-receipts.json',
          suggestion: '保留回执与 live 资产并检查损坏；无法证明安装状态前不要继续 sync。',
          userActionRequired: true,
        });
      }
    }
    const detectedAgents = result.workspace?.initialized ? detectManagedRuntimeAgents(targetRoot) : [];
    result.agentRuntime.detectedAgents = detectedAgents;
    result.agentRuntime.checkedAgents = requestedAgent && isSupportedAgent(requestedAgent) ? [requestedAgent] : requestedAgent ? [] : detectedAgents;
    result.agentRuntime.diagnosticMode = requestedAgent ? 'selected-runtime' : 'managed-runtime-inventory';
    diagnoseComponents(result, targetRoot, includeInfo, requestedAgent, detectedAgents);
    diagnoseCommands(result, targetRoot, requestedScope && requestedScope.startsWith('projects/') ? [requestedScope.split('/')[1]] : []);
    if (input.skipRuntime !== true) diagnoseRuntime(result, targetRoot, scopes, { includeInfo, agent: requestedAgent, detectedAgents });
    finalizeDoctorResult(result);

    return result;
  }


  return Object.freeze({ doctor, diagnoseWorkspaceStructuredStore });
}
