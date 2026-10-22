import { ServiceRuntimeError } from '../../domain/errors.ts';
import { RuntimeDefinitionError } from '../../domain/runtime-definition.ts';
import type { ServiceDeploymentApplication } from '../../application/service-deployment-application.ts';
import type { ServiceRuntimeApplication } from '../../application/service-runtime-application.ts';
import type { ServiceRuntimeView } from '../../application/service-runtime-view.ts';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const STATUS_BY_CODE: Record<string, number> = {
  runtime_definition_invalid: 400,
  service_deployment_plan_invalid: 400,
  service_runtime_service_unknown: 404,
  service_runtime_run_unknown: 404,
  service_runtime_worktree_unknown: 404,
  service_runtime_repository_unregistered: 409,
  service_runtime_repository_unavailable: 409,
  service_runtime_definition_missing: 409,
  service_runtime_worktree_busy: 409,
  service_runtime_port_unavailable: 409,
  service_deployment_environment_unknown: 400,
  service_deployment_environment_undefined: 409,
  service_deployment_provider_unavailable: 409,
  service_deployment_unknown_pending: 409,
};

function failure(code: string, message: string, status = 400): never {
  throw Object.assign(new Error(message), { code, status });
}

function identifier(value: string | undefined, label: string): string {
  let decoded = '';
  try {
    decoded = decodeURIComponent(value ?? '');
  } catch {
    failure('service_runtime_input_invalid', `${label} 编码无效。`);
  }
  if (!IDENTIFIER.test(decoded)) failure('service_runtime_input_invalid', `${label} 无效。`);
  return decoded;
}

function assertParams(searchParams: URLSearchParams, allowed: string[]) {
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key) || searchParams.getAll(key).length !== 1) failure('service_runtime_query_forbidden', `服务运行接口不接受查询参数：${key}。`);
  }
}

export function createServiceRuntimeHttp(deps: { view: ServiceRuntimeView; runtime: ServiceRuntimeApplication; deployment: ServiceDeploymentApplication }) {
  return Object.freeze({
    id: 'service-runtime.http',
    async handle({ request, suffix, searchParams, root, authorizeWrite, readBody }: any) {
      if (!suffix.startsWith('/service-runtime')) return null;
      try {
        const service = suffix.match(/^\/service-runtime\/services\/([^/]+)$/);
        if (service && request.method === 'GET') {
          assertParams(searchParams, []);
          return { status: 200, body: await deps.view.detail(root, identifier(service[1], '服务编号')) };
        }
        const plan = suffix.match(/^\/service-runtime\/services\/([^/]+)\/deployment-plan$/);
        if (plan && request.method === 'GET') {
          assertParams(searchParams, ['environment', 'branch', 'worktreeId']);
          return {
            status: 200,
            body: await deps.deployment.plan(root, {
              serviceCode: identifier(plan[1], '服务编号'),
              ...(searchParams.has('environment') ? { environment: searchParams.get('environment')! } : {}),
              ...(searchParams.has('branch') ? { branch: searchParams.get('branch')! } : {}),
              ...(searchParams.has('worktreeId') ? { worktreeId: searchParams.get('worktreeId')! } : {}),
            }),
          };
        }
        const start = suffix.match(/^\/service-runtime\/services\/([^/]+)\/runs$/);
        if (start && request.method === 'POST') {
          assertParams(searchParams, []);
          authorizeWrite();
          const body = await readBody(new Set(['worktreeId']), '启动本地运行');
          if (typeof body.worktreeId !== 'string' || !body.worktreeId) failure('service_runtime_input_invalid', '必须选择要启动的检出目录。');
          return { status: 200, body: await deps.runtime.startRun(root, { serviceCode: identifier(start[1], '服务编号'), worktreeId: body.worktreeId }) };
        }
        const deploy = suffix.match(/^\/service-runtime\/services\/([^/]+)\/deployments$/);
        if (deploy && request.method === 'POST') {
          assertParams(searchParams, []);
          authorizeWrite();
          const body = await readBody(new Set(['environment', 'branch', 'commit', 'acknowledgeUnknown']), '提交部署');
          if (typeof body.branch !== 'string' || typeof body.commit !== 'string') failure('service_deployment_plan_invalid', '部署计划必须包含远端分支与远端提交。');
          if (body.acknowledgeUnknown !== undefined && typeof body.acknowledgeUnknown !== 'boolean') failure('service_deployment_plan_invalid', 'acknowledgeUnknown 必须是布尔值。');
          return {
            status: 200,
            body: await deps.deployment.submit(root, {
              serviceCode: identifier(deploy[1], '服务编号'),
              branch: body.branch,
              commit: body.commit,
              ...(body.environment === undefined ? {} : { environment: body.environment }),
              ...(body.acknowledgeUnknown === undefined ? {} : { acknowledgeUnknown: body.acknowledgeUnknown }),
            }),
          };
        }
        if (suffix === '/service-runtime/overview' && request.method === 'GET') {
          assertParams(searchParams, []);
          return { status: 200, body: await deps.view.overview(root) };
        }
        const stop = suffix.match(/^\/service-runtime\/runs\/([^/]+)\/stop$/);
        if (stop && request.method === 'POST') {
          assertParams(searchParams, []);
          authorizeWrite();
          await readBody(new Set([]), '停止本地运行');
          return { status: 200, body: await deps.runtime.stopRun(root, identifier(stop[1], '运行编号')) };
        }
        const log = suffix.match(/^\/service-runtime\/runs\/([^/]+)\/log$/);
        if (log && request.method === 'GET') {
          assertParams(searchParams, ['maxBytes']);
          const maxBytes = searchParams.has('maxBytes') ? Number(searchParams.get('maxBytes')) : undefined;
          if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 1024)) failure('service_runtime_input_invalid', 'maxBytes 必须是不小于 1024 的整数。');
          return { status: 200, body: deps.runtime.readLog(root, identifier(log[1], '运行编号'), maxBytes === undefined ? {} : { maxBytes }) };
        }
        return null;
      } catch (cause) {
        if (cause instanceof ServiceRuntimeError) failure(cause.code, cause.message, STATUS_BY_CODE[cause.code] ?? 400);
        if (cause instanceof RuntimeDefinitionError) failure(cause.code, cause.message, 400);
        throw cause;
      }
    },
  });
}
