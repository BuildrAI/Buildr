import { api } from '../../../api';
import type {
  PublicationDetailResponsePublicationDetailResponse,
  PublicationListResponsePublicationListResponse,
  PublicationAssetsResponsePublicationAssetsResponse,
  PublicationUploadResponsePublicationUploadResponse,
} from '../../../../build/generated/runtime-system-http-dto';

export type PublicationList = PublicationListResponsePublicationListResponse;
export type PublicationDetail = PublicationDetailResponsePublicationDetailResponse;
export type Publication = PublicationList['publications'][number];
export type PublicationAsset = PublicationDetail['assets'][number];
export type PublicationDraft = { title: string; summary: string; content: string; status: string };
export type ArticleProject = { code: string; name: string };
export const publicationsChanged = 'buildr:publications-changed';
const base = (projectCode: string, id?: string) => `/api/v1/projects/${encodeURIComponent(projectCode)}/publications${id ? `/${encodeURIComponent(id)}` : ''}`;
const articleBase = (projectCode: string, id: string, sourceTaskId?: string) => sourceTaskId ? `/api/v1/tasks/${encodeURIComponent(sourceTaskId)}/projects/${encodeURIComponent(projectCode)}/publications/${encodeURIComponent(id)}` : base(projectCode, id);
async function mutate<T>(path: string, method: string, input: unknown): Promise<T> {
  const result = await api(path, { method, body: JSON.stringify(input) }) as T;
  window.dispatchEvent(new Event(publicationsChanged));
  return result;
}
export const publicationApi = Object.freeze({
  list(signal?: AbortSignal): Promise<PublicationList> {
    return api('/api/v1/publications', { signal }) as Promise<PublicationList>;
  },
  detail(publicationId: string, signal?: AbortSignal, projectCode = 'product', sourceTaskId?: string): Promise<PublicationDetail> {
    return api(articleBase(projectCode, publicationId, sourceTaskId), { signal }) as Promise<PublicationDetail>;
  },
  create(projectCode: string, title: string): Promise<PublicationDetail> {
    return mutate(base(projectCode), 'POST', { title, content: '', status: 'draft' });
  },
  update(projectCode: string, id: string, revision: string, draft: PublicationDraft, sourceTaskId?: string): Promise<PublicationDetail> {
    const { title, summary, content } = draft;
    return mutate(articleBase(projectCode, id, sourceTaskId), 'PUT', { ...(sourceTaskId ? { title, summary, content } : draft), revision });
  },
  updateSource(projectCode: string, id: string, revision: string, source: string, sourceTaskId?: string): Promise<PublicationDetail> {
    return mutate(articleBase(projectCode, id, sourceTaskId), 'PUT', { revision, source });
  },
  remove(projectCode: string, id: string, revision: string): Promise<unknown> {
    return mutate(base(projectCode, id), 'DELETE', { revision });
  },
  async assets(projectCode: string, id: string, signal?: AbortSignal, sourceTaskId?: string): Promise<PublicationAssetsResponsePublicationAssetsResponse> {
    if (sourceTaskId) {
      const detail = await api(articleBase(projectCode, id, sourceTaskId), { signal }) as PublicationDetail;
      return { schemaVersion: 'buildr.publication-assets/v1', projectCode, id, revision: detail.revision, assets: detail.assets };
    }
    return api(`${base(projectCode, id)}/assets`, { signal }) as Promise<PublicationAssetsResponsePublicationAssetsResponse>;
  },
  upload(projectCode: string, id: string, revision: string, filename: string, contentBase64: string, workspaceId: string): Promise<PublicationUploadResponsePublicationUploadResponse> {
    return api(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}${base(projectCode, id).slice('/api/v1'.length)}/assets`, { method: 'POST', body: JSON.stringify({ revision, filename, contentBase64 }) }) as Promise<PublicationUploadResponsePublicationUploadResponse>;
  },
});
