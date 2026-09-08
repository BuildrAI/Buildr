import { api } from '../../../api';
import type { ReleaseAwarenessResponseReleaseAwarenessResponse } from '../../../../build/generated/runtime-system-http-dto';

export type ReleaseAwareness = ReleaseAwarenessResponseReleaseAwarenessResponse;

export const releaseAwarenessApi = Object.freeze({
  inspect(signal?: AbortSignal): Promise<ReleaseAwareness> {
    return api('/api/v1/release-awareness', signal ? { signal } : undefined) as Promise<ReleaseAwareness>;
  },
});
