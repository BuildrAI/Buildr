import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { atomicWriteJson } from '../../src/infrastructure/filesystem/atomic-files.ts';
import { preparationContentDigest } from '../verification/candidate-preparation-reuse.ts';

const schemaVersion = 'buildr.test-harness-build/v1';
// Vite's public environment and the local compiler/toolchain inputs. A test's
// state roots, diagnostics paths and invocation IDs are not build inputs.
const buildEnvironmentVariable = /^(?:VITE_.*|NODE_ENV|PATH|TZ|LANG|LC_.*|BROWSERSLIST.*|ROLLUP_.*|ESBUILD_.*|SOURCE_DATE_EPOCH|SYSTEMROOT|WINDIR)$/iu;

/** A local preparation receipt, not test evidence or a portable build cache. */
export function developmentAgentBuildReuse(serviceRoot: string, agentRoot: string, webRoot: string) {
  const receiptPath = path.join(serviceRoot, 'node_modules/.buildr-test-harness-build.json');
  const relative = (root: string, entries: string[]) => entries.map(entry => path.join(root, entry));
  const input = (): string | null => {
    // Custom module loaders and external Web output are not this recipe.
    if (process.env.NODE_PATH || process.env.NODE_OPTIONS || process.env.ESBUILD_BINARY_PATH
      || process.env.LD_PRELOAD || process.env.DYLD_INSERT_LIBRARIES || process.env.BUILDR_HARNESS_WEB_DIST !== undefined) return null;
    try {
      const required = preparationContentDigest([
        import.meta.filename, path.join(import.meta.dirname, 'prepare-development-agent.ts'), fs.realpathSync(process.execPath),
        ...relative(agentRoot, ['src', 'tools/build.ts', 'tools/codegen', 'package.json', 'package-lock.json', 'tsconfig.json', 'node_modules']),
        ...relative(webRoot, ['src', 'tools/build.ts', 'index.html', 'mermaid-renderer.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json']),
      ]);
      const webDependencies = preparationContentDigest([path.join(webRoot, 'node_modules')], { webDependencyCache: true });
      const envFiles = relative(webRoot, ['.env', '.env.local', '.env.production', '.env.production.local']);
      const webFiles = preparationContentDigest([path.join(webRoot, 'public'), ...envFiles], { optional: true });
      // Vite may discover PostCSS configuration outside the Web tree. Fall
      // back to the real build rather than assume ownership of custom inputs.
      for (let dir = webRoot; ; dir = path.dirname(dir)) {
        if (fs.readdirSync(dir).some(name => /^(?:\.postcssrc(?:\.|$)|postcss\.config\.)/u.test(name))) return null;
        const pkg = path.join(dir, 'package.json');
        if (fs.existsSync(pkg) && Object.hasOwn(JSON.parse(fs.readFileSync(pkg, 'utf8')), 'postcss')) return null;
        if (path.dirname(dir) === dir) break;
      }
      if (!required || !webDependencies || !webFiles) return null;
      // A custom dotenv file can interpolate arbitrary environment variables.
      // In that case include the entire environment rather than assuming.
      const customEnv = envFiles.some(file => fs.existsSync(file));
      return createHash('sha256').update(JSON.stringify({
        required, webDependencies, webFiles, serviceRoot, agentRoot, webRoot, node: process.versions,
        platform: process.platform, arch: process.arch, umask: process.umask(),
        env: Object.entries(process.env).filter(([name]) => customEnv || buildEnvironmentVariable.test(name))
          .sort(([a], [b]) => a.localeCompare(b)),
      })).digest('hex');
    } catch { return null; }
  };
  const output = (): string | null => {
    const entrypoints = [
      ...relative(agentRoot, ['build/index.js', 'build/http-dto.d.ts', 'build/harness-web-dist/index.html']),
      ...relative(webRoot, ['dist/index.html', 'dist/mermaid-renderer.html', 'build/generated/agent-service-http-dto.ts']),
    ];
    if (!entrypoints.every(file => fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())) return null;
    return preparationContentDigest([...relative(agentRoot, ['build']), ...relative(webRoot, ['dist', 'build/generated'])]);
  };
  return {
    input,
    matches(before: string | null): boolean {
      try {
        if (!before) return false;
        const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        const current = output();
        return Boolean(current && saved?.schemaVersion === schemaVersion && saved.input === before && saved.output === current);
      } catch { return false; }
    },
    invalidate(): void {
      try { fs.unlinkSync(receiptPath); } catch {}
    },
    remember(before: string | null): void {
      try {
        if (!before || before !== input()) return;
        const current = output();
        if (current) atomicWriteJson(receiptPath, { schemaVersion, input: before, output: current });
      } catch {
        // Cache failures must never prevent successful normal preparation.
      }
    },
  };
}
