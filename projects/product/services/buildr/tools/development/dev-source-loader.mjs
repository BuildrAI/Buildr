import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';

// Explicitly injected only into a development host and its owned workers.
const snapshot = JSON.parse(fs.readFileSync(process.env.BUILDR_DEV_SNAPSHOT, 'utf8'));
if (snapshot.version !== 1 || !path.isAbsolute(snapshot.serviceRoot)
  || createHash('sha256').update(JSON.stringify(snapshot.files)).digest('hex') !== snapshot.id) {
  throw new Error('development_snapshot_invalid');
}
const sources = new Map(Object.entries(snapshot.files).map(([relative, source]) => [
  pathToFileURL(path.join(snapshot.serviceRoot, relative)).href, source,
]));
Object.defineProperty(globalThis, Symbol.for('buildr.development-snapshot'), {value: Object.freeze({id: snapshot.id, serviceRoot: snapshot.serviceRoot})});
registerHooks({
  resolve(specifier, context, next) {
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && context.parentURL) {
      const url = new URL(specifier, context.parentURL).href;
      if (sources.has(url)) return {url, shortCircuit: true};
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!sources.has(url)) return next(url, context);
    const filename = fileURLToPath(url);
    return {format: filename.endsWith('.json') ? 'json' : filename.endsWith('.ts') ? 'module-typescript' : filename.endsWith('.cjs') ? 'commonjs' : 'module',
      source: sources.get(url), shortCircuit: true};
  },
});
