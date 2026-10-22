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
};

export type RuntimeEnvironmentDefinition = {
  connectionId: string;
  program: string;
  args: string[];
  target: string;
  targetRef: string;
  integrationBranch: string;
  timeoutSeconds: number;
};

export type ServiceRuntimeDefinition = {
  version: 1;
  source: 'agent';
  verifiedAt: string;
  local: RuntimeLocalDefinition;
  environments: Record<string, RuntimeEnvironmentDefinition>;
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
    }
  }

  const environments: Record<string, RuntimeEnvironmentDefinition> = {};
  if (raw.environments !== undefined && raw.environments !== null) {
    if (!raw.environments || typeof raw.environments !== 'object' || Array.isArray(raw.environments)) {
      problems.push('environments 必须是对象或省略。');
    } else {
      for (const [id, environmentRaw] of Object.entries(raw.environments)) {
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
          problems.push(`environments 环境编号 ${id} 不合法（小写字母开头，可含数字与 -）。`);
          continue;
        }
        if (!environmentRaw || typeof environmentRaw !== 'object' || Array.isArray(environmentRaw)) {
          problems.push(`environments.${id} 必须是对象。`);
          continue;
        }
        const rawEnvironment = environmentRaw as Record<string, unknown>;
        const connectionId = text(rawEnvironment.connectionId);
        const target = text(rawEnvironment.target);
        const targetRef = text(rawEnvironment.targetRef);
        const integrationBranch = text(rawEnvironment.integrationBranch);
        const program = text(rawEnvironment.program) ?? 'deploy';
        const args = rawEnvironment.args === undefined || rawEnvironment.args === null
          ? []
          : Array.isArray(rawEnvironment.args) && rawEnvironment.args.every((item: unknown) => text(item))
            ? rawEnvironment.args.map((item: unknown) => text(item)!)
            : null;
        if (args === null) problems.push(`environments.${id}.args 必须是字符串数组或省略。`);
        const timeoutSeconds = rawEnvironment.timeoutSeconds === undefined || rawEnvironment.timeoutSeconds === null
          ? 120
          : integer(rawEnvironment.timeoutSeconds, 10, 300);
        if (timeoutSeconds === null) problems.push(`environments.${id}.timeoutSeconds 必须是 10-300 的整数或省略。`);
        if (!connectionId) problems.push(`environments.${id}.connectionId 必须是非空字符串。`);
        if (!target) problems.push(`environments.${id}.target 必须是非空字符串。`);
        if (!targetRef) problems.push(`environments.${id}.targetRef 必须是非空字符串。`);
        if (!integrationBranch) problems.push(`environments.${id}.integrationBranch 必须是非空字符串。`);
        if (connectionId && target && targetRef && integrationBranch && args && timeoutSeconds !== null) {
          environments[id] = { connectionId, program, args, target, targetRef, integrationBranch, timeoutSeconds };
        }
      }
    }
  }

  if (problems.length) throw new RuntimeDefinitionError(problems);
  return { version: 1, source: 'agent', verifiedAt: verifiedAt!, local: localDefinition!, environments };
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
    },
    ...(Object.keys(definition.environments).length ? { environments: definition.environments } : {}),
  }, { lineWidth: 0 });
}
