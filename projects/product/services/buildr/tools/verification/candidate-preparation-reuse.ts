import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { atomicWriteJson } from '../../src/infrastructure/filesystem/atomic-files.ts';

const schemaVersion = 'buildr.candidate-prepared-operation/v1';
const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
// These are the two tsBuildInfoFile outputs declared by buildr-web tsconfigs.
const webBuildInfoFiles = new Set(['.tmp/tsconfig.app.tsbuildinfo', '.tmp/tsconfig.node.tsbuildinfo']);
const ignored = new Set(['node_modules', 'build', 'web-dist', 'dist', '.git']);

// Hash bytes, permissions and layout; mtimes never establish prepared state.
// An external symlink cannot be covered by the owned output inventory.
export function preparationContentDigest(paths: string[], { source = false, optional = false, webDependencyCache = false, io = fs } = {}): string | null {
  const hash = crypto.createHash('sha256');
  try {
    for (const [index, root] of paths.entries()) {
      const resolvedRoot = path.resolve(root);
      const visit = (file: string, relative: string) => {
        const stat = io.lstatSync(file);
        hash.update(`${index}\0${relative}\0${stat.mode & 0o777}\0`);
        if (stat.isSymbolicLink()) {
          const target = io.realpathSync(file);
          const within = path.relative(resolvedRoot, target);
          if (within.startsWith(`..${path.sep}`) || within === '..' || path.isAbsolute(within)) throw new Error('Unowned preparation symlink.');
          hash.update(`link\0${io.readlinkSync(file)}\0`);
        } else if (stat.isFile()) { hash.update(`file\0${stat.size}\0`); hash.update(io.readFileSync(file)); }
        else if (stat.isDirectory()) {
          hash.update('directory\0');
          const entries = io.readdirSync(file).sort();
          for (const name of entries) {
            if (source && ((!relative && ignored.has(name)) || name.endsWith('.tsbuildinfo'))) continue;
            const child = path.join(file, name), childRelative = relative ? `${relative}/${name}` : name;
            if (webDependencyCache && childRelative === '.vite-temp' && io.lstatSync(child).isDirectory() && io.readdirSync(child).length === 0) continue;
            if (webDependencyCache && webBuildInfoFiles.has(childRelative) && io.lstatSync(child).isFile()) continue;
            if (webDependencyCache && childRelative === '.tmp' && io.lstatSync(child).isDirectory()
              && io.readdirSync(child).every(entry => webBuildInfoFiles.has(`.tmp/${entry}`) && io.lstatSync(path.join(child, entry)).isFile())) continue;
            visit(child, childRelative);
          }
        } else throw new Error('Unsupported preparation output.');
      };
      if (!io.existsSync(resolvedRoot) && optional) hash.update(`${index}\0absent\0`);
      else visit(resolvedRoot, '');
    }
    return `sha256-${hash.digest('hex')}`;
  } catch { return null; }
}

