import { releasePackageName, releasePublishAuthority, npmRegistryOrigin } from './release-authority.ts';

export class ReleaseObservationError extends Error {
  code: string;
  retryable: boolean;
  observation: 'unknown' | 'conflict';
  constructor(message: string, code = 'release-state-unknown', retryable = false, observation: 'unknown' | 'conflict' = 'unknown') {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.observation = observation;
  }
}

export function isTransientReleaseError(error: any): boolean {
  return error?.retryable === true || ['ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(error?.cause?.code || error?.code);
}

export async function requestReleaseJson(url: string | URL, options: {
  fetchImpl?: typeof fetch;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  attempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
} = {}): Promise<{ status: number; body: any }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = options.method ?? 'GET';
  const attempts = method === 'GET' ? options.attempts ?? 2 : 1;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid bounded release request budget.');
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = (async () => {
        const response = await fetchImpl(url, {
          method, headers: options.headers,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
        });
        if (response.status === 404) return { status: 404, body: null };
        if (![200, 201, 204].includes(response.status)) {
          const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
          throw new ReleaseObservationError(`Release state request returned HTTP ${response.status}.`, [401, 403].includes(response.status) ? 'release-permission-denied' : 'release-http-error', transient);
        }
        if (response.status === 204) return { status: response.status, body: null };
        try { return { status: response.status, body: await response.json() }; }
        catch { throw new ReleaseObservationError('Release state response is not valid JSON.', 'release-invalid-response'); }
      })();
      return await Promise.race([request, new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ReleaseObservationError(`Release state request exceeded ${timeoutMs}ms.`, 'release-request-timeout', true));
        }, timeoutMs);
      })]);
    } catch (error) {
      const retryable = isTransientReleaseError(error);
      if (!retryable || attempt >= attempts) {
        if (error instanceof ReleaseObservationError) throw error;
        throw new ReleaseObservationError(`Release state request failed: ${error instanceof Error ? error.message : String(error)}`, 'release-network-error', retryable);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
    await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(250 * attempt);
  }
}

export async function observeUnpublishedRelease(version: string, options: {
  token?: string;
  fetchImpl?: typeof fetch;
  repository?: string;
  githubApi?: string;
  registry?: string;
} = {}): Promise<any> {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('Release version is invalid.');
  const repository = options.repository ?? releasePublishAuthority.repository;
  const githubApi = options.githubApi ?? 'https://api.github.com';
  const registry = options.registry ?? npmRegistryOrigin;
  const request = (url: string, github = true) => requestReleaseJson(url, {
    fetchImpl: options.fetchImpl,
    headers: { accept: 'application/json', ...(github && options.token ? { authorization: `Bearer ${options.token}` } : {}) },
  });
  // GitHub can mask private/unauthorized resources with 404. Establish the public
  // repository before interpreting any tag/Release 404 as a missing resource.
  const repo = await request(`${githubApi}/repos/${repository}`);
  if (repo.status !== 200 || repo.body?.full_name !== repository || repo.body?.private !== false) throw new ReleaseObservationError('Public release repository is unavailable; absence cannot be established.');
  const checks = await Promise.allSettled([
    request(`${githubApi}/repos/${repository}/git/ref/tags/v${encodeURIComponent(version)}`),
    request(`${githubApi}/repos/${repository}/releases/tags/v${encodeURIComponent(version)}`),
    request(`${registry}/${encodeURIComponent(releasePackageName)}/${encodeURIComponent(version)}`, false),
  ]);
  const facts: Record<string, any> = {};
  for (const [index, name] of ['tag', 'githubRelease', 'npm'].entries()) {
    const result = checks[index]!;
    facts[name] = result.status === 'fulfilled'
      ? { state: result.value.status === 404 ? 'absent' : 'present', value: result.value.body }
      : { state: 'unknown', code: result.reason?.code ?? 'release-state-unknown', message: result.reason?.message ?? String(result.reason) };
  }
  const runs: any[] = [];
  for (let page = 1; ; page++) {
    if (page > 20) throw new ReleaseObservationError('Release run history exceeds bounded lookup; no absence conclusion is available.');
    const response = await request(`${githubApi}/repos/${repository}/actions/workflows/publish.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`);
    if (response.status !== 200 || !Array.isArray(response.body?.workflow_runs)) throw new ReleaseObservationError('Publication run history is unavailable.');
    const batch = response.body.workflow_runs;
    runs.push(...batch.filter((run: any) => new RegExp(`^Release ${version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?: \\(|$)`, 'u').test(run.display_title || run.name || '')));
    if (batch.length < 100) break;
  }
  const active = runs.filter(run => run.status !== 'completed');
  const canPrepare = active.length === 0 && Object.values(facts).every(fact => fact.state === 'absent');
  return { status: canPrepare ? 'unpublished' : 'blocked', version, facts, activeRuns: active.map(run => ({ runId: run.id, status: run.status })), historicalRuns: runs.map(run => ({ runId: run.id, status: run.status, conclusion: run.conclusion })), effects: [] };
}
