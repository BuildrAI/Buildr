import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hasDevelopmentCliRegistration } from '../process/development-cli-shim.ts';
import { ensureStorageDirectory, safeStoragePath } from './files.ts';

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quoteCommandValue(value: string): string {
  return value.replaceAll('%', '%%').replaceAll('"', '""');
}

function syncWrapperFile(directory: string, name: string, content: string, mode: number): void {
  const target = path.join(directory, name);
  try {
    const stat = fs.lstatSync(target, { throwIfNoEntry: false });
    if (stat) {
      if (stat.isFile() && !stat.isSymbolicLink()) {
        const current = fs.readFileSync(target, 'utf8');
        if (current === content && (process.platform === 'win32' || (stat.mode & 0o777) === mode)) return;
      } else {
        throw new Error('storage_path_unsafe');
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'storage_path_unsafe') throw error;
  }
  const temporary = path.join(directory, `.buildr-shim-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', mode, flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function prependPath(rawPath: string | undefined, shimDir: string, platform: NodeJS.Platform): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  const normalizedShim = path.resolve(shimDir);
  const existingEntries = (rawPath ?? '')
    .split(delimiter)
    .filter(entry => entry && path.resolve(entry) !== normalizedShim);
  return [shimDir, ...existingEntries].join(delimiter);
}

/** Prepend a session-local `buildr` router only for development-profile executor environments. */
export function prepareDevelopmentCliEnvironment(
  storageRoot: string,
  profileId: string | undefined,
  environment: Record<string, string>,
  options: {
    platform?: NodeJS.Platform;
    nodeExecutable?: string;
    shimScript?: string;
    defaultDevelopmentDataRoot?: string;
    developmentLauncherRoot?: string;
  } = {},
): Record<string, string> {
  if (profileId !== 'development') return environment;
  const platform = options.platform ?? process.platform;
  const dataRoot = path.dirname(storageRoot);
  if (!hasDevelopmentCliRegistration(dataRoot, {
    platform,
    env: environment,
    defaultDevelopmentDataRoot: options.defaultDevelopmentDataRoot,
    developmentLauncherRoot: options.developmentLauncherRoot,
  })) {
    return environment;
  }
  const shimDir = path.join(storageRoot, 'toolchains', 'dev-cli-bin');
  ensureStorageDirectory(storageRoot, shimDir);
  if (!safeStoragePath(storageRoot, shimDir)) throw new Error('storage_path_unsafe');
  const nodeExecutable = path.resolve(options.nodeExecutable ?? process.execPath);
  const shimScript = path.resolve(options.shimScript ?? fileURLToPath(new URL(
    import.meta.url.endsWith('.ts') ? '../process/development-cli-shim.ts' : '../process/development-cli-shim.js',
    import.meta.url,
  )));
  if (platform === 'win32') {
    const content = `@echo off\r\n"${quoteCommandValue(nodeExecutable)}" "${quoteCommandValue(shimScript)}" --data-root "${quoteCommandValue(dataRoot)}" --shim-dir "${quoteCommandValue(shimDir)}" -- %*\r\nexit /b %ERRORLEVEL%\r\n`;
    syncWrapperFile(shimDir, 'buildr.cmd', content, 0o644);
  } else {
    const content = `#!/bin/sh\nexec ${quoteShell(nodeExecutable)} ${quoteShell(shimScript)} --data-root ${quoteShell(dataRoot)} --shim-dir ${quoteShell(shimDir)} -- "$@"\n`;
    syncWrapperFile(shimDir, 'buildr', content, 0o755);
  }
  return {
    ...environment,
    PATH: prependPath(environment.PATH, shimDir, platform),
  };
}
