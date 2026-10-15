export type ProjectDocumentRef = 'readme' | 'agents';
export type ProjectDocumentPosition = { path: string; history: string[] };
export type ProjectDocumentPositions = Partial<Record<ProjectDocumentRef, ProjectDocumentPosition>>;
export type ProjectDocumentReturn = ProjectDocumentPosition & {
  returnId: string;
  projectCode: string;
  ref: ProjectDocumentRef;
  positions: ProjectDocumentPositions;
};

export const projectDocumentRoot = (ref: ProjectDocumentRef) => ref === 'agents' ? 'AGENTS.md' : 'README.md';
export const isProjectDocumentRef = (value: unknown): value is ProjectDocumentRef => value === 'readme' || value === 'agents';

function relativeMarkdownPath(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && /\.md$/i.test(value)
    && !/^[a-z][a-z\d+.-]*:/i.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(part => Boolean(part) && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
}

function position(value: unknown, ref: ProjectDocumentRef): ProjectDocumentPosition | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ProjectDocumentPosition>;
  if (!relativeMarkdownPath(candidate.path) || !Array.isArray(candidate.history) || !candidate.history.length
    || !candidate.history.every(relativeMarkdownPath) || candidate.history[0] !== projectDocumentRoot(ref)
    || candidate.history.at(-1) !== candidate.path) return null;
  return { path: candidate.path, history: [...candidate.history] };
}

/** History carries navigation only. The project reader resolves and checks every file again. */
export function readProjectDocumentReturn(state: unknown, projectCode: string): ProjectDocumentReturn | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as { projectDocumentReturn?: unknown }).projectDocumentReturn;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ProjectDocumentReturn>;
  if (typeof candidate.returnId !== 'string' || !candidate.returnId || candidate.projectCode !== projectCode || !isProjectDocumentRef(candidate.ref)) return null;
  const active = position(candidate, candidate.ref);
  if (!active) return null;
  const positions: ProjectDocumentPositions = {};
  if (candidate.positions !== undefined) {
    if (!candidate.positions || typeof candidate.positions !== 'object' || Array.isArray(candidate.positions)) return null;
    for (const [ref, value] of Object.entries(candidate.positions)) {
      if (!isProjectDocumentRef(ref)) return null;
      const retained = position(value, ref);
      if (!retained) return null;
      positions[ref] = retained;
    }
  }
  positions[candidate.ref] = active;
  return { returnId: candidate.returnId, projectCode, ref: candidate.ref, ...active, positions };
}

export function withProjectDocumentReturn(state: unknown, navigation: ProjectDocumentReturn): Record<string, unknown> {
  const previous = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const { projectDocumentReturn: _previous, ...retained } = previous as Record<string, unknown>;
  const current = readProjectDocumentReturn({ projectDocumentReturn: navigation }, navigation.projectCode);
  return current ? { ...retained, projectDocumentReturn: current } : retained;
}

/** A retained project page consumes each return once; manual document openings do not replay it. */
export function consumeProjectDocumentReturn(state: unknown, projectCode: string, consumed: Set<string>) {
  const restored = readProjectDocumentReturn(state, projectCode);
  if (!restored || consumed.has(restored.returnId)) return null;
  consumed.add(restored.returnId);
  return restored;
}
