import { api, type ApiClient } from '../../../api';

export type TaskRef = {
  taskId: string;
  title: string | null;
  status: string | null;
  resolved: boolean;
};

export type Commit = {
  sha: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorship: 'self' | 'other';
  taskIds: string[];
  tasks: TaskRef[];
};

export type Group = {
  key: string;
  label: string;
  commits: Commit[];
};

export type DaySummary = {
  added: string;
  updated: string;
  deleted: string;
  drawbacks: string;
};

export type InspectResult = {
  status: 'inspected' | 'not-found' | 'incompatible';
  project: string;
  date: string;
  group: string;
  itemCount: number;
  taskReferenceCount: number;
  daySummary: DaySummary | null;
  commits: Commit[];
  groups: Group[];
};

export function createDailyProgressClient(client: ApiClient) {
  return {
    inspect(projectCode: string, date: string, group: 'day' | 'person' | 'task', options: Pick<RequestInit, 'signal'> = {}): Promise<InspectResult> {
      const suffix = date ? `/${date}` : '';
      const query = new URLSearchParams({ group });
      return client(`/api/v1/projects/${encodeURIComponent(projectCode)}/daily-progress${suffix}?${query}`, options) as Promise<InspectResult>;
    },
  };
}

export const dailyProgressApi = createDailyProgressClient(api);
