import YAML from 'yaml';

export type RuntimeReadiness =
  | { kind: 'log'; pattern: string }
  | { kind: 'http'; path: string };

export type RuntimeLocalDefinition = {
  command: string[];
  cwd: string;
  profile: string | null;
  preferredPort: number;
  portOverride: string | null;
  readiness: RuntimeReadiness;
  timeoutSeconds: number;
  backend?: { serviceCode: string; environmentVariable: string; remoteUrl: string };
};

export type ServiceRuntimeDefinition = {
  version: 1;
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
  if (raw.version !== 1) problems.push('version 必须为 1。');
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
      if (local.backend !== undefined) {
        const backend = local.backend;
        const serviceCode = text(backend?.serviceCode);
        const environmentVariable = text(backend?.environmentVariable);
        const remoteUrl = text(backend?.remoteUrl);
        if (!serviceCode || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(serviceCode)) problems.push('local.backend.serviceCode 必须是已登记服务编号。');
        if (!environmentVariable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentVariable)) problems.push('local.backend.environmentVariable 必须是环境变量名称。');
        let validUrl = false;
        try {
          const url = new URL(remoteUrl ?? '');
          validUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
        } catch {}
        if (!validUrl) problems.push('local.backend.remoteUrl 必须是不含认证和片段的 HTTP/HTTPS 地址。');
        if (serviceCode && environmentVariable && remoteUrl && validUrl) localDefinition.backend = { serviceCode, environmentVariable, remoteUrl };
      }
    }
  }

  // 退役的部署字段只兼容忽略；旧配置不参与本地运行校验。
  if (problems.length) throw new RuntimeDefinitionError(problems);
  return { version: 1, source: 'agent', verifiedAt: verifiedAt!, local: localDefinition! };
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
      ...(definition.local.backend ? { backend: definition.local.backend } : {}),
    },
  }, { lineWidth: 0 });
}
