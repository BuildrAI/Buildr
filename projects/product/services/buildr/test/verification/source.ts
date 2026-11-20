#!/usr/bin/env node
import fs from 'node:fs';
import { sharedCheckPreparation } from '../../tools/testing/verification-checks.ts';
import { randomUUID } from 'node:crypto';
import { assertCandidateResumeScope, createCandidateRoundExecution, assertCandidateRound } from './candidate-round.ts';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { assertMinimumNodeVersion } from '../../src/infrastructure/process.ts';
import { enforceOfflineVerification } from '../../src/infrastructure/network/verification-network-policy.ts';
import { prepareCandidateEnvironment } from '../../tools/verification/candidate-environment.ts';
import { assertVerificationResourceDemand } from './dag-scheduler.ts';
import { localExecutionStep } from './plan-runner.ts';
import { createVerificationPlan } from './planner.ts';
import { CANDIDATE_CI_SHARDS, sourcePreparationForCheck, VERIFICATION_PLATFORMS, verificationSteps, resolveVerificationExecutionProfile } from './registry.ts';
import { collectVerificationSourceIdentity, createVerificationEvidencePaths, writeVerificationTimingEvidence } from './timing/evidence.ts';
import { inspectVerificationReusePlan } from './verification-reuse.ts';
import { resolveVerificationBase } from './changed-paths.ts';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

export type SourceVerificationScope = 'all' | 'common' | 'platform';

/** Graceful interruption lets the existing runner observe child and shared
 * cleanup before exporting completed checks. A hard kill cannot provide it. */
export function sourceVerificationCancellation(signals: Pick<NodeJS.Process, 'on' | 'removeListener'> = process): any {
  const controller = new AbortController();
  const interrupt = () => controller.abort('SIGINT');
  const terminate = () => controller.abort('SIGTERM');
  signals.on('SIGINT', interrupt);
  signals.on('SIGTERM', terminate);
  return { signal: controller.signal,
    exitCode: () => controller.signal.reason === 'SIGTERM' ? 143 : 130,
    dispose: () => { signals.removeListener('SIGINT', interrupt); signals.removeListener('SIGTERM', terminate); } };
}

export function parseSourceArgs(args: string[]): { help: boolean; json: boolean; force: boolean; resume: boolean; scope: SourceVerificationScope; base: string | null; output: string | null; round: string | null; invalidate: string[]; selected: string[] } {
  const result = { help: false, json: false, force: false, resume: false, scope: 'all' as SourceVerificationScope, base: null as string | null, output: null as string | null, round: null as string | null, invalidate: [] as string[], selected: [] as string[] };
  let scopeSupplied = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--force') result.force = true;
    else if (arg === '--resume') result.resume = true;
    else if (arg === '--scope') {
      const value = args[++index];
      if (!value || !['all', 'common', 'platform'].includes(value)) throw new Error('--scope requires all, common or platform');
      if (scopeSupplied) throw new Error('--scope may only be supplied once');
      result.scope = value as SourceVerificationScope;
      scopeSupplied = true;
    } else if (arg === '--base') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --base');
      if (result.base !== null) throw new Error('--base may only be supplied once');
      result.base = value;
    } else if (arg === '--round') {
      const value = args[++index];
      if (!value || value.startsWith('-') || result.round !== null) throw new Error('--round requires one round id');
      result.round = value;
    } else if (arg === '--output') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --output');
      if (result.output !== null) throw new Error('--output may only be supplied once');
      result.output = value;
    } else if (arg === '--invalidate') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --invalidate');
      if (result.invalidate.length) throw new Error('--invalidate may only be supplied once');
      const ids = value.split(',').map(id => id.trim()).filter(Boolean);
      if (!ids.length || ids.some(id => !/^[a-z0-9][a-z0-9:-]*$/u.test(id))) throw new Error('--invalidate requires comma-separated step ids');
      result.invalidate = ids;
    } else if (arg === '--selected') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --selected');
      if (result.selected.length) throw new Error('--selected may only be supplied once');
      const ids = value.split(',').map(id => id.trim()).filter(Boolean);
      if (!ids.length || ids.some(id => !/^[a-z0-9][a-z0-9:-]*$/u.test(id))) throw new Error('--selected requires comma-separated step ids');
      result.selected = ids;
    } else throw new Error(`Unknown release source-verification option: ${arg}`);
  }
  if (result.help && args.length !== 1) throw new Error('--help cannot be combined with other arguments');
  if (result.resume && (!result.round || !result.output)) throw new Error('--resume requires the original --round and --output');
  return result;
}

