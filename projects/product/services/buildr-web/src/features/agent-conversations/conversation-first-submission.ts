import type { StartDraftInput } from './api/agent-conversations-api';

export type FirstSubmission = { draftId: string; workspaceId: string; input: StartDraftInput; failureReason?: 'backend-updating' };
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
    recordFailure(requestId: string, error: unknown): FirstSubmission | undefined {
      const current = this.read();
      if (!current || current.input.clientRequestId !== requestId) return;
      const failure = error as { status?: number; code?: string } | undefined;
      return this.save({ ...current, failureReason: failure?.status === 503 && failure.code === 'agent_process_switching' ? 'backend-updating' : undefined });
    },
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
