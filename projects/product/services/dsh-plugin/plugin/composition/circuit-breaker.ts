/** Cross-process startup circuit breaker keyed by host version and composition identity. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const COMPOSITION_GUARD_SCHEMA = 'buildr.dsh-composition-guard/v1';

export type GuardState = 'attempting' | 'ready' | 'tripped';

export interface CompositionGuardRecord {
  schemaVersion: typeof COMPOSITION_GUARD_SCHEMA;
  hostVersion: string | null;
  compositionIdentity: string;
  state: GuardState;
  pid: number;
  updatedAt: string;
}

export type CircuitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'circuit-breaker'; detail: string };

export function readHostVersion(installAnchor: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(installAnchor, 'utf8')) as { version?: unknown };
    return typeof manifest.version === 'string' && manifest.version.trim() !== '' ? manifest.version.trim() : null;
  } catch {
    return null;
  }
}

export function readCompositionIdentity(compositionEntryUrl: string): string {
  try {
    const pkgUrl = new URL('../package.json', compositionEntryUrl);
    const manifest = JSON.parse(readFileSync(pkgUrl, 'utf8')) as {
      name?: unknown;
      version?: unknown;
      buildrComposition?: { patchSha256?: unknown };
      buildrDshSourceSdk?: { sourcePatchSha256?: unknown };
    };
    const name = typeof manifest.name === 'string' && manifest.name.trim() !== '' ? manifest.name.trim() : 'buildr-composition';
    const version = typeof manifest.version === 'string' && manifest.version.trim() !== '' ? manifest.version.trim() : '0.0.0';
    const patchSha = typeof manifest.buildrComposition?.patchSha256 === 'string'
      ? manifest.buildrComposition.patchSha256
      : typeof manifest.buildrDshSourceSdk?.sourcePatchSha256 === 'string'
        ? manifest.buildrDshSourceSdk.sourcePatchSha256
        : '';
    return patchSha ? `${name}@${version}:${patchSha}` : `${name}@${version}`;
  } catch {
    return `entry:${createHash('sha256').update(compositionEntryUrl).digest('hex').slice(0, 16)}`;
  }
}

export function guardFilePath(profileDir: string): string {
  return join(profileDir, 'data', 'buildr-composition', 'startup-guard.json');
}

function parseGuardRecord(value: unknown): CompositionGuardRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== COMPOSITION_GUARD_SCHEMA) return null;
  if (candidate.hostVersion !== null && typeof candidate.hostVersion !== 'string') return null;
  if (typeof candidate.compositionIdentity !== 'string' || !candidate.compositionIdentity) return null;
  if (candidate.state !== 'attempting' && candidate.state !== 'ready' && candidate.state !== 'tripped') return null;
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid)) return null;
  if (typeof candidate.updatedAt !== 'string') return null;
  return {
    schemaVersion: COMPOSITION_GUARD_SCHEMA,
    hostVersion: candidate.hostVersion,
    compositionIdentity: candidate.compositionIdentity,
    state: candidate.state,
    pid: candidate.pid,
    updatedAt: candidate.updatedAt,
  };
}

export function createStartupCircuitBreaker(options: {
  guardFile: string;
  hostVersion: string | null;
  compositionIdentity: string;
  pid?: number;
  now?: () => string;
}) {
  const pid = options.pid ?? process.pid;
  const now = options.now ?? (() => new Date().toISOString());

  const writeState = (state: GuardState): void => {
    try {
      const directory = dirname(options.guardFile);
      mkdirSync(directory, { recursive: true });
      const record: CompositionGuardRecord = {
        schemaVersion: COMPOSITION_GUARD_SCHEMA,
        hostVersion: options.hostVersion,
        compositionIdentity: options.compositionIdentity,
        state,
        pid,
        updatedAt: now(),
      };
      const tmp = `${options.guardFile}.${pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
      renameSync(tmp, options.guardFile);
    } catch {
      // Read-only or restricted profile storage must never block startup.
    }
  };

  return {
    check(): CircuitCheckResult {
      let existing: CompositionGuardRecord | null = null;
      try {
        existing = parseGuardRecord(JSON.parse(readFileSync(options.guardFile, 'utf8')));
      } catch {
        return { allowed: true };
      }
      if (!existing) return { allowed: true };
      if (existing.hostVersion !== options.hostVersion || existing.compositionIdentity !== options.compositionIdentity) {
        return { allowed: true };
      }
      if (existing.state === 'tripped') {
        return {
          allowed: false,
          reason: 'circuit-breaker',
          detail: `startup guard tripped for host ${options.hostVersion ?? 'unknown'} and ${options.compositionIdentity}`,
        };
      }
      if (existing.state === 'attempting' && existing.pid !== pid) {
        writeState('tripped');
        return {
          allowed: false,
          reason: 'circuit-breaker',
          detail: `previous process (pid ${existing.pid}) exited before confirming composition readiness for host ${options.hostVersion ?? 'unknown'}`,
        };
      }
      return { allowed: true };
    },
    markAttempting(): void {
      writeState('attempting');
    },
    markReady(): void {
      writeState('ready');
    },
    clear(): void {
      try {
        rmSync(options.guardFile, { force: true });
      } catch {
        // Ignore cleanup failures.
      }
    },
  };
}
