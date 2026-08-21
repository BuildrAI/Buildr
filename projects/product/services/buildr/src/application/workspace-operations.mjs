import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  RUNTIME_ADAPTERS,
  SUPPORTED_AGENT_IDS,
  UNSUPPORTED_AGENT_GUIDANCE,
  isSupportedAgent,
} from '../infrastructure/runtime/adapter-contract.mjs';
import { observeGitCheckoutIdentity } from '../infrastructure/git/checkout-identity.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from './json-contracts.mjs';
import { DOCTOR_DIAGNOSTIC_PROFILE } from './doctor/result-model.mjs';
import { WORKSPACE_ROOT_GITIGNORE_ENTRIES } from './workspace/workspace-root-gitignore-entries.mjs';

export function registerApplicationWorkspaceOperations(runtime) {
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
  const diagnoseProjectEnvironmentPreparation = (...args) => runtime.diagnoseProjectEnvironmentPreparation(...args);
  const diagnoseInternalWorkflowRoutes = (...args) => runtime.diagnoseInternalWorkflowRoutes(...args);
  const inspectTaskFinishPersistence = (...args) => runtime.inspectTaskFinishPersistence(...args);
  const syncPackageBuiltins = (...args) => runtime.syncPackageBuiltins(...args);
  const finalizeDoctorResult = (...args) => runtime.finalizeDoctorResult(...args);
  const printDoctorReport = (...args) => runtime.printDoctorReport(...args);
  const releaseAwareness = (...args) => runtime.releaseAwareness(...args);
  const positionalArgs = (...args) => runtime.positionalArgs(...args);
  const syncPackageComponents = (...args) => runtime.syncPackageComponents(...args);
  const readPackageManifest = (...args) => runtime.readPackageManifest(...args);
  const parseManifestFileEntry = (...args) => runtime.parseManifestFileEntry(...args);
  const parseYamlDocument = (...args) => runtime.parseYamlDocument(...args);
  const diagnoseRules = (...args) => runtime.diagnoseRules(...args);
  const assertName = (...args) => runtime.assertName(...args);
  const assertAgentId = (...args) => runtime.assertAgentId(...args);
  const renderSkillsManifestYaml = (...args) => runtime.renderSkillsManifestYaml(...args);
  const renderProjectsYaml = (...args) => runtime.renderProjectsYaml(...args);
  const renderRulesManifestYaml = (...args) => runtime.renderRulesManifestYaml(...args);
  const renderCommandsManifestYaml = (...args) => runtime.renderCommandsManifestYaml(...args);
  const renderComponentsManifestYaml = (...args) => runtime.renderComponentsManifestYaml(...args);
  const trackWrite = (...args) => runtime.trackWrite(...args);
  const printResult = (...args) => runtime.printResult(...args);
  const optionValue = (...args) => runtime.optionValue(...args);
  const ensureDirectory = (...args) => runtime.ensureDirectory(...args);
  const atomicWriteJson = (...args) => runtime.atomicWriteJson(...args);
  const mutationStateRoot = (...args) => runtime.mutationStateRoot(...args);
  const mutationLockPath = (...args) => runtime.mutationLockPath(...args);
  const mutationRecoveryReceiptPath = (...args) => runtime.mutationRecoveryReceiptPath(...args);
  const restoreMutationSnapshot = (...args) => runtime.restoreMutationSnapshot(...args);
  const removeMutationRestoreTarget = (...args) => runtime.removeMutationRestoreTarget(...args);
  const withWorkspaceMutation = (...args) => runtime.withWorkspaceMutation(...args);
  const productRoot = (...args) => runtime.productRoot(...args);
  const writeMappedFileIfMissing = (...args) => runtime.writeMappedFileIfMissing(...args);
  const appendGitignoreEntries = (...args) => runtime.appendGitignoreEntries(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const toPosixRelative = (...args) => runtime.toPosixRelative(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);
  const existsFile = (...args) => runtime.existsFile(...args);
  const ensureRootRequiredBlock = (...args) => runtime.ensureRootRequiredBlock(...args);
  const assertInitializedBuildrWorkspace = (...args) => runtime.assertInitializedBuildrWorkspace(...args);
  const addDoctorFinding = (...args) => runtime.addDoctorFinding(...args);
  const createWorkspaceId = (...args) => runtime.createWorkspaceId(...args);
  const renderWorkspaceManifest = (...args) => runtime.renderWorkspaceManifest(...args);
  const diagnoseWorkspaceMetadata = (...args) => runtime.diagnoseWorkspaceMetadata(...args);

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

  function diagnoseTaskFinishStore(result, targetRoot) {
    if (observeGitCheckoutIdentity(targetRoot)?.linkedWorktree) {
      result.taskFinish = { status: 'not-applicable', current: [], leases: [] };
      return;
    }
    try {
      const observation = inspectTaskFinishPersistence(targetRoot);
      result.taskFinish = observation;
      for (const lease of observation.leases || []) if (lease.expired) addDoctorFinding(result, 'error', 'task_finish.expired_lease', `Task Finish target lease 已过期：${lease.targetIdentity}`, {
        path: '.buildr/local/workspace.sqlite', taskId: lease.taskId, runId: lease.runId,
        suggestion: '确认没有仍在运行的 Finish 进程后重试或恢复对应 run；Doctor 不会自动删除 lease。', userActionRequired: true,
      });
      for (const item of observation.current || []) if (item.status === 'cleanup_pending') addDoctorFinding(result, 'warning', 'task_finish.cleanup_pending', `Task Finish run 等待 cleanup：${item.runId}`, {
        path: '.buildr/local/workspace.sqlite', taskId: item.taskId, runId: item.runId, suggestion: '使用同一 Task Finish run 与 resume token 继续 cleanup；不要重新执行已完成的 delivery。', userActionRequired: true,
      });
    } catch (error) {
      result.taskFinish = { status: 'unavailable', error: error.message };
      addDoctorFinding(result, 'error', error.code || 'task_finish.persistence_failed', error.message, { path: '.buildr/local/workspace.sqlite', suggestion: '保留数据库现场并运行 Buildr Doctor；不要从旧 Finish 文件恢复。', userActionRequired: true });
    }
  }

  function bootstrapGuide() {
    const guidePath = path.join(productRoot(), 'docs', 'bootstrap-guide.md');
    if (!existsFile(guidePath)) {
      throw new Error(`Bootstrap guide not found: ${guidePath}`);
    }
    process.stdout.write(fs.readFileSync(guidePath, 'utf8'));
  }

  function mutationTransactions(targetRoot) {
    const stateRoot = mutationStateRoot(targetRoot);
    if (!existsDirectory(stateRoot)) return [];
    return fs.readdirSync(stateRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const transactionRoot = path.join(stateRoot, entry.name);
        const journalFile = path.join(transactionRoot, 'journal.json');
        let journal = null;
        let parseError = null;
        try { journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')); } catch (error) { parseError = error.message; }
        return { id: entry.name, transactionRoot, journalFile, journal, parseError };
      });
  }

  function diagnoseMutations(result, targetRoot) {
    const lockFile = mutationLockPath(targetRoot);
    let lock = null;
    if (existsFile(lockFile)) {
      try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch { lock = { invalid: true }; }
    }
    const transactions = mutationTransactions(targetRoot);
    result.mutations = { blocked: Boolean(lock || transactions.length), lock, transactions: transactions.map((item) => ({ id: item.id, operation: item.journal?.operation || null, phase: item.journal?.phase || null, affectedPaths: item.journal?.affectedPaths || [], parseError: item.parseError })) };
    for (const transaction of transactions) {
      addDoctorFinding(result, 'error', 'mutation.transaction_incomplete', `检测到未完成 Buildr source mutation：${transaction.id}`, {
        path: toPosixRelative(targetRoot, transaction.transactionRoot),
        transactionId: transaction.id,
        operation: transaction.journal?.operation || lock?.operation || null,
        phase: transaction.journal?.phase || lock?.phase || 'unknown',
        affectedPaths: transaction.journal?.affectedPaths || lock?.affectedPaths || [],
        suggestion: transaction.parseError ? '保留 transaction 目录并人工检查损坏 journal。' : '运行 mutation recover 恢复操作前源资产；恢复前不要删除 backup。',
        command: transaction.parseError ? undefined : `buildr mutation recover ${transaction.id} --target ${targetRoot}`,
        userActionRequired: true,
      });
    }
    if (lock && transactions.length === 0) {
      addDoctorFinding(result, 'error', 'mutation.lock_orphaned', '检测到没有 transaction journal 的 mutation lock。', {
        path: toPosixRelative(targetRoot, lockFile),
        operation: lock.operation || null,
        suggestion: '保留 lock 并检查 workspace；无法证明状态前不要继续 source mutation。',
        userActionRequired: true,
      });
    }
  }

  function mutationRecover(args) {
    const [id] = positionalArgs(args);
    if (!id) throw new Error('Missing mutation transaction id.');
    assertName(id, 'Mutation transaction id');
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const transactionRoot = path.join(mutationStateRoot(targetRoot), id);
    const journalFile = path.join(transactionRoot, 'journal.json');
    const recoveryReceipt = mutationRecoveryReceiptPath(targetRoot, id);
    if (!existsFile(journalFile)) {
      if (!existsFile(recoveryReceipt)) throw new Error(`Mutation transaction journal not found: ${id}`);
      const recovered = JSON.parse(fs.readFileSync(recoveryReceipt, 'utf8'));
      if (recovered.schemaVersion !== 'buildr.mutation-recovery/v1' || recovered.transactionId !== id) throw new Error(`Mutation recovery receipt is invalid: ${id}`);
      console.log(`Buildr source mutation 已经恢复：${id}`);
      return;
    }
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    if (journal.schemaVersion !== 'buildr.mutation/v1' || journal.transactionId !== id || !Array.isArray(journal.snapshots)) throw new Error(`Mutation transaction journal is invalid: ${id}`);
    const lockFile = mutationLockPath(targetRoot);
    let lock = null;
    if (existsFile(lockFile)) {
      lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (lock.transactionId !== id) throw new Error(`Mutation lock belongs to another transaction: ${lock.transactionId}`);
    }
    const restorePlan = [...journal.snapshots].reverse().map((snapshot) => {
      const target = path.resolve(snapshot.target);
      const relative = path.relative(targetRoot, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.startsWith(`.buildr${path.sep}mutations`)) throw new Error(`Mutation recovery target is unsafe: ${snapshot.target}`);
      const backup = path.join(transactionRoot, 'backup', String(snapshot.index));
      if (snapshot.existed && !fs.existsSync(backup)) throw new Error(`Mutation backup is missing for ${snapshot.relative}`);
      return { ...snapshot, target, backup };
    });
    for (const snapshot of restorePlan) restoreMutationSnapshot(snapshot);
    atomicWriteJson(recoveryReceipt, {
      schemaVersion: 'buildr.mutation-recovery/v1',
      transactionId: id,
      operation: journal.operation || null,
      recoveredAt: new Date().toISOString(),
      affectedPaths: journal.affectedPaths || [],
    });
    removeMutationRestoreTarget(transactionRoot);
    if (lock) {
      fs.rmSync(lockFile, { force: true });
      if (fs.existsSync(lockFile)) throw new Error(`Mutation recovery could not remove matching lock: ${id}`);
    }
    console.log(`已恢复 Buildr source mutation：${id}`);
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
      taskFinish: null,
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
      findings: [],
      repairPlan: [],
      nextSteps: [],
    };

    diagnoseWorkspace(result, targetRoot);
    diagnoseProductInstallation(result);
    diagnoseReleaseAwareness(result, internalOptions.releaseAwarenessOptions);
    if (result.workspace?.initialized) diagnoseWorkspaceMetadata(result, targetRoot);
    if (result.workspace?.initialized) diagnoseWorkspaceStructuredStore(result, targetRoot, includeInfo);
    if (result.workspace?.initialized) diagnoseTaskFinishStore(result, targetRoot);
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
    diagnoseProjectEnvironmentPreparation(result, targetRoot, registry);
    diagnoseServices(result, targetRoot, scopes, registry);
    diagnoseSkillsManifestSchemas(result, targetRoot, scopes);
    diagnoseInternalWorkflowRoutes(result);
    if (result.workspace?.initialized) diagnoseSkillCapabilities(result, targetRoot, scopes, requestedAgent);
    if (result.workspace?.initialized) {
      try {
        const builtinStatus = syncPackageBuiltins(targetRoot, { checkOnly: true });
        result.builtins.items = builtinStatus.findings;
        for (const finding of builtinStatus.findings.filter((item) => !item.component)) {
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
        ok: result.ok, summary: result.summary, health: result.health,
        findings: result.findings, repairPlan: result.repairPlan, nextSteps: result.nextSteps,
      } : result;
      process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.doctor, report), null, 2)}\n`);
    } else {
      printDoctorReport(result);
    }
    process.exitCode = result.ok ? 0 : 1;
  }

  function initBuildr(args) {
    const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
    const name = optionValue(args, '--name', path.basename(targetRoot));
    const description = optionValue(args, '--description', 'TODO: 请补充 Workspace 的管理范围和用途。');
    const profile = optionValue(args, '--profile', 'team');
    const agent = optionValue(args, '--agent', null);
    assertName(name, 'Workspace name');
    if (!description.trim()) throw new Error('Workspace description must be a non-empty string.');
    assertName(profile, 'Workspace profile');
    if (agent !== null) {
      assertAgentId(agent);
      if (!isSupportedAgent(agent)) {
        throw new Error(`Unsupported Agent runtime: ${agent}. Supported Agent runtime adapters: ${SUPPORTED_AGENT_IDS.join(', ')}. ${UNSUPPORTED_AGENT_GUIDANCE.message}${UNSUPPORTED_AGENT_GUIDANCE.nextStep}`);
      }
    }
    const manifest = readPackageManifest();
    const created = [];
    const changed = [];

    ensureDirectory(targetRoot);
    for (const relativeDir of manifest.workspaceDirectories) {
      ensureDirectory(path.join(targetRoot, relativeDir));
    }

    const workspaceId = createWorkspaceId();
    const variables = {};
    for (const rawEntry of manifest.workspaceFiles) {
      const entry = parseManifestFileEntry(rawEntry, 'workspaceFiles');
      writeMappedFileIfMissing(targetRoot, targetRoot, entry, variables, created);
    }
    trackWrite(targetRoot, path.join(targetRoot, '.buildr', 'workspace.yml'), renderWorkspaceManifest({
      workspace: { id: workspaceId, name, description },
      compatibility: { kind: 'organization', profile },
    }), created);
    ensureRootRequiredBlock(targetRoot, changed);
    trackWrite(targetRoot, path.join(targetRoot, 'projects', 'manifest.yml'), renderProjectsYaml({ schemaVersion: 'buildr.projects/v2', projects: {} }), created);
    trackWrite(targetRoot, path.join(targetRoot, 'rules', 'manifest.yml'), renderRulesManifestYaml({ rules: [] }), created);
    trackWrite(targetRoot, path.join(targetRoot, 'skills', 'manifest.yml'), renderSkillsManifestYaml({ schemaVersion: 'buildr.skills/v3', workspaceId, skills: [] }), created);
    trackWrite(targetRoot, path.join(targetRoot, 'commands', 'manifest.yml'), renderCommandsManifestYaml({ commands: [] }), created);
    trackWrite(targetRoot, path.join(targetRoot, 'components', 'manifest.yml'), renderComponentsManifestYaml({ components: [] }), created);
    const builtinResult = syncPackageBuiltins(targetRoot);
    changed.push(...builtinResult.changed);
    const componentResult = syncPackageComponents(targetRoot);
    if (componentResult.errors.length) throw new Error(componentResult.errors.map((item) => item.error).join('\n'));
    changed.push(...componentResult.changed);

    const gitignoreChanged = appendGitignoreEntries(path.join(targetRoot, '.gitignore'), [...WORKSPACE_ROOT_GITIGNORE_ENTRIES]);
    if (gitignoreChanged) changed.push('.gitignore');

    console.log(`Initialized Buildr root organization context at ${targetRoot}`);
    console.log(`Name: ${name}`);
    console.log(`Description: ${description}`);
    console.log(`Profile: ${profile}`);
    printResult('Workspace assets initialized', targetRoot, created, changed);
    if (agent !== null) {
      console.log('');
      console.log(`正在准备 ${agent} runtime；该步骤复用 buildr sync ${agent} 并执行最终 doctor。`);
      try {
        runtime.syncRuntime(agent, ['--target', targetRoot]);
      } catch (error) {
        throw new Error(`Workspace 源资产已初始化，但 ${agent} onboarding 未完成。\n修复问题后运行：buildr sync ${agent} --target ${targetRoot}\n原因：${error.message}`);
      }
      console.log(`Buildr onboarding 已完成：${agent}（包含 sync 与最终 doctor）。`);
      console.log('下一步：请由当前 Agent 完成一次首次使用交接。');
      console.log('用普通语言说明 Workspace → Project → Service：Project 是业务、产品、系统或长期工作；Service 只在需要代码仓、应用、模块或可执行资产时接入。');
      console.log('先根据真实 Project/Service 状态确认唯一范围或只询问必要歧义，然后邀请用户直接描述第一项真实工作；不要把 project create 命令作为面向用户的默认下一步。');
      return;
    }
    console.log('');
    console.log('仅初始化源资产的后续步骤：');
    console.log('  buildr runtime list --json');
    console.log(`  buildr sync <agent> --target ${targetRoot}`);
    console.log(`  buildr project create <project> --target ${targetRoot}`);
    console.log('');
    console.log('Agent runtime:');
    console.log('  先用 runtime list 确认当前 Agent 是否受支持；不支持时停止当前 Buildr 操作，请联系 Buildr 作者反馈该 Agent。');
    console.log(`  当前命令未写入 Agent runtime；受支持时，用 buildr sync <agent> --target ${targetRoot} 完成 runtime 与最终 doctor。`);
    console.log('  完整 Agent onboarding guidance：buildr bootstrap guide');
  }

  Object.assign(runtime, { bootstrapGuide, mutationTransactions, diagnoseMutations, diagnoseWorkspaceStructuredStore, diagnoseTaskFinishStore, mutationRecover, doctor, initBuildr });
  return runtime;
}
