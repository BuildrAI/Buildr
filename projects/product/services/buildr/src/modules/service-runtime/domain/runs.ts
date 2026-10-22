export type RunStatus = 'starting' | 'running' | 'stopped' | 'failed';

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
};

export function isActiveRun(run: ManagedRunRecord): boolean {
  return run.status === 'starting' || run.status === 'running';
}

export function nextAvailablePort(preferred: number, used: ReadonlySet<number>): number {
  let port = preferred;
  while (used.has(port)) port += 1;
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
