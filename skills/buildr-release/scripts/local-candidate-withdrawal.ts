import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOCAL_PACKAGE_MODEL, isCandidateVerificationWorkflow, validatePackageHandoff, restorePackageHandoff } from './local-package-handoff.ts';
import { requestReleaseJson } from './release-observation.ts';
import { containsCredentialMaterial } from './release-authority.ts';
import { MAIN_PACKAGE, PLUGIN_PACKAGE } from './package-compatibility.ts';
import { normalizeReleaseTargets } from './release-targets.ts';
import { releaseCarrierBranchFor, pushReleaseBranch } from './release-git-convergence.ts';

const repository = 'BuildrAI/Buildr';
const api = `repos/${repository}`;
const hash = (bytes: string | Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = (value: unknown) => `sha256-${hash(JSON.stringify(value))}`;
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value);
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const operationIdentity = ({ withdrawal: _withdrawal, ...state }: any) => identity(state);

interface Owners {
  git: (args: string[], cwd?: string) => string;
  gh: (args: string[], cwd?: string) => string;
  execute: (command: string, args: string[], options: any) => any;
  save: () => void;
  effects: any[];
  fetchImpl?: typeof fetch;
}

/** Only terminal, local-first candidates with no public/adoption intent are eligible.
 * Runs are never cancelled here; unknown requests retain their original recovery owner. */