/** Resolve once before planning or preparing. Every snapshot and child uses the
 * same immutable comparison even if a shared tracking ref moves during a run. */
export function pinSourceVerificationBase(repo: string, env: NodeJS.ProcessEnv = process.env, requestedBase?: string | null): NodeJS.ProcessEnv {
  const ref = resolveVerificationBase(repo, requestedBase || env.BUILDR_VERIFICATION_BASE || null);
  const base = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { ...env, BUILDR_VERIFICATION_BASE: base };
}

export function sourceOnlyVerificationSteps(steps: any[]): { steps: any[]; excludedStepIds: string[] } {
  const byId = new Map(steps.map(step => [step.id, step]));
  const excluded = new Set<string>(steps.filter(step => step.executor?.type === 'candidate-artifact' || step.executor?.consumesArtifact === true).map(step => step.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (!excluded.has(step.id) && (step.dependsOn ?? []).some((id: string) => excluded.has(id) || !byId.has(id))) {
        excluded.add(step.id);
        changed = true;
      }
    }
  }
  return { steps: steps.filter(step => !excluded.has(step.id)), excludedStepIds: [...excluded].sort() };
}

export function createSourceVerificationPlan(platform: string = process.platform, options: { scope?: SourceVerificationScope } = {}): any {
  const runner = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform;
  const scope = options.scope ?? 'all';
  if (!['all', 'common', 'platform'].includes(scope)) throw new Error(`Unknown source verification scope: ${scope}`);
  const supported = VERIFICATION_PLATFORMS.includes(runner);
  const stepIds: string[] = supported ? verificationSteps.filter((step: any) => step.profiles.includes('candidate')
    && (step.platformScope.kind === 'common' ? scope !== 'platform'
      : scope !== 'common' && step.platformScope.runners.includes(runner))).map((step: any) => step.id) : [];
  const selected = createVerificationPlan({ stepIds });
  const composed = selected;
  const source = sourceOnlyVerificationSteps(composed.steps);
  const ids = new Set(source.steps.map(step => step.id));
  return {
    ...composed,
    schemaVersion: 'buildr.verification-source-plan/v1',
    source: 'candidate-source', runner, sourceScope: scope,
    status: supported ? composed.status : 'blocked',
    diagnostic: supported ? composed.diagnostic : { code: 'source-runner-not-declared', message: `No Candidate source checks are declared for ${runner}.` },
    stepIds: stepIds.filter(id => ids.has(id)),
    excludedStepIds: source.excludedStepIds,
    steps: source.steps,
  };
}

const sourcePreparationProfiles = ['base', 'frontend', 'source-runtime'] as const;
const sourceVerificationForce = (force: boolean | undefined, env: NodeJS.ProcessEnv = process.env) => force === true || env.BUILDR_VERIFICATION_FORCE === '1';

/** Preparation follows the existing Candidate declarations for checks that will
 * actually execute. An unregistered check retains the conservative source setup. */
export function sourceVerificationPreparation(plan: any, reuse: any, shards?: readonly any[]): any {
  const dispositions = new Map((reuse?.steps ?? []).map((step: any) => [step.id, step.disposition]));
  const missing = plan.steps.filter((step: any) => dispositions.get(step.id) !== 'reuse');
  let rank = -1;
  for (const step of missing) {
    const owners = shards?.filter(shard => shard.stepIds.includes(step.id));
    const required = owners ? owners.length ? owners.map(owner => owner.preparation) : ['source-runtime'] : [sourcePreparationForCheck(step.id)];
    for (const profile of required) {
      const current = sourcePreparationProfiles.indexOf(profile);
      rank = Math.max(rank, current < 0 ? sourcePreparationProfiles.length - 1 : current);
    }
  }
  return { profile: rank < 0 ? null : sourcePreparationProfiles[rank], stepIds: missing.map((step: any) => step.id) };
}

