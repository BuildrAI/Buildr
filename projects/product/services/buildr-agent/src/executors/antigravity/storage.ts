import { regenerableToolCaches, toolCacheReclaimable } from '../../storage/tool-cache.ts';

/**
 * Antigravity runs as a standalone Go binary; private `.gemini/` settings/sessions
 * and Buildr's `antigravity-sessions/` tool index are never reclaimed as caches.
 */
export function antigravityStorage() {
  return {
    transientDirectories: regenerableToolCaches,
    canReclaim: toolCacheReclaimable,
  };
}
