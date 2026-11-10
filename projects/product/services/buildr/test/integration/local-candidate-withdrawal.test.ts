import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createPackageHandoff, createPackageHandoffCommit, LOCAL_PACKAGE_MODEL, LOCAL_PLATFORM_POLICY } from '../../../../../../skills/buildr-release/scripts/local-package-handoff.ts';
import { withdrawLocalCandidate } from '../../../../../../skills/buildr-release/scripts/local-candidate-withdrawal.ts';
import { normalizeReleaseTargets } from '../../../../../../skills/buildr-release/scripts/release-targets.ts';
import { compactReleaseOperation, runReleaseOperation } from '../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts';

const hash = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
function fixture(t: any) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-withdrawal-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '--quiet']); git(['config', 'user.name', 'Withdrawal fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(repo, 'product'), 'original source'); git(['add', 'product']); git(['commit', '--quiet', '-m', 'source']);
  const source = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']);
  const original = Buffer.from('one unchanged original');
  const files = ['candidate-package/one.tgz', 'candidate-package/release-artifact.json', 'candidate-package/npm-pack.json', 'source-verification.json', 'artifact-verification.json'].map((name, index) => {
    const file = path.join(root, `file-${index}`); fs.writeFileSync(file, index === 0 ? original : '{}'); return { path: name, source: file };
  });
  const handoffDirectory = path.join(root, 'handoff');
  const manifest = createPackageHandoff({ output: handoffDirectory, sourceCommit: source, sourceTree: tree, platform: 'darwin',
    artifactSha256: hash(original), files, platformPolicy: LOCAL_PLATFORM_POLICY });
  const data = createPackageHandoffCommit(repo, handoffDirectory);
  const key = '0.1.0-rc.999', branch = `codex/release-main-${key}-g1`, dataBranch = `${branch}-input-${manifest.artifactSha256.slice(0, 12)}`;
  const remote = path.join(root, 'remote.git'); execFileSync('git', ['init', '--bare', '--quiet', remote]); git(['remote', 'add', 'origin', remote]);
  for (const [name, commit] of [[branch, source], [dataBranch, data.commit], [`release-${key}`, source]]) git(['push', '--quiet', 'origin', `${commit}:refs/heads/${name}`]);
  const state: any = { workspace: repo, version: key, executionModel: LOCAL_PACKAGE_MODEL,
    localPackage: { status: 'ready', handoffIdentity: manifest.identity, artifactSha256: manifest.artifactSha256 },
    candidate: { runId: 100, sourceCommit: source, branch, packageData: { branch: dataBranch, commit: data.commit, identity: manifest.identity } }, publication: null };
  const zip = Buffer.from('PKfixture-archive');
  const control: any = { runStatus: 'completed', runAttempt: 1, pull: false, active: false, adopted: false,
    main: 'b'.repeat(40), public: false, history: [], registry: 404, failDelete: false, lostDelete: false, failDownload: false,
    artifacts: [{ id: 111, name: 'candidate-package', size_in_bytes: zip.length, digest: `sha256:${hash(zip)}`, expired: false, workflow_run: { id: 100 } }], deletes: [], saves: 0 };
  const gh = (args: string[]) => {
    const endpoint = args.at(-1)!;
    if (args.includes('DELETE')) {
      control.deletes.push(endpoint);
      if (control.failDelete) throw new Error('response lost before effect');
      control.artifacts = [];
      if (control.lostDelete) throw new Error('response lost after effect');
      return '';
    }
    if (args[0] === 'run') return 'retained run log';
    if (endpoint === 'repos/BuildrAI/Buildr') return JSON.stringify({ full_name: 'BuildrAI/Buildr', private: false });
    if (endpoint.includes('/git/ref/tags/') || endpoint.includes('/releases/tags/')) {
      if (control.public) return '{}';
      throw Object.assign(new Error('Not Found'), { diagnostic: { httpStatus: 404 } });
    }
    if (endpoint.includes('/actions/workflows/')) return JSON.stringify([{ workflow_runs: control.history }]);
    if (endpoint.includes('/compare/')) return JSON.stringify({ status: control.adopted ? 'ahead' : 'diverged', base_commit: { sha: source } });
    if (endpoint.endsWith('/commits/main')) return JSON.stringify({ sha: control.main });
    if (endpoint.includes('/pulls?')) return JSON.stringify([control.pull ? [{ number: 1, state: control.pull === 'merged' ? 'closed' : 'open', merged_at: control.pull === 'merged' ? '2026-11-10T00:00:00Z' : null }] : []]);
    if (endpoint.includes('/actions/runs?branch=')) return JSON.stringify([{ workflow_runs: control.active ? [{ status: 'in_progress' }] : [] }]);
    if (endpoint.includes('/artifacts?')) return JSON.stringify([{ artifacts: control.artifacts }]);
    if (endpoint.endsWith('/actions/runs/100')) return JSON.stringify({ id: 100, repository: { full_name: 'BuildrAI/Buildr' },
      path: '.github/workflows/verify.yml', event: 'workflow_dispatch', head_sha: source, head_branch: branch,
      status: control.runStatus, run_attempt: control.runAttempt });
    throw new Error(`Unexpected fixture request: ${args.join(' ')}`);
  };
  const owners: any = { git: (args: string[]) => args[0] === 'remote' && args[1] === 'get-url' ? 'https://github.com/BuildrAI/Buildr.git' : git(args), gh, save: () => { control.saves++; }, effects: [],
    fetchImpl: async () => new Response(control.registry === 404 ? '' : '{}', { status: control.registry }),
    execute: (command: string, args: string[], settings: any) => {
      if (command === 'gh') {
        if (control.failDownload) return { status: 1 };
        fs.writeSync(settings.stdio[1], zip); return { status: 0 };
      }
      return spawnSync(command, args, { ...settings, encoding: 'utf8' });
    } };
  return { root, repo, git, state, key, owners, control, original, branch, source };
}
async function plan(f: ReturnType<typeof fixture>) {
  const result = await withdrawLocalCandidate(f.state, f.key, {}, f.owners);
  assert.equal(result.status, 'withdrawal-planned', JSON.stringify(result)); return result.plan;
}
async function execute(f: ReturnType<typeof fixture>, observed: any) {
  return withdrawLocalCandidate(f.state, f.key, { authorized: true, planIdentity: observed.identity }, f.owners);
}

test('withdrawal plan is read-only; execution preserves exact bytes, source bundle and logs before leased cleanup; repeat is idempotent', async t => {
  const f = fixture(t), observed = await plan(f);
  assert.equal(f.control.saves, 0); assert.equal(f.state.withdrawal, undefined); assert.equal(fs.existsSync(path.join(f.repo, '.buildr')), false);
  assert.equal(compactReleaseOperation({ plan: observed }).plan.identity, observed.identity);
  const completed = await execute(f, observed);
  assert.equal(completed.status, 'candidate-withdrawn', JSON.stringify(completed));
  const retained = completed.withdrawal.preservation.directory;
  assert.deepEqual(fs.readFileSync(path.join(retained, 'original/candidate-package/one.tgz')), f.original);
  assert.match(f.git(['bundle', 'list-heads', path.join(retained, 'source.bundle')]), new RegExp(f.source));
  assert.equal(fs.readFileSync(path.join(retained, 'run.log'), 'utf8'), 'retained run log');
  assert.equal(f.git(['ls-remote', 'origin', 'refs/heads/*']), ''); assert.equal(f.control.deletes.length, 1);
  assert.equal((await execute(f, observed)).status, 'candidate-withdrawn'); assert.equal(f.control.deletes.length, 1);
});
for (const [name, mutate] of Object.entries({
  'active candidate': (f: any) => { f.control.runStatus = 'in_progress'; },
  'open PR': (f: any) => { f.control.pull = true; },
  'squash-merged PR': (f: any) => { f.control.pull = 'merged'; },
  'other active run': (f: any) => { f.control.active = true; },
  'main adoption': (f: any) => { f.control.adopted = true; },
  'public tag': (f: any) => { f.control.public = true; },
  'public npm': (f: any) => { f.control.registry = 200; },
  'unknown registry': (f: any) => { f.control.registry = 401; },
  'prior public request': (f: any) => { f.control.history = [{ display_title: `Release ${f.key} (request)`, status: 'completed' }]; },
  'unknown dispatch': (f: any) => { delete f.state.candidate.runId; },
  'local public intent': (f: any) => { f.state.publication = { requested: true }; },
  'wrong owner': (f: any) => { f.state.candidate.packageData.branch = 'task/other'; },
  'expired artifact': (f: any) => { f.control.artifacts[0].expired = true; },
})) test(`withdrawal refuses ${name} without writes`, async t => {
  const f = fixture(t); mutate(f);
  const result = await withdrawLocalCandidate(f.state, f.key, {}, f.owners);
  assert.equal(result.status, 'withdrawal-blocked'); assert.equal(f.control.saves, 0); assert.equal(f.control.deletes.length, 0);
});
test('withdrawal requires the exact plan and rechecks drift before taking ownership', async t => {
  const f = fixture(t), observed = await plan(f);
  assert.equal((await execute(f, { identity: 'wrong' })).status, 'withdrawal-blocked'); assert.equal(f.state.withdrawal, undefined);
  f.control.main = 'c'.repeat(40);
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.state.withdrawal, undefined);
});
test('preservation failure leaves all remote resources intact and resumes only the same withdrawal', async t => {
  const f = fixture(t), observed = await plan(f); f.control.failDownload = true;
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked');
  assert.equal(f.control.deletes.length, 0); assert.ok(f.git(['ls-remote', 'origin', `refs/heads/${f.branch}`]));
  f.control.failDownload = false; assert.equal((await execute(f, observed)).status, 'candidate-withdrawn');
});
test('unknown delete is not replayed; later absence is adopted without another delete request', async t => {
  const f = fixture(t), observed = await plan(f); f.control.failDelete = true;
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.control.deletes.length, 1);
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.control.deletes.length, 1);
  f.control.artifacts = [];
  assert.equal((await execute(f, observed)).status, 'candidate-withdrawn'); assert.equal(f.control.deletes.length, 1);
});
test('lost response after artifact deletion is resolved by actual readback', async t => {
  const f = fixture(t), observed = await plan(f); f.control.lostDelete = true;
  assert.equal((await execute(f, observed)).status, 'candidate-withdrawn'); assert.equal(f.control.deletes.length, 1);
});
test('preserved bytes cannot drift and authorize further cleanup', async t => {
  const f = fixture(t), observed = await plan(f); f.control.failDelete = true; await execute(f, observed);
  fs.appendFileSync(path.join(f.state.withdrawal.preservation.directory, 'run.log'), 'changed');
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.control.deletes.length, 1);
});
test('operation controller blocks prepare, resume and publication after withdrawal intent', async t => {
  const f = fixture(t), observed = await plan(f); f.control.failDownload = true; await execute(f, observed);
  const common = f.git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  fs.mkdirSync(path.join(common, 'buildr/release-operations'), { recursive: true });
  fs.writeFileSync(path.join(common, 'buildr/release-operations', `${f.key}.json`), JSON.stringify(f.state));
  for (const action of ['prepare', 'resume', 'publish']) {
    const result = await runReleaseOperation({ action, workspace: f.repo, version: f.key, authorized: true }, {
      execute: (command: string, args: string[], settings: any) => {
        assert.equal(command, 'git'); assert.equal(args[0], 'rev-parse', 'blocked operation must not dispatch, prepare or recreate refs');
        return spawnSync(command, args, { ...settings, encoding: 'utf8' });
      },
    });
    assert.equal(result.status, 'candidate-withdrawal-active');
  }
});


