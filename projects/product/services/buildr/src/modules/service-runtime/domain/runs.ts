import type { RuntimeReadiness } from './runtime-definition.ts';

export type RunStatus = 'starting' | 'running' | 'stopped' | 'failed';

export type RunDirectConnection = { kind?: 'direct-url'; mode: 'local' | 'remote'; url: string; serviceCode: string; runId: string | null };
export type RunDiscoveryConnection = { kind: 'service-discovery'; mode: 'local' | 'remote'; url: null; serviceCode: string; serviceId: string; runId: string | null; context: 'qa' | null; reason: string };
export type RunConnection = RunDirectConnection | RunDiscoveryConnection;
export type RoutingObservation = { status: 'observed' | 'unknown' | 'unavailable'; observedAt?: string; targets?: Record<string, unknown>; error?: string };
export type RunRouting = {
  laneId: string; workspaceId: string; hostId: string; serviceId: string;
  contextDigest: string; contextPath: string; observationPath: string;
  observation?: RoutingObservation;
};
export type RunLaunch = {
  command: string[];
  cwd: string;
  profile: string | null;
  readiness: RuntimeReadiness;
  timeoutSeconds: number;
  definitionPath: string;
  verifiedAt: string;
};
export type ProcessIdentity = { pid: number; groupId: number; startTime: string };

export type ManagedRunRecord = {
  id: string;
  serviceId: string;
  serviceCode: string;
  worktreeId: string;
  worktreePath: string;
  worktreeLabel: string;
  branch: string | null;
  head: string | null;
  pid: number;
  preferredPort: number;
  actualPort: number;
  portNote: string;
  status: RunStatus;
  startedAt: string;
  stoppedAt: string | null;
  failure: string | null;
  logPath: string;
  main: boolean | null;
  dirty: boolean | null;
  taskId: string | null;
  taskTitle: string | null;
  origin: 'human' | 'agent' | 'unknown';
  url: string;
  connection: RunDirectConnection | null;
  connections: RunConnection[];
  routing?: RunRouting;
  launch: RunLaunch | null;
  processIdentity: ProcessIdentity | null;
};

export function isActiveRun(run: Pick<ManagedRunRecord, 'status'> & Partial<Pick<ManagedRunRecord, 'pid' | 'stoppedAt'>>): boolean {
  return run.status === 'starting' || run.status === 'running'
    || run.status === 'failed' && run.stoppedAt === null && typeof run.pid === 'number' && run.pid > 0;
}

export function nextAvailablePort(preferred: number, used: ReadonlySet<number>): number {
  let port = preferred;
  while (port <= 65535 && used.has(port)) port += 1;
  return port;
}

export function createReadinessMatcher(readiness: { kind: 'log'; pattern: string } | { kind: 'http'; path: string }) {
  if (readiness.kind === 'log') {
    const pattern = readiness.pattern;
    return {
      kind: 'log' as const,
      testLine: (line: string) => line.includes(pattern),
      testHttp: null as null | ((status: number) => boolean),
    };
  }
  return {
    kind: 'http' as const,
    testLine: null as null | ((line: string) => boolean),
    testHttp: (status: number) => status >= 200 && status < 400,
  };
}
