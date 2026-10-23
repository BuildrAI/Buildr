import { api } from '../../../api';
import type { ResourceLocationResponseUpdateFlowResourceLocationResponse } from '../../../../build/generated/runtime-system-http-dto';
export type ResourceLocation = ResourceLocationResponseUpdateFlowResourceLocationResponse;
export const resourceLocationApi = {
  read: (signal?: AbortSignal) => api('/api/v1/installation/resources', { signal }) as Promise<ResourceLocation>,
  open: (resourceSet: string) => api('/api/v1/installation/resources/open', { method: 'POST', body: JSON.stringify({ resourceSet }) }),
};
