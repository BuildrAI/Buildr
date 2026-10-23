import YAML from 'yaml';

export type RuntimeReadiness =
  | { kind: 'log'; pattern: string }
  | { kind: 'http'; path: string };

export type RuntimeDirectBackend = { kind?: 'direct-url'; serviceCode: string; environmentVariable: string; remoteUrl: string };
export type RuntimeDiscoveryBackend = { kind: 'service-discovery'; serviceCode: string; serviceId: string; fallback: { kind: 'existing-discovery'; context: 'qa' } };
export type RuntimeBackendDeclaration = RuntimeDirectBackend | RuntimeDiscoveryBackend;
export type RuntimeRoutingDeclaration = { serviceId: string; environmentVariable: string; format: 'buildr.local-service-routing/v1'; observationPath: string };
export type RuntimeRemoteEnvironment = { code: string; name: string; url?: string; variables: Record<string, string> };

export type RuntimeLocalDefinition = {
  command: string[];
  cwd: string;
  profile: string | null;
  preferredPort: number;
  portOverride: string | null;
  readiness: RuntimeReadiness;
  timeoutSeconds: number;
  backends?: RuntimeBackendDeclaration[];
  routing?: RuntimeRoutingDeclaration;
  remoteEnvironments?: RuntimeRemoteEnvironment[];
};

export type ServiceRuntimeDefinition = {
  version: 1 | 2;
  source: 'agent';
  verifiedAt: string;
  local: RuntimeLocalDefinition;
};

export class RuntimeDefinitionError extends Error {
  readonly code = 'runtime_definition_invalid';
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`服务运行定义不合法：${problems.join('；')}`);
    this.problems = problems;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function relativePath(value: string): boolean {
  return !value.startsWith('/') && !value.startsWith('\\') && !value.split(/[\\/]/).includes('..');
}

