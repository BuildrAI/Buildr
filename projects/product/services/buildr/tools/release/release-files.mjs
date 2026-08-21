import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha512Integrity(value) {
  return `sha512-${crypto.createHash('sha512').update(value).digest('base64')}`;
}

export function readJson(file, label = path.basename(file)) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

export function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error) throw new Error(`${options.label ?? executable} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${options.label ?? executable} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function copyDirectory(source, destination) {
  const sourceStat = fs.statSync(source, { throwIfNoEntry: false });
  if (!sourceStat?.isDirectory()) throw new Error(`Required directory is missing: ${source}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`Unsupported payload entry type: ${from}`);
  }
}

export function directoryInventory(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        const bytes = fs.readFileSync(absolute);
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          size: stat.size,
          mode: stat.mode & 0o777,
          sha256: sha256(bytes),
        });
      } else if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(absolute);
        const bytes = Buffer.from(target, 'utf8');
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

export function inventorySize(files) {
  return files.reduce((total, entry) => total + entry.size, 0);
}

export function parseArguments(argv) {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    if (equals !== -1) {
      const name = value.slice(2, equals);
      const item = value.slice(equals + 1);
      options.set(name, [...(options.get(name) ?? []), item]);
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) options.set(name, [...(options.get(name) ?? []), true]);
    else {
      options.set(name, [...(options.get(name) ?? []), next]);
      index += 1;
    }
  }
  return {
    positionals,
    option(name, fallback = undefined) {
      const values = options.get(name);
      return values?.at(-1) ?? fallback;
    },
    options(name) {
      return options.get(name) ?? [];
    },
    has(name) {
      return options.has(name);
    },
  };
}

export function requireOption(parsed, name) {
  const value = parsed.option(name);
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required --${name}.`);
  return value;
}

export function assertRelativeFilename(value, label = 'filename') {
  if (typeof value !== 'string' || !value || path.basename(value) !== value || value.includes('\\')) {
    throw new Error(`${label} must be a basename.`);
  }
  return value;
}

export function assertSha256(value, label = 'SHA-256') {
  if (!/^[a-f0-9]{64}$/.test(value ?? '')) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}

export function fileEvidence(file) {
  const bytes = fs.readFileSync(file);
  return { filename: path.basename(file), size: bytes.length, sha256: sha256(bytes) };
}
