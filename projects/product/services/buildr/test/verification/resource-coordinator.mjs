import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const SCHEMA = 'buildr.verification-resource-lease/v1';

function safeIdentity(value, fallback) {
  const normalized = String(value || fallback).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (normalized || fallback).slice(0, 80);
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function atomicWriteJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function resolveVerificationCoordinationRoot(productRoot, env = process.env) {
  if (env.BUILDR_VERIFICATION_COORDINATION_ROOT) {
    if (!path.isAbsolute(env.BUILDR_VERIFICATION_COORDINATION_ROOT)) throw new Error('BUILDR_VERIFICATION_COORDINATION_ROOT must be absolute');
    return path.resolve(env.BUILDR_VERIFICATION_COORDINATION_ROOT);
  }
  const resolved = path.resolve(productRoot);
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: resolved, encoding: 'utf8' }).trim();
    return path.join(path.resolve(resolved, common), 'buildr', 'verification-resources');
  } catch {
    return path.join(os.tmpdir(), 'buildr-verification-resources', digest(resolved).slice(0, 24));
  }
}

export function coordinatedResourcesFromLimits(limits = {}) {
  return Object.fromEntries(Object.entries(limits.resources || {}).map(([id, capacity]) => [id, {
    id, strategy: 'coordinated', capacity, cleanup: 'provider-owned', authorization: 'implicit',
  }]));
}

export function createVerificationResourceCoordinator(options) {
  const root = path.resolve(options.root);
  const definitions = options.resources || {};
  const owner = {
    taskId: safeIdentity(options.owner?.taskId, 'workspace-task'),
    runId: safeIdentity(options.owner?.runId, `run-${process.pid}`),
    pid: options.owner?.pid ?? process.pid,
    host: options.owner?.host ?? os.hostname(),
  };
  const ttlMs = options.ttlMs ?? 120_000;
  const pollMs = options.pollMs ?? 50;
  const waitTimeoutMs = options.waitTimeoutMs ?? 600_000;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timers = options.timers ?? { setInterval, clearInterval };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  function leaseValue(resource, slot, token, recovered = false) {
    const timestamp = now();
    return {
      schemaVersion: SCHEMA, resource, slot, token, ...owner,
      acquiredAt: new Date(timestamp).toISOString(),
      heartbeatAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + ttlMs).toISOString(),
      recovered,
    };
  }

  function tryClaim(resource, definition) {
    const resourceRoot = path.join(root, digest(resource));
    fs.mkdirSync(resourceRoot, { recursive: true, mode: 0o700 });
    for (let slot = 0; slot < definition.capacity; slot += 1) {
      const directory = path.join(resourceRoot, `slot-${slot}`);
      const token = crypto.randomUUID();
      try {
        fs.mkdirSync(directory, { mode: 0o700 });
        const lease = leaseValue(resource, slot, token, false);
        atomicWriteJson(path.join(directory, 'lease.json'), lease);
        return { directory, lease };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const file = path.join(directory, 'lease.json');
      const existing = readJson(file);
      if (!existing || Date.parse(existing.expiresAt) > now()) continue;
      const stale = `${directory}.stale-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
      try {
        fs.renameSync(directory, stale);
        fs.rmSync(stale, { recursive: true, force: true });
        fs.mkdirSync(directory, { mode: 0o700 });
        const lease = leaseValue(resource, slot, token, true);
        atomicWriteJson(file, lease);
        return { directory, lease };
      } catch (error) {
        if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error;
      }
    }
    return null;
  }

  async function acquire(resourceIds = [], acquireOptions = {}) {
    const startedAt = now();
    const claims = [];
    const environment = {};
    const requested = [...new Set(resourceIds)].sort();
    try {
      for (const resource of requested) {
        const definition = definitions[resource];
        if (!definition) throw new Error(`Unknown verification resource: ${resource}`);
        if (definition.strategy === 'external') {
          if (!(acquireOptions.authorizedResources || []).includes(resource)) throw new Error(`Explicit authorization is required for external verification resource: ${resource}`);
          claims.push({ resource, strategy: 'external', cleanup: 'external', status: 'authorized' });
          continue;
        }
        if (definition.strategy === 'namespaced') {
          const namespace = safeIdentity(`${owner.taskId}-${owner.runId}-${resource}`, 'verification-run');
          environment[definition.namespaceEnv] = namespace;
          claims.push({ resource, strategy: 'namespaced', namespace, cleanup: definition.cleanup, status: 'ready' });
          continue;
        }
        if (definition.strategy === 'isolated') {
          claims.push({ resource, strategy: 'isolated', cleanup: definition.cleanup, status: 'ready' });
          continue;
        }
        if (definition.strategy !== 'coordinated' || !Number.isInteger(definition.capacity) || definition.capacity < 1) throw new Error(`Invalid coordinated verification resource: ${resource}`);
        let claimed = null;
        while (!claimed) {
          if (acquireOptions.signal?.aborted) throw new Error(`Verification resource wait cancelled: ${resource}`);
          if (now() - startedAt >= (acquireOptions.waitTimeoutMs ?? waitTimeoutMs)) throw new Error(`Verification resource wait timed out: ${resource}`);
          claimed = tryClaim(resource, definition);
          if (!claimed) await delay(pollMs);
        }
        const heartbeat = timers.setInterval(() => {
          try {
            const file = path.join(claimed.directory, 'lease.json');
            const current = readJson(file);
            if (!current || current.token !== claimed.lease.token) return;
            const timestamp = now();
            atomicWriteJson(file, { ...current, heartbeatAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + ttlMs).toISOString() });
          } catch {
            // Release or stale-lease recovery may move the slot between the
            // ownership check and the atomic write. The next owner token is
            // authoritative; a heartbeat must never terminate the verifier.
          }
        }, Math.max(10, Math.floor(ttlMs / 3)));
        heartbeat.unref?.();
        claims.push({ resource, strategy: 'coordinated', slot: claimed.lease.slot, token: claimed.lease.token, owner: { taskId: owner.taskId, runId: owner.runId }, recovered: claimed.lease.recovered, directory: claimed.directory, heartbeat, status: 'acquired' });
      }
    } catch (error) {
      await releaseClaims(claims);
      throw error;
    }
    return {
      claims,
      environment,
      waitDurationMs: now() - startedAt,
      acquiredAt: new Date(now()).toISOString(),
      release: () => releaseClaims(claims),
    };
  }

  async function releaseClaims(claims) {
    const results = [];
    for (const claim of [...claims].reverse()) {
      if (claim.strategy !== 'coordinated') { results.push({ resource: claim.resource, status: 'not-applicable' }); continue; }
      timers.clearInterval(claim.heartbeat);
      const file = path.join(claim.directory, 'lease.json');
      const current = readJson(file);
      if (!current || current.token !== claim.token || current.taskId !== owner.taskId || current.runId !== owner.runId) {
        results.push({ resource: claim.resource, slot: claim.slot, status: 'ownership-mismatch' });
        continue;
      }
      const released = `${claim.directory}.released-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
      try {
        fs.renameSync(claim.directory, released);
        fs.rmSync(released, { recursive: true, force: true });
        results.push({ resource: claim.resource, slot: claim.slot, status: 'released' });
      } catch (error) {
        results.push({ resource: claim.resource, slot: claim.slot, status: 'release-failed', message: error.message });
      }
    }
    return results.reverse();
  }

  return { root, owner, acquire };
}
