import type { FileEditingSessionStore } from './file-editing-session';

/** Keep only unfinished workspace sessions while their page provider is absent. */
export class WorkspaceFileEditingStores {
  private stores = new Map<string, FileEditingSessionStore>();

  hasUnsaved(): boolean { return [...this.stores.values()].some(store => store.hasUnsaved()); }

  take(workspaceId: string): FileEditingSessionStore | undefined {
    const store = this.stores.get(workspaceId);
    this.stores.delete(workspaceId);
    return store;
  }

  async suspend(workspaceId: string, store: FileEditingSessionStore): Promise<void> {
    if (store.hasUnsaved()) this.stores.set(workspaceId, store);
    try { await store.flush(); }
    finally { if (!store.hasUnsaved() && this.stores.get(workspaceId) === store) this.stores.delete(workspaceId); }
  }
}
