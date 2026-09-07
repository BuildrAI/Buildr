import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function sha256(value: any): any  {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha512Integrity(value: any): any  {
  return `sha512-${crypto.createHash('sha512').update(value).digest('base64')}`;
}

export function readJson(file: any, label: any = path.basename(file)): any  {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error: any) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

export function writeJson(file: any, value: any): any  {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(file: any, value: any): any  {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

export function run(executable: any, args: any, options: any = {}): any  {
  const result: any = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error) throw new Error(`${options.label ?? executable} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail: any = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${options.label ?? executable} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function copyDirectory(source: any, destination: any): any  {
  const sourceStat: any = fs.statSync(source, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory()) throw new Error(`Required directory is missing: ${source}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a: any, b: any) => a.name.localeCompare(b.name))) {
    const from: any = path.join(source, entry.name);
    const to: any = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`Unsupported payload entry type: ${from}`);
  }
}

export function directoryInventory(root: any): any  {
  const files: any[] = [];
  function visit(current: any): any  {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a: any, b: any) => a.name.localeCompare(b.name))) {
      const absolute: any = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const stat: any = fs.statSync(absolute);
        const bytes: any = fs.readFileSync(absolute);
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          size: stat.size,
          mode: stat.mode & 0o777,
          sha256: sha256(bytes),
        });
      } else if (entry.isSymbolicLink()) {
        const target: any = fs.readlinkSync(absolute);
        const bytes: any = Buffer.from(target, 'utf8');
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          type: 'symlink',
          linkTarget: target,
          size: bytes.length,
          mode: 0o777,
          sha256: sha256(bytes),
        });
      } else {
        throw new Error(`Unsupported inventory entry type: ${absolute}`);
      }
    }
  }
  visit(root);
  return files;
}

export function inventorySize(files: any): any  {
  return files.reduce((total: any, entry: any) => total + entry.size, 0);
}

export function parseArguments(argv: any): any  {
  const positionals: any[] = [];
  const options: any = new Map();
  for (let index: any = 0; index < argv.length; index += 1) {
    const value: any = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals: any = value.indexOf('=');
    if (equals !== -1) {
      const name: any = value.slice(2, equals);
      const item: any = value.slice(equals + 1);
      options.set(name, [...(options.get(name) ?? []), item]);
      continue;
    }
    const name: any = value.slice(2);
    const next: any = argv[index + 1];
    if (!next || next.startsWith('--')) options.set(name, [...(options.get(name) ?? []), true]);
    else {
      options.set(name, [...(options.get(name) ?? []), next]);
      index += 1;
    }
  }
  return {
    positionals,
    option(name: any, fallback: any = undefined): any  {
      const values: any = options.get(name);
      return values?.at(-1) ?? fallback;
    },
    options(name: any): any  {
      return options.get(name) ?? [];
    },
    has(name: any): any  {
      return options.has(name);
    },
  };
}

export function requireOption(parsed: any, name: any): any  {
  const value: any = parsed.option(name);
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required --${name}.`);
  return value;
}

export function assertRelativeFilename(value: any, label: any = 'filename'): any  {
  if (typeof value !== 'string' || !value || path.basename(value) !== value || value.includes('\\')) {
    throw new Error(`${label} must be a basename.`);
  }
  return value;
}

export function assertSha256(value: any, label: any = 'SHA-256'): any  {
  if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}

export function fileEvidence(file: any): any  {
  const bytes: any = fs.readFileSync(file);
  return { filename: path.basename(file), size: bytes.length, sha256: sha256(bytes) };
}
