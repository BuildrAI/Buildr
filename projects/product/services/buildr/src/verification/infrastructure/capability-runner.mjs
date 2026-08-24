export async function runVerificationCapabilities(capabilities, options = {}) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) throw new Error('runVerificationCapabilities requires at least one capability');
  if (typeof options.execute !== 'function') throw new Error('runVerificationCapabilities requires an execute function');
  const concurrency = options.concurrency ?? Math.min(4, capabilities.length);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('Verification concurrency must be an integer from 1 to 32');
  const queuedAtMs = Date.now();
  const queuedAt = new Date(queuedAtMs).toISOString();
  const results = new Array(capabilities.length);
  let cursor = 0;

  async function worker() {
    while (cursor < capabilities.length) {
      const index = cursor;
      cursor += 1;
      const capability = capabilities[index];
      let resourceHandle = null;
      let startedAtMs = null;
      try {
        resourceHandle = options.resourceCoordinator && (capability.resourceClaims ?? []).length > 0
          ? await options.resourceCoordinator.acquire(capability.resourceClaims, { authorizedResources: options.authorizedResources, signal: options.signal })
          : null;
        startedAtMs = Date.now();
        const executed = await options.execute(capability, { resourceEnvironment: resourceHandle?.environment || {} });
        const release = resourceHandle ? await resourceHandle.release() : [];
        const releaseFailed = release.some((item) => !['released', 'not-applicable'].includes(item.status));
        const finishedAtMs = Date.now();
        results[index] = {
          id: capability.id,
          title: capability.title || capability.id,
          ...executed,
          ...(resourceHandle ? { resourceCoordination: { waitDurationMs: resourceHandle.waitDurationMs, acquiredAt: resourceHandle.acquiredAt, claims: resourceHandle.claims.map(({ heartbeat, directory, token, ...claim }) => claim), release } } : {}),
          ...(releaseFailed && executed.status === 'passed' ? { status: 'failed', exitCode: 1, stderr: `${executed.stderr || ''}Verification resource cleanup did not preserve ownership.\n` } : {}),
          queuedAt,
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
          queueDurationMs: startedAtMs - queuedAtMs,
        };
      } catch (error) {
        const release = resourceHandle ? await resourceHandle.release().catch(() => []) : [];
        startedAtMs ??= Date.now();
        const finishedAtMs = Date.now();
        results[index] = {
          id: capability.id,
          title: capability.title || capability.id,
          status: 'failed',
          exitCode: 1,
          signal: null,
          durationMs: 0,
          stdout: '',
          stderr: `${error.stack || error.message}\n`,
          ...(resourceHandle ? { resourceCoordination: { waitDurationMs: resourceHandle.waitDurationMs, acquiredAt: resourceHandle.acquiredAt, claims: resourceHandle.claims.map(({ heartbeat, directory, token, ...claim }) => claim), release } } : {}),
          queuedAt,
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
          queueDurationMs: startedAtMs - queuedAtMs,
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, capabilities.length) }, () => worker()));
  return results;
}
