import type { StartDraftInput } from './api/agent-conversations-api';

export type FirstSubmission = { draftId: string; workspaceId: string; input: StartDraftInput };
/** Persist before transport. A lost reply cannot cause a fresh creation identity. */
export function firstConversationSubmissions(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, key = 'buildr.conversation-first') {
  let memory: FirstSubmission | null | undefined;
  return {
    read(): FirstSubmission | undefined {
      if (memory !== undefined) return memory ?? undefined;
      try {
        const value = JSON.parse(storage?.getItem(key) || 'null');
        if (value && typeof value.draftId === 'string' && typeof value.workspaceId === 'string' && typeof value.input?.clientRequestId === 'string' && typeof value.input.text === 'string') return memory = value;
      } catch { /* Same-page memory remains usable without storage. */ }
      return undefined;
    },
    save(value: FirstSubmission) { memory = value; try { storage?.setItem(key, JSON.stringify(value)); } catch {} return value; },
    clear(requestId: string) {
      if (this.read()?.input.clientRequestId !== requestId) return;
      memory = null; try { storage?.removeItem(key); } catch {}
    },
  };
}

/** Derived video frames are dependencies, not user-selected materials. */
export function draftMaterialIds(images: Array<{id:string;frame?:boolean}>): string[] {
  return images.filter(image=>!image.frame).map(image=>image.id);
}
