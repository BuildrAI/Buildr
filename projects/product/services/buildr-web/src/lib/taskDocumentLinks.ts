export type TaskProjectScope = {
  projects: string[];
  services: Array<{ project: string; service: string }>;
};

import {
  resolveWorkspaceMarkdownReference,
  type RegisteredProject,
  type WorkspaceMarkdownReference,
} from './workspaceMarkdownReferences.ts';

export type { RegisteredProject } from './workspaceMarkdownReferences.ts';
export type TaskDocumentReference = WorkspaceMarkdownReference;

function scopedProjectCodes(scope: TaskProjectScope): Set<string> {
  return new Set([
    ...(scope.projects || []),
    ...(scope.services || []).map((service) => service.project),
  ]);
}

export function resolveTaskDocumentReference(
  href: string,
  scope: TaskProjectScope,
  projects: RegisteredProject[],
): TaskDocumentReference | null {
  const allowedProjects = scopedProjectCodes(scope);
  return resolveWorkspaceMarkdownReference(href, allowedProjects, projects);
}
