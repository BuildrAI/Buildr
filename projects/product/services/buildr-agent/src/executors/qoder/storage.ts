import { regenerableToolCaches, toolCacheReclaimable } from '../../storage/tool-cache.ts';
import { qoderLegacyCaches } from './cache-storage.ts';
import { qoderDiagnosticResources } from './diagnostic-storage.ts';

/** Qoder products share one native cache layout and the same maintenance proof. */
export function qoderStorage() {
  return { legacyDirectories: qoderLegacyCaches, diagnostics: qoderDiagnosticResources,
    transientDirectories: regenerableToolCaches, canReclaim: toolCacheReclaimable };
}
