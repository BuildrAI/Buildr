// Shared by working-tree and immutable Git input readers. This only resolves
// known execution semantics; unknown dynamic readers retain their fallback.
export function discoveredVerificationFiles(step: any, files: string[]): { selected: string[]; inventory: string[] } {
  const family = step.executor?.file === 'test/verification/system.ts' ? 'test/system/'
    : step.executor?.file === 'test/verification/integration.ts' ? 'test/integration/' : null;
  if (!family) return { selected: [], inventory: [] };
  const inventory = files.filter(file => file.startsWith(family) && /\.test\.[cm]?[jt]sx?$/u.test(file)).sort();
  // The executor's declaration is derived from the same suite registry used by
  // the runner, not from changed-path ownership. Unknown callers bind all files.
  return { selected: step.executor.discoveredFiles ?? inventory, inventory };
}

export function verificationEntryFiles(executor: any): string[] {
  if (executor.file) return [executor.file];
  if (executor.type === 'workspace-suite' && /^[a-z][a-z-]+$/u.test(executor.selector)) return [`test/verification/workspace/${executor.selector}.ts`];
  if (executor.type === 'package-selector') return ['test/verification/package/run.ts'];
  return [];
}

export function literalUrlImports(source: string): { imports: string[]; remainder: string } {
  const imports: string[] = [];
  const remainder = source.replace(/\bimport\s*\(\s*new\s+URL\s*\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)\.href\s*\)/gu,
    (_match, _quote, file) => { imports.push(file); return ''; });
  return { imports, remainder };
}
