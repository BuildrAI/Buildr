import { discoveredVerificationFiles, executableModuleInputs, literalUrlImports, verificationEntryFiles, verificationModuleSlice } from './verification-input-discovery.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Complete read scopes are independent of changed-path ownership. Unreviewed
// files remain inputs; only these known test/tool namespaces are partitioned.
const sharedRecipe = [
  'test/verification/result-applicability.ts', 'test/verification/package-adapter.ts', 'test/verification/candidate-check-inputs.ts',
  'test/verification/settle-diagnostics.mjs', 'test/register-development-entry.ts', 'tools/development/isolated-workspace-state.ts', 'test/verification/executor.ts', 'test/verification/plan-runner.ts',
  'test/verification/dag-scheduler.ts', 'test/verification/verification-reuse.ts', 'test/verification/verification-inputs.ts',
  'test/verification/resource-coordinator.ts', 'test/verification/candidate-round.ts', 'test/verification/integration-progress-reporter.ts', 'test/verification/test-files.ts', 'test/verification/verification-input-discovery.ts',
];
const sharedTrees = ['test/context/', 'test/fixtures/', 'test/verification/timing/', 'test/verification/support/'];
type Entry = string[];

/** Pure parsing belongs to one source observation, not to each check that
 * imports the same helper. No filesystem facts survive into another reader. */
export function createVerificationInputAnalysis() {
  const slices = new Map<string, Map<string, ReturnType<typeof verificationModuleSlice>>>();
  const modules = new Map<string, ReturnType<typeof executableModuleInputs>>();
  const urls = new Map<string, ReturnType<typeof literalUrlImports>>();
  return {
    slice(source: string, names: Set<string> | null) {
      let entries = slices.get(source);
      if (!entries) slices.set(source, entries = new Map());
      // Existing proof digests preserve discovery order as well as members.
      const key = JSON.stringify(names === null ? null : [...names]);
      if (!entries.has(key)) entries.set(key, verificationModuleSlice(source, names));
      return entries.get(key)!;
    },
    executable(source: string, resolveKnown: boolean) {
      const key = JSON.stringify([source, resolveKnown]);
      if (!modules.has(key)) modules.set(key, executableModuleInputs(source, resolveKnown));
      return modules.get(key)!;
    },
    urls(source: string) {
      if (!urls.has(source)) urls.set(source, literalUrlImports(source));
      return urls.get(source)!;
    },
  };
}

