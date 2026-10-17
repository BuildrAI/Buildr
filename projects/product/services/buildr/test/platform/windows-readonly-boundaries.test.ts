import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { readVerifiedReadonlyBatch, readVerifiedReadonlyBytes, VERIFIED_READONLY_BATCH_SIZE } from '../../src/infrastructure/filesystem/verified-readonly-file.ts';
import { WINDOWS_READONLY_SCRIPT, WINDOWS_READONLY_TIMEOUT_MS } from '../../src/infrastructure/filesystem/verified-readonly-file-windows.ts';
import { readSkillTexts } from '../../src/modules/agent-assets/persistence/skill-content-repository.ts';
import { fixture, body, denied } from '../helpers/verified-readonly-fixture.ts';

const native = { skip: process.platform !== 'win32', timeout: 20_000 };
const beforeLeaf = '// Test instrumentation may pause here while real Windows paths change.';
const beforeRead = '// All root and leaf handles remain held across the entire before/read/after stage.';

// Instrument only the production script's pause points; all Win32 calls, real
// processes and files remain real. No production option enables this behavior.
function instrument(t: test.TestContext, transform: (script: string) => string, timeout?: number) {
  const original = childProcess.execFileSync;
  const captured = t.mock.method(childProcess, 'execFileSync', ((file: any, args: any, options: any) => {
    const slot = args.indexOf('-EncodedCommand');
    if (slot < 0) return original(file, args, options);
    assert.equal(Buffer.from(args[slot + 1], 'base64').toString('utf16le'), WINDOWS_READONLY_SCRIPT);
    const changed = [...args]; changed[slot + 1] = Buffer.from(transform(WINDOWS_READONLY_SCRIPT), 'utf16le').toString('base64');
    return original(file, changed, { ...options, ...(timeout === undefined ? {} : { timeout }) });
  }) as typeof childProcess.execFileSync);
  syncBuiltinESMExports();
  return () => { captured.mock.restore(); syncBuiltinESMExports(); };
}

function pause(script: string, marker: string, ready: string, done: string): string {
  assert.equal(script.split(marker).length, 2);
  return script.replace(marker, `${marker}\n${marker === beforeLeaf ? 'if (index == 0)' : ''} {
    File.WriteAllText(${JSON.stringify(ready)}, "ready");
    for (int wait = 0; wait < 400 && !File.Exists(${JSON.stringify(done)}); wait++) System.Threading.Thread.Sleep(10);
    Require(File.Exists(${JSON.stringify(done)}));
  }`);
}

function attacker(t: test.TestContext, ready: string, done: string, action: string) {
  const code = `const fs=require('node:fs'); const started=Date.now();
    const tick=()=>{ if(!fs.existsSync(${JSON.stringify(ready)})){if(Date.now()-started>12000)process.exit(2);return setTimeout(tick,5);}
      let value;try{value=(()=>{${action}})();}catch(error){value={unexpected:String(error),code:error.code};}
      fs.writeFileSync(${JSON.stringify(done)},JSON.stringify(value));};tick();`;
  const child = childProcess.spawn(process.execPath, ['-e', code], { stdio: 'ignore', windowsHide: true });
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGKILL');
    if (child.exitCode === null) await new Promise(resolve => child.once('close', resolve));
  });
}

