import type { TaskChangeState } from '../hooks/useTaskArtifacts';
import type { ChangeAsset } from '../api/task-api';

export type DeliveryFileNode = { key: string; title: string; asset?: ChangeAsset; children?: DeliveryFileNode[] };
export function deliveryFileTree(assets: ChangeAsset[], prefix: string): DeliveryFileNode[] {
  const roots: DeliveryFileNode[] = [];
  for (const asset of [...assets].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    let children = roots;
    const parts = asset.relativePath.split('/');
    parts.forEach((part, index) => {
      const key = JSON.stringify([prefix, parts.slice(0, index + 1).join('/')]);
      let node = children.find(item => item.key === key);
      if (!node) { node = { key, title: part }; children.push(node); }
      if (index === parts.length - 1) node.asset = asset;
      else { node.children ||= []; children = node.children; }
    });
  }
  return roots;
}

export function hasDeliveryFiles(changes: TaskChangeState[]): boolean {
  return changes.some(source => source.kind === 'missing' || source.kind === 'ready' && Boolean(source.change.assets?.length || source.change.assetDiagnostics?.length));
}

/** Resolve a relative file link without inferring a project or escaping this change. */
export function resolveDeliveryFileHref(current: string, href: string): string | null {
  const raw = href.trim().split(/[?#]/, 1)[0];
  if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|\\|@)/i.test(raw)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (!decoded || /[\\\0]/.test(decoded) || /^(?:[a-z][a-z0-9+.-]*:|\/|@)/i.test(decoded)) return null;
  const parts = current.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.length && !parts.some(part => part.toLowerCase() === '.git') ? parts.join('/') : null;
}