/** Preparation can change dependency identities. Observe reuse again before any
 * check runs, and prepare a broader declared environment only if newly missing
 * checks require it. No preparation receipt is treated as a test result. */
export function prepareSourceVerificationEnvironment(plan: any, options: any, dependencies: any = {}): any {
  options = { ...options, force: sourceVerificationForce(options.force, options.env ?? process.env) };
  const inspect = dependencies.inspectReuse ?? ((plan: any, options: any) => options.round
    ? createCandidateRoundExecution(plan, { ...options, inspectOnly: true }).explanation : inspectVerificationReusePlan(plan, options));
  const prepare = dependencies.prepareEnvironment ?? prepareCandidateEnvironment;
  const shards = dependencies.shards;
  const preparations: any[] = [];
  let preparedRank = -1;
  let reuse = inspect(plan, options);
  while (true) {
    const required = sourceVerificationPreparation(plan, reuse, shards);
    const rank = required.profile === null ? -1 : sourcePreparationProfiles.indexOf(required.profile);
    dependencies.assertAdmission?.(plan, reuse);
    if (rank <= preparedRank) return { reuse, preparation: required, preparations };
    preparations.push(prepare({ profile: required.profile, reusePrepared: true,
      preparationReuseOptions: { force: options.force === true } }));
    preparedRank = rank;
    reuse = inspect(plan, options);
  }
}

/** Same-process handoff of a completed owned artifacts:prepare operation.
 * Never reads a caller file or promotes preparation to a check result. */
export function sourcePreparationCommands(prepared: any): Map<string, Promise<any>> {
  const commands = new Map<string, Promise<any>>();
  const receipt = prepared.preparations?.findLast((item: any) => item.status === 'passed' && item.operations?.some((operation: any) =>
    operation.id === 'generated-contracts-and-test-context' && operation.status === 'passed'));
  if (!receipt) return commands;
  const owner = receipt.operations.find((operation: any) => operation.id === 'generated-contracts-and-test-context');
  for (const command of sharedCheckPreparation) {
    const key = JSON.stringify([command.file, command.args, path.resolve(productRoot, command.cwd)]);
    commands.set(key, Promise.resolve({ id: owner.id, status: 'passed', exitCode: 0, durationMs: 0,
      command: command.file, args: command.args, cwd: path.resolve(productRoot, command.cwd), reusedFrom: { preparation: receipt.id, finishedAt: owner.finishedAt } }));
  }
  return commands;
}

function usage(): void {
  process.stdout.write('Internal release source verification: node test/verification/source.ts [--scope all|common|platform] [--base <ref>] [--json] [--resume] [--force] [--round <round-id>] [--output <round-log.json>] [--invalidate <step-id,...>] [--selected <step-id,...>]\n');
}

function historicalSourceCosts(output: string | null) {
  const costs = new Map<string, { durationMs: number; resources: any }>();
  if (!output) return costs;
  const directory = path.dirname(output);
  let files: fs.Dirent[];
  try { files = fs.readdirSync(directory, { withFileTypes: true }); }
  catch { return costs; }
  for (const name of files.filter(file => file.isFile() && file.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).slice(0, 12)) {
    try {
      const file = path.join(directory, name.name);
      if (fs.statSync(file).size > 64 * 1024 ** 2) continue;
      const log = JSON.parse(fs.readFileSync(file, 'utf8'));
      assertCandidateRound(log);
      for (const { identity, result, environment } of log.records) {
        if (environment.platform !== process.platform || result.status !== 'passed' || result.disposition === 'reused'
          || !Number.isFinite(result.durationMs) || result.durationMs <= 0 || costs.has(identity.stepId)) continue;
        costs.set(identity.stepId, { durationMs: result.durationMs, resources: environment.arch === process.arch ? result.resources : undefined });
      }
    } catch { /* Historical costs are optional scheduling hints. */ }
  }
  return costs;
}

