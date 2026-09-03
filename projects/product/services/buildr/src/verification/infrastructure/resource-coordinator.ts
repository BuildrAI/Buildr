import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

export const VERIFICATION_RESOURCE_LEASE_SCHEMA = 'buildr.verification-resource-lease/v1';
export const VERIFICATION_RESOURCE_TICKET_SCHEMA = 'buildr.verification-resource-ticket/v1';

function safeIdentity(value: any, fallback: any) {
  const normalized = String(value || fallback).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (normalized || fallback).slice(0, 80);
}

function digest(value: any) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function scopedIdentity(value: any, fallback: any) {
  const raw = String(value || fallback);
  return `${safeIdentity(raw, fallback).slice(0, 60)}-${digest(raw).slice(0, 12)}`;
}

function atomicWriteJson(file: any, value: any) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function registerTicketDirectory(temporary: any, directory: any, ticket: any) {
  fs.mkdirSync(temporary, { mode: 0o700 });
  try {
    atomicWriteJson(path.join(temporary, 'ticket.json'), ticket);
    fs.renameSync(temporary, directory);
  } catch (error: any) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function replaceExpiredLeaseDirectory(directory: any, stale: any) {
  fs.renameSync(directory, stale);
  fs.rmSync(stale, { recursive: true, force: true });
}

function releaseLeaseDirectory(directory: any, released: any) {
  fs.renameSync(directory, released);
  fs.rmSync(released, { recursive: true, force: true });
}

function ownerMatches(value: any, owner: any) {
  return value?.taskId === owner.taskId
    && value?.environmentId === owner.environmentId
    && value?.runId === owner.runId;
}

function readJson(file: any) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function resolveVerificationCoordinationRoot(executionRoot: any, env: any = process.env) {
  if (env.BUILDR_VERIFICATION_COORDINATION_ROOT) {
    if (!path.isAbsolute(env.BUILDR_VERIFICATION_COORDINATION_ROOT)) throw new Error('BUILDR_VERIFICATION_COORDINATION_ROOT must be absolute');
    return path.resolve(env.BUILDR_VERIFICATION_COORDINATION_ROOT);
  }
  const resolved = path.resolve(executionRoot);
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: resolved, encoding: 'utf8' }).trim();
    return path.join(path.resolve(resolved, common), 'buildr', 'verification-resources');
  } catch {
    return path.join(os.tmpdir(), 'buildr-verification-resources', digest(resolved).slice(0, 24));
  }
}

export function coordinatedResourcesFromLimits(limits: any = {}) {
  return Object.fromEntries(Object.entries(limits.resources || {}).map(([id, capacity]: any) => [id, {
    id,
    strategy: 'coordinated',
    capacity,
    authorization: 'implicit',
  }]));
}