export function scopedVerificationInputs(entries: Entry[], repositoryRoot: string, productRoot: string, step: any, options: { proof?: boolean; readText?: (file: string) => string; legacyDeclarations?: boolean; analysis?: ReturnType<typeof createVerificationInputAnalysis> } = {}): {
  content: Entry[]; recipe: Entry[]; fallback: boolean; unresolved: string[];
} {
  const prefix = path.relative(fs.realpathSync(repositoryRoot), fs.realpathSync(productRoot)).split(path.sep).join('/') + '/';
  const byPath = new Map(entries.map(entry => [entry[0]!, entry]));
  const selected = new Set<string>(), pending: string[] = [], members = new Map<string, Set<string> | null>();
  const fragments = new Map<string, string>();
  const narrow = options.proof && !options.legacyDeclarations;
  const add = (file: string, names: Set<string> | null = null) => {
    selected.add(file);
    if (file.startsWith('skills/buildr-release/scripts/')) selected.add('skills/buildr-release/scripts/package.json');
    const before = members.get(file);
    if (members.has(file) && (before === null || names !== null && [...names].every(name => before?.has(name)))) return;
    members.set(file, names === null ? null : new Set([...(before ?? []), ...names])); pending.push(file);
  };
  const local = (file: string) => file.startsWith(prefix) ? file.slice(prefix.length) : null;
  const recipeFile = (file: string) => {
    const relative = local(file);
    return !options.legacyDeclarations && ['projects/product/verification.yml', '.github/workflows/verify.yml', '.github/workflows/verify-package.yml'].includes(file)
      || file.startsWith('skills/buildr-release/') || relative !== null && (relative.startsWith('test/') || relative.startsWith('tools/release/') || relative.startsWith('tools/verification/'));
  };
  // These fixture/source checks were reviewed for real checkout readers. Their
  // inputs are executable/shipped assets, not this Product's planning material.
  const independent = step.reuse?.releaseNotes === false || ['integration-changed-paths', 'runtime-adapter-contract', 'integration-candidate-release-selection', 'integration-release', 'integration-self-bootstrap'].includes(step.id);
  const material = (file: string) => /^projects\/product\/(?:knowledge|openspec|docs|tasks)\//u.test(file);
  const content = entries.filter(([file]) => !recipeFile(file!) && !(narrow && independent && material(file!)));
  // Result validation does not execute the assertions. Its consumers still bind
  // it through their real imports; changes to the executor/scheduler remain inputs.
  const validationOnly = new Set(['verification-reuse.ts', 'verification-inputs.ts', 'verification-input-discovery.ts']);
  for (const relative of sharedRecipe) {
    // A repaired runner does not change what an earlier clean execution proved.
    // Checks of the runner itself still bind it through their actual imports.
    if (!options.proof || !narrow && !validationOnly.has(path.posix.basename(relative))) selected.add(prefix + relative);
  }
  for (const [file] of entries) {
    const relative = local(file!);
    if (relative && (sharedTrees.some(tree => relative.startsWith(tree))
      || relative.startsWith('test/helpers/') && !/\.[cm]?[jt]sx?$/u.test(relative))) selected.add(file!);
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
  let readsReleaseNotes = false;
  const unresolved = new Set<string>();
  // A command's executable (for example the external Node binary) is not a
  // source entry. Such dynamic scanners/compilers must retain the entire read
  // scope, not silently omit the tests they discover through tsconfig/globs.
  for (const entry of verificationEntryFiles(step.executor)) {
    if (!byPath.has(path.posix.normalize(prefix + entry))) {
      fallback = true; unresolved.add(`executor:unknown-entry:${entry}`);
    }
  }
  while (pending.length) {
    const file = pending.pop()!;
    const sourceEntry = byPath.get(file);
    if (!recipeFile(file) || !/\.[cm]?[jt]sx?$/u.test(file) || !sourceEntry || sourceEntry[1] === 'absent') continue;
    const source = options.readText ? options.readText(file) : fs.readFileSync(path.resolve(repositoryRoot, file), 'utf8');
    const slice = narrow ? (options.analysis?.slice ?? verificationModuleSlice)(source, members.get(file) ?? null) : null;
    const text = slice?.text ?? source;
    if (slice && members.get(file) !== null) fragments.set(file, crypto.createHash('sha256').update(JSON.stringify([text,
      [...slice.imports].map(([target, names]) => [target, names && [...names].sort()])])).digest('hex'));
    else fragments.delete(file);
    const readsRepository = /\b(?:readFileSync|readFile|readdirSync|readdir|opendirSync|opendir|copyFileSync|cpSync|globSync|glob)\s*\([^;]*\b(?:repositoryRoot|workspaceRoot|gitRoot)\b/u.test(text);
    // The map selects checks; their executable descriptors are already bound.
    // Only actual map readers (or unknown readers below) consume its text.
    if (!options.legacyDeclarations && (narrow ? /\b(?:readFileSync|readFile)\s*\([^;]*['"]projects\/product\/verification\.yml['"]/u.test(text) : readsRepository || /\bverification\.yml\b/u.test(text))) selected.add('projects/product/verification.yml');
    if (!options.legacyDeclarations) for (const workflow of ['verify.yml', 'verify-package.yml']) {
      const file = `.github/workflows/${workflow}`;
      const explicitRead = new RegExp(`\\b(?:readFileSync|readFile)\\s*\\([^;]*['"]${file.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]`, 'u');
      if (narrow ? explicitRead.test(text) : readsRepository || text.includes('.github/workflows') || text.includes(workflow)) selected.add(file);
    }
    if (narrow && independent) {
      for (const [candidate] of entries) if (material(candidate!) && (text.includes(candidate!) || text.includes(candidate!.replace('projects/product/', '')))
        && /\b(?:readFileSync|readFile|readdirSync|readdir)\s*\(/u.test(text)) selected.add(candidate!);
    }
    // Imported helpers belong to their consumers, rather than every check.
    // Directory-based helper discovery retains the entire namespace; computed
    // module loading below still falls back to the complete read scope.
    if (/(['"])(?:[^'"\n]*\/)?helpers\/?\1/u.test(text)) {
      for (const [candidate] of entries) if (local(candidate!)?.startsWith('test/helpers/')) add(candidate!);
    }
    // Reviewed checks can exclude the checkout's release notes without
    // excluding other Product materials. A direct reader outgrows that claim.
    if (/\bCHANGELOG\.md\b/iu.test(text) || readsRepository && (!narrow
      || /\b(?:readdirSync|readdir)\s*\(\s*(?:repositoryRoot|workspaceRoot|gitRoot)\s*[,)]/u.test(text)
      || /\b(?:readFileSync|readFile)\s*\(\s*path\.(?:join|resolve)\s*\(\s*(?:repositoryRoot|workspaceRoot|gitRoot)\s*,\s*[a-zA-Z_$]/u.test(text))) readsReleaseNotes = true;
    const urls = (options.analysis?.urls ?? literalUrlImports)(text);
    const executable = options.proof ? (options.analysis?.executable ?? executableModuleInputs)(text, !options.legacyDeclarations) : null;
    // Child scripts are often passed to spawn via a repository-relative literal,
    // rather than imported into the current test process.
    const catalog = /\/test\/(?:verification|context)\/(?:registry|ownership|journey-suites|profiles|dispositions)\.ts$/u.test(file);
    const children = executable?.children ?? [...text.matchAll(/['"]((?:test|tools)\/[^'"\n]+\.[cm]?[jt]sx?)['"]/gu)].map(match => match[1]!);
    for (const target of catalog ? [] : children) {
      const child = prefix + target;
      if (byPath.has(child)) add(child); else if (!executable) { fallback = true; unresolved.add(file + ':child:' + target); }
    }
    // Computed module paths retain the conservative scope. Never infer their
    // complete inputs from the changed-path ownership map.
    if (executable ? executable.computed : /\b(?:import|require)\s*\(\s*(?!['"\s])(?:[a-zA-Z_$])/u.test(urls.remainder)) { fallback = true; unresolved.add(file + ':computed-import'); }
    const imports = [...text.matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/gu)].map(match => match[1]!);
    const moduleImports = new Map<string, Set<string> | null>(slice?.imports ?? []);
    for (const target of executable?.imports ?? [...imports, ...urls.imports]) if (!moduleImports.has(target)) moduleImports.set(target, null);
    for (const [target, names] of moduleImports) {
      if (!target.startsWith('.')) continue;
      const relative = path.relative(repositoryRoot, path.resolve(repositoryRoot, path.dirname(file), target)).split(path.sep).join('/');
      if (relative.startsWith('../') || path.isAbsolute(relative)) { fallback = true; continue; }
      const candidates = [relative, ...['.ts', '.tsx', '.js', '/index.ts', '/index.js'].map(suffix => relative + suffix)];
      const existing = candidates.find(candidate => byPath.has(candidate));
      if (existing) add(existing, names);
      else if (!relative.includes('/build/')) { fallback = true; unresolved.add(file + ':module:' + relative); }
    }
  }
  return { content: fallback ? entries : content.filter(([file]) => !(file === 'CHANGELOG.md'
      && (step.reuse?.releaseNotes === false || narrow && independent) && !readsReleaseNotes)),
    recipe: [...selected].sort().map(file => fragments.has(file) ? [file, byPath.get(file)![1]!, fragments.get(file)!] : byPath.get(file) ?? [file, 'absent']).concat(discovery.inventory.map(file => [prefix + file, 'discovered-member'])), fallback, unresolved: [...unresolved].sort() };
}
