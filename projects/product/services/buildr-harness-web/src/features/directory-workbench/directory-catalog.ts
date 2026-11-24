import type { DirectoryCatalog, DirectoryCatalogRepository, DirectoryInventory, DirectoryRequest } from './api';

/** Inventory and Git results are independent. Only a scoped Git response may supply a usable checkout identity. */
export async function loadDirectoryCatalog(request: DirectoryRequest, previous: DirectoryCatalog | null, more: boolean, keepDiscovery: boolean, preferred: () => string | undefined, signal: AbortSignal, publish: (data: DirectoryCatalog) => void): Promise<DirectoryCatalog> {
  const cursor = more ? previous?.nextCursor : undefined;
  if (more && !cursor) return previous!;
  const inventory = keepDiscovery && previous ? {repositories:previous.repositories, nextCursor:previous.nextCursor ?? null,
    limited:!!previous.limited, diagnostic:previous.diagnostic, readAt:previous.readAt}
    : await request<DirectoryInventory>('inventory', cursor ? {cursor} : {}, signal);
  signal.throwIfAborted();
  const old = new Map(previous?.repositories.map(repo => [repo.path, repo]));
  const paths = new Map<string, DirectoryCatalogRepository>(more ? old : []);
  for (const hint of inventory.repositories) paths.set(hint.path, {...(old.get(hint.path) ?? {
    id:'pending:' + hint.path, checkouts:{defaultId:null,members:[],truncated:false,diagnostic:null}, gitId:null, members:[], pending:true,
  }), path:hint.path, name:hint.name});
  const readAt = inventory.readAt;
  const snapshot = (): DirectoryCatalog => ({repositories:[...paths.values()], nextCursor:inventory.nextCursor, limited:inventory.limited,
    diagnostic:inventory.diagnostic, truncated:[...paths.values()].some(repo => repo.checkouts.truncated || repo.members.some(member => member.truncated)), readAt});
  publish(snapshot());
  const remaining = new Set(more ? inventory.repositories.map(repo => repo.path) : paths.keys());
  await Promise.all(Array.from({length:Math.min(2, remaining.size)}, async () => {
    while (remaining.size) {
      signal.throwIfAborted();
      const requested = preferred();
      const path = requested !== undefined && remaining.has(requested) ? requested : remaining.values().next().value!;
      remaining.delete(path);
      const repo = paths.get(path)!;
      try {
        const result = await request<DirectoryCatalog>('catalog', {repositoryPath:path}, signal);
        signal.throwIfAborted();
        const verified = result.repositories.find(item => item.path === path);
        if (!verified) throw new Error('未返回所选仓库。');
        paths.set(path, {...verified, name:repo.name, readAt:result.readAt, topologyRevision:result.topologyRevision});
      } catch (error) {
        signal.throwIfAborted();
        paths.set(path, {...repo, gitId:null, pending:false, members:repo.members.map(member => ({...member, status:'offline'})),
          error:error instanceof Error ? error.message : '仓库暂不可读取。'});
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
