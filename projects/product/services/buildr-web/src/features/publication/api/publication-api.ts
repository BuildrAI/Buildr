import { api } from '../../../api';
import type {
  PublicationDetailResponsePublicationDetailResponse,
  PublicationListResponsePublicationListResponse,
} from '../../../api/generated/runtime-system-http-dto';

export type PublicationList = PublicationListResponsePublicationListResponse;
export type PublicationDetail = PublicationDetailResponsePublicationDetailResponse;

export const publicationApi = Object.freeze({
  list(signal?: AbortSignal): Promise<PublicationList> {
    return api('/api/v1/publications', signal ? { signal } : undefined) as Promise<PublicationList>;
  },
  detail(publicationId: string, signal?: AbortSignal): Promise<PublicationDetail> {
    return api(`/api/v1/publications/${encodeURIComponent(publicationId)}`, signal ? { signal } : undefined) as Promise<PublicationDetail>;
  },
});
