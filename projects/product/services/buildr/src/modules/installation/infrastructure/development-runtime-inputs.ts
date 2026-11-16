import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const product = 'projects/product';
const service = `${product}/services/buildr`;
const frontend = `${product}/services/buildr-web`;
const agent = `${product}/services/buildr-harness`;
const harnessWeb = `${product}/services/buildr-harness-web`;
const preparedAgent = `${service}/node_modules/@buildr-ai/buildr-harness`;

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
    `${service}/tools/development/prepare-development-agent.ts`, `${service}/tools/build/agent-package.ts`,
    `${service}/tools/development/dev-live.ts`, `${service}/tools/development/dev-web.ts`,
    `${service}/tools/development/dev-update.ts`, `${service}/tools/development/dev-snapshot.ts`,
    `${service}/tools/development/dev-source-loader.mjs`, `${service}/tools/development/dev-harness-update.ts`,
    `${agent}/package.json`, `${agent}/package-lock.json`, `${agent}/tsconfig.json`, `${agent}/tools/build.ts`,
    `${preparedAgent}/package.json`,
    `${service}/tools/build/web-dist.ts`,
    `${frontend}/package.json`, `${frontend}/package-lock.json`, `${frontend}/index.html`,
    `${frontend}/vite.config.ts`, `${frontend}/tsconfig.json`,
    `${frontend}/tsconfig.app.json`, `${frontend}/tsconfig.node.json`,
    `${harnessWeb}/package.json`, `${harnessWeb}/package-lock.json`, `${harnessWeb}/index.html`,
    `${harnessWeb}/mermaid-renderer.html`, `${harnessWeb}/vite.config.ts`, `${harnessWeb}/tsconfig.json`,
    `${harnessWeb}/tools/build.ts`,
    `${harnessWeb}/tools/dev-server.mjs`,
  ]),
  prefixes: Object.freeze([
    `${service}/src/`, `${service}/bin/`, `${service}/web-dist/`,
    `${service}/tools/build/launcher/`, `${frontend}/src/`, `${frontend}/public/`,
    `${harnessWeb}/src/`,
    `${service}/tools/codegen/contracts/`,
    `${agent}/src/`, `${agent}/build/`, `${preparedAgent}/build/`,
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
    const snapshot = (globalThis as any)[Symbol.for('buildr.development-snapshot')];
    if (snapshot?.serviceRoot === source && /^[a-f0-9]{64}$/.test(snapshot.id)) {
      // A live source snapshot is not a formal installed runtime, even when
      // the mutable checkout now happens to match the installed source bytes.
      return `sha256-${crypto.createHash('sha256').update(JSON.stringify({schemaVersion: 'buildr.development-live/v1', sourceRoot: source, snapshot: snapshot.id})).digest('hex')}`;
    }
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
    visit(path.join(root, agent, 'build'));
    visit(path.join(root, preparedAgent, 'build'));
    if (fs.existsSync(path.join(root, preparedAgent, 'package.json'))) names.add(`${preparedAgent}/package.json`);
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