function preparationInputScope(id: string, roots: any): { required: string[]; optional: string[]; dependencies: string[] } | null {
  const backend = (file: string) => path.join(roots.serviceRoot, file);
  const web = (file: string) => path.join(roots.webRoot, file);
  if (id === 'buildr-dependencies' || id === 'buildr-web-dependencies') {
    const file = id === 'buildr-dependencies' ? backend : web;
    return { required: ['package.json', 'package-lock.json'].map(file), optional: [file('.npmrc')], dependencies: [] };
  }
  if (id === 'generated-contracts-and-test-context') return {
    required: ['src', 'tools/codegen', 'tools/testing', 'tools/build/generated-artifacts.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.test-context.json'].map(backend),
    optional: [], dependencies: ['buildr-dependencies'],
  };
  if (id === 'buildr-web-source-runtime') return {
    // DTO generators import schemas across backend modules. Keep that source
    // closure conservative without making tests, docs or unrelated tools inputs.
    required: [...['src', 'tools/codegen', 'tools/build/web-dist.ts', 'tools/development/prepare-development-web.ts', 'package.json', 'package-lock.json'].map(backend),
      ...['src', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package.json', 'package-lock.json', 'build/generated'].map(web)],
    optional: ['public', '.env', '.env.local', '.env.production', '.env.production.local'].map(web),
    dependencies: ['buildr-dependencies', 'buildr-web-dependencies'],
  };
  return null;
}

export function createCandidatePreparationReuse(roots: any, node: any, options: any = {}): any {
  const receiptRoot = options.receiptRoot ?? path.join(os.tmpdir(), `buildr-candidate-prepared-${digest(path.resolve(roots.serviceRoot)).slice(7)}`);
  const dependencyOutputs = new Map<string, string>();
  const environment = options.env ?? process.env;
  const environmentIdentity = digest({ platform: process.platform, arch: process.arch, variables: Object.fromEntries(Object.entries(environment)
    .filter(([key]) => ['NODE_ENV', 'NODE_OPTIONS', 'PATH', 'TZ', 'LANG', 'LC_ALL', 'LC_CTYPE'].includes(key) || /^npm_config_/iu.test(key))
    .sort(([left], [right]) => left.localeCompare(right))) });
  const read = options.read ?? ((id: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(receiptRoot, `${id}.json`), 'utf8')); } catch { return null; }
  });
  const remove = options.remove ?? ((id: string) => fs.rmSync(path.join(receiptRoot, `${id}.json`), { force: true }));
  const write = options.write ?? ((id: string, value: any) => atomicWriteJson(path.join(receiptRoot, `${id}.json`), value));
  const contentDigest = options.contentDigest ?? preparationContentDigest;
  const exists = options.exists ?? fs.existsSync;
  let npmIdentity: string | null = options.npmIdentity ?? null;
  try {
    if (npmIdentity === null) {
      const cli = fs.realpathSync(node.npmExecutable);
      npmIdentity = contentDigest([cli, path.resolve(path.dirname(cli), '../package.json')]);
    }
  } catch {}
  const fingerprint = options.fingerprint ?? ((item: any, role: string) => {
    if (role === 'input') {
      const scope = preparationInputScope(item.id, roots);
      if (!scope) return null;
      const required = contentDigest(scope.required), optional = contentDigest(scope.optional, { optional: true });
      if (!required || !optional || !npmIdentity) return null;
      return digest({ recipe: item, node, npmIdentity, scope: { required: scope.required, optional: scope.optional }, required, optional,
        dependencyOutputs: scope.dependencies.map(id => [id, dependencyOutputs.get(id) ?? null]) });
    }
    if (item.id === 'buildr-dependencies' || item.id === 'buildr-web-dependencies') {
      const root = item.id === 'buildr-dependencies' ? roots.serviceRoot : roots.webRoot;
      if (!exists(path.join(root, 'node_modules/.package-lock.json'))) return null;
      return contentDigest([path.join(root, 'node_modules')], { webDependencyCache: item.id === 'buildr-web-dependencies' });
    }
    if (item.id === 'generated-contracts-and-test-context') {
      if (!exists(path.join(roots.serviceRoot, 'build/test-context/public.js'))
          || !exists(path.join(roots.serviceRoot, 'build/generated/task-dto.ts'))
          || !exists(path.join(roots.webRoot, 'build/generated/task-dto.ts'))) return null;
      return contentDigest([path.join(roots.serviceRoot, 'build/generated'), path.join(roots.serviceRoot, 'build/test-context'), path.join(roots.webRoot, 'build/generated')]);
    }
    if (item.id === 'buildr-web-source-runtime') {
      if (!exists(path.join(roots.serviceRoot, 'web-dist/index.html'))) return null;
      return contentDigest([path.join(roots.serviceRoot, 'web-dist')]);
    }
    return null;
  });
  const inputFor = (item: any): string | null => {
    const input = fingerprint(item, 'input');
    return input ? digest({ input, environmentIdentity }) : null;
  };
  const remember = (item: any, output: string | null) => { if (output) dependencyOutputs.set(item.id, output); };
  return {
    inspect(item: any): any {
      const input = inputFor(item);
      const output = fingerprint(item, 'output');
      let receipt: any = null;
      try { receipt = read(item.id); } catch {}
      const reusable = !options.force && Boolean(input && output && receipt?.schemaVersion === schemaVersion && receipt.id === item.id
        && receipt.input === input && receipt.output === output && receipt.status === 'passed' && receipt.exitCode === 0);
      if (reusable) remember(item, output);
      return { input, reusable, ...(reusable ? { reusedFrom: { input, output, finishedAt: receipt.finishedAt } } : {}) };
    },
    invalidate(item: any): void { try { remove(item.id); } catch {} },
    complete(item: any, before: any, finishedAt: string): void {
      const input = inputFor(item);
      const output = fingerprint(item, 'output');
      remember(item, output);
      if (!input || before.input !== input || !output) return;
      write(item.id, { schemaVersion, id: item.id, status: 'passed', exitCode: 0, input, output, finishedAt });
    },
  };
}