async function observe(state: any, key: string, owners: Owners): Promise<any> {
  const { git, gh } = owners;
  assert(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)BuildrAI\/Buildr(?:\.git)?$/u.test(git(['remote', 'get-url', 'origin'])),
    'Withdrawal remote is not the official BuildrAI/Buildr repository.');
  assert(state.executionModel === LOCAL_PACKAGE_MODEL && state.localPackage?.status === 'ready', 'Only a retained local-first candidate can be withdrawn.');
  assert(!state.context && !state.transaction && !state.publicationAuthorization && !state.publicationEvidence
    && !state.publication && !Object.keys(state.packagePublications ?? {}).length
    && !state.preparation?.adoptionRequested,
  'Public or main-adoption intent exists; use its original recovery owner, not candidate withdrawal.');
  const candidate = state.candidate;
  assert(candidate && !candidate.repair && !candidate.queueCancellation && !candidate.queueRedispatch
    && !state.pluginPreparation, 'Repair, queue or plugin requests require their original readback before withdrawal.');
  assert(Number.isSafeInteger(candidate.runId) && candidate.runId > 0 && sha(candidate.sourceCommit)
    && sha(candidate.packageData?.commit), 'Candidate dispatch or package data identity is unconfirmed.');
  const generation = Number(/-g(\d+)$/u.exec(candidate.branch ?? '')?.[1]);
  const branch = releaseCarrierBranchFor(key, generation);
  assert(candidate.branch === branch && candidate.packageData.branch === `${branch}-input-${state.localPackage.artifactSha256.slice(0, 12)}`,
    'Candidate temporary references do not match this selection and generation.');
  const manifest = validatePackageHandoff(JSON.parse(git(['show', `${candidate.packageData.commit}:handoff.json`])));
  assert(manifest.identity === state.localPackage.handoffIdentity && manifest.identity === candidate.packageData.identity
    && manifest.sourceCommit === candidate.sourceCommit
    && (!state.localPackage.sourceCommit || state.localPackage.sourceCommit === candidate.sourceCommit)
    && (!state.sourceCommit || state.sourceCommit === candidate.sourceCommit) && manifest.artifactSha256 === state.localPackage.artifactSha256
    && git(['rev-parse', `${candidate.sourceCommit}^{tree}`]) === manifest.sourceTree, 'Candidate source, original bytes or handoff drifted.');
  const run = JSON.parse(gh(['api', `${api}/actions/runs/${candidate.runId}`]));
  assert(run.id === candidate.runId && run.repository?.full_name === repository && run.event === 'workflow_dispatch'
    && isCandidateVerificationWorkflow(run.path) && run.head_sha === candidate.sourceCommit && run.head_branch === branch
    && Number.isSafeInteger(run.run_attempt) && run.status === 'completed', 'Candidate run is active or has a different identity.');
  const comparison = JSON.parse(gh(['api', `${api}/compare/${candidate.sourceCommit}...main`]));
  assert(['behind', 'diverged'].includes(comparison.status) && sha(comparison.base_commit?.sha)
    && comparison.base_commit.sha === candidate.sourceCommit, 'Candidate is adopted by main or adoption cannot be determined.');
  const main = JSON.parse(gh(['api', `${api}/commits/main`]));
  assert(sha(main.sha), 'Main identity is unavailable.');
  // Pin comparison to the observed main, rather than trusting two moving reads.
  const exactComparison = JSON.parse(gh(['api', `${api}/compare/${candidate.sourceCommit}...${main.sha}`]));
  assert(['behind', 'diverged'].includes(exactComparison.status) && exactComparison.base_commit?.sha === candidate.sourceCommit, 'Candidate is already included in main.');
  const repo = JSON.parse(gh(['api', api]));
  assert(repo.full_name === repository && repo.private === false, 'Public repository identity is unavailable.');
  const targets = state.targets ?? normalizeReleaseTargets({ version: state.version });
  for (const name of targets.packages) {
    const version = targets.versions[name];
    const tag = name === 'buildr' ? `v${version}` : `dsh-plugin-v${version}`;
    for (const endpoint of [`${api}/git/ref/tags/${tag}`, `${api}/releases/tags/${tag}`]) {
      let missing = false;
      try { gh(['api', endpoint]); } catch (error: any) {
        if (error.diagnostic?.httpStatus !== 404) throw error;
        missing = true;
      }
      assert(missing, 'Public tag or Release exists; candidate withdrawal is not applicable.');
    }
    const npm = await requestReleaseJson(`https://registry.npmjs.org/${encodeURIComponent(name === 'buildr' ? MAIN_PACKAGE : PLUGIN_PACKAGE)}/${encodeURIComponent(version)}`, { fetchImpl: owners.fetchImpl });
    assert(npm.status === 404, 'This package version is already public.');
    const workflow = name === 'buildr' ? 'publish.yml' : 'publish-dsh-plugin.yml';
    const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `${api}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`]));
    assert(Array.isArray(pages) && pages.every(page => Array.isArray(page.workflow_runs)), 'Publication requests cannot be observed.');
    const title = name === 'buildr' ? `Release ${version}` : `DSH publish ${version}`;
    assert(!pages.flatMap(page => page.workflow_runs).some(run => typeof run.display_title !== 'string'
      || run.display_title === title || run.display_title.startsWith(`${title} (`)), 'A prior public request exists; resolve it with its original owner.');
  }
  const references = [branch, candidate.packageData.branch, `release-${key}`].map(name => {
    const ref = `refs/heads/${name}`;
    const lines = git(['ls-remote', 'origin', ref]).split('\n').filter(Boolean);
    assert(lines.length <= 1 && (!lines.length || lines[0].split(/\s/u)[1] === ref), 'Remote ref readback is ambiguous.');
    const commit = lines.length ? lines[0].split(/\s/u)[0] : null;
    const expected = name === candidate.packageData.branch ? candidate.packageData.commit : candidate.sourceCommit;
    assert(commit === null || commit === expected, `Temporary ref drift: ${ref}`);
    const pulls = JSON.parse(gh(['api', '--paginate', '--slurp', `${api}/pulls?state=all&head=BuildrAI:${encodeURIComponent(name)}&per_page=100`]));
    const runs = JSON.parse(gh(['api', '--paginate', '--slurp', `${api}/actions/runs?branch=${encodeURIComponent(name)}&per_page=100`]));
    assert(Array.isArray(pulls) && pulls.every(page => Array.isArray(page))
      && pulls.flat().every(pr => pr.state === 'closed' && pr.merged_at === null), `Open, merged or unknown pull request uses ${ref}.`);
    assert(Array.isArray(runs) && runs.every(page => Array.isArray(page.workflow_runs))
      && runs.flatMap(page => page.workflow_runs).every(item => item.status === 'completed'), `Active or unknown run uses ${ref}.`);
    return { ref, commit: expected, present: commit !== null };
  });
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `${api}/actions/runs/${run.id}/artifacts?per_page=100`]));
  assert(Array.isArray(pages) && pages.every(page => Array.isArray(page.artifacts)), 'Artifact listing is incomplete.');
  const artifacts = pages.flatMap(page => page.artifacts).map(item => {
    assert(Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string'
      && Number.isSafeInteger(item.size_in_bytes) && item.size_in_bytes >= 0 && item.size_in_bytes <= 300 * 1024 * 1024
      && item.expired === false && item.workflow_run?.id === run.id, 'Artifact identity is unsafe or expired.');
    return { id: item.id, name: item.name, size: item.size_in_bytes, digest: item.digest ?? null };
  }).sort((a, b) => a.id - b.id);
  assert(new Set(artifacts.map(item => item.id)).size === artifacts.length && artifacts.length <= 128
    && artifacts.reduce((sum, item) => sum + item.size, 0) <= 1024 ** 3, 'Artifact preservation budget exceeded.');
  return { schemaVersion: 'buildr.local-candidate-withdrawal-plan/v1', repository, key,
    operationIdentity: operationIdentity(state), sourceCommit: candidate.sourceCommit, dataCommit: candidate.packageData.commit,
    handoffIdentity: manifest.identity, artifactSha256: manifest.artifactSha256, sourceTree: manifest.sourceTree,
    mainCommit: main.sha, run: { id: run.id, attempt: run.run_attempt }, references, artifacts };
}