test('drifted remote tip and a different remote identity cannot be deleted', async t => {
  const f = fixture(t), observed = await plan(f);
  fs.writeFileSync(path.join(f.repo, 'product'), 'new source'); f.git(['commit', '-am', 'other work', '--quiet']);
  f.git(['push', '--quiet', 'origin', `HEAD:refs/heads/${f.branch}`]);
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.state.withdrawal, undefined);
  const git = f.owners.git;
  f.owners.git = (args: string[]) => args[0] === 'remote' ? 'https://github.com/other/repo.git' : git(args);
  assert.equal((await withdrawLocalCandidate(f.state, f.key, {}, f.owners)).status, 'withdrawal-blocked');
  assert.equal(f.control.deletes.length, 0);
});

test('new artifacts and changed run attempts are refused during continuation', async t => {
  const f = fixture(t), observed = await plan(f); f.control.failDelete = true; await execute(f, observed);
  f.control.artifacts.push({ ...f.control.artifacts[0], id: 222 });
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.control.deletes.length, 1);
  f.control.artifacts.pop(); f.control.runAttempt = 2;
  assert.equal((await execute(f, observed)).status, 'withdrawal-blocked'); assert.equal(f.control.deletes.length, 1);
});

test('independent plugin withdrawal observes the actual official package and plugin public request', async t => {
  const f = fixture(t), urls: string[] = [];
  f.state.targets = normalizeReleaseTargets({ packages: 'dsh-plugin', pluginVersion: '0.1.0-rc.999', selectionId: f.key });
  f.state.version = null;
  f.owners.fetchImpl = async (url: string) => { urls.push(url); return new Response('', { status: 404 }); };
  await plan(f);
  assert.ok(urls[0].includes(encodeURIComponent('@buildr-ai/buildr-dsh-plugin')));
  f.control.history = [{ display_title: 'DSH publish 0.1.0-rc.999', status: 'completed' }];
  assert.equal((await withdrawLocalCandidate(f.state, f.key, {}, f.owners)).status, 'withdrawal-blocked');
  assert.equal(f.control.deletes.length, 0);
});


test('real withdrawal CLI reports a rejected read-only plan with a failing exit status and no new state', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../../../../skills/buildr-release/scripts/release-orchestration-runner.ts'),
    'withdraw', '--workspace', f.repo, '--version', f.key], { encoding: 'utf8', timeout: 20_000 });
  assert.ifError(result.error); assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'withdrawal-blocked');
  assert.equal(fs.existsSync(path.join(f.repo, '.buildr')), false);
  const common = f.git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  assert.equal(fs.existsSync(path.join(common, 'buildr/release-operations', `${f.key}.json`)), false);
});