test('Windows actual handles read Unicode, exact bounds and sixteen independent roots in order', native, t => {
  const f = fixture(t);
  const requests = Array.from({ length: VERIFIED_READONLY_BATCH_SIZE }, (_, index) => {
    f.write(`根 空格${index}/目录/内容.md`, index === 0 ? '' : `内容 ${index}`);
    return f.request(`根 空格${index}`, '目录/内容.md');
  });
  type Phase = 'first-call' | 'multi-file-batch' | 'repeat-call' | 'exact-byte-limit' | 'over-byte-limit';
  const samples: Array<{ phase: Phase; requestCount: number; elapsedMs: number; acceptedCount: number | null; deniedCount: number | null }> = [];
  const calls: Array<{ phase: Phase; requestCount: number; elapsedMs: number; timeoutMs: number | null;
    outcome: 'completed' | 'failed'; errorCode: string | null; exitCode: number | null; signal: string | null; outputBytes: number | null;
    systemPowerShell: boolean; noProfile: boolean }> = [];
  let currentPhase: Phase = 'first-call', requestCount = 0;
  const original = childProcess.execFileSync;
  const captured = t.mock.method(childProcess, 'execFileSync', ((file: any, args: any, options: any) => {
    const started = performance.now();
    let failure: any = null, output: any = null;
    try { output = original(file, args, options); return output; }
    catch (error) { failure = error; throw error; }
    finally {
      // Deliberately omit argv, paths, input, stdout/stderr and error messages.
      const knownCode = ['ETIMEDOUT', 'ENOBUFS', 'ENOENT', 'EACCES', 'EPERM', 'EINVAL'];
      const knownSignal = ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT'];
      calls.push({ phase: currentPhase, requestCount, elapsedMs: performance.now() - started,
        timeoutMs: Number.isSafeInteger(options?.timeout) ? options.timeout : null,
        outcome: failure === null ? 'completed' : 'failed',
        errorCode: failure === null ? null : knownCode.includes(failure.code) ? failure.code : failure.code == null ? null : 'unknown',
        exitCode: failure === null ? 0 : Number.isInteger(failure.status) ? failure.status : null,
        signal: failure?.signal == null ? null : knownSignal.includes(failure.signal) ? failure.signal : 'unknown',
        outputBytes: Buffer.isBuffer(output) ? output.length : null,
        systemPowerShell: file === path.join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        noProfile: Array.isArray(args) && args.includes('-NoProfile') });
    }
  }) as typeof childProcess.execFileSync);
  syncBuiltinESMExports();
  t.after(() => {
    captured.mock.restore(); syncBuiltinESMExports();
    const record = { schemaVersion: 'buildr.windows-readonly-cost/v1', kind: 'windows-readonly-cost', samples, calls,
      node: { version: process.versions.node, platform: process.platform, arch: process.arch },
      helperTimeoutMs: WINDOWS_READONLY_TIMEOUT_MS,
      persistentOwner: false, compilationPerCall: true };
    t.diagnostic(JSON.stringify(record));
    const output = process.env.BUILDR_DIAGNOSTICS_OUTPUT;
    if (output) {
      try {
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, 'windows-readonly-cost.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      } catch {
        // The TAP diagnostic above still holds the record. Optional persistence
        // must neither overwrite an earlier sample nor replace the test result.
        t.diagnostic('windows-readonly-cost persistence unavailable; original test result retained');
      }
    }
  });
  const timed = (phase: Phase, selected: typeof requests) => {
    currentPhase = phase; requestCount = selected.length;
    const started = performance.now();
    let acceptedCount: number | null = null, deniedCount: number | null = null;
    try {
      const values = readVerifiedReadonlyBatch(selected);
      acceptedCount = values.filter(value => value.ok).length; deniedCount = values.length - acceptedCount;
      return values.map(body);
    } finally { samples.push({ phase, requestCount: selected.length, elapsedMs: performance.now() - started, acceptedCount, deniedCount }); }
  };
  assert.deepEqual(timed('first-call', requests.slice(1, 2)), ['内容 1']);
  assert.deepEqual(timed('multi-file-batch', requests), requests.map((_, index) => index === 0 ? '' : `内容 ${index}`));
  assert.deepEqual(timed('repeat-call', requests.slice(1, 2)), ['内容 1']);
  assert.deepEqual(readVerifiedReadonlyBatch([]), []);
  assert.throws(() => readVerifiedReadonlyBatch([...requests, requests[0]!]), { code: 'readonly_root_unconfirmed' });
  f.write('exact/a.md', '12345');
  currentPhase = 'exact-byte-limit'; requestCount = 1;
  assert.equal(readVerifiedReadonlyBytes(path.join(f.directory, 'exact'), 'a.md', 5).toString(), '12345');
  currentPhase = 'over-byte-limit';
  assert.throws(() => readVerifiedReadonlyBytes(path.join(f.directory, 'exact'), 'a.md', 4), { code: 'readonly_root_unconfirmed' });
  assert.deepEqual(calls.map(call => [call.phase, call.requestCount]), [
    ['first-call', 1], ['multi-file-batch', VERIFIED_READONLY_BATCH_SIZE], ['repeat-call', 1],
    ['exact-byte-limit', 1], ['over-byte-limit', 1],
  ], 'the observer records every real native call, while empty and invalid batches start no child');
  assert.ok(calls.every(call => call.systemPowerShell && call.noProfile && call.timeoutMs === WINDOWS_READONLY_TIMEOUT_MS));
  // A successful read must close roots as well as leaves, including all 32 handles.
  for (let index = 0; index < requests.length; index++) fs.renameSync(requests[index]!.root, `${requests[index]!.root}-closed`);
});

