import path from 'node:path';
import process from 'node:process';

import { observeGitCheckoutIdentity } from '../../../infrastructure/git/checkout-identity.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.ts';
import { DOCTOR_DIAGNOSTIC_PROFILE } from './result-model.mjs';

export function registerSystemDoctorApplication(runtime) {
  const { RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, isSupportedAgent } = runtime;
  const discoverDoctorScopes = (...args) => runtime.discoverDoctorScopes(...args);
  const diagnoseProjectRegistry = (...args) => runtime.diagnoseProjectRegistry(...args);
  const diagnoseWorkspace = (...args) => runtime.diagnoseWorkspace(...args);
  const diagnoseLegacyPractices = (...args) => runtime.diagnoseLegacyPractices(...args);
  const diagnoseHierarchy = (...args) => runtime.diagnoseHierarchy(...args);
  const diagnoseServices = (...args) => runtime.diagnoseServices(...args);
  const diagnoseRuntime = (...args) => runtime.diagnoseRuntime(...args);
  const detectManagedRuntimeAgents = (...args) => runtime.detectManagedRuntimeAgents(...args);
  const diagnoseCommands = (...args) => runtime.diagnoseCommands(...args);
  const diagnoseComponents = (...args) => runtime.diagnoseComponents(...args);
  const diagnoseSkillsManifestSchemas = (...args) => runtime.diagnoseSkillsManifestSchemas(...args);
  const diagnoseSkillCapabilities = (...args) => runtime.diagnoseSkillCapabilities(...args);
  const diagnoseProjectVerification = (...args) => runtime.diagnoseProjectVerification(...args);
  const syncPackageBuiltins = (...args) => runtime.syncPackageBuiltins(...args);
  const finalizeDoctorResult = (...args) => runtime.finalizeDoctorResult(...args);
  const printDoctorReport = (...args) => runtime.printDoctorReport(...args);
  const releaseAwareness = (...args) => runtime.releaseAwareness(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const assertAgentId = (...args) => runtime.assertAgentId(...args);
  const addDoctorFinding = (...args) => runtime.addDoctorFinding(...args);
  const diagnoseRules = (...args) => runtime.diagnoseRules(...args);
  const diagnoseWorkspaceMetadata = (...args) => runtime.diagnoseWorkspaceMetadata(...args);
  const diagnoseMutations = (...args) => runtime.diagnoseMutations(...args);

  function diagnoseProductInstallation(result) {
    result.productInstallation = runtime.buildInstallationInventory();
  }

  function diagnoseReleaseAwareness(result, options = {}) {
    try {
      result.releaseAwareness = releaseAwareness({
        allowDevelopmentQuery: false,
        persistState: true,
        notify: true,
        ...options,
      });
      result.notices = result.releaseAwareness.notices.filter((notice) => notice.notify === true);
    } catch (error) {
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

  function diagnoseWorkspaceStructuredStore(result, targetRoot, includeInfo = false) {
    if (observeGitCheckoutIdentity(targetRoot)?.linkedWorktree) {
      result.structuredStore = { status: 'not-applicable', version: null, integrity: null };
      if (includeInfo) addDoctorFinding(result, 'info', 'workspace.structured_store_not_applicable', 'Linked task worktree 不持有 Workspace structured store；数据库只属于 canonical Workspace。');
      return;
    }
    try {
      const observation = runtime.inspectWorkspaceStructuredStore(targetRoot);
      result.structuredStore = observation;
      if (observation.status === 'uninitialized' && includeInfo) {
        addDoctorFinding(result, 'info', 'workspace.structured_store_uninitialized', 'Workspace structured store 尚未初始化；首次合法结构化写入会创建数据库。');
      }
    } catch (error) {
      result.structuredStore = { status: 'unavailable', version: null, integrity: null };
      addDoctorFinding(result, 'error', error.code || 'workspace.structured_store_failed', error.message, {
        suggestion: error.nextAction || '保留数据库现场并检查 migration 与 integrity 诊断；不要自动删除或从旧 Task 文件恢复。',
        userActionRequired: true,
      });
    }
  }

  function doctor(args, internalOptions = {}) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const requestedScope = optionValue(args, '--scope', null);
    const requestedAgent = optionValue(args, '--agent', null);
    if (requestedAgent !== null) assertAgentId(requestedAgent);
    const json = hasFlag(args, '--json');
    const detail = optionValue(args, '--detail', 'compact');
    if (!['compact', 'full'].includes(detail)) throw new Error('--detail must be compact or full.');
    const includeInfo = hasFlag(args, '--include-info') || hasFlag(args, '--verbose');
    const result = {
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
      runtime: Object.fromEntries(SUPPORTED_AGENT_IDS.map((agent) => [RUNTIME_ADAPTERS[agent].traits.checker.resultKey ?? agent.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()), []])),
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
    diagnoseReleaseAwareness(result, internalOptions.releaseAwarenessOptions);
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
        const builtinStatus = syncPackageBuiltins(targetRoot, { checkOnly: true });
        result.builtins.items = builtinStatus.findings;
        for (const finding of builtinStatus.findings.filter((item) => !item.component)) {
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
      } catch (error) {
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
    if (internalOptions.skipRuntime !== true) diagnoseRuntime(result, targetRoot, scopes, { includeInfo, agent: requestedAgent, detectedAgents });
    finalizeDoctorResult(result);

    if (json) {
      const report = detail === 'compact' ? {
        targetRoot: result.targetRoot, scope: result.scope, agentRuntime: result.agentRuntime,
        productInstallation: result.productInstallation,
        releaseAwareness: result.releaseAwareness,
        notices: result.notices,
        ok: result.ok, summary: result.summary, health: result.health, domainHealth: result.domainHealth,
        findings: result.findings, repairPlan: result.repairPlan, nextSteps: result.nextSteps,
      } : result;
      process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.doctor, report), null, 2)}\n`);
    } else {
      printDoctorReport(result);
    }
    process.exitCode = result.ok ? 0 : 1;
  }


  Object.assign(runtime, { doctor, diagnoseWorkspaceStructuredStore });
  return runtime;
}
