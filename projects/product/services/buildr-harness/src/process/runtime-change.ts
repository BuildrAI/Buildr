import type { BackendRuntimeChange } from '../contracts.ts';
import type { ProcessRecord } from './ownership.ts';

/** Content identity proves a content change, not who installed it or why. */
export function runtimeChange(previous: ProcessRecord | undefined, digest: string, detectedAt: string): BackendRuntimeChange | undefined {
  if (!previous) return;
  return {
    reason: previous.identity.runtime.digest === digest ? 'process-restarted' : 'runtime-content-changed',
    detectedAt,
    fromGeneration: previous.identity.generation,
    fromDigest: previous.identity.runtime.digest,
    toDigest: digest,
  };
}
