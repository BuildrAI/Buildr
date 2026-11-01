import assert from 'node:assert/strict';
import test from 'node:test';
import { ProgramUpdates, compareVersions } from '../../src/application/program-updates.ts';
import type { AgentProgramManager, ConnectionView } from '../../src/contracts.ts';

const connection = (id: string, executable: string | undefined = '/fixture/' + id): ConnectionView => ({
  id, provider: id, label: id, revision: 'one', executable, enabled: true, status: 'ready', models: [],
  capabilities: { text: true, images: false, approval: false, questions: false, stop: true, resume: true, maxInputBytes: 100 },
});
const manager = (version = '0.163.0'): AgentProgramManager => ({
  async discover(input) { return { candidates: [{ executable: input.boundExecutable!, source: 'configured', label: 'bound', version, compatible: true }], installation: {label: 'unused',version:'0.0.0',url:'unused',canInstall:false} }; },
  async install() { assert.fail('a check must not install'); },
});

test('SemVer order includes prereleases, builds, numeric identifiers and invalid versions', () => {
  for (const [a, b, expected] of [
    ['0.163.0', '0.164.0', -1], ['1.0.0-rc.2', '1.0.0-rc.10', -1], ['1.0.0-rc.2', '1.0.0', -1],
    ['1.0.0', '1.0.0-rc.2', 1], ['1.0.0+build', '1.0.0', 0], ['1.0.0-alpha', '1.0.0-1', 1],
    ['1.0.0-rc', '1.0.0-rc.1', -1], ['01.0.0', '1.0.0', null], ['1.0.0-01', '1.0.0', null],
  ] as const) assert.equal(compareVersions(a, b), expected, a + ' vs ' + b);
});

test('read is network-free; checks only bound paths, does not install, and shares observations', async () => {
  const view = connection('codex'), before = structuredClone(view); let calls = 0;
  const programs = manager(); const discover = programs.discover;
  programs.discover = input => { assert.equal(input.boundExecutable, view.executable); assert.equal(input.executable, undefined); return discover(input); };
  const updates = new ProgramUpdates(() => [view], programs, () => '2026-10-30T00:00:00Z', async () => { calls++; return {latestVersion:'0.164.0',source:'https://registry.npmjs.org/'}; });
  assert.equal(updates.list().programs[0]!.status, 'unchecked'); assert.equal(calls, 0);
  const result = await updates.check(); assert.equal(result.programs[0]!.status, 'available');
  assert.deepEqual(updates.list(), result); assert.deepEqual(view, before); assert.equal(calls, 1);
});

test('one failed upstream does not lose another result, and no lower target is offered', async () => {
  const updates = new ProgramUpdates(() => [connection('codex'), connection('dsh')], manager(), undefined, async provider => {
    if (provider === 'dsh') throw new Error('token=not-public');
    return {latestVersion:'0.162.0',source:'https://registry.npmjs.org/'};
  });
  const result = (await updates.check()).programs;
  assert.equal(result[0]!.status, 'ahead'); assert.equal(result[1]!.status, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /token/);
});

test('Qoder compares the SDK release, not the native program version; unknown metadata stays unknown', async () => {
  for (const currentReleaseVersion of ['1.0.55', undefined]) {
    const updates = new ProgramUpdates(() => [connection('qoder')], manager('1.1.75'), undefined,
      async () => ({latestVersion:'1.0.56',currentReleaseVersion,source:'https://registry.npmjs.org/'}));
    const value = (await updates.check()).programs[0]!;
    assert.equal(value.status, currentReleaseVersion ? 'available' : 'unknown');
    assert.equal(value.currentReleaseVersion, currentReleaseVersion);
    assert.equal(value.currentVersion, '1.1.75'); assert.equal(value.versionKind, 'package');
  }
});

test('duplicate requests coalesce and drift cannot overwrite the current binding', async () => {
  let view = connection('codex'), release!: () => void, calls = 0;
  const updates = new ProgramUpdates(() => [view], manager(), undefined, async () => {
    calls++; await new Promise<void>(resolve => {release = resolve;}); return {latestVersion:'0.164.0',source:'https://registry.npmjs.org/'};
  });
  const first = updates.check(), second = updates.check();
  // The fake program discovery yields once before the fake network request.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); view = {...view,revision:'two',executable:'/fixture/new'}; release();
  assert.equal((await first).programs[0]!.status, 'stale'); assert.equal((await second).programs[0]!.status, 'stale');
  assert.equal(updates.list().programs[0]!.status, 'unchecked');
});

test('unbound programs are explicitly not connected and never probed', async () => {
  const programs = manager(); programs.discover = async () => assert.fail('no binding');
  const updates = new ProgramUpdates(() => [{...connection('codex'),executable:undefined}], programs);
  assert.equal((await updates.check()).programs[0]!.status, 'not-connected');
});


test('an unsupported executor is an independent unknown, not a failure of the whole list',async()=>{
  const updates=new ProgramUpdates(()=>[connection('custom'),connection('codex')],manager(),undefined,async provider=>{if(provider==='custom')throw new Error('unsupported');return{latestVersion:'0.163.0',source:'https://registry.npmjs.org/'};});
  const values=(await updates.check()).programs;assert.equal(values[0]!.status,'unknown');assert.equal(values[1]!.status,'latest');
});
