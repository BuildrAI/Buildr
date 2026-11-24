export type Scope = { id: string; path: string; name?: string };
export type Session = { cwd?: string | null; updatedAt?: number; origin?: 'subagent'; formatStatus?: 'current' | 'migration-required' };
export type SessionCatalog = { phase: 'pending' | 'ready'; ids: readonly string[]; byId: Readonly<Record<string, Session>> };
export type Tool = 'explorer' | 'source-control';
export const toolId = (tool: Tool) => `buildr-harness-${tool}`;
export const toolAddress = (tool: Tool) => `dsh-resource://buildr-harness/${tool}`;
export const CHANNEL = 'buildr-harness-desktop/v1:';
export type Reveal = { workspaceId: string; revision: string; path: string; line?: number; checkout?: { repositoryId: string; checkoutId: string } };
export type GuestMessage = { kind: 'workspace'; scope: Scope | null } | { kind: 'link'; url: string; external: boolean }
  | {kind:'reveal'; file: Reveal} | {kind:'tool-ready'}
  | {kind:'shell'; action:'leave'|'toggle-right'};

function shortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value);
}
function fileReveal(value: unknown): Reveal | undefined {
  const v = value as Partial<Reveal> | undefined;
  if (!shortText(v?.workspaceId, 1024) || !shortText(v.revision, 256) || !shortText(v.path, 4096)
      || v.path.includes('\\') || v.path.split('/').some(part => !part || part === '..' || part === '.') || /^[A-Za-z]:/.test(v.path)) return;
  if (v.checkout !== undefined && (!shortText(v.checkout?.repositoryId, 512) || !shortText(v.checkout?.checkoutId, 512))) return;
  if (v.line !== undefined && (!Number.isSafeInteger(v.line) || v.line < 1)) return;
  return { workspaceId: v.workspaceId, revision: v.revision, path: v.path, line: v.line,
    checkout: v.checkout && { repositoryId: v.checkout.repositoryId, checkoutId: v.checkout.checkoutId } };
}

export function parseGuestMessage(message: string): GuestMessage | undefined {
  if (!message.startsWith(CHANNEL) || message.length > 22000) return;
  try {
    const value = JSON.parse(message.slice(CHANNEL.length));
    if (value?.kind === 'shell' && (value.action === 'leave' || value.action === 'toggle-right')) return {kind:'shell',action:value.action};
    if (value?.kind === 'tool-ready') return { kind:'tool-ready' };
    if (value?.kind === 'reveal') { const file = fileReveal(value.file); return file && { kind:'reveal', file }; }
    if (value?.kind === 'workspace') {
      const scope = value.scope;
      if (scope === null) return { kind: 'workspace', scope: null };
      if (typeof scope?.id !== 'string' || !scope.id || scope.id.length > 1024 || /[\0\r\n]/.test(scope.id)
          || typeof scope.path !== 'string' || scope.path.length > 4096 || !scope.path.startsWith('/') || /[\0\r\n]/.test(scope.path)) return;
      const name = typeof scope.name === 'string' && scope.name.trim() && scope.name.length <= 256 && !/[\0\r\n]/.test(scope.name)
        ? scope.name.trim()
        : undefined;
      return { kind: 'workspace', scope: { id: scope.id, path: scope.path, ...(name ? { name } : {}) } };
    }
    if (value?.kind === 'link' && typeof value.url === 'string' && value.url.length <= 16384 && !/[\0\r\n]/.test(value.url)) {
      const url = new URL(value.url);
      if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return;
      return { kind: 'link', url: url.href, external: value.external === true };
    }
  } catch { /* Invalid or unrelated renderer output has no effect. */ }
}

export function workspaceDisplayName(scope: Scope | null | undefined): string | undefined {
  if (!scope) return undefined;
  const explicit = scope.name?.trim();
  if (explicit) return explicit;
  if (scope.id === '@default') return '默认工作空间';
  const trimmed = scope.path.replace(/\/+$/, '');
  return trimmed.split('/').filter(Boolean).at(-1) || trimmed || undefined;
}

export function sameDirectory(session: Session | undefined, scope: Scope | null): boolean {
  return !!session?.cwd && !!scope && session.cwd.replace(/\/+$/, '') === scope.path.replace(/\/+$/, '');
}

export function liveCarrier(scope: Scope | null, bindings: ReadonlyMap<string, string>, sessions: SessionCatalog, archived: readonly string[]): string | undefined {
  const id = scope && bindings.get(scope.id);
  return id && sessions.phase === 'ready' && sessions.ids.includes(id) &&
    !archived.includes(id) && availableInScope(scope, sessions.byId[id], id, bindings) ? id : undefined;
}

function availableInScope(scope: Scope | null, session: Session | undefined, id: string, bindings: ReadonlyMap<string, string>) {
  return sameDirectory(session, scope) && session?.origin !== 'subagent' && session?.formatStatus !== 'migration-required'
    && ![...bindings].some(([owner, bound]) => owner !== scope?.id && bound === id);
}

export function matchingCarriers(scope: Scope | null, bindings: ReadonlyMap<string, string>, sessions: SessionCatalog, archived: readonly string[]): string[] {
  if (!scope || sessions.phase !== 'ready') return [];
  const unavailable = new Set(archived);
  return sessions.ids.filter(id => !unavailable.has(id) && availableInScope(scope, sessions.byId[id], id, bindings));
}

export function preferredCarrier(scope: Scope | null, bindings: ReadonlyMap<string, string>, sessions: SessionCatalog, archived: readonly string[], current?: string): string | undefined {
  const existing = liveCarrier(scope, bindings, sessions, archived);
  if (existing) return existing;
  const candidates = matchingCarriers(scope, bindings, sessions, archived);
  if (current && candidates.includes(current)) return current;
  // Prefer activity only within this directory; preserve host order for ties.
  return candidates.reduce<string | undefined>((best, id) => !best ||
    (sessions.byId[id]?.updatedAt ?? 0) > (sessions.byId[best]?.updatedAt ?? 0) ? id : best, undefined);
}

export function linkDestination(preference: unknown, external: boolean, native: boolean): 'sidebar' | 'external' | 'offer' {
  if (external || preference === 'new-tab') return 'external';
  return native ? 'sidebar' : 'offer';
}

/** A native selection is navigation unless it acknowledges our exact pending carrier. */
export function sessionSelection(expected: string | undefined, selected: string | undefined): 'align' | 'leave' {
  return expected !== undefined && selected === expected ? 'align' : 'leave';
}

export function shouldNotifyChatActive(panelActive: boolean, visibilityState: string): boolean {
  return panelActive && visibilityState === 'visible';
}
