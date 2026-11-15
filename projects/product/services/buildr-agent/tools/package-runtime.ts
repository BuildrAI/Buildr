import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runtimePackageTree} from './runtime-package-tree.ts';

/** The runtime owner builds one relocatable production package for every host and test. */
export function agentRuntimePackageTree(agentRoot:string){
  const metadata = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8'));
  if (metadata.name !== '@buildr-ai/buildr-agent' || metadata.private !== true) throw new Error('agent_package_identity_invalid');
  if (!fs.statSync(path.join(agentRoot, 'build/index.js'), { throwIfNoEntry: false })?.isFile()) throw new Error('agent_package_not_built');
  const tree = runtimePackageTree();
  tree.copy(path.join(agentRoot, 'package.json'), 'package.json');
  tree.copy(path.join(agentRoot, 'LICENSE'), 'LICENSE');
  tree.copy(path.join(agentRoot, 'build'), 'build');
  {
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
        // Claude's SDK is always given an explicitly managed CLI. Its optional
        // fallback binaries are not a second program installation in every
        // retained runtime unit; the SDK JS and its peers still ship normally.
        if (pkg.name === '@anthropic-ai/claude-agent-sdk' && pkg.optionalDependencies?.[name] &&
          /^@anthropic-ai\/claude-agent-sdk-(?:darwin|linux|win32)-/.test(name)) continue;
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
        const rootTarget = path.join('node_modules', name);
        const version = String(dependencyMetadata.version);
        exactDependencies[name] = version;
        const rootVersion = rootVersions.get(name);
        if (rootVersion === version && tree.has(path.join(rootTarget, 'package.json'))) continue;
        const output = rootVersion && rootVersion !== version ? path.join(target, 'node_modules', name) : rootTarget;
        if (tree.has(path.join(output, 'package.json'))) {
          if (tree.json(path.join(output, 'package.json')).version === version) continue;
          throw new Error(`agent_runtime_dependency_conflict: ${name}`);
        }
        if (!rootVersion) rootVersions.set(name, version);
        tree.copy(dependency, output, (file) => {
            const relative = path.relative(dependency, file);
            if (relative.split(path.sep).some(part => ['node_modules', 'test', 'tests', '__tests__', 'fixture', 'fixtures'].includes(part))) return false;
            if (/^(?:changelog|history)(?:\.|$)/iu.test(path.basename(file))) return false;
            return !file.endsWith('.map') && !(file.endsWith('.ts') && !file.endsWith('.d.ts'));
          });
        // The runtime is already materialized from the lock. In particular the
        // SDK's installer must not download a CLI or touch a user's profile when
        // the enclosing Buildr package is installed normally.
        const runtimeMetadata = tree.json(path.join(output, 'package.json'));
        runtimeMetadata.dependencies = copyDependencies(dependency, output);
        runtimeMetadata.bundleDependencies = Object.keys(runtimeMetadata.dependencies).sort();
        delete runtimeMetadata.scripts;
        delete runtimeMetadata.devDependencies;
        delete runtimeMetadata.peerDependencies;
        delete runtimeMetadata.peerDependenciesMeta;
        delete runtimeMetadata.optionalDependencies;
        tree.writeJson(path.join(output, 'package.json'), runtimeMetadata);
      }
      return exactDependencies;
    };
    copyDependencies(agentRoot, '');
    // npm must retain the complete observed runtime tree when the enclosing
    // package is packed. Peer packages required by the generated DSH client are
    // explicit here rather than left as extraneous, pruneable directories.
    const runtimeMetadata = { ...metadata,
      dependencies: Object.fromEntries([...rootVersions].sort(([a], [b]) => a.localeCompare(b))),
      bundleDependencies: [...rootVersions.keys()].sort(),
    };
    delete runtimeMetadata.devDependencies;
    delete runtimeMetadata.scripts;
    tree.writeJson('package.json', runtimeMetadata);
  }
  return tree;
}