function inventory(directory: string): any[] {
  const files: any[] = [];
  const walk = (relative: string) => {
    const absolute = path.join(directory, relative), stat = fs.lstatSync(absolute);
    assert(!stat.isSymbolicLink(), 'Withdrawal preservation contains an alias.');
    if (stat.isDirectory()) for (const name of fs.readdirSync(absolute).sort()) walk(path.join(relative, name));
    else {
      assert(stat.isFile(), 'Withdrawal preservation contains a non-regular file.');
      files.push({ path: relative.replaceAll(path.sep, '/'), size: stat.size, sha256: hash(fs.readFileSync(absolute)) });
    }
  };
  walk(''); return files;
}

function safeDirectory(workspace: string, key: string, planId: string): string {
  let directory = workspace;
  for (const part of ['.buildr', 'local', 'release-withdrawals', key, planId.slice(7)]) {
    directory = path.join(directory, part);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
    assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), 'Withdrawal preservation parent is an alias.');
  }
  return directory;
}

function preserve(state: any, owners: Owners, ghCommand: string): void {
  const withdrawal = state.withdrawal, plan = withdrawal.plan;
  if (withdrawal.preservation) {
    assert(fs.realpathSync(withdrawal.preservation.directory) === withdrawal.preservation.directory
      && withdrawal.preservation.directory.startsWith(path.join(state.workspace, '.buildr/local/release-withdrawals', plan.key, withdrawal.identity.slice(7)) + path.sep),
    'Withdrawal archive location changed.');
    assert(JSON.stringify(inventory(withdrawal.preservation.directory)) === JSON.stringify(withdrawal.preservation.files),
      'Preserved original or evidence changed; no further cleanup.');
    return;
  }
  const root = safeDirectory(state.workspace, plan.key, withdrawal.identity);
  // Interrupted partial archives remain visible. Never reuse them as complete proof.
  const directory = fs.mkdtempSync(path.join(root, 'attempt-'));
  restorePackageHandoff(state.workspace, plan.dataCommit, path.join(directory, 'original'), {
    sourceCommit: plan.sourceCommit, sourceTree: plan.sourceTree, identity: plan.handoffIdentity,
    artifactSha256: plan.artifactSha256, preserveOnly: true,
  });
  fs.writeFileSync(path.join(directory, 'operation.json'), JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const retained = [plan.sourceCommit, plan.dataCommit].map((commit: string, index: number) => {
    const ref = `refs/buildr/withdrawn/${plan.key}/${withdrawal.identity.slice(7)}/${index === 0 ? 'source' : 'data'}`;
    const present = owners.git(['for-each-ref', '--format=%(objectname)', ref]);
    assert(!present || present === commit, 'Retained source reference changed.');
    if (!present) owners.git(['update-ref', ref, commit, '0'.repeat(commit.length)]);
    return ref;
  });
  owners.git(['bundle', 'create', path.join(directory, 'source.bundle'), ...retained]);
  owners.git(['bundle', 'verify', path.join(directory, 'source.bundle')]);
  fs.writeFileSync(path.join(directory, 'run.log'), owners.gh(['run', 'view', String(plan.run.id), '--repo', repository, '--log']), { flag: 'wx', mode: 0o600 });
  for (const artifact of plan.artifacts) {
    const filename = path.join(directory, `artifact-${artifact.id}.zip`);
    const fd = fs.openSync(filename, 'wx', 0o600);
    try {
      const result = owners.execute(ghCommand, ['api', `${api}/actions/artifacts/${artifact.id}/zip`], {
        cwd: state.workspace, timeout: 180_000, stdio: ['ignore', fd, 'pipe'], maxBuffer: 2 * 1024 * 1024,
      });
      assert(!result.error && result.status === 0, `Artifact download unconfirmed: ${artifact.id}`);
    } finally { fs.closeSync(fd); }
    assert(fs.statSync(filename).size <= 300 * 1024 * 1024, 'Artifact exceeds its preservation budget.');
    const bytes = fs.readFileSync(filename);
    assert(bytes.length > 4 && bytes.subarray(0, 2).toString() === 'PK'
      && (artifact.digest === null || artifact.digest === `sha256:${hash(bytes)}`), `Artifact preserved bytes differ: ${artifact.id}`);
  }
  withdrawal.preservation = { directory, files: inventory(directory) };
  owners.effects.push({ type: 'candidate-preserved', directory, identity: withdrawal.identity });
  owners.save();
}

/** Called under the existing operation lock for execution; plan-only has no writes.
 * Every destructive request is journaled before sending. An unknown request is
 * resolved by readback only, never automatically resent because its target exists. */
export async function withdrawLocalCandidate(state: any, key: string, options: any, owners: Owners): Promise<any> {
  try {
    const observed = await observe(state, key, owners);
    const { identity: _ignored, ...savedPlan } = state.withdrawal?.plan ?? {};
    const plan = state.withdrawal ? savedPlan : observed;
    if (state.withdrawal) {
      const remaining = { ...observed, references: plan.references, artifacts: plan.artifacts };
      assert(identity(remaining) === state.withdrawal.identity, 'Withdrawal operation, source, run attempt or main changed.');
      assert(observed.artifacts.every((item: any) => plan.artifacts.some((original: any) => JSON.stringify(item) === JSON.stringify(original))),
        'New or changed artifacts appeared; no cleanup.');
    }
    const planId = identity(plan);
    if (options.authorized !== true) return { status: 'withdrawal-planned', plan: { ...plan, identity: planId },
      withdrawal: state.withdrawal ?? null, nextActions: ['核对准确计划并取得撤回授权，再传 --authorized --plan-identity；此计划未执行清理。'] };
    assert(options.planIdentity === planId, 'Withdrawal requires the exact observed --plan-identity.');
    if (!state.withdrawal) {
      state.withdrawal = { identity: planId, plan, status: 'in-progress', requests: [], startedAt: new Date().toISOString() };
      owners.save();
    }
    const withdrawal = state.withdrawal;
    preserve(state, owners, options.ghCommand || 'gh');
    // Re-observe activity, main and run after preservation, before any deletion.
    const fresh = await observe(state, key, owners);
    assert(identity({ ...fresh, references: plan.references, artifacts: plan.artifacts }) === planId,
      'Candidate changed during preservation; no cleanup.');
    assert(fresh.artifacts.every((item: any) => plan.artifacts.some((original: any) => JSON.stringify(item) === JSON.stringify(original))),
      'Artifacts changed during preservation; no cleanup.');
    assert(fresh.references.every((ref: any) => !ref.present || plan.references.some((original: any) => original.ref === ref.ref && original.present)),
      'A previously absent reference appeared; preserve it and re-evaluate ownership.');
    const remove = async (id: string, present: boolean, invoke: () => void, absent: () => boolean) => {
      let request = withdrawal.requests.find((item: any) => item.id === id);
      if (!present) {
        if (request) request.state = 'confirmed-absent';
        owners.save(); return;
      }
      assert(!request, `Previous cleanup request ${id} is unresolved or the resource reappeared; read back, do not replay.`);
      const current = await observe(state, key, owners);
      assert(identity({ ...current, references: plan.references, artifacts: plan.artifacts }) === planId
        && current.artifacts.every((item: any) => plan.artifacts.some((original: any) => JSON.stringify(item) === JSON.stringify(original))),
      'Candidate activity or resources changed before cleanup.');
      request = { id, state: 'unknown', requestedAt: new Date().toISOString() };
      withdrawal.requests.push(request); owners.save();
      let failure: unknown;
      try { invoke(); } catch (error) { failure = error; }
      assert(absent(), `Cleanup request ${id} is unconfirmed; preserve its intent and read back only.${failure ? ' Command failed.' : ''}`);
      request.state = 'confirmed-absent'; owners.effects.push({ type: 'candidate-resource-deleted', id }); owners.save();
    };
    // Source and original bundle already verified. Remove data/carrier refs by lease.
    for (const ref of fresh.references) await remove(ref.ref, ref.present, () => {
      pushReleaseBranch({ repo: state.workspace, remote: 'origin', branch: ref.ref.slice('refs/heads/'.length),
        commit: ref.commit, before: ref.commit, remove: true }, { execute: owners.execute }, owners.effects);
    }, () => owners.git(['ls-remote', 'origin', ref.ref]) === '');
    for (const artifact of plan.artifacts) await remove(`artifact:${artifact.id}`, fresh.artifacts.some((item: any) => item.id === artifact.id),
      () => { owners.gh(['api', '--method', 'DELETE', `${api}/actions/artifacts/${artifact.id}`]); },
      () => {
        const pages = JSON.parse(owners.gh(['api', '--paginate', '--slurp', `${api}/actions/runs/${plan.run.id}/artifacts?per_page=100`]));
        assert(Array.isArray(pages) && pages.every(page => Array.isArray(page.artifacts)), 'Artifact readback is incomplete.');
        return !pages.flatMap(page => page.artifacts).some(item => item.id === artifact.id);
      });
    withdrawal.status = 'completed'; withdrawal.finishedAt ??= new Date().toISOString(); owners.save();
    return { status: 'candidate-withdrawn', plan: { ...plan, identity: planId }, withdrawal,
      nextActions: ['撤回完成；原包、证明、源码 bundle 和历史运行已保留。本选择不能再准备或公开；新尝试使用新选择。'] };
  } catch (error: any) {
    return { status: 'withdrawal-blocked', diagnostic: { code: 'candidate-withdrawal-blocked', message: containsCredentialMaterial(error.message) ? 'Withdrawal readback failed.' : error.message },
      withdrawal: state.withdrawal ?? null, nextActions: ['保留原包和撤回日志，先核对具体阻塞；未知请求不自动重发。'] };
  }
}