export function createVerificationResourceCoordinator(options: any) {
  const root = path.resolve(options.root);
  const definitions = Array.isArray(options.resources)
    ? Object.fromEntries(options.resources.map((resource: any) => [resource.id, resource]))
    : { ...(options.resources || {}) };
  const owner = {
    workspaceId: safeIdentity(options.owner?.workspaceId, 'workspace'),
    projectId: safeIdentity(options.owner?.projectId, 'project'),
    taskId: safeIdentity(options.owner?.taskId, 'workspace-task'),
    environmentId: scopedIdentity(options.owner?.environmentId, 'retained'),
    runId: safeIdentity(options.owner?.runId, `run-${process.pid}`),
    pid: options.owner?.pid ?? process.pid,
    host: options.owner?.host ?? os.hostname(),
  };
  const ttlMs = options.ttlMs ?? 120_000;
  const pollMs = options.pollMs ?? 50;
  const waitTimeoutMs = options.waitTimeoutMs ?? 600_000;
  const now = options.now ?? Date.now;
  const ticketOrder = options.ticketOrder ?? (() => process.hrtime.bigint().toString().padStart(24, '0'));
  const delay = options.delay ?? ((milliseconds: any) => new Promise((resolve: any) => setTimeout(resolve, milliseconds)));
  const timers = options.timers ?? { setInterval, clearInterval };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  function leaseValue(resource: any, slot: any, token: any, recovered: any = false) {
    const timestamp = now();
    return {
      schemaVersion: VERIFICATION_RESOURCE_LEASE_SCHEMA,
      resource,
      slot,
      token,
      ...owner,
      acquiredAt: new Date(timestamp).toISOString(),
      heartbeatAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + ttlMs).toISOString(),
      recovered,
    };
  }

  function resourceRoot(resource: any) {
    const directory = path.join(root, digest(`${owner.workspaceId}:${owner.projectId}:${resource}`));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
  }

  function ticketValue(resource: any, token: any) {
    const timestamp = now();
    return {
      schemaVersion: VERIFICATION_RESOURCE_TICKET_SCHEMA,
      resource,
      token,
      order: String(ticketOrder()),
      ...owner,
      enqueuedAt: new Date(timestamp).toISOString(),
      heartbeatAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + ttlMs).toISOString(),
    };
  }

  function createTicket(resource: any) {
    const waitersRoot = path.join(resourceRoot(resource), 'waiters');
    fs.mkdirSync(waitersRoot, { recursive: true, mode: 0o700 });
    const token = crypto.randomUUID();
    const directory = path.join(waitersRoot, token);
    const temporary = path.join(waitersRoot, `.${token}.creating-${process.pid}`);
    const ticket = ticketValue(resource, token);
    registerTicketDirectory(temporary, directory, ticket);
    const heartbeat = timers.setInterval(() => {
      try {
        const file = path.join(directory, 'ticket.json');
        const current = readJson(file);
        if (!current || current.token !== token || !ownerMatches(current, owner)) return;
        const timestamp = now();
        atomicWriteJson(file, { ...current, heartbeatAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + ttlMs).toISOString() });
      } catch { /* ticket ownership remains authoritative */ }
    }, Math.max(10, Math.floor(ttlMs / 3)));
    heartbeat.unref?.();
    return { directory, ticket, heartbeat };
  }

  function removeTicket(ticket: any, suffix: any) {
    const file = path.join(ticket.directory, 'ticket.json');
    const current = readJson(file);
    if (!current || current.token !== ticket.ticket.token || !ownerMatches(current, owner)) return false;
    const removed = `${ticket.directory}.${suffix}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      releaseLeaseDirectory(ticket.directory, removed);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  function expireTicket(directory: any, ticket: any) {
    const file = path.join(directory, 'ticket.json');
    const current = readJson(file);
    if (!current || current.token !== ticket.token || Date.parse(current.expiresAt) > now()) return false;
    const expired = `${directory}.expired-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      releaseLeaseDirectory(directory, expired);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  function validTickets(resource: any) {
    const waitersRoot = path.join(resourceRoot(resource), 'waiters');
    fs.mkdirSync(waitersRoot, { recursive: true, mode: 0o700 });
    const tickets: any[] = [];
    for (const entry of fs.readdirSync(waitersRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(waitersRoot, entry.name);
      const ticket = readJson(path.join(directory, 'ticket.json'));
      if (!ticket || ticket.schemaVersion !== VERIFICATION_RESOURCE_TICKET_SCHEMA || ticket.resource !== resource || ticket.token !== entry.name) continue;
      if (Date.parse(ticket.expiresAt) <= now()) {
        expireTicket(directory, ticket);
        continue;
      }
      tickets.push({ directory, ticket });
    }
    return tickets.sort((left: any, right: any) => left.ticket.order.localeCompare(right.ticket.order) || left.ticket.token.localeCompare(right.ticket.token));
  }

  function availableSlots(resource: any, definition: any) {
    const directory = resourceRoot(resource);
    let available = 0;
    for (let slot = 0; slot < definition.capacity; slot += 1) {
      const leaseDirectory = path.join(directory, `slot-${slot}`);
      if (!fs.existsSync(leaseDirectory)) {
        available += 1;
        continue;
      }
      const lease = readJson(path.join(leaseDirectory, 'lease.json'));
      if (lease && Date.parse(lease.expiresAt) <= now()) available += 1;
    }
    return available;
  }

  function ticketEligible(resource: any, definition: any, ticket: any) {
    const current = readJson(path.join(ticket.directory, 'ticket.json'));
    if (!current || current.token !== ticket.ticket.token || !ownerMatches(current, owner)) throw new Error(`Verification resource wait ownership lost: ${resource}`);
    const index = validTickets(resource).findIndex((item: any) => item.ticket.token === ticket.ticket.token);
    return index >= 0 && index < availableSlots(resource, definition);
  }

  function tryClaim(resource: any, definition: any) {
    const currentResourceRoot = resourceRoot(resource);
    for (let slot = 0; slot < definition.capacity; slot += 1) {
      const directory = path.join(currentResourceRoot, `slot-${slot}`);
      const token = crypto.randomUUID();
      try {
        fs.mkdirSync(directory, { mode: 0o700 });
        const lease = leaseValue(resource, slot, token);
        atomicWriteJson(path.join(directory, 'lease.json'), lease);
        return { directory, lease };
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
      }
      const file = path.join(directory, 'lease.json');
      const existing = readJson(file);
      if (!existing || Date.parse(existing.expiresAt) > now()) continue;
      const stale = `${directory}.stale-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
      try {
        replaceExpiredLeaseDirectory(directory, stale);
        fs.mkdirSync(directory, { mode: 0o700 });
        const lease = leaseValue(resource, slot, token, true);
        atomicWriteJson(file, lease);
        return { directory, lease };
      } catch (error: any) {
        if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error;
      }
    }
    return null;
  }

  async function releaseClaims(claims: any) {
    const results: any[] = [];
    for (const claim of [...claims].reverse()) {
      if (claim.strategy !== 'coordinated') {
        results.push({ resource: claim.resource, status: 'not-applicable' });
        continue;
      }
      timers.clearInterval(claim.heartbeat);
      const current = readJson(path.join(claim.directory, 'lease.json'));
      if (!current || current.token !== claim.token || current.taskId !== owner.taskId || current.environmentId !== owner.environmentId || current.runId !== owner.runId) {
        results.push({ resource: claim.resource, slot: claim.slot, status: 'ownership-mismatch' });
        continue;
      }
      const released = `${claim.directory}.released-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
      try {
        releaseLeaseDirectory(claim.directory, released);
        results.push({ resource: claim.resource, slot: claim.slot, status: 'released' });
      } catch (error: any) {
        results.push({ resource: claim.resource, slot: claim.slot, status: 'release-failed', message: error.message });
      }
    }
    return results.reverse();
  }

  async function acquire(resourceIds: any = [], acquireOptions: any = {}) {
    const startedAt = now();
    const claims: any[] = [];
    try {
      for (const resource of [...new Set<string>(resourceIds)].sort()) {
        const definition = definitions[resource];
        if (!definition) throw new Error(`Unknown verification resource: ${resource}`);
        if (definition.authorization === 'explicit' && !(acquireOptions.authorizedResources || []).includes(resource)) {
          throw new Error(`Explicit authorization is required for verification resource: ${resource}`);
        }
        if (definition.strategy === 'external') {
          claims.push({ resource, strategy: 'external', status: 'authorized' });
          continue;
        }
        if (definition.strategy !== 'coordinated' || !Number.isInteger(definition.capacity) || definition.capacity < 1) throw new Error(`Invalid coordinated verification resource: ${resource}`);
        const ticket = createTicket(resource);
        let claimed: any = null;
        try {
          while (!claimed) {
            if (acquireOptions.signal?.aborted) throw new Error(`Verification resource wait cancelled: ${resource}`);
            if (now() - startedAt >= (acquireOptions.waitTimeoutMs ?? waitTimeoutMs)) throw new Error(`Verification resource wait timed out: ${resource}`);
            if (ticketEligible(resource, definition, ticket)) claimed = tryClaim(resource, definition);
            if (!claimed) await delay(pollMs);
          }
        } finally {
          timers.clearInterval(ticket.heartbeat);
          removeTicket(ticket, claimed ? 'acquired' : 'cancelled');
        }
        const heartbeat = timers.setInterval(() => {
          try {
            const file = path.join(claimed.directory, 'lease.json');
            const current = readJson(file);
            if (!current || current.token !== claimed.lease.token) return;
            const timestamp = now();
            atomicWriteJson(file, { ...current, heartbeatAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + ttlMs).toISOString() });
          } catch { /* token ownership remains authoritative */ }
        }, Math.max(10, Math.floor(ttlMs / 3)));
        heartbeat.unref?.();
        claims.push({
          resource,
          strategy: 'coordinated',
          slot: claimed.lease.slot,
          token: claimed.lease.token,
          owner: { taskId: owner.taskId, environmentId: owner.environmentId, runId: owner.runId },
          recovered: claimed.lease.recovered,
          directory: claimed.directory,
          heartbeat,
          status: 'acquired',
        });
      }
    } catch (error: any) {
      await releaseClaims(claims);
      throw error;
    }
    return {
      claims,
      environment: {},
      waitDurationMs: now() - startedAt,
      acquiredAt: new Date(now()).toISOString(),
      release: () => releaseClaims(claims),
    };
  }

  return { root, owner, acquire };
}
