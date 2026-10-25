import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type test from 'node:test';
import type { VerifiedReadonlyResult } from '../../src/infrastructure/filesystem/verified-readonly-file.ts';

export function fixture(t: test.TestContext) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verified-read-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (relative: string, body: string) => { const file = path.join(directory, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); return file; };
  const request = (root: string, relative: string, maxBytes = 1024) => ({ root: path.join(directory, root), relative, maxBytes });
  return { directory, write, request };
}
export function body(result: VerifiedReadonlyResult): string { if (!result.ok) throw result.error; assert.equal(result.ok, true); return result.bytes.toString('utf8'); }
export function denied(result: VerifiedReadonlyResult): void { assert.equal(result.ok, false); if (result.ok) assert.fail('unproved body returned'); assert.equal(Reflect.get(result.error, 'code'), 'readonly_root_unconfirmed'); }
export function captureOpens(t: test.TestContext, before?: (file: string) => void) {
  const original = fs.openSync, opened = new Map<number, string>();
  const capture = t.mock.method(fs, 'openSync', ((...args: Parameters<typeof fs.openSync>) => { before?.(String(args[0])); const fd = Reflect.apply(original, fs, args); opened.set(fd, String(args[0])); return fd; }) as typeof fs.openSync);
  return { opened, restore: () => capture.mock.restore(), assertClosed: () => { for (const fd of opened.keys()) assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' }); } };
}
export function captureProbes(t: test.TestContext, transform?: (bytes: Buffer, args: string[], count: number) => Buffer) {
  const original = childProcess.execFileSync, calls: string[][] = [];
  const capture = t.mock.method(childProcess, 'execFileSync', ((file: any, args: any, options: any) => {
    const bytes = original(file, args, options);
    if (file !== '/usr/sbin/lsof') return bytes;
    calls.push(args); assert.equal(options.timeout, 250); assert.equal(options.maxBuffer, 256 * 1024);
    return transform ? transform(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), args, calls.length) : bytes;
  }) as typeof childProcess.execFileSync);
  syncBuiltinESMExports();
  return { calls, restore: () => { capture.mock.restore(); syncBuiltinESMExports(); } };
}
export function withoutDescriptor(bytes: Buffer, omitted: number): Buffer {
  let skip = false;
  return Buffer.from(bytes.toString('utf8').split('\0').filter(raw => {
    const field = raw.startsWith('\n') ? raw.slice(1) : raw;
    if (/^f\d+$/.test(field)) { skip = Number(field.slice(1)) === omitted; return !skip; }
    return !field.startsWith('n') || !skip;
  }).join('\0'));
}
