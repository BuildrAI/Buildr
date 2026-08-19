export type TaskProjectScope = {
  projects: string[];
  services: Array<{ project: string; service: string }>;
};

export type RegisteredProject = {
  code: string;
  name?: string;
  source?: { path?: string };
};

export type TaskDocumentReference = {
  projectCode: string;
  projectName: string;
  projectSourcePath: string;
  documentPath: string;
  workspacePath: string;
};

function normalizedRelativePath(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return null;
  const end = [raw.indexOf('#'), raw.indexOf('?')].filter((index) => index >= 0).reduce((lowest, index) => Math.min(lowest, index), raw.length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.slice(0, end));
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0') || decoded.includes('\\') || decoded.startsWith('/')) return null;
  const segments = decoded.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function normalizedProjectSourcePath(value: string | undefined): string | null {
  const raw = String(value || '.').trim().replace(/\/$/, '');
  if (raw === '.') return '.';
  return normalizedRelativePath(raw);
}

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
  const workspacePath = normalizedRelativePath(href);
  if (!workspacePath || !workspacePath.toLowerCase().endsWith('.md')) return null;
  const allowedProjects = scopedProjectCodes(scope);
  const candidates = projects
    .filter((project) => allowedProjects.has(project.code))
    .map((project) => ({ project, sourcePath: normalizedProjectSourcePath(project.source?.path) }))
    .filter((entry): entry is { project: RegisteredProject; sourcePath: string } => Boolean(entry.sourcePath))
    .filter(({ sourcePath }) => sourcePath === '.' || workspacePath.startsWith(`${sourcePath}/`))
    .sort((left, right) => right.sourcePath.length - left.sourcePath.length);
  const match = candidates[0];
  if (!match) return null;
  const documentPath = match.sourcePath === '.' ? workspacePath : workspacePath.slice(match.sourcePath.length + 1);
  if (!documentPath || !documentPath.toLowerCase().endsWith('.md')) return null;
  return {
    projectCode: match.project.code,
    projectName: match.project.name || match.project.code,
    projectSourcePath: match.sourcePath,
    documentPath,
    workspacePath,
  };
}
