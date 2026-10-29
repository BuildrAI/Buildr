import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { withExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

const buildrRoot = path.resolve(import.meta.dirname, '../..');

function sameRuntimeTree(left: string, right: string): boolean {
  const expected = fs.lstatSync(left);
  const current = fs.lstatSync(right, { throwIfNoEntry: false });
  if (!current || expected.isSymbolicLink() || current.isSymbolicLink()
    || expected.isDirectory() !== current.isDirectory() || (expected.mode & 0o777) !== (current.mode & 0o777)) return false;
  if (expected.isFile()) return current.isFile() && expected.size === current.size && fs.readFileSync(left).equals(fs.readFileSync(right));
  if (!expected.isDirectory()) return false;
  const names = fs.readdirSync(left).sort(), existing = fs.readdirSync(right).sort();
  return names.length === existing.length && names.every((name, index) => name === existing[index]
    && sameRuntimeTree(path.join(left, name), path.join(right, name)));
}

/** Materialize the same public package consumed by an installed Buildr. */
export function prepareDevelopmentAgent({
  serviceRoot = buildrRoot,
  agentRoot = path.resolve(serviceRoot, '../buildr-agent'),
  build = true,
}: { serviceRoot?: string; agentRoot?: string; build?: boolean } = {}): string {
  const destination = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-agent');
  return withExclusiveFileLock(path.join(serviceRoot, 'node_modules/.buildr-agent-preparation.lock'), destination,
    () => materializeDevelopmentAgent({ serviceRoot, agentRoot, build }), { timeoutMs: 30_000 });
}

function materializeDevelopmentAgent({ serviceRoot, agentRoot, build }: { serviceRoot: string; agentRoot: string; build: boolean }): string {
  if (build) {
    const result = spawnSync(process.execPath, [path.join(agentRoot, 'tools/build.ts')], { cwd: agentRoot, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`agent_preparation_build_failed: ${result.error?.message ?? result.status}`);
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8'));
  if (metadata.name !== '@buildr-ai/buildr-agent' || metadata.private !== true) throw new Error('agent_package_identity_invalid');
  if (!fs.statSync(path.join(agentRoot, 'build/index.js'), { throwIfNoEntry: false })?.isFile()) throw new Error('agent_package_not_built');
  const finalDestination = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-agent');
  fs.mkdirSync(path.dirname(finalDestination), { recursive: true });
  const destination = fs.mkdtempSync(path.join(path.dirname(finalDestination), '.buildr-agent-stage-'));
  try {
    fs.copyFileSync(path.join(agentRoot, 'package.json'), path.join(destination, 'package.json'));
    fs.copyFileSync(path.join(agentRoot, 'LICENSE'), path.join(destination, 'LICENSE'));
    fs.cpSync(path.join(agentRoot, 'build'), path.join(destination, 'build'), { recursive: true });
    // Runtime dependencies stay nested with their owner. Only declared runtime
    // packages and their actual transitive closure are copied, never dev tools.
    const rootVersions = new Map<string, string>();
    // Reserve the package's own dependency versions before traversing transitive
    // trees. Otherwise a transitive version can occupy the direct import path.
    const rootRequire = createRequire(path.join(agentRoot, 'package.json'));
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      const found = (rootRequire.resolve.paths(name) ?? []).map(base => path.join(base, name))
        .find(candidate => fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile());
      if (!found) throw new Error(`agent_runtime_dependency_missing: ${name}`);
      rootVersions.set(name, String(JSON.parse(fs.readFileSync(path.join(found, 'package.json'), 'utf8')).version));
    }
    const copyDependencies = (source: string, target: string): Record<string, string> => {
      const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
      const exactDependencies: Record<string, string> = {};
      const names = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
      const require = createRequire(path.join(source, 'package.json'));
      for (const name of names) {
        let dependency: string;
        try {
          const lookup = require.resolve.paths(name) ?? [];
          const found = lookup.map(base => path.join(base, name)).find(candidate => fs.statSync(path.join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile());
          if (!found) throw new Error('missing dependency');
          dependency = fs.realpathSync(found);
        } catch (error) {
          if (pkg.optionalDependencies?.[name] || pkg.peerDependenciesMeta?.[name]?.optional) continue;
          throw new Error(`agent_runtime_dependency_missing: ${name}`, { cause: error });
        }
        const dependencyMetadata = JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8'));
        // Keep each dependency at its original nesting level when versions clash.
        const rootTarget = path.join(destination, 'node_modules', name);
        const version = String(dependencyMetadata.version);
        exactDependencies[name] = version;
        const rootVersion = rootVersions.get(name);
        if (rootVersion === version && fs.existsSync(path.join(rootTarget, 'package.json'))) continue;
        const output = rootVersion && rootVersion !== version ? path.join(target, 'node_modules', name) : rootTarget;
        if (fs.existsSync(path.join(output, 'package.json'))) {
          if (JSON.parse(fs.readFileSync(path.join(output, 'package.json'), 'utf8')).version === version) continue;
          throw new Error(`agent_runtime_dependency_conflict: ${name}`);
        }
        if (!rootVersion) rootVersions.set(name, version);
        fs.cpSync(dependency, output, {
          recursive: true,
          filter: (file) => {
            const relative = path.relative(dependency, file);
            if (relative.split(path.sep).some(part => ['node_modules', 'test', 'tests', '__tests__', 'fixture', 'fixtures'].includes(part))) return false;
            if (/^(?:changelog|history)(?:\.|$)/iu.test(path.basename(file))) return false;
            return !file.endsWith('.map') && !(file.endsWith('.ts') && !file.endsWith('.d.ts'));
          },
        });
        // The runtime is already materialized from the lock. In particular the
        // SDK's installer must not download a CLI or touch a user's profile when
        // the enclosing Buildr package is installed normally.
        const runtimeMetadata = JSON.parse(fs.readFileSync(path.join(output, 'package.json'), 'utf8'));
        runtimeMetadata.dependencies = copyDependencies(dependency, output);
        runtimeMetadata.bundleDependencies = Object.keys(runtimeMetadata.dependencies).sort();
        delete runtimeMetadata.scripts;
        delete runtimeMetadata.devDependencies;
        delete runtimeMetadata.peerDependencies;
        delete runtimeMetadata.peerDependenciesMeta;
        delete runtimeMetadata.optionalDependencies;
        fs.writeFileSync(path.join(output, 'package.json'), `${JSON.stringify(runtimeMetadata, null, 2)}\n`);
      }
      return exactDependencies;
    };
    copyDependencies(agentRoot, destination);
    // npm must retain the complete observed runtime tree when the enclosing
    // package is packed. Peer packages required by the generated DSH client are
    // explicit here rather than left as extraneous, pruneable directories.
    const runtimeMetadata = { ...metadata,
      dependencies: Object.fromEntries([...rootVersions].sort(([a], [b]) => a.localeCompare(b))),
      bundleDependencies: [...rootVersions.keys()].sort(),
    };
    delete runtimeMetadata.devDependencies;
    delete runtimeMetadata.scripts;
    fs.writeFileSync(path.join(destination, 'package.json'), `${JSON.stringify(runtimeMetadata, null, 2)}\n`);
    // Concurrent CLI and runtime preparation can be reading these public files.
    // Repeated preparation must not retire an identical package underneath them.
    if (sameRuntimeTree(destination, finalDestination)) return finalDestination;
    const previous = `${destination}-previous`;
    if (fs.existsSync(finalDestination)) fs.renameSync(finalDestination, previous);
    try { fs.renameSync(destination, finalDestination); }
    catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, finalDestination); throw error; }
    fs.rmSync(previous, { recursive: true, force: true });
    return finalDestination;
  } finally { fs.rmSync(destination, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.stdout.write(`${JSON.stringify({ status: 'passed', root: prepareDevelopmentAgent({ build: !process.argv.includes('--no-build') }) })}\n`);
}