/** A user-selected round executes exactly the selected checks plus the
 * dependencies they actually need. Scope-outside checks are not executed and
 * are not claimed; they stay absent from this round instead of failing it. */
export function selectSourceVerificationSubset(plan: any, selectedIds: string[]): any {
  const byId: any = new Map(plan.steps.map((step: any) => [step.id, step]));
  // A release selection spans the whole Candidate, including the other
  // operating system and final-package checks. Only ids unknown to the
  // registry are mistakes; ids outside this plan are owned by another runner.
  const known = new Set<string>(verificationSteps.map((step: any) => step.id));
  // Plugin checks are registered by the plugin runner, not this service's list.
  for (const id of selectedIds) if (id.startsWith('dsh-plugin:')) known.add(id);
  const unknown = selectedIds.filter((id: string) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown selected verification step: ${unknown.sort().join(', ')}.`);
  const closure = new Set<string>();
  const visit = (id: string) => {
    if (closure.has(id)) return;
    closure.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (byId.has(dependency)) visit(dependency);
  };
  for (const id of selectedIds) if (byId.has(id)) visit(id);
  return { ...plan, steps: plan.steps.filter((step: any) => closure.has(step.id)), selectedStepIds: [...closure].sort() };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const args = parseSourceArgs(process.argv.slice(2));
    if (args.help) usage();
    else {
      const plan = createSourceVerificationPlan(process.platform, { scope: args.scope });
      const comparisonRequired = plan.steps.some((step: any) => step.reuse?.git === 'comparison');
      const selectedPlan = args.selected.length ? selectSourceVerificationSubset(plan, args.selected) : plan;
      const costs = historicalSourceCosts(args.output);
      const executionPlan = { ...selectedPlan, steps: selectedPlan.steps.map((step: any) => ({
        ...step, schedulingCostMs: costs.get(step.id)?.durationMs ?? step.schedulingCostMs,
      })) };
      const round = { protectResume: true, strictInputs: true, resume: args.resume, allowFullRerun: true, roundId: args.round ?? process.env.BUILDR_VERIFICATION_ROUND ?? randomUUID(), ...(args.output ? { output: path.resolve(args.output) } : {}), ...(args.invalidate.length ? { invalidStepIds: args.invalidate } : {}), ...(args.selected.length ? { selectedStepIds: executionPlan.selectedStepIds } : {}) };
      const reuseOptions = { productRoot, projectRoot, round, force: sourceVerificationForce(args.force),
        env: enforceOfflineVerification(comparisonRequired || args.base
          ? pinSourceVerificationBase(productRoot, process.env, args.base) : { ...process.env }) };
      if (args.json) {
        const reuse = createCandidateRoundExecution(executionPlan, { ...reuseOptions, inspectOnly: true }).explanation;
        process.stdout.write(`${JSON.stringify({ ...executionPlan, verificationBase: reuseOptions.env.BUILDR_VERIFICATION_BASE,
          reuse, preparation: sourceVerificationPreparation(executionPlan, reuse) }, null, 2)}\n`);
        if (plan.status !== 'ready' || reuse.fullRerun) process.exitCode = 1;
      } else {
        if (plan.status !== 'ready') throw new Error(plan.diagnostic?.message ?? 'Source verification plan is blocked.');
        assertMinimumNodeVersion(process.versions.node, fs.readFileSync(path.join(projectRoot, '.node-version'), 'utf8').trim());
        if (args.resume && !round.allowFullRerun && round.output && !fs.existsSync(round.output)) {
          assertCandidateResumeScope(createCandidateRoundExecution(executionPlan, { ...reuseOptions, inspectOnly: true }).explanation);
        }
        const executionProfile = resolveVerificationExecutionProfile(process.env.BUILDR_VERIFICATION_PROFILE, process.env, [...costs.values()].map(item => item.resources).filter(Boolean));
        const startedAt = Date.now();
        if (executionPlan.steps.some((step: any) => step.id === 'integration-candidate-release')) {
          execFileSync(process.execPath, ['--test', '--test-name-pattern=Candidate gate loads',
            path.join(productRoot, 'test/integration/release-contract-cold-start.test.ts')],
            { cwd: productRoot, stdio: 'inherit', timeout: 60_000 });
        }
        const prepared = prepareSourceVerificationEnvironment(executionPlan, reuseOptions, {
          assertAdmission(plan: any, reuse: any) {
            const reusable = new Set(reuse.steps.filter((step: any) => step.disposition === 'reuse').map((step: any) => step.id));
            assertVerificationResourceDemand({ steps: plan.steps.filter((step: any) => !reusable.has(step.id))
              .map((step: any) => localExecutionStep(step, executionProfile, executionProfile.limits)) }, executionProfile.limits, executionProfile);
          },
        });
        let v1CompatibilityRoot: string | null = null;
        let v1CompatibilityPackage: string | null = null;
        try {
          if (!reuseOptions.env.BUILDR_AGENT_V1_PACKAGE && prepared.preparation.stepIds.includes('agent-integration-compatibility')) {
            const v1Stdout = execFileSync(process.execPath, [
              path.join(projectRoot, 'services/buildr-harness/tools/testing/prepare-v1-compatibility.ts'),
              '974612e171af0a551cccaa6e8880735944bac717',
            ], {
              cwd: projectRoot,
              env: { ...process.env, npm_config_prefer_offline: 'true', ...(process.env.BUILDR_HOST_HOME ? { HOME: process.env.BUILDR_HOST_HOME } : {}) },
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: 180_000,
              maxBuffer: 16 * 1024 * 1024,
            });
            const v1Info = JSON.parse(v1Stdout.trim().split('\n').at(-1)!);
            v1CompatibilityRoot = v1Info.root;
            v1CompatibilityPackage = v1Info.packageRoot;
          }
          const environmentPreparationMs = Date.now() - startedAt;
          enforceOfflineVerification();
          const { executePlan } = await import('./plan-runner.ts');
          const evidence = createVerificationEvidencePaths('source');
          const source = collectVerificationSourceIdentity(productRoot, { projectRoot });
          const sourceObservationMs = Date.now() - startedAt - environmentPreparationMs;
          const cancellation = sourceVerificationCancellation();
          // Explicit preparation owns dependency installation. Wrapped development
          // commands inside checks must not start another implicit install while
          // the verification network policy is offline.
          const executionEnv = {
            ...reuseOptions.env,
            BUILDR_VERIFICATION_SAMPLE_RESOURCES: '1',
            ...(v1CompatibilityPackage ? { BUILDR_AGENT_V1_PACKAGE: v1CompatibilityPackage } : {}),
            BUILDR_DEVELOPMENT_PREPARE_SKIP: '1',
          };
          let execution: any;
          try {
            execution = await executePlan(executionPlan, {
              productRoot, projectRoot, env: executionEnv, diagnosticsDirectory: evidence.diagnosticsOutput,
              stream: process.stdout, errorStream: process.stderr, prefix: 'verify-source',
              concurrency: executionProfile.limits, executionProfile, schedulingMode: 'critical-path', runId: evidence.runId,
              taskId: process.env.BUILDR_TASK_ID ?? source.branch ?? 'source', signal: cancellation.signal,
              reuse: false, force: reuseOptions.force, round, preparations: sourcePreparationCommands(prepared),
            });
          } finally { cancellation.dispose(); }
          writeVerificationTimingEvidence({
            ...evidence, kind: 'source', source, status: execution.passed ? 'passed' : 'failed',
            results: execution.results, timings: { ...execution.timings, environmentPreparationMs, sourceObservationMs, sourceTotalMs: Date.now() - startedAt }, contextLifecycle: execution.contextLifecycle,
            startedAt, finishedAt: Date.now(), diagnosticsDirectory: evidence.diagnosticsOutput,
            prefix: 'verify-source', stream: process.stdout, errorStream: process.stderr, executionProfile,
          });
          if (cancellation.signal.aborted) process.exitCode = cancellation.exitCode();
          else if (!execution.passed) process.exitCode = 1;
        } finally {
          if (v1CompatibilityRoot) fs.rmSync(v1CompatibilityRoot, { recursive: true, force: true });
        }
      }
    }
  } catch (error: any) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
