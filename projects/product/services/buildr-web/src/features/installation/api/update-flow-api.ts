import { api } from '../../../api';
import type {
  UpdateFlowApplyRequestUpdateFlowApplyRequest,
  UpdateFlowJobResponseUpdateFlowJobResponse,
  UpdateFlowPrepareRequestUpdateFlowPrepareRequest,
  UpdateFlowRecoveryRequestUpdateFlowRecoveryRequest,
} from '../../../../build/generated/runtime-system-http-dto';

export type UpdateFlowJob = UpdateFlowJobResponseUpdateFlowJobResponse;

export const updateFlowApi = Object.freeze({
  recover(input: UpdateFlowRecoveryRequestUpdateFlowRecoveryRequest): Promise<UpdateFlowJob> {
    return api('/api/v1/update/recover', { method:'POST', body:JSON.stringify(input) }) as Promise<UpdateFlowJob>;
  },
  status(signal?: AbortSignal): Promise<UpdateFlowJob> {
    return api('/api/v1/update/status', signal ? { signal } : undefined) as Promise<UpdateFlowJob>;
  },
  prepare(input: UpdateFlowPrepareRequestUpdateFlowPrepareRequest): Promise<UpdateFlowJob> {
    return api('/api/v1/update/prepare', { method: 'POST', body: JSON.stringify(input) }) as Promise<UpdateFlowJob>;
  },
  apply(input: UpdateFlowApplyRequestUpdateFlowApplyRequest): Promise<UpdateFlowJob> {
    return api('/api/v1/update/apply', { method: 'POST', body: JSON.stringify(input) }) as Promise<UpdateFlowJob>;
  },
});
