#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { spawnCommandSync } from '../../../projects/product/services/buildr/src/infrastructure/process.ts';
import { withExclusiveFileLock } from '../../../projects/product/services/buildr/src/infrastructure/filesystem/exclusive-file-lock.ts';
import { CANDIDATE_CI_AGGREGATE_SCHEMA } from '../../../projects/product/services/buildr/test/verification/release/candidate-ci-contract.ts';
import { releasePublishAuthority } from './release-authority.ts';
import { validateReleaseExecutionBinding } from './release-execution-binding.ts';
import { inspectReleaseSelection } from './release-selection.ts';
import { observeUnpublishedRelease } from './release-observation.ts';
import { readReleaseArtifact } from './release-artifact.ts';
import { assertReleaseConsumptionCoverage } from '../../../projects/product/services/buildr/test/verification/release/release-consumption.ts';
import { pushReleaseBranch } from './release-git-convergence.ts';

export const RELEASE_REHEARSAL_PREPARATION_SCHEMA = 'buildr.release-rehearsal-preparation/v2';
export const RELEASE_REHEARSAL_EVIDENCE_SCHEMA = 'buildr.release-rehearsal-evidence/v1';
const SHA = /^[a-f0-9]{40}$/u;

function digest(value: unknown): string {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function run(command: string, args: string[], cwd: string, { allowFailure = false }: { allowFailure?: boolean } = {}) {
  const result = spawnCommandSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error || (!allowFailure && result.status !== 0)) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
  return { status: result.status ?? 1, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() };
}

function commit(ref: string, repo: string): string {
  const value = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], repo).stdout;
  if (!SHA.test(value)) throw new Error(`Git commit is unavailable: ${ref}`);
  return value;
}

function tree(ref: string, repo: string): string {
  const value = run('git', ['rev-parse', `${ref}^{tree}`], repo).stdout;
  if (!SHA.test(value)) throw new Error(`Git tree is unavailable: ${ref}`);
  return value;
}

