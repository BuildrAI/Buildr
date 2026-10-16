import { discoveredVerificationFiles, executableModuleInputs, literalUrlImports, verificationEntryFiles } from './verification-input-discovery.ts';
import fs from 'node:fs';
import path from 'node:path';

// Complete read scopes are independent of changed-path ownership. Unreviewed
// files remain inputs; only these known test/tool namespaces are partitioned.
const sharedRecipe = [
  'test/register-development-entry.ts', 'test/verification/executor.ts', 'test/verification/plan-runner.ts',
  'test/verification/dag-scheduler.ts', 'test/verification/verification-reuse.ts', 'test/verification/verification-inputs.ts',
  'test/verification/resource-coordinator.ts', 'test/verification/test-files.ts', 'test/verification/verification-input-discovery.ts',
];
const sharedTrees = ['test/helpers/', 'test/context/', 'test/fixtures/', 'test/verification/timing/', 'test/verification/support/'];
type Entry = string[];

export function scopedVerificationInputs(entries: Entry[], repositoryRoot: string, productRoot: string, step: any, options: { proof?: boolean; readText?: (file: string) => string } = {}): {
  content: Entry[]; recipe: Entry[]; fallback: boolean; unresolved: string[];
} {
  const prefix = path.relative(fs.realpathSync(repositoryRoot), fs.realpathSync(productRoot)).split(path.sep).join('/') + '/';
  const byPath = new Map(entries.map(entry => [entry[0]!, entry]));
  const selected = new Set<string>(), queued = new Set<string>(), pending: string[] = [];
  const add = (file: string) => { selected.add(file); if (!queued.has(file)) { queued.add(file); pending.push(file); } };
  const local = (file: string) => file.startsWith(prefix) ? file.slice(prefix.length) : null;
  const recipeFile = (file: string) => {
    const relative = local(file);
    return relative !== null && (relative.startsWith('test/') || relative.startsWith('tools/release/') || relative.startsWith('tools/verification/'));
  };
  const content = entries.filter(([file]) => !recipeFile(file!));
  // Result validation does not execute the assertions. Its consumers still bind
  // it through their real imports; changes to the executor/scheduler remain inputs.
  const validationOnly = new Set(['verification-reuse.ts', 'verification-inputs.ts', 'verification-input-discovery.ts']);
  for (const relative of sharedRecipe) {
    if (!options.proof || !validationOnly.has(path.posix.basename(relative))) selected.add(prefix + relative);
  }
  for (const [file] of entries) {
    const relative = local(file!);
    if (relative && sharedTrees.some(tree => relative.startsWith(tree))) selected.add(file!);
  }
  const discovery = discoveredVerificationFiles(step, entries.map(([file]) => local(file!)).filter((file): file is string => file !== null));
  for (const file of discovery.selected) add(prefix + file);
  for (const file of verificationEntryFiles(step.executor)) add(path.posix.normalize(prefix + file));
  const selectors = [...(step.executor.files ?? []), ...(step.executor.args ?? []).filter((argument: string) => argument.startsWith('test/'))];
  for (const selector of selectors) {
    for (const [file] of entries) {
      const relative = local(file!);
      if (relative && path.matchesGlob(relative, selector)) add(file!);
    }
  }
  let fallback = verificationEntryFiles(step.executor).length === 0 && !(step.executor.files?.length > 0);
  const unresolved = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (!recipeFile(file) || !/\.[cm]?[jt]sx?$/u.test(file) || !byPath.has(file)) continue;
    const text = options.readText ? options.readText(file) : fs.readFileSync(path.resolve(repositoryRoot, file), 'utf8');
    const urls = literalUrlImports(text);
    const executable = options.proof ? executableModuleInputs(text) : null;
    // Child scripts are often passed to spawn via a repository-relative literal,
    // rather than imported into the current test process.
    const catalog = /\/test\/(?:verification|context)\/(?:registry|ownership|system-suites|profiles|dispositions)\.ts$/u.test(file);
    const children = executable?.children ?? [...text.matchAll(/['"]((?:test|tools)\/[^'"\n]+\.[cm]?[jt]sx?)['"]/gu)].map(match => match[1]!);
    for (const target of catalog ? [] : children) {
      const child = prefix + target;
      if (byPath.has(child)) add(child); else if (!executable) { fallback = true; unresolved.add(file + ':child:' + target); }
    }
    // Computed module paths retain the conservative scope. Never infer their
    // complete inputs from the changed-path ownership map.
    if (executable ? executable.computed : /\b(?:import|require)\s*\(\s*(?!['"\s])(?:[a-zA-Z_$])/u.test(urls.remainder)) { fallback = true; unresolved.add(file + ':computed-import'); }
    const imports = [...text.matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/gu)].map(match => match[1]!);
    for (const target of executable?.imports ?? [...imports, ...urls.imports]) {
      if (!target.startsWith('.')) continue;
      const relative = path.relative(repositoryRoot, path.resolve(repositoryRoot, path.dirname(file), target)).split(path.sep).join('/');
      if (relative.startsWith('../') || path.isAbsolute(relative)) { fallback = true; continue; }
      const candidates = [relative, ...['.ts', '.tsx', '.js', '/index.ts', '/index.js'].map(suffix => relative + suffix)];
      const existing = candidates.find(candidate => byPath.has(candidate));
      if (existing) add(existing);
      else if (!relative.includes('/build/')) { fallback = true; unresolved.add(file + ':module:' + relative); }
    }
  }
  return { content: fallback ? entries : content,
    recipe: [...selected].sort().map(file => byPath.get(file) ?? [file, 'absent']).concat(discovery.inventory.map(file => [prefix + file, 'discovered-member'])), fallback, unresolved: [...unresolved].sort() };
}