test('Windows reparse roots and intermediate junctions cannot disclose outside bytes or suppress a good root', native, t => {
  const f = fixture(t); f.write('left/good.md', 'safe'); f.write('foreign/private.md', 'FOREIGN_NEVER_READ');
  fs.symlinkSync(path.join(f.directory, 'foreign'), path.join(f.directory, 'root-junction'), 'junction');
  fs.symlinkSync(path.join(f.directory, 'foreign'), path.join(f.directory, 'left/outside'), 'junction');
  fs.mkdirSync(path.join(f.directory, 'left/directory.md'));
  const values = readVerifiedReadonlyBatch([
    f.request('root-junction', 'private.md'), f.request('left', 'outside/private.md'),
    f.request('left', 'directory.md'), f.request('left', 'missing.md'),
    f.request('left', '../foreign/private.md'), f.request('left', 'good.md:stream'),
    f.request('left', 'good.md'),
  ]);
  values.slice(0, -1).forEach(denied); assert.equal(body(values.at(-1)!), 'safe');
  assert.equal(JSON.stringify(values).includes('FOREIGN_NEVER_READ'), false);
  fs.rmSync(path.join(f.directory, 'root-junction'), { recursive: true });
  fs.rmSync(path.join(f.directory, 'left/outside'), { recursive: true });
  assert.equal(fs.readFileSync(path.join(f.directory, 'foreign/private.md'), 'utf8'), 'FOREIGN_NEVER_READ');
});

test('Windows leaf symlinks are rejected before returning their target body', native, t => {
  const f = fixture(t); const outside = f.write('foreign/a.md', 'FOREIGN_NEVER_READ'); f.write('left/good.md', 'safe');
  try { fs.symlinkSync(outside, path.join(f.directory, 'left/link.md'), 'file'); }
  catch (error: any) { if (error.code === 'EPERM') { t.skip('Native Windows file-symlink privilege is unavailable; junction proof remains separate.'); return; } throw error; }
  const values = readVerifiedReadonlyBatch([f.request('left', 'link.md'), f.request('left', 'good.md')]);
  denied(values[0]!); assert.equal(body(values[1]!), 'safe');
});

test('Windows existing writers deny only their own file and releasing them restores strict reading', native, t => {
  const f = fixture(t), file = f.write('left/busy.md', 'busy'); f.write('right/good.md', 'independent');
  const writer = fs.openSync(file, 'r+');
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'busy.md'), f.request('right', 'good.md')]);
    denied(values[0]!); assert.equal(body(values[1]!), 'independent');
  } finally { fs.closeSync(writer); }
  assert.equal(readVerifiedReadonlyBytes(path.dirname(file), 'busy.md', 4).toString(), 'busy');
  fs.renameSync(path.dirname(file), `${path.dirname(file)}-closed`);
});

test('Windows a real intermediate-directory swap before leaf open reads no foreign bytes and remains local', native, t => {
  const f = fixture(t); f.write('left/nested/a.md', 'trusted'); f.write('foreign/a.md', 'FOREIGN_NEVER_READ'); f.write('right/a.md', 'independent');
  const ready = path.join(f.directory, 'ready'), done = path.join(f.directory, 'done'), reads = path.join(f.directory, 'reads');
  const restore = instrument(t, script => pause(script, beforeLeaf, ready, done).replace('Require(ReadFile(leaf.Handle, buffer, wanted, out count, IntPtr.Zero));', `File.AppendAllText(${JSON.stringify(reads)}, leaf.Index.ToString() + "\\n"); Require(ReadFile(leaf.Handle, buffer, wanted, out count, IntPtr.Zero));`));
  attacker(t, ready, done, `fs.renameSync(${JSON.stringify(path.join(f.directory, 'left/nested'))},${JSON.stringify(path.join(f.directory, 'left/nested-held'))});fs.symlinkSync(${JSON.stringify(path.join(f.directory, 'foreign'))},${JSON.stringify(path.join(f.directory, 'left/nested'))},'junction');return {changed:true};`);
  try {
    const values = readVerifiedReadonlyBatch([f.request('left', 'nested/a.md'), f.request('right', 'a.md')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(done, 'utf8')), { changed: true });
    denied(values[0]!); assert.equal(body(values[1]!), 'independent');
    assert.deepEqual([...new Set(fs.readFileSync(reads, 'utf8').trim().split('\n'))], ['1']);
    assert.equal(JSON.stringify(values).includes('FOREIGN_NEVER_READ'), false);
  } finally { restore(); }
});