function ancestor(older: string, newer: string, repo: string): boolean {
  return run('git', ['merge-base', '--is-ancestor', older, newer], repo, { allowFailure: true }).status === 0;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function updateRefs(commands: string[], repo: string): void {
  const input = ['start', ...commands, 'prepare', 'commit', ''].join('\n');
  const result = spawnCommandSync('git', ['update-ref', '--stdin'], { cwd: repo, encoding: 'utf8', input });
  if (result.error || result.status !== 0) throw new Error(`git update-ref transaction failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
}

export function validateReleaseRehearsalPreparation(value: any): any {
  if (![RELEASE_REHEARSAL_PREPARATION_SCHEMA, 'buildr.release-rehearsal-preparation/v1'].includes(value?.schemaVersion) || value?.status !== 'prepared') throw new Error('Release rehearsal preparation is invalid.');
  const identity = value.identity;
  const projection = { ...value };
  delete projection.identity;
  if (value.schemaVersion === RELEASE_REHEARSAL_PREPARATION_SCHEMA) delete projection.effects;
  if (identity !== digest(projection)) throw new Error('Release rehearsal preparation identity is invalid.');
  if (!SHA.test(value.base?.commit || '') || !SHA.test(value.base?.tree || '') || !SHA.test(value.prospective?.commit || '') || !SHA.test(value.prospective?.tree || '')) throw new Error('Release rehearsal preparation Git identity is invalid.');
  if (typeof value.devRef !== 'string' || !value.devRef.trim()) throw new Error('Release rehearsal preparation dev ref is invalid.');
  if (!Array.isArray(value.sourceDevCommits) || value.sourceDevCommits.length === 0 || value.sourceDevCommits.some((item: any) => !SHA.test(item))) throw new Error('Release rehearsal preparation requires ordered dev source commits.');
  return value;
}

export function validateReleaseRehearsalEvidence(value: any): any {
  if (value?.schemaVersion !== RELEASE_REHEARSAL_EVIDENCE_SCHEMA || value?.status !== 'passed') throw new Error('Release rehearsal evidence is not passed.');
  const identity = value.identity;
  const projection = { ...value };
  delete projection.identity;
  if (identity !== digest(projection)) throw new Error('Release rehearsal evidence identity is invalid.');
  validateReleaseRehearsalPreparation(value.preparation);
  if (value.aggregate?.schemaVersion !== CANDIDATE_CI_AGGREGATE_SCHEMA || value.aggregate?.status !== 'passed') throw new Error('Release rehearsal aggregate is not passed.');
  return value;
}

export function prepareReleaseRehearsal(options: { version: string; repo: string; sourceDevCommits: string[]; devRef?: string; remote?: string; executionBinding: any }, dependencies: any = {}): any {
  const repo = path.resolve(options.repo);
  const binding = (dependencies.validateExecutionBinding || validateReleaseExecutionBinding)(options.executionBinding, { repo });
  if (binding.version !== options.version) throw new Error('Release rehearsal execution binding version mismatches target version.');
  const state: any = inspectReleaseSelection({ version: options.version, repo, devRef: options.devRef || 'dev' });
  if (state.status !== 'frozen') throw new Error(`Release ${options.version} must be frozen before rehearsal.`);
  if (binding.head !== state.releaseHead) throw new Error('Release rehearsal execution binding does not match the frozen release head.');
  const sources = [...new Set(options.sourceDevCommits || [])];
  if (!sources.length || sources.length !== options.sourceDevCommits.length) throw new Error('Release rehearsal requires unique ordered source commits.');
  const devHead = commit(options.devRef || state.devRef, repo);
  for (const source of sources) {
    const resolved = commit(source, repo);
    if (resolved !== source || !ancestor(source, devHead, repo)) throw new Error(`Release rehearsal source is not current dev provenance: ${source}`);
    if (state.selectionChain.some((entry: any) => entry.sourceDevCommit === source)) throw new Error(`Release rehearsal source is already selected: ${source}`);
  }
  const effects: any[] = [];
  const rehearsalKey = digest({ version: options.version, base: state.releaseHead, sources }).slice(7, 23);
  const carrier = `codex/release-rehearsal-${options.version}-${rehearsalKey}`;
  const localRef = `refs/buildr/release/${options.version}/rehearsals/${rehearsalKey}`;
  const remote = options.remote || 'origin';
  try {
    let prospectiveCommit = run('git', ['for-each-ref', '--format=%(objectname)', localRef], repo).stdout || null;
    const remoteCommit = run('git', ['ls-remote', remote, `refs/heads/${carrier}`], repo).stdout.split(/\s+/u)[0] || null;
    if (!prospectiveCommit && remoteCommit) {
      const restored = { type: 'release-rehearsal-ref-restored', ref: localRef, commit: remoteCommit, state: 'unknown' };
      effects.push(restored);
      run('git', ['fetch', '--no-tags', remote, `refs/heads/${carrier}:${localRef}`], repo);
      prospectiveCommit = commit(localRef, repo);
      restored.state = 'confirmed';
    }
    if (!prospectiveCommit) {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-rehearsal-'));
      try {
        run('git', ['worktree', 'add', '--detach', temporary, state.releaseHead], repo);
        for (const source of sources) run('git', ['cherry-pick', '-x', source], temporary);
        prospectiveCommit = commit('HEAD', temporary);
      } finally {
        // This is solely an algorithm-owned prospective checkout. The support
        // Task and its implementation worktree are never removed here.
        run('git', ['worktree', 'remove', '--force', temporary], repo, { allowFailure: true });
      }
      const created = { type: 'release-rehearsal-ref-created', ref: localRef, commit: prospectiveCommit, state: 'unknown' };
      effects.push(created);
      run('git', ['update-ref', localRef, prospectiveCommit], repo);
      created.state = 'confirmed';
    }
    const chain = run('git', ['rev-list', '--reverse', '--first-parent', `${state.releaseHead}..${prospectiveCommit}`], repo).stdout.split(/\s+/u).filter(Boolean);
    const selected = chain.map(value => run('git', ['show', '-s', '--format=%B', value], repo).stdout.match(/cherry picked from commit ([a-f0-9]{40})/u)?.[1] || null);
    if (JSON.stringify(selected) !== JSON.stringify(sources)) throw new Error('Rehearsal carrier has different ordered source provenance.');
    if (remoteCommit && remoteCommit !== prospectiveCommit) throw new Error('Rehearsal carrier source drifted.');
    if (!remoteCommit) pushReleaseBranch({ repo, remote, branch: carrier, commit: prospectiveCommit, before: null }, dependencies, effects);
    const result: any = { schemaVersion: RELEASE_REHEARSAL_PREPARATION_SCHEMA, status: 'prepared', version: options.version, devRef: state.devRef,
      base: { commit: state.releaseHead, tree: state.releaseTree, generation: state.generation, selectionIdentity: state.selectionIdentity },
      sourceDevCommits: sources, prospective: { commit: prospectiveCommit, tree: tree(prospectiveCommit, repo) }, carrier: { remote, branch: carrier, localRef } };
    result.identity = digest(result);
    return { ...result, effects };
  } catch (error) {
    return { status: 'blocked', version: options.version, effects, diagnostic: { message: error instanceof Error ? error.message : String(error) },
      nextActions: ['保留已生成的演练引用，恢复同一prepare；不用重新创建支持任务或重算已验证提交。'] };
  }
}

function readPreparationFile(file: string): { raw: string; value: any } {
  const state = fs.lstatSync(file);
  if (!state.isFile() || state.size > 2 * 1024 * 1024 || fs.realpathSync(file) !== file) throw new Error('Rehearsal preparation must be one bounded regular file at its real path.');
  const raw = fs.readFileSync(file, 'utf8');
  return { raw, value: validateReleaseRehearsalPreparation(JSON.parse(raw)) };
}

function replacePreparationFile(file: string, raw: string, value: any): string {
  if (readPreparationFile(file).raw !== raw) throw new Error('Rehearsal preparation changed before its intent could be retained.');
  const temporary = `${file}.pending-${process.pid}-${crypto.randomUUID()}`;
  const next = `${JSON.stringify(value, null, 2)}\n`;
  try {
    fs.writeFileSync(temporary, next, { mode: 0o600, flag: 'wx' });
    if (readPreparationFile(file).raw !== raw) throw new Error('Rehearsal preparation changed while retaining its intent.');
    fs.renameSync(temporary, file);
    return next;
  } finally { fs.rmSync(temporary, { force: true }); }
}

/** A repeated prepare cannot erase an earlier unknown dispatch intent. */
export function writeReleaseRehearsalPreparation(filename: string, value: any): any {
  const preparation = validateReleaseRehearsalPreparation(value), input = path.resolve(filename);
  fs.mkdirSync(path.dirname(input), { recursive: true });
  const file = path.join(fs.realpathSync(path.dirname(input)), path.basename(input));
  return withExclusiveFileLock(`${file}.lock`, file, () => {
    if (fs.existsSync(file)) {
      const current = readPreparationFile(file).value;
      if (current.identity !== preparation.identity) throw new Error('Existing rehearsal preparation differs; preserve its dispatch history.');
      return current;
    }
    fs.writeFileSync(file, `${JSON.stringify(preparation, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    return preparation;
  });
}

export function dispatchReleaseRehearsal(preparationValue: any, options: { repo: string; confirm?: boolean; preparationPath?: string }, dependencies: any = {}): any {
  const preparation = validateReleaseRehearsalPreparation(preparationValue);
  if (options.confirm !== true) throw new Error('Release rehearsal dispatch requires explicit confirmation.');
  const execute = dependencies.execute ?? spawnCommandSync;
  const request = (args: string[]) => execute('gh', args, { cwd: options.repo, encoding: 'utf8', timeout: 30_000 });
  const result = (status: string, effect: any = null, observed: any = null): any => ({ schemaVersion: 'buildr.release-rehearsal-dispatch/v1', status,
    preparationIdentity: preparation.identity, effects: effect ? [effect] : [], ...(observed ? { workflow: observed } : {}),
    nextActions: [observed ? '对同一runId执行inspect，终态仍须核验rehearsalIdentity与完整原包证明。' : '回读同一演练请求；未知请求不能再次派发。'] });
  const lookup = () => {
    const response = request(['api', `repos/${releasePublishAuthority.repository}/actions/workflows/verify.yml/runs?event=workflow_dispatch&branch=${encodeURIComponent(preparation.carrier.branch)}&per_page=100`]);
    if (response.error || response.status !== 0) throw new Error('Rehearsal workflow history is unknown.');
    const body = JSON.parse(String(response.stdout));
    if (!Array.isArray(body.workflow_runs) || !Number.isSafeInteger(body.total_count) || body.total_count !== body.workflow_runs.length || body.total_count > 100) throw new Error('Rehearsal workflow history is incomplete.');
    if (body.workflow_runs.some((item: any) => item.repository?.full_name !== releasePublishAuthority.repository
      || item.path?.split('@')[0] !== '.github/workflows/verify.yml' || item.event !== 'workflow_dispatch'
      || item.head_branch !== preparation.carrier.branch || item.head_sha !== preparation.prospective.commit
      || !Number.isSafeInteger(item.id) || item.id < 1 || !Number.isSafeInteger(item.run_attempt) || item.run_attempt < 1
      || typeof item.status !== 'string')) throw new Error('Rehearsal workflow run identity is incomplete.');
    return body.workflow_runs.filter((item: any) => item.repository?.full_name === releasePublishAuthority.repository
      && item.path?.split('@')[0] === '.github/workflows/verify.yml' && item.event === 'workflow_dispatch'
      && item.head_branch === preparation.carrier.branch && item.head_sha === preparation.prospective.commit
      && Number.isSafeInteger(item.id) && item.id > 0);
  };
  const continueRequest = (stored: any = null, file: string | null = null): any => {
    if (stored && stored.value.identity !== preparation.identity) throw new Error('Stored rehearsal preparation identity changed.');
    const value = stored?.value ?? preparation;
    const intents = (value.effects ?? []).filter((item: any) => item?.type === 'github-release-rehearsal-dispatched');
    const validIntent = intents.length === 1 && intents[0].preparationIdentity === preparation.identity
      && intents[0].branch === preparation.carrier.branch && intents[0].sourceCommit === preparation.prospective.commit
      && intents[0].workflow === '.github/workflows/verify.yml' && intents[0].repository === releasePublishAuthority.repository;
    if (intents.length && !validIntent && value.schemaVersion === RELEASE_REHEARSAL_PREPARATION_SCHEMA) return result('readback-required');
    let matches: any[];
    try { matches = lookup(); } catch { return result('readback-required', validIntent ? intents[0] : null); }
    if (matches.length > 1 || validIntent && intents[0].runId && matches[0]?.id !== intents[0].runId) return result('readback-required', validIntent ? intents[0] : null);
    let intent = validIntent ? intents[0] : null;
    if (matches.length === 0 && !intent) {
      // v1 effects participate in its identity. Missing durable v2 input is read-only.
      if (!file || value.schemaVersion !== RELEASE_REHEARSAL_PREPARATION_SCHEMA) return result('readback-required');
      intent = { type: 'github-release-rehearsal-dispatched', preparationIdentity: preparation.identity,
        repository: releasePublishAuthority.repository, workflow: '.github/workflows/verify.yml', branch: preparation.carrier.branch,
        sourceCommit: preparation.prospective.commit, state: 'unknown', runId: null };
      value.effects = [...(value.effects ?? []), intent];
      stored.raw = replacePreparationFile(file, stored.raw, value);
      if (readPreparationFile(file).raw !== stored.raw) throw new Error('Rehearsal preparation changed before dispatch.');
      try { request(['workflow', 'run', 'verify.yml', '--repo', releasePublishAuthority.repository, '--ref', preparation.carrier.branch,
        '-f', 'purpose=release-rehearsal', '-f', `expected_source_tree=${preparation.prospective.tree}`, '-f', `rehearsal_identity=${preparation.identity}`]); }
      catch { /* Lost and rejected responses both retain this intent; only readback follows. */ }
      try { matches = lookup(); } catch { return result('readback-required', intent); }
    }
    if (matches.length !== 1) return result('readback-required', intent);
    if (!intent && file && value.schemaVersion === RELEASE_REHEARSAL_PREPARATION_SCHEMA) {
      intent = { type: 'github-release-rehearsal-dispatched', preparationIdentity: preparation.identity,
        repository: releasePublishAuthority.repository, workflow: '.github/workflows/verify.yml', branch: preparation.carrier.branch,
        sourceCommit: preparation.prospective.commit, state: 'confirmed', runId: matches[0].id };
      value.effects = [...(value.effects ?? []), intent];
    }
    if (intent && file && value.schemaVersion === RELEASE_REHEARSAL_PREPARATION_SCHEMA) {
      intent.runId = matches[0].id; intent.state = 'confirmed';
      replacePreparationFile(file, stored.raw, value);
    }
    return result(matches[0].status === 'completed' ? 'inspect-required' : 'running', intent, matches[0]);
  };
  if (!options.preparationPath) return continueRequest();
  const input = path.resolve(options.preparationPath);
  const file = path.join(fs.realpathSync(path.dirname(input)), path.basename(input));
  return withExclusiveFileLock(`${file}.lock`, file, () => continueRequest(readPreparationFile(file), file));
}

export function inspectReleaseRehearsal(preparationValue: any, options: { repo: string; runId: number }): any {
  const preparation = validateReleaseRehearsalPreparation(preparationValue);
  const runId = Number(options.runId);
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Release rehearsal inspect requires a positive run id.');
  const runValue = JSON.parse(run('gh', ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`], options.repo).stdout);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-rehearsal-evidence-'));
  let aggregate: any = null;
  let artifact: any = null;
  try {
    if (runValue.status === 'completed') {
      const download = run('gh', ['run', 'download', String(runId), '--repo', releasePublishAuthority.repository, '--name', 'candidate-aggregate', '--dir', temporary], options.repo, { allowFailure: true });
      if (download.status === 0) {
        aggregate = readJson(path.join(temporary, 'candidate-ci-aggregate.json'));
        const packageRoot = path.join(temporary, 'package');
        run('gh', ['run', 'download', String(runId), '--repo', releasePublishAuthority.repository, '--name', 'candidate-package', '--dir', packageRoot], options.repo);
        artifact = readReleaseArtifact(path.join(packageRoot, 'release-artifact.json')).manifest;
        assertReleaseConsumptionCoverage(aggregate, { sourceCommit: preparation.prospective.commit, sourceTree: preparation.prospective.tree }, artifact);
      }
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const findings: any[] = [];
  if (runValue.event !== 'workflow_dispatch') findings.push({ code: 'rehearsal-run-event-mismatch', actual: runValue.event });
  if (runValue.head_sha !== preparation.prospective.commit) findings.push({ code: 'rehearsal-run-source-mismatch', actual: runValue.head_sha });
  if (runValue.status !== 'completed' || runValue.conclusion !== 'success') findings.push({ code: 'rehearsal-run-not-passed', status: runValue.status, conclusion: runValue.conclusion });
  if (aggregate?.schemaVersion !== CANDIDATE_CI_AGGREGATE_SCHEMA || aggregate?.status !== 'passed') findings.push({ code: 'rehearsal-aggregate-not-passed', actual: aggregate?.status ?? null });
  if (aggregate && (aggregate.purpose !== 'release-rehearsal' || aggregate.sourceCommit !== preparation.prospective.commit || aggregate.sourceTree !== preparation.prospective.tree || aggregate.rehearsalIdentity !== preparation.identity)) findings.push({ code: 'rehearsal-aggregate-identity-mismatch' });
  const evidence: any = {
    schemaVersion: RELEASE_REHEARSAL_EVIDENCE_SCHEMA,
    status: findings.length ? 'failed' : 'passed',
    preparation,
    workflow: { runId, runAttempt: runValue.run_attempt, headSha: runValue.head_sha, status: runValue.status, conclusion: runValue.conclusion },
    aggregate,
    artifact,
    findings,
    effects: [],
  };
  evidence.identity = digest(evidence);
  return evidence;
}

export function cleanupReleaseRehearsal(preparationValue: any, options: { repo: string; confirm?: boolean }, dependencies: any = {}): any {
  const preparation = validateReleaseRehearsalPreparation(preparationValue);
  if (options.confirm !== true) throw new Error('Release rehearsal cleanup requires explicit confirmation.');
  const actualLocal = run('git', ['rev-parse', '--verify', preparation.carrier.localRef], options.repo, { allowFailure: true }).stdout;
  if (actualLocal && actualLocal !== preparation.prospective.commit) throw new Error('Release rehearsal local ref drifted.');
  const remoteValue = run('git', ['ls-remote', preparation.carrier.remote, `refs/heads/${preparation.carrier.branch}`], options.repo).stdout;
  const actualRemote = remoteValue.split(/\s+/u)[0] || null;
  if (actualRemote && actualRemote !== preparation.prospective.commit) throw new Error('Release rehearsal remote carrier drifted.');
  const effects: any[] = [];
  if (actualRemote) {
    const removed = pushReleaseBranch({ repo: options.repo, remote: preparation.carrier.remote, branch: preparation.carrier.branch,
      commit: preparation.prospective.commit, before: actualRemote, remove: true }, dependencies, effects);
    removed.type = 'release-rehearsal-remote-carrier-deleted';
    removed.branch = preparation.carrier.branch;
  }
  if (actualLocal) {
    run('git', ['update-ref', '-d', preparation.carrier.localRef, preparation.prospective.commit], options.repo);
    effects.push({ type: 'release-rehearsal-local-ref-deleted', ref: preparation.carrier.localRef });
  }
  return { schemaVersion: 'buildr.release-rehearsal-cleanup/v1', status: 'cleaned', preparationIdentity: preparation.identity, effects, nextActions: [] };
}

export function assertNoConflictingPublicationRuns(runs: any[], version: string): void {
  const matching = runs.filter((item: any) => String(item.displayTitle || '').includes(version));
  if (matching.some((item: any) => item.status !== 'completed')) throw new Error(`An active protected publication run already exists for ${version}.`);
  // A terminal run is history. Only current public facts decide whether repair is safe.
}

export async function assertUnpublished(version: string, repo: string): Promise<void> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || run('gh', ['auth', 'token'], repo, { allowFailure: true }).stdout || undefined;
  const observed = await observeUnpublishedRelease(version, { token });
  if (observed.status !== 'unpublished') throw Object.assign(new Error('Release version is published, active, or its public state is unknown.'), { observation: observed });
}

export async function promoteReleaseRehearsal(evidenceValue: any, options: { repo: string; executionBinding: any; confirm?: boolean; reason?: string }, dependencies: any = {}): Promise<any> {
  const evidence = validateReleaseRehearsalEvidence(evidenceValue);
  if (options.confirm !== true || !String(options.reason || '').trim()) throw new Error('Release rehearsal promotion requires authorization and a non-empty reason.');
  const repo = path.resolve(options.repo);
  const preparation = evidence.preparation;
  const effects: any[] = [];
  try {
    const binding = (dependencies.validateExecutionBinding || validateReleaseExecutionBinding)(options.executionBinding, { repo });
    if (binding.version !== preparation.version) throw new Error('Release rehearsal promotion version mismatches preparation.');
    const state: any = inspectReleaseSelection({ version: preparation.version, repo, devRef: preparation.devRef });
    const target = preparation.prospective.commit;
    const base = preparation.base.commit;
    if (!['frozen', 'stale'].includes(state.status) || ![base, target].includes(state.releaseHead) || ![base, target].includes(state.freeze.commit)) throw new Error('Current frozen release is outside the prepared promotion states.');
    if (state.releaseHead === base && state.selectionIdentity !== preparation.base.selectionIdentity) throw new Error('Current frozen selection differs from rehearsal base.');
    const currentBranch = run('git', ['branch', '--show-current'], repo).stdout;
    const currentHead = commit('HEAD', repo);
    if (currentBranch !== binding.branch || ![base, target].includes(currentHead)) throw new Error('Promotion requires the bound release Task branch at the base or exact resumed target.');
    if (run('git', ['status', '--porcelain=v1', '--untracked-files=all'], repo).stdout) throw new Error('Promotion requires a clean worktree.');
    const live = await (dependencies.inspectRehearsal || inspectReleaseRehearsal)(preparation, { repo, runId: evidence.workflow.runId });
    if (live.status !== 'passed' || live.identity !== evidence.identity) throw new Error('Release rehearsal evidence is stale or no longer matches GitHub.');
    const devHead = commit(preparation.devRef, repo);
    if (preparation.sourceDevCommits.some((source: string) => !ancestor(source, devHead, repo))) throw new Error('Selected source is no longer contained by dev.');
    const remoteCarrier = run('git', ['ls-remote', preparation.carrier.remote, `refs/heads/${preparation.carrier.branch}`], repo).stdout.split(/\s+/u)[0] || null;
    if (remoteCarrier !== target) throw new Error('Release rehearsal carrier does not match the exact source.');
    const formalRef = `refs/heads/release-${preparation.version}`;
    const frozenRef = `refs/buildr/release/${preparation.version}/frozen`;
    const newGeneration = preparation.base.generation + preparation.sourceDevCommits.length;
    const historyRef = `refs/buildr/release/${preparation.version}/freezes/${newGeneration}`;
    const remoteFormal = run('git', ['ls-remote', preparation.carrier.remote, formalRef], repo).stdout.split(/\s+/u)[0] || null;
    const alreadyPromoted = state.releaseHead === target && state.freeze.commit === target && currentHead === target && remoteFormal === target;
    if (!alreadyPromoted) {
      await (dependencies.assertUnpublished || assertUnpublished)(preparation.version, repo);
      if (currentHead !== target) {
        const merged = { type: 'release-task-fast-forwarded', from: currentHead, to: target, state: 'unknown' };
        effects.push(merged);
        run('git', ['merge', '--ff-only', target], repo);
        merged.state = 'confirmed';
      }
      const updates = [];
      for (const ref of [formalRef, frozenRef, historyRef]) {
        const current = run('git', ['for-each-ref', '--format=%(objectname)', ref], repo).stdout;
        if (current && ![base, target].includes(current)) throw new Error(`Promotion ref ${ref} drifted.`);
        updates.push(current === target ? `verify ${ref} ${target}` : current ? `update ${ref} ${target} ${current}` : `create ${ref} ${target}`);
      }
      const updated = { type: 'release-rehearsal-promoted', from: base, to: target, generation: newGeneration, state: 'unknown' };
      effects.push(updated);
      updateRefs(updates, repo);
      updated.state = 'confirmed';
      if (remoteFormal !== target) pushReleaseBranch({ repo, remote: preparation.carrier.remote, branch: `release-${preparation.version}`, commit: target, before: remoteFormal }, dependencies, effects);
    }
    const result: any = inspectReleaseSelection({ version: preparation.version, repo, devRef: preparation.devRef });
    if (result.status !== 'frozen' || result.releaseHead !== target || result.releaseTree !== preparation.prospective.tree) throw new Error('Promoted release selection does not match rehearsal source.');
    return { ...result, operation: 'promote-rehearsal', status: 'passed', action: alreadyPromoted ? 'reused' : 'promoted', rehearsalEvidenceIdentity: evidence.identity,
      candidateRunId: evidence.workflow.runId, artifact: evidence.artifact ?? evidence.aggregate.artifact,
      effects, nextActions: ['复用此完整Candidate及同一tarball；核验main关系和临发布状态。源码或相关执行输入变化才重新验证。'] };
  } catch (error) {
    return { status: 'blocked', operation: 'promote-rehearsal', version: preparation.version, effects,
      diagnostic: { message: error instanceof Error ? error.message : String(error) },
      nextActions: ['回读prepared base/target的本地与远端引用，继续同一promotion；不要重建已验证提交或产物。'] };
  }
}

function args(argv: string[]): any {
  const action = argv[0];
  const values: Record<string, any> = { sources: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--confirm') values.confirm = true;
    else if (key === '--source') values.sources.push(argv[++index]);
    else if (key.startsWith('--')) values[key.slice(2).replaceAll('-', '')] = argv[++index];
  }
  return { action, values };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { action, values } = args(process.argv.slice(2));
    const repo = path.resolve(values.repo || process.cwd());
    const prepared = values.prepared ? readJson(values.prepared) : null;
    const evidence = values.evidence ? readJson(values.evidence) : null;
    if (values.output && [values.prepared, values.evidence].filter(Boolean).some(input => path.resolve(input) === path.resolve(values.output)
      || fs.existsSync(values.output) && fs.realpathSync(input) === fs.realpathSync(values.output))) throw new Error('Rehearsal output cannot overwrite its preparation or evidence input.');
    let result = action === 'prepare'
      ? prepareReleaseRehearsal({ version: values.version, repo, sourceDevCommits: values.sources, devRef: values.devref, remote: values.remote, executionBinding: readJson(values.executionbinding) })
      : action === 'dispatch'
        ? dispatchReleaseRehearsal(prepared, { repo, confirm: values.confirm, preparationPath: values.prepared })
        : action === 'inspect'
          ? inspectReleaseRehearsal(prepared, { repo, runId: Number(values.runid) })
          : action === 'promote'
            ? await promoteReleaseRehearsal(evidence, { repo, executionBinding: readJson(values.executionbinding), confirm: values.confirm, reason: values.reason })
          : action === 'cleanup'
            ? cleanupReleaseRehearsal(prepared, { repo, confirm: values.confirm })
            : null;
    if (!result) throw new Error('Usage: release-rehearsal.ts <prepare|dispatch|inspect|promote|cleanup> ...');
    if (values.output) {
      if (action === 'prepare' && result.schemaVersion === RELEASE_REHEARSAL_PREPARATION_SCHEMA) result = writeReleaseRehearsalPreparation(values.output, result);
      else if (action === 'prepare' && fs.existsSync(values.output)) throw new Error('Failed preparation cannot overwrite existing rehearsal history.');
      else { fs.mkdirSync(path.dirname(path.resolve(values.output)), { recursive: true }); fs.writeFileSync(path.resolve(values.output), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }); }
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (['failed', 'blocked'].includes(result.status)) process.exitCode = 1;
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
