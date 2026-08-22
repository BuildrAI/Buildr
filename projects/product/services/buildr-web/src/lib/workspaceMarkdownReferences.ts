export type RegisteredProject = {
  code: string;
  name?: string;
  source?: { path?: string };
};

export type WorkspaceMarkdownReference = {
  projectCode: string;
  projectName: string;
  projectSourcePath: string;
  documentPath: string;
  workspacePath: string;
  resolution: 'resolved';
};

export function normalizedWorkspaceRelativePath(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return null;
  const end = [raw.indexOf('#'), raw.indexOf('?')]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), raw.length);
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
  return normalizedWorkspaceRelativePath(raw);
}

export function resolveWorkspaceMarkdownReference(
  href: string,
  allowedProjectCodes: Set<string>,
  projects: RegisteredProject[],
): WorkspaceMarkdownReference | null {
  const workspacePath = normalizedWorkspaceRelativePath(href);
  if (!workspacePath || !workspacePath.toLowerCase().endsWith('.md')) return null;
  const candidates = projects
    .filter((project) => allowedProjectCodes.has(project.code))
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
    resolution: 'resolved',
  };
}

/** Resolve a Markdown href against the currently viewed Project or Service document. */
export function resolveProjectMarkdownHref(currentDocPath: string, href: string): string | null {
  const value = String(href ?? '').trim();
  if (!value) return null;
  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let pathEnd = value.length;
  if (hashIndex >= 0) pathEnd = Math.min(pathEnd, hashIndex);
  if (queryIndex >= 0) pathEnd = Math.min(pathEnd, queryIndex);
  const pathPart = value.slice(0, pathEnd);
  if (!pathPart) return null;
  const current = String(currentDocPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const slash = current.lastIndexOf('/');
  const baseDir = slash >= 0 ? current.slice(0, slash + 1) : '';
  let resolved: string;
  try {
    resolved = decodeURIComponent(new URL(pathPart, `https://project.local/${baseDir}`).pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!resolved || resolved.includes('\0') || /(^|\/)\.\.(\/|$)/.test(resolved)) return null;
  if (!resolved.toLowerCase().endsWith('.md')) return null;
  return resolved;
}

export function encodeProjectDocumentPath(docPath: string): string {
  return String(docPath).split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
