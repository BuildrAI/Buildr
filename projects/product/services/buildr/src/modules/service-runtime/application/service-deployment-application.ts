import {
  adapterInput,
  deploymentVersion,
  normalizeDeploymentResult,
  parseBranchListOutput,
  planIdentity,
  type DeploymentPlan,
  type DeploymentRecord,
  type ProgramObservation,
  type RemoteBranch,
} from '../domain/deployment.ts';
import { ServiceRuntimeError } from '../domain/errors.ts';
import type { ServiceWorktree } from '../domain/worktrees.ts';
import { readLatestDeployment, writeDeploymentRecord } from '../persistence/deployments-repository.ts';
import { readRuntimeDefinition } from '../persistence/runtime-definition-repository.ts';

export type DeploymentConnectionView = { id: string; name: string; revision: string; diagnostic: string | null };

export type DeploymentConnectionPort = {
  describe(targetRoot: string, connectionId: string, program: string): DeploymentConnectionView | null;
  run(targetRoot: string, options: { connection: DeploymentConnectionView; program: string; args: string[]; input: string; timeoutMs: number }): Promise<ProgramObservation>;
};

export type ServiceDeploymentDeps = {
  resolveService(targetRoot: string, serviceCode: string): { id: string; code: string } | null;
  listWorktrees(targetRoot: string, serviceCode: string): ServiceWorktree[];
  connection: DeploymentConnectionPort;
  now?(): string;
  newId?(): string;
};

export type DeploymentPlanView = {
  serviceCode: string;
  serviceId: string;
  environment: string;
  target: string;
  targetRef: string;
  provider: { connectionId: string; name: string; program: string; revision: string } | null;
  branch: string;
  integration: boolean;
  remoteCommit: string | null;
  version: string | null;
  local: ServiceWorktree | null;
  worktrees: ServiceWorktree[];
  branches: RemoteBranch[];
  expiresAt: string;
  available: boolean;
  latest: DeploymentRecord | null;
  diagnostics: string[];
};

const PLAN_VALIDITY_MS = 10 * 60 * 1000;

