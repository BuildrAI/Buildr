const HOUR_MS = 60 * 60 * 1000;

export function millisecondsUntilNextLocalHour(value = new Date()) {
  const now = value instanceof Date ? value : new Date(value);
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1, next.getTime() - now.getTime());
}

export function createBuildrWebScheduledMaintenance(runtime, {
  clock = () => new Date(),
  timers = { setTimeout, clearTimeout },
  onResult = () => {},
} = {}) {
  let timer = null;
  let stopped = true;
  let running = false;
  let lastResult = null;

  function publish(result) {
    lastResult = result;
    try { onResult(result); } catch {}
    return result;
  }

  function scheduleNext() {
    if (stopped || timer !== null) return;
    timer = timers.setTimeout(async () => {
      timer = null;
      await runNow();
      scheduleNext();
    }, millisecondsUntilNextLocalHour(clock()));
    timer?.unref?.();
  }

  async function runNow() {
    if (stopped) return { status: 'stopped', workspaces: [] };
    if (running) return { status: 'skipped', reason: 'in-flight', workspaces: [] };
    running = true;
    const startedAt = clock().toISOString();
    const workspaces = [];
    try {
      let registry;
      try {
        registry = runtime.listRegisteredWorkspaces();
      } catch (error) {
        return publish({ status: 'failed', startedAt, completedAt: clock().toISOString(), workspaces: [], diagnostic: { code: error.code || 'workspace_registry_unavailable' } });
      }
      for (const entry of registry.workspaces.filter((workspace) => workspace.status === 'ready')) {
        try {
          const result = await Promise.resolve(runtime.gcTaskExecutionRecords(entry.rootPath, {}));
          workspaces.push({ workspaceId: entry.workspace.id, status: result.status, counts: result.counts, diagnostic: result.diagnostic });
        } catch (error) {
          workspaces.push({ workspaceId: entry.workspace?.id || null, status: 'failed', counts: null, diagnostic: { code: error.code || 'task_execution_record_gc_failed' } });
        }
      }
      return publish({
        status: workspaces.some((item) => item.status === 'failed' || item.status === 'partial') ? 'partial' : 'completed',
        startedAt,
        completedAt: clock().toISOString(),
        workspaces,
        diagnostic: null,
      });
    } finally {
      running = false;
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    scheduleNext();
  }

  function stop() {
    stopped = true;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }

  return {
    start,
    stop,
    runNow,
    inspect: () => ({ enabled: !stopped, running, scheduled: timer !== null, lastResult }),
  };
}
