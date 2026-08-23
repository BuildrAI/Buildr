import type { ApiClient } from './client';
import type {
  LocalAppStoppingResponseLocalAppStoppingResponse,
  PublicationDetailResponsePublicationDetailResponse,
  PublicationListResponsePublicationListResponse,
  ReleaseAwarenessResponseReleaseAwarenessResponse,
} from './generated/runtime-system-http-dto';

export type ReleaseAwareness = ReleaseAwarenessResponseReleaseAwarenessResponse;
export type PublicationList = PublicationListResponsePublicationListResponse;
export type PublicationDetail = PublicationDetailResponsePublicationDetailResponse;

export function createRuntimeSystemClient(api: ApiClient) {
  return {
    releaseAwareness(signal?: AbortSignal): Promise<ReleaseAwareness> {
      return api('/api/v1/release-awareness', signal ? { signal } : undefined) as Promise<ReleaseAwareness>;
    },
    quit(): Promise<LocalAppStoppingResponseLocalAppStoppingResponse> {
      return api('/api/v1/app/quit', { method: 'POST', body: '{}' }) as Promise<LocalAppStoppingResponseLocalAppStoppingResponse>;
    },
    publications(): Promise<PublicationList> {
      return api('/api/v1/publications') as Promise<PublicationList>;
    },
    publication(publicationId: string): Promise<PublicationDetail> {
      return api(`/api/v1/publications/${encodeURIComponent(publicationId)}`) as Promise<PublicationDetail>;
    },
  };
}