test('Windows held root and leaf handles block real replacement and write attempts until proof completes', native, t => {
  const f = fixture(t), file = f.write('left/a.md', 'trusted');
  const ready = path.join(f.directory, 'ready'), done = path.join(f.directory, 'done');
  const restore = instrument(t, script => pause(script, beforeRead, ready, done));
  attacker(t, ready, done, `const codes=[];for(const action of [()=>fs.renameSync(${JSON.stringify(path.dirname(file))},${JSON.stringify(path.dirname(file) + '-moved')}),()=>fs.writeFileSync(${JSON.stringify(file)},'foreign')]){try{action();codes.push('unexpected-success');}catch(error){codes.push(error.code);}}return {codes};`);
  try {
    assert.equal(body(readVerifiedReadonlyBatch([f.request('left', 'a.md')])[0]!), 'trusted');
    const result = JSON.parse(fs.readFileSync(done, 'utf8'));
    assert.equal(result.codes.length, 2);
    for (const code of result.codes) assert.ok(['EACCES', 'EPERM', 'EBUSY'].includes(code), JSON.stringify(result));
    fs.writeFileSync(file, 'after');
    fs.renameSync(path.dirname(file), `${path.dirname(file)}-closed`);
  } finally { restore(); }
});

test('Windows native timeout returns no tentative bodies and the killed owner releases all held handles', native, t => {
  const f = fixture(t); const first = f.write('left/a.md', 'first'); f.write('right/a.md', 'second');
  const ready = path.join(f.directory, 'held-ready');
  const restore = instrument(t, script => script.replace(beforeRead, `${beforeRead}\nFile.WriteAllText(${JSON.stringify(ready)}, "ready"); System.Threading.Thread.Sleep(30000);`));
  try {
    const started = performance.now();
    readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('right', 'a.md')]).forEach(denied);
    assert.equal(fs.readFileSync(ready, 'utf8'), 'ready', 'the real native owner reached the held-handle stage before timeout');
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= WINDOWS_READONLY_TIMEOUT_MS * 0.9, 'an immediate rejection cannot stand in for the native deadline');
    assert.ok(elapsed < WINDOWS_READONLY_TIMEOUT_MS + 5_000);
    fs.renameSync(path.dirname(first), `${path.dirname(first)}-closed`);
    fs.renameSync(path.join(f.directory, 'right'), path.join(f.directory, 'right-closed'));
  } finally { restore(); }
});

test('Windows strict skill-source caller consumes independent native results without changing its public contract', native, t => {
  const f = fixture(t); f.write('first/SKILL.md', '# First'); f.write('second/refs/中文.md', '# Second');
  const values = readSkillTexts([{ directory: path.join(f.directory, 'first'), relative: 'SKILL.md' }, { directory: path.join(f.directory, 'first'), relative: 'missing.md' }, { directory: path.join(f.directory, 'second'), relative: 'refs/中文.md' }]);
  assert.equal(values[0]!.ok, true); assert.equal(values[1]!.ok, false); assert.equal(values[2]!.ok, true);
  if (values[0]!.ok) assert.equal(values[0]!.file.content, '# First');
  if (values[2]!.ok) assert.equal(values[2]!.file.content, '# Second');
});

test('Windows uncertain native close acknowledgement suppresses only its file or shared root', native, t => {
  const f = fixture(t); f.write('left/a.md', 'first'); f.write('left/b.md', 'second'); f.write('right/a.md', 'independent');
  for (const scope of ['file', 'root']) {
    const restore = instrument(t, script => script.replace('try { closed = CloseHandle(handle.DangerousGetHandle()); } catch { }',
      `try { closed = CloseHandle(handle.DangerousGetHandle()); } catch { }\nif (leaves.Exists(leaf => leaf.Index == 0 && Object.ReferenceEquals(leaf.${scope === 'file' ? 'Handle' : 'Root.Handle'}, handle))) closed = false;`));
    try {
      const values = readVerifiedReadonlyBatch([f.request('left', 'a.md'), f.request('left', 'b.md'), f.request('right', 'a.md')]);
      denied(values[0]!);
      if (scope === 'root') denied(values[1]!); else assert.equal(body(values[1]!), 'second');
      assert.equal(body(values[2]!), 'independent');
    } finally { restore(); }
  }
  fs.renameSync(path.join(f.directory, 'left'), path.join(f.directory, 'left-closed'));
});
