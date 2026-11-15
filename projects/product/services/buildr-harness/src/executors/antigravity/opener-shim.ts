import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface AntigravityOpenerShim {
  readonly directory: string;
  readonly openerScript: string;
  readCapturedUrl(): Promise<string | undefined>;
  dispose(): Promise<void>;
}

/** Redact query parameters and fragments from any auth URL before diagnostic logging. */
export function redactAuthUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const hasSensitiveTail = Boolean(parsed.search || parsed.hash);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return `${parsed.href}${hasSensitiveTail ? '?[redacted]' : ''}`;
  } catch {
    return '[redacted-url]';
  }
}

/**
 * Controlled opener shim prepended to PATH only for short-lived `agy` login child processes.
 * Captures the official HTTPS PKCE authorization URL into a private `0o600` file without
 * launching an uncontrolled host browser or touching credentials.
 */
export async function createAntigravityOpenerShim(
  temporaryRoot: string,
  attemptId: string,
): Promise<AntigravityOpenerShim> {
  const token = attemptId.replace(/[^A-Za-z0-9]/g, '').slice(0, 32) || randomUUID().replace(/-/g, '');
  const directory = path.join(temporaryRoot, `login-shim-${token}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);

  const captureFile = path.join(directory, 'captured-url.txt');
  const nodeExe = process.execPath;
  const captureRunner = path.join(directory, 'capture.mjs');

  const captureSource = [
    "import fs from 'node:fs';",
    `const target = ${JSON.stringify(captureFile)};`,
    'for (const arg of process.argv.slice(2)) {',
    "  if (typeof arg !== 'string' || !arg.startsWith('https://')) continue;",
    '  try {',
    '    const url = new URL(arg);',
    "    if (url.protocol === 'https:') {",
    '      const tmp = `${target}.${process.pid}`;',
    '      fs.writeFileSync(tmp, url.href, { mode: 0o600 });',
    '      fs.renameSync(tmp, target);',
    '      process.exit(0);',
    '    }',
    '  } catch {}',
    '}',
    'process.exit(0);',
    '',
  ].join('\n');
  await fs.writeFile(captureRunner, captureSource, { mode: 0o700 });

  const posixWrapper = `#!/bin/sh\nexec "${nodeExe.replace(/(["\\$`])/g, '\\$1')}" "${captureRunner.replace(/(["\\$`])/g, '\\$1')}" "$@"\n`;
  const openPath = path.join(directory, 'open');
  const xdgOpenPath = path.join(directory, 'xdg-open');
  await fs.writeFile(openPath, posixWrapper, { mode: 0o700 });
  await fs.writeFile(xdgOpenPath, posixWrapper, { mode: 0o700 });

  const winWrapper = `@echo off\r\n"${nodeExe}" "${captureRunner}" %*\r\n`;
  const rundllPath = path.join(directory, 'rundll32.cmd');
  await fs.writeFile(rundllPath, winWrapper, { mode: 0o700 });

  return {
    directory,
    openerScript: process.platform === 'win32' ? rundllPath : process.platform === 'darwin' ? openPath : xdgOpenPath,
    async readCapturedUrl(): Promise<string | undefined> {
      try {
        const stat = await fs.lstat(captureFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 16_384) return undefined;
        const raw = (await fs.readFile(captureFile, 'utf8')).trim();
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
        return parsed.href;
      } catch {
        return undefined;
      }
    },
    async dispose(): Promise<void> {
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
