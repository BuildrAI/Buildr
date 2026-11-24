import type { DirectoryCatalog, DirectoryCatalogRepository, DirectoryInventory, DirectoryRequest } from './api';

/** Inventory and Git results are independent. Only a scoped Git response may supply a usable checkout identity. */
export async function loadDirectoryCatalog(request: DirectoryRequest, previous: DirectoryCatalog | null, more: boolean, keepDiscovery: boolean, preferred: () => string | undefined, signal: AbortSignal, publish: (data: DirectoryCatalog) => void,
  primaryStatus?: (repositoryPath: string) => { preferredCheckoutId?: string },
): Promise<DirectoryCatalog> {
  const cursor = more ? previous?.nextCursor : undefined;
  if (more && !cursor) return previous!;
  const inventory = keepDiscovery && previous ? {repositories:previous.repositories, nextCursor:previous.nextCursor ?? null,
    limited:!!previous.limited, registered:previous.registered, diagnostic:previous.diagnostic, readAt:previous.readAt}
    : await request<DirectoryInventory>('inventory', cursor ? {cursor} : {}, signal);
  signal.throwIfAborted();
  const old = new Map(previous?.repositories.map(repo => [repo.path, repo]));
  const paths = new Map<string, DirectoryCatalogRepository>(more ? old : []);
  for (const hint of inventory.repositories) paths.set(hint.path, {...(old.get(hint.path) ?? {
    id:'pending:' + hint.path, checkouts:{defaultId:null,members:[],truncated:false,diagnostic:null}, gitId:null, members:[], pending:true,
  }), path:hint.path, code:hint.code ?? old.get(hint.path)?.code, name:hint.name});
  const readAt = inventory.readAt;
  const snapshot = (): DirectoryCatalog => ({repositories:[...paths.values()], nextCursor:inventory.nextCursor, limited:inventory.limited, registered:inventory.registered,
    diagnostic:inventory.diagnostic, truncated:[...paths.values()].some(repo => repo.checkouts.truncated || repo.members.some(member => member.truncated)), readAt});
  publish(snapshot());
  const remaining = new Set(more ? inventory.repositories.map(repo => repo.path) : paths.keys());
  const background = new Set<string>();
  if (more) {
    // Continuing discovery cancels the previous read. Carry its unfinished work forward.
    for (const repo of paths.values()) {
      if (remaining.has(repo.path)) continue;
      if (repo.pending) remaining.add(repo.path);
      else if (repo.statusPending) background.add(repo.path);
    }
  }
  await Promise.all(Array.from({length:Math.min(2, remaining.size + background.size)}, async () => {
    while (remaining.size || background.size) {
      signal.throwIfAborted();
      const requested = preferred();
      const queue = requested !== undefined && background.has(requested) ? background : remaining.size ? remaining : background;
      const path = requested !== undefined && queue.has(requested) ? requested : queue.values().next().value!;
      const complete = queue === background;
      queue.delete(path);
      const repo = paths.get(path)!;
      // A complete snapshot already supplies the first paint during a refresh.
      const primary = !complete && primaryStatus && (!repo.members.length || repo.statusPending);
      try {
        const result = await request<DirectoryCatalog>('catalog', {
          repositoryPath:path,
          ...(primary ? { primaryStatus:true, ...primaryStatus(path) } : {}),
        }, signal);
        signal.throwIfAborted();
        const verified = result.repositories.find(item => item.path === path);
        if (!verified) throw new Error('未返回所选仓库。');
        paths.set(path, {...verified, code:repo.code ?? verified.code, name:repo.name, readAt:result.readAt, topologyRevision:result.topologyRevision});
        if (primary && verified.statusPending) background.add(path);
      } catch (error) {
        signal.throwIfAborted();
        const message = error instanceof Error ? error.message : '仓库暂不可读取。';
        paths.set(path, complete
          ? {...repo, error:message}
          : {...repo, gitId:null, pending:false, members:repo.members.map(member => ({...member, status:'offline'})), error:message});
      }
      publish(snapshot());
    }
  }));
  return {...snapshot(), topologyPaths:[...paths.values()].filter(repo => repo.checkouts.defaultId && !repo.error).map(repo => repo.path)};
}

export function shouldCollapseExplorerTree(visibleSourceCount: number, totalRepoCount: number, selectedRepoPaths: readonly string[]): boolean {
  return visibleSourceCount > 1 || (totalRepoCount > 1 && selectedRepoPaths.length !== 1);
}

export function collectExplorerLoadTargets(input: {
  collapsed: boolean;
  visibleBrowserIds: readonly string[];
  expandedKeys: readonly string[];
}): Array<{ browserId: string; relative: string }> {
  const visible = new Set(input.visibleBrowserIds);
  const targets: Array<{ browserId: string; relative: string }> = [];
  const seen = new Set<string>();
  const add = (browserId: string, relative: string) => {
    if (!visible.has(browserId)) return;
    const key = `${browserId}::${relative}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ browserId, relative });
  };
  if (!input.collapsed) {
    for (const browserId of input.visibleBrowserIds) add(browserId, '');
  }
  for (const key of input.expandedKeys) {
    const sep = key.indexOf('::');
    if (sep < 0) continue;
    add(key.slice(0, sep), key.slice(sep + 2));
  }
  return targets;
}
