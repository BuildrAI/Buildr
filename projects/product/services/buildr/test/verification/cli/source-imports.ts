import { stripTypeScriptTypes } from 'node:module';

export function isScriptSource(file: string): boolean {
  return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file);
}

export function platformNamespaceImports(files: readonly { path: string; source: string }[]): string[] {
  return files.filter((file) => isScriptSource(file.path)
    && /import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*\/platform\.[cm]?[jt]s['"]/.test(file.source))
    .map((file) => file.path).sort();
}

/** Static module references, retaining type dependencies without inventing runtime edges. */
export function sourceModuleReferences(source: string): { specifier: string; runtime: boolean }[] {
  // Use the same TypeScript erasure as the retained Node runtime. In particular,
  // `import { type X }` keeps an empty runtime import, whereas `import type` vanishes.
  const declarations = /\b(?:import|export)\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)\s+from\s+)?(['"])([^'"]+)\1/gu;
  return [...source.matchAll(declarations)].map(match => ({
    specifier: match[2]!,
    runtime: /\b(?:import|export)\b/u.test(stripTypeScriptTypes(match[0])),
  }));
}

/** A declared query port is bounded read access; every other legacy Task method remains audited. */
export function hasWideTaskRecordAccess(source: string): boolean {
  const declaredQueryPort = /import\s*\{\s*TASK_QUERY_APPLICATION\s*\}\s*from\s*['"][^'"]*\/task\/module\.ts['"]/u.test(source);
  const inspected = declaredQueryPort ? source.replace(/requires\s*\[\s*TASK_QUERY_APPLICATION\s*\]\s*\.\s*(?:inspectTask|inspectTaskView|readTaskView|queryTaskViews|queryTasks)\s*\(/gu, 'boundedQuery(') : source;
  return /\.(?:assertCanonicalTaskWorkspace|taskDirectory|ensureTaskDirectory|readTask|prepareTask|queryTaskViews|readTaskView|createTaskPersistence|mutateTaskPersistence|writeTaskPersistence|queryTasks|inspectTask|inspectTaskView|createTask|updateTask|activateTask|completeTask|abandonTask)\(/u.test(inspected);
}
