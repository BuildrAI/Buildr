import path from 'node:path';

export function releaseCommandDiagnostic(command: string, args: string[], result: any): any {
  const bounded = (value: unknown) => String(value ?? '').replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+)/gu, '[redacted]').slice(-8192);
  const stderr = bounded(result.stderr), message = bounded(result.error?.message);
  const httpStatus = Number(/\bHTTP\s+(\d{3})\b/u.exec(stderr)?.[1]) || null;
  return { code: 'release-command-failed', command: path.basename(command), operation: args.slice(0, 2).join(' '),
    exitCode: result.status ?? null, signal: result.signal ?? null, systemCode: result.error?.code ?? null,
    httpStatus, stderr, message };
}

export function releaseDispatchRejected(diagnostic: any): boolean {
  // Only an explicit transport rejection (or failure to start the client) proves
  // that the server did not accept the request. A timeout never does.
  return diagnostic?.systemCode === 'ENOENT' || diagnostic?.systemCode === 'EACCES'
    || [400, 401, 403, 404, 405, 409, 422, 429].includes(diagnostic?.httpStatus);
}

export function releaseRecoveryPlan(phase: string, status: string, state: any, nextActions: string[]): any {
  const retained = [
    ...(state.candidate?.runId ? [{ kind: 'candidate-run', runId: state.candidate.runId, sourceCommit: state.candidate.sourceCommit }] : []),
    ...(state.context?.identity ? [{ kind: 'prepared-context', identity: state.context.identity }] : []),
    ...Object.entries(state.packagePublications ?? {}).filter(([, value]: any) => value.evidence?.status === 'passed')
      .map(([name, value]: any) => ({ kind: 'published-package', package: name, runId: value.runId })),
  ];
  const source = status === 'local-verification-required';
  const unknown = /unconfirmed|readback-required/u.test(status);
  const stage = source ? 'source-verification' : status.startsWith('plugin-preparation-') || status === 'readiness-blocked' ? 'adoption-readiness' : phase;
  return { stage, status, retained, action: source ? 'complete-missing-checks' : unknown ? 'read-original-request'
    : status === 'diagnosis-required' ? 'diagnose-failed-boundary' : nextActions.length ? 'continue-current-operation' : 'none',
    automaticFullRerun: false, nextActions };
}
