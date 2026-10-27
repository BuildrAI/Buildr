import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const projectRoot: any = path.resolve(serviceRoot, '../..');

/** The project preparation declaration is a flat, closed list; a YAML
 * dependency cannot parse the file that precedes dependency installation. */
interface PreparationEntry {
  id: string;
  cwd: string;
  executable: string;
  args: string[];
}

function parsePreparationDeclarations(file: string): PreparationEntry[] {
  const entries: PreparationEntry[] = [];
  let current: { id?: string; cwd?: string; executable?: string; args?: string[] } = {};
  const flush = () => {
    if (!current.id) return;
    entries.push({ id: current.id, cwd: current.cwd!, executable: current.executable!, args: current.args! });
    current = {};
  };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const item = /^\s*-\s+id:\s+(\S+)\s*$/.exec(line);
    if (item) { flush(); current = { id: item[1] }; continue; }
    const cwd = /^\s+cwd:\s+(\S+)\s*$/.exec(line);
    if (cwd) current.cwd = cwd[1];
    const executable = /^\s+executable:\s+(\S+)\s*$/.exec(line);
    if (executable) current.executable = executable[1];
    const args = /^\s+args:\s+\[(.*)\]\s*$/.exec(line);
    if (args) current.args = args[1].split(',').map(part => part.trim()).filter(Boolean);
  }
  flush();
  for (const entry of entries) {
    if (!entry.cwd || !entry.executable || !Array.isArray(entry.args)) {
      throw new Error(`preparation_declaration_invalid: ${entry.id} must declare cwd, executable and args.`);
    }
  }
  return entries;
}

/** Cheap proof that a declaration has already run against the current inputs.
 * npm re-checks freshness itself; these probes only avoid paying for the
 * process start when nothing changed. */
function readied(entry: PreparationEntry, root: string): boolean {
  const service = path.join(root, entry.cwd);
  if (entry.id.endsWith('.npm-ci')) {
    const lock = path.join(service, 'package-lock.json');
    if (!fs.statSync(lock, { throwIfNoEntry: false })?.isFile()) {
      // A service without a lockfile is a zero-dependency declaration: npm ci
      // cannot run there and node_modules is not expected. Real dependencies
      // without a lockfile are reported by the executor, not treated as ready.
      const metadata = JSON.parse(fs.readFileSync(path.join(service, 'package.json'), 'utf8'));
      return Object.keys(metadata.dependencies ?? {}).length === 0 && Object.keys(metadata.devDependencies ?? {}).length === 0;
    }
    const marker = path.join(service, 'node_modules', '.package-lock.json');
    const markerStat = fs.statSync(marker, { throwIfNoEntry: false });
    const lockStat = fs.statSync(lock, { throwIfNoEntry: false });
    return Boolean(markerStat?.isFile() && lockStat?.isFile() && markerStat.mtimeMs >= lockStat.mtimeMs);
  }
  if (entry.id === 'buildr-agent.build') {
    return fs.statSync(path.join(service, 'build', 'index.js'), { throwIfNoEntry: false })?.isFile() === true;
  }
  return false;
}

export function prepareDevelopmentDependencies({
  root = projectRoot,
  execute = (executable: string, args: string[], cwd: string) => spawnSync(executable, args, {
    cwd, stdio: 'inherit',
    // Preparation entries invoke the development npm wrapper, which runs the
    // same readiness probe; skipping it there prevents recursion.
    env: { ...process.env, BUILDR_DEVELOPMENT_PREPARE_SKIP: '1' },
  }),
  entryFilter = (entry: PreparationEntry) => !entry.id.includes('browser-chromium'),
  log = (message: string) => process.stderr.write(`${message}\n`),
}: { root?: string; execute?: (executable: string, args: string[], cwd: string) => { status: number | null; error?: Error | null }; entryFilter?: (entry: PreparationEntry) => boolean; log?: (message: string) => void } = {}): { executed: string[]; reused: string[] } {
  const file = path.join(root, 'preparation.yml');
  const entries = parsePreparationDeclarations(file);
  const executed: string[] = [];
  const reused: string[] = [];
  for (const entry of entries) {
    if (!entryFilter(entry)) continue;
    if (readied(entry, root)) { reused.push(entry.id); continue; }
    const cwd = path.join(root, entry.cwd);
    if (entry.id.endsWith('.npm-ci') && !fs.statSync(path.join(cwd, 'package-lock.json'), { throwIfNoEntry: false })?.isFile()) {
      // A service declaring dependencies without a lockfile cannot be
      // reproduced by npm ci; surface that instead of silently skipping it.
      const metadata = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      if (Object.keys(metadata.dependencies ?? {}).length > 0 || Object.keys(metadata.devDependencies ?? {}).length > 0) {
        throw new Error(`preparation_lockfile_missing: ${entry.id} declares dependencies but ${entry.cwd} has no package-lock.json.`);
      }
      reused.push(entry.id);
      continue;
    }
    const executable = path.join(cwd, entry.executable);
    const result = execute(executable, entry.args, cwd);
    if (result.error || result.status !== 0) {
      throw new Error(`development_preparation_failed: ${entry.id} exited ${result.status ?? result.error?.message}`);
    }
    executed.push(entry.id);
    log(`development-preparation: ${entry.id} ready`);
  }
  return { executed, reused };
}

/** Fast precheck used by the development Node wrapper: the main service lock
 * marker and the private Agent build are the two inputs every later step needs. */
export function developmentDependenciesReady(root = projectRoot): boolean {
  return readied({ id: 'buildr.npm-ci', cwd: 'services/buildr', executable: '', args: [] }, root)
    && readied({ id: 'buildr-agent.build', cwd: 'services/buildr-agent', executable: '', args: [] }, root);
}

export function ensureDevelopmentDependencies({ root = projectRoot, ...options }: { root?: string } & Parameters<typeof prepareDevelopmentDependencies>[0] = {}): void {
  if (developmentDependenciesReady(root)) return;
  prepareDevelopmentDependencies({ root, ...options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const ready = process.argv.includes('--check');
  const full = process.argv.includes('--full');
  if (ready) {
    process.stdout.write(`${JSON.stringify({ ready: developmentDependenciesReady() })}\n`);
  } else {
    const result = prepareDevelopmentDependencies({ entryFilter: (entry) => full || !entry.id.includes('browser-chromium') });
    process.stdout.write(`${JSON.stringify({ status: 'passed', ...result })}\n`);
  }
}