export function parseRuntimeDefinition(content: string): ServiceRuntimeDefinition {
  const problems: string[] = [];
  let raw: any;
  try {
    raw = YAML.parse(content);
  } catch (cause) {
    throw new RuntimeDefinitionError([`YAML 解析失败：${(cause as Error).message}`]);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RuntimeDefinitionError(['顶层必须是对象。']);
  if (raw.version !== 1 && raw.version !== 2) problems.push('version 必须为 1 或 2。');
  if (raw.source !== 'agent') problems.push('source 必须为 agent（首期只接受智能体发现并验证的来源）。');
  const verifiedAt = text(raw.verifiedAt);
  if (!verifiedAt) problems.push('verifiedAt 必须是非空时间字符串。');

  const local = raw.local;
  if (!local || typeof local !== 'object' || Array.isArray(local)) {
    problems.push('local 必须是对象。');
  }
  let localDefinition: RuntimeLocalDefinition | null = null;
  if (local && typeof local === 'object' && !Array.isArray(local)) {
    const command = Array.isArray(local.command) && local.command.length && local.command.every((item: unknown) => text(item))
      ? local.command.map((item: unknown) => text(item)!)
      : null;
    if (!command) problems.push('local.command 必须是非空字符串数组。');
    const cwd = text(local.cwd);
    if (!cwd) problems.push('local.cwd 必须是非空字符串。');
    else if (!relativePath(cwd)) problems.push('local.cwd 必须是相对检出根的相对路径。');
    const profile = text(local.profile);
    const preferredPort = integer(local.preferredPort, 1, 65535);
    if (preferredPort === null) problems.push('local.preferredPort 必须是 1-65535 的整数。');
    const portOverride = text(local.portOverride);
    const timeoutSeconds = integer(local.timeoutSeconds, 10, 3600);
    if (timeoutSeconds === null) problems.push('local.timeoutSeconds 必须是 10-3600 的整数。');
    const readinessRaw = local.readiness;
    let readiness: RuntimeReadiness | null = null;
    if (!readinessRaw || typeof readinessRaw !== 'object' || Array.isArray(readinessRaw)) {
      problems.push('local.readiness 必须是对象。');
    } else if (readinessRaw.kind === 'log') {
      const pattern = text(readinessRaw.pattern);
      if (!pattern) problems.push('local.readiness.pattern 必须是非空字符串。');
      else readiness = { kind: 'log', pattern };
    } else if (readinessRaw.kind === 'http') {
      const pathValue = text(readinessRaw.path);
      if (!pathValue || !pathValue.startsWith('/')) problems.push('local.readiness.path 必须是以 / 开头的路径。');
      else readiness = { kind: 'http', path: pathValue };
    } else {
      problems.push('local.readiness.kind 必须是 log 或 http。');
    }
    if (command && cwd && relativePath(cwd) && preferredPort !== null && timeoutSeconds !== null && readiness) {
      localDefinition = { command, cwd, profile, preferredPort, portOverride, readiness, timeoutSeconds };
      if (local.remoteEnvironments !== undefined) {
        if (!Array.isArray(local.remoteEnvironments) || !local.remoteEnvironments.length) problems.push('local.remoteEnvironments 必须是非空环境列表。');
        else {
          const seen = new Set<string>();
          localDefinition.remoteEnvironments = [];
          for (const item of local.remoteEnvironments) {
            const code = text(item?.code), name = text(item?.name), url = text(item?.url);
            if (!code || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(code) || seen.has(code) || !name) { problems.push('远程环境需要唯一编号及名称。'); continue; }
            seen.add(code);
            if (url) { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw Error(); } catch { problems.push('远程环境 url 必须是不含业务路径或认证的网关根地址。'); } }
            const variables = item.variables ?? {};
            if (!variables || typeof variables !== 'object' || Array.isArray(variables) || Object.entries(variables).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0'))) { problems.push('远程环境 variables 必须是已验证的环境变量映射。'); continue; }
            localDefinition.remoteEnvironments.push({ code, name, ...(url ? { url } : {}), variables });
          }
        }
      }
      if (local.routing !== undefined) {
        const routing = local.routing;
        if (raw.version !== 2) problems.push('local.routing 必须使用 version 2。');
        const serviceId = text(routing?.serviceId);
        const environmentVariable = text(routing?.environmentVariable);
        const observationPath = text(routing?.observationPath);
        if (!routing || typeof routing !== 'object' || Array.isArray(routing) || Object.keys(routing).some(key => !['serviceId', 'environmentVariable', 'format', 'observationPath'].includes(key))) problems.push('local.routing 只允许已声明的服务名、注入变量、格式与观察路径。');
        if (!serviceId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serviceId)) problems.push('local.routing.serviceId 必须是真实发现名称。');
        if (!environmentVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(environmentVariable)) problems.push('local.routing.environmentVariable 必须是环境变量名称。');
        if (routing?.format !== 'buildr.local-service-routing/v1') problems.push('local.routing.format 不受支持。');
        if (!observationPath || !observationPath.startsWith('/') || observationPath.startsWith('//') || /[\\\\?#\s]/.test(observationPath) || observationPath.split('/').includes('..')) problems.push('local.routing.observationPath 必须是安全的本地只读路径。');
        if (serviceId && environmentVariable && observationPath && routing?.format === 'buildr.local-service-routing/v1') localDefinition.routing = { serviceId, environmentVariable, observationPath, format: routing.format };
      }
      if (local.backend !== undefined && local.backends !== undefined) problems.push('local.backend 与 local.backends 不能同时声明。');
      else if (local.backends !== undefined && !Array.isArray(local.backends)) problems.push('local.backends 必须是数组。');
      else {
        const declared: unknown[] = Array.isArray(local.backends) ? local.backends : local.backend !== undefined ? [local.backend] : [];
        const backends: RuntimeBackendDeclaration[] = [];
        const seenServices = new Set<string>();
        const seenVariables = new Set<string>();
        declared.forEach((backend, index) => {
          const label = Array.isArray(local.backends) ? `local.backends[${index}]` : 'local.backend';
          const serviceCode = text((backend as any)?.serviceCode);
          const environmentVariable = text((backend as any)?.environmentVariable);
          const remoteUrl = text((backend as any)?.remoteUrl);
          if (!serviceCode || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serviceCode)) problems.push(`${label}.serviceCode 必须是已登记服务编号。`);
          else if (seenServices.has(serviceCode)) problems.push(`${label}.serviceCode 重复声明：${serviceCode}。`);
          if ((backend as any)?.kind === 'service-discovery') {
            const entry = backend as any;
            if (raw.version !== 2) problems.push(`${label} 的发现类型必须使用 version 2。`);
            if (!localDefinition?.routing) problems.push(`${label} 必须声明已验证的 local.routing。`);
            const serviceId = text(entry.serviceId);
            if (!serviceId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serviceId)) problems.push(`${label}.serviceId 必须是真实发现名称。`);
            if (backends.some(item => item.kind === 'service-discovery' && item.serviceId === serviceId)) problems.push(`${label}.serviceId 重复声明。`);
            if (Object.keys(entry).some(key => !['kind', 'serviceCode', 'serviceId', 'fallback'].includes(key))) problems.push(`${label} 的发现条目不接受任意地址或注入字段。`);
            if (entry.fallback?.kind !== 'existing-discovery' || entry.fallback?.context !== 'qa' || Object.keys(entry.fallback ?? {}).some(key => !['kind', 'context'].includes(key))) problems.push(`${label}.fallback 只支持已验证的既有 QA 上下文。`);
            if (serviceCode && serviceId) { seenServices.add(serviceCode); backends.push({ kind: 'service-discovery', serviceCode, serviceId, fallback: { kind: 'existing-discovery', context: 'qa' } }); }
            return;
          }
          if ((backend as any)?.kind !== undefined && (backend as any)?.kind !== 'direct-url') problems.push(`${label}.kind 不受支持。`);
          if (raw.version === 2 && (backend as any)?.kind !== 'direct-url') problems.push(`${label} 的版本 2 直接地址条目必须声明 kind: direct-url。`);
          if (!environmentVariable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentVariable)) problems.push(`${label}.environmentVariable 必须是环境变量名称。`);
          else if (seenVariables.has(environmentVariable)) problems.push(`${label}.environmentVariable 重复声明：${environmentVariable}。`);
          let validUrl = false;
          try {
            const url = new URL(remoteUrl ?? '');
            validUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
          } catch {}
          if (!validUrl) problems.push(`${label}.remoteUrl 必须是不含认证和片段的 HTTP/HTTPS 地址。`);
          if (serviceCode && !seenServices.has(serviceCode) && environmentVariable && !seenVariables.has(environmentVariable) && remoteUrl && validUrl) {
            seenServices.add(serviceCode); seenVariables.add(environmentVariable);
            backends.push({ ...(raw.version === 2 ? { kind: 'direct-url' as const } : {}), serviceCode, environmentVariable, remoteUrl });
          }
        });
        if (backends.length) localDefinition.backends = backends;
      }
      if (localDefinition.routing && localDefinition.backends?.some(item => item.kind !== 'service-discovery' && item.environmentVariable === localDefinition!.routing!.environmentVariable)) problems.push('local.routing.environmentVariable 与直接地址注入变量冲突。');
      if (localDefinition.routing && localDefinition.remoteEnvironments?.some(item => Object.hasOwn(item.variables, localDefinition!.routing!.environmentVariable))) problems.push('远程环境不能覆盖任务路由上下文变量。');
    }
  }

  // 退役的部署字段只兼容忽略；旧配置不参与本地运行校验。
  if (problems.length) throw new RuntimeDefinitionError(problems);
  return { version: raw.version, source: 'agent', verifiedAt: verifiedAt!, local: localDefinition! };
}

export function renderRuntimeDefinition(definition: ServiceRuntimeDefinition): string {
  return YAML.stringify({
    version: definition.version,
    source: definition.source,
    verifiedAt: definition.verifiedAt,
    local: {
      command: definition.local.command,
      cwd: definition.local.cwd,
      ...(definition.local.profile ? { profile: definition.local.profile } : {}),
      preferredPort: definition.local.preferredPort,
      ...(definition.local.portOverride ? { portOverride: definition.local.portOverride } : {}),
      readiness: definition.local.readiness,
      timeoutSeconds: definition.local.timeoutSeconds,
      ...(definition.local.backends?.length ? { backends: definition.local.backends } : {}),
      ...(definition.local.routing ? { routing: definition.local.routing } : {}),
      ...(definition.local.remoteEnvironments ? { remoteEnvironments: definition.local.remoteEnvironments } : {}),
    },
  }, { lineWidth: 0 });
}
