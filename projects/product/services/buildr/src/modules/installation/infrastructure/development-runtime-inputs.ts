import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const product = 'projects/product';
const service = `${product}/services/buildr`;
const frontend = `${product}/services/buildr-web`;

// One definition for the running development product and its closeout restart.
// Documentation, tests and the independently installed DSH plugin are not inputs.
export const DEVELOPMENT_RUNTIME_INPUTS = Object.freeze({
  exact: Object.freeze([
    `${product}/buildr`, `${product}/.node-version`, `${service}/package.json`, `${service}/package-lock.json`,
    `${service}/tools/development/run-development-cli`,
    `${service}/tools/development/run-development-npm`,
    `${service}/tools/development/run-development-npm.ts`, `${service}/tools/development/run-development-npm.cmd`,
    `${service}/tools/development/run-development-node`, `${service}/tools/development/run-development-node.cmd`,
    `${service}/tools/development/resolve-development-node`, `${service}/tools/development/resolve-development-node.cmd`,
    `${service}/tools/development/prepare-development-web.ts`,
    `${service}/tools/build/web-dist.ts`,
    `${frontend}/package.json`, `${frontend}/package-lock.json`, `${frontend}/index.html`,
    `${frontend}/vite.config.ts`, `${frontend}/tsconfig.json`,
    `${frontend}/tsconfig.app.json`, `${frontend}/tsconfig.node.json`,
  ]),
  prefixes: Object.freeze([
    `${service}/src/`, `${service}/bin/`, `${service}/web-dist/`,
    `${service}/tools/build/launcher/`, `${frontend}/src/`, `${frontend}/public/`,
    `${service}/tools/codegen/contracts/`,
    `${service}/tools/development/programs/`, `${service}/resources/contracts/`, `${service}/resources/installation/launcher/`,
  ]),
});

export function isDevelopmentRuntimeInput(name: string): boolean {
  return DEVELOPMENT_RUNTIME_INPUTS.exact.includes(name)
    || DEVELOPMENT_RUNTIME_INPUTS.prefixes.some(prefix => name.startsWith(prefix));
}

/** Current bytes, including dirty/untracked sources and the actual ignored Web build. */
export function readDevelopmentRuntimeIdentity(productRoot: string, gitRoot: string): string | null {
  try {
    const root = fs.realpathSync(gitRoot);
    const source = fs.realpathSync(productRoot);
    if (source !== fs.realpathSync(path.join(root, service))) return null;
    const paths = [...DEVELOPMENT_RUNTIME_INPUTS.exact, ...DEVELOPMENT_RUNTIME_INPUTS.prefixes];
    const listed = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...paths], { encoding: 'utf8' });
    if (listed.error || listed.status !== 0) return null;
    const names = new Set(listed.stdout.split('\0').filter(Boolean));
    const web = path.join(source, 'web-dist');
    const visit = (directory: string): void => {
      if (!fs.existsSync(directory)) return;
      for (const name of fs.readdirSync(directory)) {
        const file = path.join(directory, name);
        const state = fs.lstatSync(file);
        if (state.isDirectory()) visit(file);
        else names.add(path.relative(root, file).split(path.sep).join('/'));
      }
    };
    visit(web);
    const digest = crypto.createHash('sha256');
    digest.update(JSON.stringify({ schemaVersion: 'buildr.development-runtime/v1', sourceRoot: source, inputs: DEVELOPMENT_RUNTIME_INPUTS }));
    for (const name of [...names].sort()) {
      if (!isDevelopmentRuntimeInput(name)) continue;
      const file = path.join(root, name);
      // A deleted tracked input is represented by its absence.
      let state: fs.Stats;
      try { state = fs.lstatSync(file); } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error; }
      if (!state.isFile()) return null;
      const bytes = fs.readFileSync(file);
      digest.update(JSON.stringify([name, state.mode & 0o111 ? 'executable' : 'file', bytes.length]));
      digest.update(bytes);
    }
    return `sha256-${digest.digest('hex')}`;
  } catch { return null; }
}