export function createServiceDeploymentApplication(deps: ServiceDeploymentDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  function requireEnvironment(targetRoot: string, serviceCode: string, environment: string) {
    const service = deps.resolveService(targetRoot, serviceCode);
    if (!service) throw new ServiceRuntimeError('service_runtime_service_unknown', `服务未登记：${serviceCode}`);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(environment)) throw new ServiceRuntimeError('service_deployment_environment_unknown', `环境编号 ${environment} 不合法。`);
    const existing = readRuntimeDefinition(targetRoot, serviceCode);
    if (!existing) throw new ServiceRuntimeError('service_runtime_definition_missing', `服务 ${serviceCode} 尚无运行定义，先由智能体识别并验证。`);
    const environmentDefinition = existing.definition.environments[environment];
    if (!environmentDefinition) throw new ServiceRuntimeError('service_deployment_environment_undefined', `服务 ${serviceCode} 未登记 ${environment} 部署目标。`);
    return { service, environmentDefinition };
  }

  function describe(targetRoot: string, connectionId: string, program: string): { connection: DeploymentConnectionView | null; diagnostics: string[] } {
    try {
      const connection = deps.connection.describe(targetRoot, connectionId, program);
      if (!connection) return { connection: null, diagnostics: [`连接实例 ${connectionId} 不存在或未启用；部署动作不可用，本地运行与日志不受影响。`] };
      if (connection.diagnostic) return { connection, diagnostics: [`连接实例 ${connectionId} 当前不可用：${connection.diagnostic}`] };
      return { connection, diagnostics: [] };
    } catch (cause) {
      return { connection: null, diagnostics: [`读取连接实例 ${connectionId} 失败：${(cause as Error).message}`] };
    }
  }

  function checkouts(targetRoot: string, serviceCode: string): { worktrees: ServiceWorktree[]; diagnostics: string[] } {
    try {
      return { worktrees: deps.listWorktrees(targetRoot, serviceCode), diagnostics: [] };
    } catch (cause) {
      return { worktrees: [], diagnostics: [`读取服务检出目录失败：${(cause as Error).message}`] };
    }
  }

  async function listBranches(targetRoot: string, serviceCode: string, environment = 'qa'): Promise<{ branches: RemoteBranch[]; provider: DeploymentConnectionView | null; diagnostics: string[] }> {
    const { environmentDefinition } = requireEnvironment(targetRoot, serviceCode, environment);
    const { connection, diagnostics } = describe(targetRoot, environmentDefinition.connectionId, environmentDefinition.program);
    // 连接实例或部署程序已确认不可用时不再调用程序，只保留诊断。
    if (!connection || connection.diagnostic) return { branches: [], provider: connection, diagnostics };
    const plan: DeploymentPlan = { serviceCode, environment, target: environmentDefinition.target, targetRef: environmentDefinition.targetRef, branch: environmentDefinition.integrationBranch, commit: '' };
    try {
      const observation = await deps.connection.run(targetRoot, {
        connection,
        program: environmentDefinition.program,
        args: environmentDefinition.args,
        input: adapterInput('list-branches', plan),
        timeoutMs: Math.min(environmentDefinition.timeoutSeconds * 1000, 60_000),
      });
      const branches = parseBranchListOutput(observation.stdout);
      if (!branches) return { branches: [], provider: connection, diagnostics: [...diagnostics, ...observation.diagnostics, '部署程序未返回符合契约的分支列表；可稍后重试或到外部系统核对。'] };
      return {
        branches: branches.map(item => ({ ...item, integration: item.integration || item.branch === environmentDefinition.integrationBranch })),
        provider: connection,
        diagnostics: [...diagnostics, ...observation.diagnostics],
      };
    } catch (cause) {
      return { branches: [], provider: connection, diagnostics: [...diagnostics, `读取远端分支失败：${(cause as Error).message}`] };
    }
  }

  return Object.freeze({
    async plan(targetRoot: string, input: { serviceCode: string; environment?: string; branch?: string; worktreeId?: string | null }): Promise<DeploymentPlanView> {
      const environment = input.environment ?? 'qa';
      const { service, environmentDefinition } = requireEnvironment(targetRoot, input.serviceCode, environment);
      const listed = await listBranches(targetRoot, input.serviceCode, environment);
      const observed = checkouts(targetRoot, input.serviceCode);
      const connection = listed.provider && !listed.provider.diagnostic ? listed.provider : null;
      const branch = input.branch?.trim() || environmentDefinition.integrationBranch;
      const remote = listed.branches.find(item => item.branch === branch) ?? null;
      const selected = input.worktreeId
        ? observed.worktrees.find(item => item.id === input.worktreeId) ?? null
        : observed.worktrees.find(item => item.main) ?? observed.worktrees[0] ?? null;
      const allDiagnostics = [...new Set([...listed.diagnostics, ...observed.diagnostics])];
      if (connection && !remote) allDiagnostics.push(`远端分支列表中没有 ${branch}；请改选其他分支或到外部系统核对。`);
      return {
        serviceCode: service.code,
        serviceId: service.id,
        environment,
        target: environmentDefinition.target,
        targetRef: environmentDefinition.targetRef,
        provider: connection ? { connectionId: connection.id, name: connection.name, program: environmentDefinition.program, revision: connection.revision } : null,
        branch,
        integration: branch === environmentDefinition.integrationBranch,
        remoteCommit: remote?.commit ?? null,
        version: remote ? deploymentVersion(branch, remote.commit) : null,
        local: selected,
        worktrees: observed.worktrees,
        branches: listed.branches,
        expiresAt: new Date(Date.now() + PLAN_VALIDITY_MS).toISOString(),
        available: Boolean(connection && remote),
        latest: readLatestDeployment(targetRoot, input.serviceCode, environment),
        diagnostics: allDiagnostics,
      };
    },

    async submit(targetRoot: string, input: { serviceCode: string; environment?: string; branch: string; commit: string; acknowledgeUnknown?: boolean }): Promise<DeploymentRecord> {
      const environment = input.environment ?? 'qa';
      const branch = typeof input.branch === 'string' ? input.branch.trim() : '';
      const commit = typeof input.commit === 'string' ? input.commit.trim() : '';
      if (!branch || !commit) throw new ServiceRuntimeError('service_deployment_plan_invalid', '部署计划必须包含远端分支与远端提交。');
      const { service, environmentDefinition } = requireEnvironment(targetRoot, input.serviceCode, environment);
      const plan: DeploymentPlan = { serviceCode: service.code, environment, target: environmentDefinition.target, targetRef: environmentDefinition.targetRef, branch, commit };
      const latest = readLatestDeployment(targetRoot, service.code, environment);
      if (latest && latest.state === 'unknown' && planIdentity(latest) === planIdentity(plan) && input.acknowledgeUnknown !== true) {
        throw new ServiceRuntimeError('service_deployment_unknown_pending', `上一次提交（${latest.version ?? deploymentVersion(branch, commit)}，${latest.at ?? latest.submittedAt}）结果未知；先到外部系统核对实际记录，确认后才可以再次提交同一计划。`);
      }
      const { connection, diagnostics } = describe(targetRoot, environmentDefinition.connectionId, environmentDefinition.program);
      if (!connection) throw new ServiceRuntimeError('service_deployment_provider_unavailable', diagnostics[0] ?? `连接实例 ${environmentDefinition.connectionId} 不可用。`);
      if (connection.diagnostic) throw new ServiceRuntimeError('service_deployment_provider_unavailable', `连接实例 ${environmentDefinition.connectionId} 当前不可用：${connection.diagnostic}`);
      const submittedAt = now();
      const base = {
        id: newId(),
        serviceId: service.id,
        serviceCode: service.code,
        environment,
        target: environmentDefinition.target,
        targetRef: environmentDefinition.targetRef,
        branch,
        commit,
        submittedAt,
        provider: { connectionId: connection.id, revision: connection.revision, program: environmentDefinition.program },
      };
      let observation: ProgramObservation;
      try {
        observation = await deps.connection.run(targetRoot, {
          connection,
          program: environmentDefinition.program,
          args: environmentDefinition.args,
          input: adapterInput('submit', plan),
          timeoutMs: environmentDefinition.timeoutSeconds * 1000,
        });
      } catch (cause) {
        // 程序未启动，提交没有发出；这与结果未知不同，可以重新提交。
        const record: DeploymentRecord = {
          ...base,
          state: 'failed',
          version: deploymentVersion(branch, commit),
          at: submittedAt,
          externalUrl: null,
          diagnostics: [`提交未发出：${(cause as Error).message}`],
        };
        await writeDeploymentRecord(targetRoot, record);
        return record;
      }
      const outcome = normalizeDeploymentResult(observation, plan);
      const record: DeploymentRecord = { ...base, ...outcome, at: outcome.at ?? submittedAt, version: outcome.version ?? deploymentVersion(branch, commit) };
      await writeDeploymentRecord(targetRoot, record);
      return record;
    },

    latest(targetRoot: string, serviceCode: string, environment = 'qa'): DeploymentRecord | null {
      return readLatestDeployment(targetRoot, serviceCode, environment);
    },

    listBranches,
  });
}

export type ServiceDeploymentApplication = ReturnType<typeof createServiceDeploymentApplication>;
