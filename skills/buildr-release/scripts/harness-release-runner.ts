#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { inspectCandidate, type Target } from './harness-release.ts';
import { parseAdmissions } from './harness-release-admission.ts';
import { approvePendingEnvironmentDeployments, type EnvironmentApproval } from './environment-approval.ts';
import { isRetryableReadOnlyGhArgs, isTransientGhNetworkFailure, pauseSync } from './gh-read-retry.ts';
import { runReleasePreflight } from './release-preflight.ts';

export const HARNESS_RUNNER_REPO = 'BuildrAI/Buildr';
const ADMISSIONS_RELATIVE_PATH = 'skills/buildr-release/scripts/harness-release-admissions.json';
const REGISTRY = 'https://registry.npmjs.org/';
const ADMISSION_KEYS = ['target', 'version', 'sourceCommit', 'sourceTree', 'sha256', 'integrity', 'proofSha256'] as const;

export type AdmissionEntry = Record<typeof ADMISSION_KEYS[number], string>;

export type RunnerAction =
  | 'help'
  | 'preflight'
  | 'prepare'
  | 'handoff'
  | 'admit'
  | 'preserve'
  | 'publish'
  | 'readback'
  | 'cleanup';

export interface ParsedHarnessRunnerArgs {
  action: RunnerAction;
  repo: string;
  targets?: string[];
  target?: Target;
  version?: string;
  buildrVersion?: string;
  harnessVersion?: string;
  pluginVersion?: string;
  devPluginVersion?: string;
  dir?: string;
  dirs: string[];
  rehearsal: boolean;
  push: boolean;
  write: boolean;
  createPr: boolean;
  wait: boolean;
  authorized: boolean;
  autoReadback: boolean;
  dryRun: boolean;
  localBase: boolean;
  preserveRunId?: number;
  expectedLatest?: string;
  branch?: string;
  pollTimeoutMs: number;
}

export interface RunnerDependencies {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  ghRetryDelayMs?: number;
  execute?: (command: string, args: string[], options: { cwd: string; encoding: 'utf8'; timeout: number; maxBuffer?: number; env?: NodeJS.ProcessEnv }) => {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  };
}

export function harnessReleaseRunnerUsage(): string {
  return [
    'Usage: harness-release-runner.ts <command> [options]',
    '',
    'Unified local orchestrator for harness, dsh-buildr-harness, and dsh-buildr-development:',
    '  preflight   --targets <list> [--buildr-version <v>] [--harness-version <v>] [--plugin-version <v>] [--repo <dir>]',
    '  prepare     --target <harness|dsh-buildr-harness|dsh-buildr-development> --version <v> --dir <empty-dir> [--rehearsal]',
    '  handoff     --dir <candidate-dir> [--push] [--repo <dir>]',
    '  admit       --version <v> --dir <candidate-dir> [--dir <dir2> ...] [--write] [--push] [--create-pr] [--local-base] [--branch <name>] [--repo <dir>]',
    '  preserve    --dir <candidate-dir> [--wait] [--repo <dir>]',
    '  publish     --dir <candidate-dir> --preserve-run-id <id> --authorized [--wait] [--auto-readback] [--expected-latest <v>] [--poll-timeout-ms <ms>] [--repo <dir>]',
    '  readback    --dir <candidate-dir> [--preserve-run-id <id>] [--wait] [--expected-latest <v>] [--repo <dir>]',
    '  cleanup     --dir <candidate-dir> [--dir <dir2> ...] [--expected-latest <v>] [--dry-run] [--repo <dir>]',
  ].join('\n');
}

export function parseHarnessReleaseRunnerArgs(argv: string[], defaultRepo = path.resolve(import.meta.dirname, '../../..')): ParsedHarnessRunnerArgs {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return {
      action: 'help', repo: defaultRepo, dirs: [], rehearsal: false, push: false, write: false, createPr: false,
      wait: false, authorized: false, autoReadback: false, dryRun: false, localBase: false, pollTimeoutMs: 12 * 60_000,
    };
  }
  const [rawAction, ...rest] = argv;
  if (!['preflight', 'prepare', 'handoff', 'admit', 'preserve', 'publish', 'readback', 'cleanup'].includes(rawAction ?? '')) {
    throw new Error(`Unsupported command: ${rawAction ?? '<missing>'} (see --help).`);
  }
  const parsed: ParsedHarnessRunnerArgs = {
    action: rawAction as RunnerAction,
    repo: defaultRepo,
    dirs: [],
    rehearsal: false,
    push: false,
    write: false,
    createPr: false,
    wait: false,
    authorized: false,
    autoReadback: false,
    dryRun: false,
    localBase: false,
    pollTimeoutMs: 12 * 60_000,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--rehearsal') { parsed.rehearsal = true; continue; }
    if (flag === '--push') { parsed.push = true; continue; }
    if (flag === '--write') { parsed.write = true; continue; }
    if (flag === '--create-pr') { parsed.createPr = true; continue; }
    if (flag === '--wait') { parsed.wait = true; continue; }
    if (flag === '--authorized') { parsed.authorized = true; continue; }
    if (flag === '--auto-readback') { parsed.autoReadback = true; continue; }
    if (flag === '--dry-run') { parsed.dryRun = true; continue; }
    if (flag === '--local-base') { parsed.localBase = true; continue; }
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${flag ?? '<missing>'}`);
    }
    if (flag === '--repo') parsed.repo = path.resolve(value);
    else if (flag === '--targets') parsed.targets = value.split(',').map(item => item.trim()).filter(Boolean);
    else if (flag === '--target') parsed.target = value as Target;
    else if (flag === '--version') parsed.version = value;
    else if (flag === '--buildr-version') parsed.buildrVersion = value;
    else if (flag === '--harness-version') parsed.harnessVersion = value;
    else if (flag === '--plugin-version') parsed.pluginVersion = value;
    else if (flag === '--dev-plugin-version') parsed.devPluginVersion = value;
    else if (flag === '--dir') {
      const resolved = path.resolve(value);
      parsed.dir ??= resolved;
      parsed.dirs.push(resolved);
    } else if (flag === '--preserve-run-id') parsed.preserveRunId = Number(value);
    else if (flag === '--expected-latest') parsed.expectedLatest = value;
    else if (flag === '--branch') parsed.branch = value;
    else if (flag === '--poll-timeout-ms') parsed.pollTimeoutMs = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  return parsed;
}

function sha256Buffer(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(file: string): string {
  return sha256Buffer(fs.readFileSync(file));
}

export function buildHarnessAdmissionEntries(dirs: string[]): AdmissionEntry[] {
  if (dirs.length === 0) throw new Error('At least one --dir candidate directory is required.');
  return dirs.map(dir => {
    const { candidate } = inspectCandidate(dir);
    if (candidate.rehearsal) throw new Error(`Rehearsal candidate cannot be admitted: ${dir}`);
    const proofFile = path.join(dir, 'verification.json');
    if (!fs.existsSync(proofFile)) throw new Error(`Missing verification.json in ${dir}`);
    const proofBytes = fs.readFileSync(proofFile);
    const proof = JSON.parse(proofBytes.toString('utf8'));
    if (proof?.status !== 'passed' || proof?.sha256 !== candidate.sha256) {
      throw new Error(`Verification proof does not match passed candidate bytes in ${dir}`);
    }
    return {
      target: candidate.target,
      version: candidate.version,
      sourceCommit: candidate.sourceCommit,
      sourceTree: candidate.sourceTree,
      sha256: candidate.sha256,
      integrity: candidate.integrity,
      proofSha256: sha256Buffer(proofBytes),
    };
  });
}

export function appendHarnessAdmissions(existingRaw: string, additions: AdmissionEntry[]): {
  updatedRaw: string;
  added: AdmissionEntry[];
  total: number;
} {
  const existing = parseAdmissions(existingRaw);
  const next = [...existing, ...additions];
  const serialized = JSON.stringify({ schemaVersion: 'buildr.harness-release-admissions/v1', admissions: next }, null, 2) + '\n';
  parseAdmissions(serialized);
  return { updatedRaw: serialized, added: additions, total: next.length };
}

function defaultExec(command: string, args: string[], options: { cwd: string; encoding: 'utf8'; timeout: number; maxBuffer?: number; env?: NodeJS.ProcessEnv }) {
  const hostHome = process.env.BUILDR_HOST_HOME;
  const env = hostHome ? { ...process.env, HOME: hostHome, ...options.env } : { ...process.env, ...options.env };
  const result = spawnSync(command, args, { ...options, env, maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024 });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error,
  };
}

function runCommand(
  executable: string,
  args: string[],
  cwd: string,
  deps: RunnerDependencies,
  timeout = 60_000,
): string {
  const exec = deps.execute ?? defaultExec;
  const retryable = executable === 'gh' && isRetryableReadOnlyGhArgs(args);
  const maxAttempts = retryable ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = exec(executable, args, { cwd, encoding: 'utf8', timeout });
    if (result.status === 0 && !result.error) return String(result.stdout ?? '').trim();
    if (attempt < maxAttempts && isTransientGhNetworkFailure(result)) {
      const waitMs = deps.ghRetryDelayMs ?? (deps.execute ? 0 : 1_000 * attempt);
      pauseSync(waitMs);
      continue;
    }
    throw new Error(`${executable} ${args.slice(0, 3).join(' ')} failed (${result.status ?? 'error'}): ${result.stderr || result.error?.message || ''}`.trim());
  }
  throw new Error(`${executable} failed unexpectedly`);
}

export async function verifyPublicHarnessRelease(
  candidate: {
    target: Target;
    packageName: string;
    version: string;
    file: string;
    sha256: string;
    integrity: string;
    sourceCommit: string;
  },
  options: { expectedLatest?: string; repo?: string } = {},
  deps: RunnerDependencies = {},
): Promise<Record<string, unknown>> {
  const fetchImpl = deps.fetch ?? fetch;
  const tagName = candidate.version.includes('-rc.') ? 'next' : 'latest';
  const versionRes = await fetchImpl(`${REGISTRY}${encodeURIComponent(candidate.packageName)}/${encodeURIComponent(candidate.version)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!versionRes.ok) throw new Error(`npm version ${candidate.packageName}@${candidate.version} returned HTTP ${versionRes.status}`);
  const metadata = await versionRes.json() as any;
  if (metadata?.dist?.integrity !== candidate.integrity) {
    throw new Error(`npm integrity mismatch for ${candidate.packageName}@${candidate.version}`);
  }
  const tagsRes = await fetchImpl(`${REGISTRY}-/package/${encodeURIComponent(candidate.packageName)}/dist-tags`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!tagsRes.ok) throw new Error(`npm dist-tags query failed for ${candidate.packageName}: ${tagsRes.status}`);
  const tags = await tagsRes.json() as Record<string, string>;
  if (tags[tagName] !== candidate.version) {
    throw new Error(`npm dist-tag ${tagName} is ${tags[tagName]}, expected ${candidate.version}`);
  }
  if (options.expectedLatest && tags.latest !== options.expectedLatest) {
    throw new Error(`npm dist-tag latest changed to ${tags.latest}, expected ${options.expectedLatest}`);
  }
  const tgzRes = await fetchImpl(metadata.dist.tarball, { signal: AbortSignal.timeout(60_000) });
  if (!tgzRes.ok) throw new Error(`npm tarball download returned HTTP ${tgzRes.status}`);
  const npmSha256 = sha256Buffer(Buffer.from(await tgzRes.arrayBuffer()));
  if (npmSha256 !== candidate.sha256) {
    throw new Error(`npm tarball sha256 mismatch: expected ${candidate.sha256}, got ${npmSha256}`);
  }

  let releaseTag: string | null = null;
  let releaseUrl: string | null = null;
  if (candidate.target === 'dsh-buildr-harness' || candidate.target === 'dsh-buildr-development') {
    const cwd = options.repo ?? process.cwd();
    releaseTag = `${candidate.target}-v${candidate.version}`;
    const release = JSON.parse(runCommand('gh', ['release', 'view', releaseTag, '--repo', HARNESS_RUNNER_REPO, '--json', 'tagName,url,assets'], cwd, deps));
    if (release?.tagName !== releaseTag) throw new Error(`GitHub Release tag mismatch: ${release?.tagName}`);
    releaseUrl = release.url ?? null;
    const tagOut = runCommand('git', ['ls-remote', 'origin', `refs/tags/${releaseTag}`, `refs/tags/${releaseTag}^{}`], cwd, deps);
    const actualTagCommit = tagOut.split('\n').filter(Boolean).at(-1)?.split(/\s+/u)[0];
    if (actualTagCommit !== candidate.sourceCommit) {
      throw new Error(`GitHub Release tag commit ${actualTagCommit} !== expected ${candidate.sourceCommit}`);
    }
    const dlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-public-gh-'));
    try {
      const outPath = path.join(dlRoot, candidate.file);
      runCommand('gh', ['release', 'download', releaseTag, '--repo', HARNESS_RUNNER_REPO, '--pattern', candidate.file, '--output', outPath], cwd, deps);
      const ghSha = sha256File(outPath);
      if (ghSha !== candidate.sha256) {
        throw new Error(`GitHub Release asset sha256 mismatch: expected ${candidate.sha256}, got ${ghSha}`);
      }
    } finally {
      fs.rmSync(dlRoot, { recursive: true, force: true });
    }
  }

  return {
    status: 'confirmed',
    target: candidate.target,
    packageName: candidate.packageName,
    version: candidate.version,
    sha256: candidate.sha256,
    integrity: candidate.integrity,
    distTags: tags,
    releaseTag,
    releaseUrl,
  };
}

async function waitForWorkflowRunDiscovery(
  workflow: string,
  beforeIds: Set<number>,
  expectedTitle: string,
  cwd: string,
  deps: RunnerDependencies,
): Promise<number> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const runs = JSON.parse(runCommand('gh', [
      'run', 'list', '--repo', HARNESS_RUNNER_REPO, '--workflow', workflow, '--branch', 'main',
      '--event', 'workflow_dispatch', '--limit', '20', '--json', 'databaseId,displayTitle,status,conclusion',
    ], cwd, deps)) as Array<{ databaseId: number; displayTitle: string }>;
    const found = runs.find(item => !beforeIds.has(item.databaseId) && item.displayTitle === expectedTitle);
    if (found) return Number(found.databaseId);
    await sleep(2_500);
  }
  throw new Error(`Could not locate new workflow run for ${workflow} (${expectedTitle}).`);
}

function listWorkflowRuns(workflow: string, cwd: string, deps: RunnerDependencies) {
  return JSON.parse(runCommand('gh', [
    'run', 'list', '--repo', HARNESS_RUNNER_REPO, '--workflow', workflow, '--branch', 'main',
    '--event', 'workflow_dispatch', '--limit', '30', '--json', 'databaseId,displayTitle,status,conclusion,url',
  ], cwd, deps)) as Array<{ databaseId: number; displayTitle: string; status: string; conclusion: string | null; url: string }>;
}

async function waitForWorkflowRunWithOptionalApproval(
  runId: number,
  options: { approveEnvironment?: string; cwd: string },
  deps: RunnerDependencies,
): Promise<any> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const effects: EnvironmentApproval[] = [];
  if (options.approveEnvironment) {
    const deadline = (deps.now ?? Date.now)() + 90_000;
    while ((deps.now ?? Date.now)() < deadline) {
      const run = JSON.parse(runCommand('gh', ['api', `repos/${HARNESS_RUNNER_REPO}/actions/runs/${runId}`], options.cwd, deps));
      if (run.status === 'completed') break;
      if (approvePendingEnvironmentDeployments(
        runId,
        HARNESS_RUNNER_REPO,
        options.approveEnvironment,
        ghArgs => runCommand('gh', ghArgs, options.cwd, deps),
        effects,
      )) break;
      await sleep(3_000);
    }
  }
  if (deps.execute) {
    try {
      runCommand('gh', ['run', 'watch', String(runId), '--repo', HARNESS_RUNNER_REPO, '--exit-status', '--interval', '10'], options.cwd, deps, 25 * 60_000);
    } catch { /* inspect final run state explicitly below */ }
  } else {
    const hostHome = process.env.BUILDR_HOST_HOME;
    const watchEnv = hostHome ? { ...process.env, HOME: hostHome } : process.env;
    spawnSync('gh', ['run', 'watch', String(runId), '--repo', HARNESS_RUNNER_REPO, '--exit-status', '--interval', '10'], {
      cwd: options.cwd,
      env: watchEnv,
      stdio: 'inherit',
      timeout: 25 * 60_000,
    });
  }
  const finalRun = JSON.parse(runCommand('gh', ['api', `repos/${HARNESS_RUNNER_REPO}/actions/runs/${runId}`], options.cwd, deps));
  const jobsPayload = JSON.parse(runCommand('gh', ['api', `repos/${HARNESS_RUNNER_REPO}/actions/runs/${runId}/jobs`], options.cwd, deps));
  return { run: finalRun, jobs: jobsPayload.jobs ?? [], effects };
}

export async function runHarnessReleaseCommand(parsed: ParsedHarnessRunnerArgs, deps: RunnerDependencies = {}): Promise<Record<string, unknown>> {
  const repo = parsed.repo;
  if (parsed.action === 'help') {
    return { status: 'help', usage: harnessReleaseRunnerUsage() };
  }
  if (parsed.action === 'preflight') {
    return runReleasePreflight({
      repo,
      targets: parsed.targets ?? ['harness', 'dsh-buildr-harness'],
      buildrVersion: parsed.buildrVersion,
      harnessVersion: parsed.harnessVersion,
      pluginVersion: parsed.pluginVersion,
      devPluginVersion: parsed.devPluginVersion,
    }) as unknown as Record<string, unknown>;
  }
  if (parsed.action === 'prepare') {
    if (!parsed.target || !parsed.version || !parsed.dir) {
      throw new Error('prepare requires --target, --version, and --dir.');
    }
    const cli = path.join(repo, 'skills/buildr-release/scripts/harness-release.ts');
    const args = [cli, 'prepare', parsed.target, parsed.version, parsed.dir, ...(parsed.rehearsal ? ['--rehearsal'] : [])];
    const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600_000 });
    if (result.error || result.status !== 0) throw result.error ?? new Error('harness-release.ts prepare failed');
    return JSON.parse(result.stdout);
  }
  if (parsed.action === 'handoff') {
    if (!parsed.dir) throw new Error('handoff requires --dir.');
    const { candidate } = inspectCandidate(parsed.dir);
    const cli = path.join(repo, 'skills/buildr-release/scripts/harness-handoff.ts');
    const packed = JSON.parse(runCommand(process.execPath, [cli, 'pack', parsed.dir, candidate.sha256], repo, deps, 120_000));
    if (parsed.push) {
      const remoteRef = packed.ref as string;
      const before = runCommand('git', ['ls-remote', 'origin', remoteRef], repo, deps).split(/\s+/u)[0] || null;
      if (before && before !== packed.commit) {
        throw new Error(`Immutable data ref ${remoteRef} already exists with different commit ${before}.`);
      }
      if (!before) {
        runCommand('git', ['push', 'origin', `${packed.commit}:${remoteRef}`], repo, deps, 120_000);
      }
      return { ...packed, pushed: true, existing: Boolean(before) };
    }
    return { ...packed, pushed: false };
  }
  if (parsed.action === 'admit') {
    if (!parsed.version || parsed.dirs.length === 0) throw new Error('admit requires --version and one or more --dir flags.');
    const additions = buildHarnessAdmissionEntries(parsed.dirs);
    if (additions.some(entry => entry.version !== parsed.version)) {
      throw new Error(`Every admitted candidate must match --version ${parsed.version}.`);
    }
    const branch = parsed.branch ?? `codex/release-harness-admission-v${parsed.version}`;
    if (!/^codex\/release-harness-admission-v\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/u.test(branch)) {
      throw new Error(`Admission PR branch must match codex/release-harness-admission-v<version>: ${branch}`);
    }
    if (!parsed.localBase) {
      runCommand('git', ['fetch', '--no-tags', 'origin', 'main'], repo, deps, 60_000);
    }
    const existingRaw = parsed.localBase
      ? fs.readFileSync(path.join(repo, ADMISSIONS_RELATIVE_PATH), 'utf8')
      : runCommand('git', ['show', `origin/main:${ADMISSIONS_RELATIVE_PATH}`], repo, deps);
    const { updatedRaw, added, total } = appendHarnessAdmissions(existingRaw, additions);

    if (!parsed.write && !parsed.push && !parsed.createPr) {
      return { status: 'planned', branch, additions: added, total };
    }
    if (parsed.createPr || parsed.push) {
      const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-admit-wt-'));
      try {
        const baseSha = runCommand('git', ['rev-parse', 'origin/main'], repo, deps);
        runCommand('git', ['worktree', 'add', '--detach', worktreeRoot, baseSha], repo, deps);
        execFileSync('git', ['checkout', '-B', branch, baseSha], { cwd: worktreeRoot, encoding: 'utf8', timeout: 30_000 });
        fs.writeFileSync(path.join(worktreeRoot, ADMISSIONS_RELATIVE_PATH), updatedRaw);
        runCommand('git', ['add', ADMISSIONS_RELATIVE_PATH], worktreeRoot, deps);
        runCommand('git', ['commit', '-m', `Admit Harness ${parsed.version} candidates`], worktreeRoot, deps);
        const headCommit = runCommand('git', ['rev-parse', 'HEAD'], worktreeRoot, deps);
        let prUrl: string | null = null;
        if (parsed.push || parsed.createPr) {
          runCommand('git', ['push', '-u', 'origin', `${branch}:${branch}`], worktreeRoot, deps, 60_000);
        }
        if (parsed.createPr) {
          prUrl = runCommand('gh', [
            'pr', 'create', '--repo', HARNESS_RUNNER_REPO, '--base', 'main', '--head', branch,
            '--title', `Admit Harness ${parsed.version}`,
            '--body', `Append verified ${parsed.version} candidate(s) (${added.map(item => item.target).join(', ')}).`,
          ], worktreeRoot, deps);
        }
        return { status: parsed.createPr ? 'pr-created' : 'pushed', branch, headCommit, prUrl, additions: added, total };
      } finally {
        try { runCommand('git', ['worktree', 'remove', '--force', worktreeRoot], repo, deps); } catch { /* best effort cleanup */ }
        fs.rmSync(worktreeRoot, { recursive: true, force: true });
      }
    }
    fs.writeFileSync(path.join(repo, ADMISSIONS_RELATIVE_PATH), updatedRaw);
    return { status: 'written', path: path.join(repo, ADMISSIONS_RELATIVE_PATH), branch, additions: added, total };
  }
  if (parsed.action === 'preserve') {
    if (!parsed.dir) throw new Error('preserve requires --dir.');
    const { candidate } = inspectCandidate(parsed.dir);
    if (candidate.rehearsal) throw new Error('Rehearsal candidates cannot be preserved to main.');
    const dataRef = `refs/heads/release-data/harness-${candidate.sha256}`;
    const dataCommit = runCommand('git', ['ls-remote', 'origin', dataRef], repo, deps).split(/\s+/u)[0];
    if (!dataCommit) throw new Error(`Remote data ref not found (${dataRef}); run handoff --push first.`);
    const expectedTitle = `Harness preserve ${candidate.target} ${candidate.version}`;
    const existing = listWorkflowRuns('preserve-harness.yml', repo, deps)
      .find(item => item.displayTitle === expectedTitle && (item.status !== 'completed' || item.conclusion === 'success'));
    let runId = existing?.databaseId;
    if (!runId) {
      const beforeIds = new Set(listWorkflowRuns('preserve-harness.yml', repo, deps).map(item => item.databaseId));
      runCommand('gh', [
        'workflow', 'run', 'preserve-harness.yml', '--repo', HARNESS_RUNNER_REPO, '--ref', 'main',
        '-f', `release_target=${candidate.target}`,
        '-f', `version=${candidate.version}`,
        '-f', `source_commit=${candidate.sourceCommit}`,
        '-f', `data_commit=${dataCommit}`,
        '-f', `original_sha256=${candidate.sha256}`,
      ], repo, deps);
      runId = await waitForWorkflowRunDiscovery('preserve-harness.yml', beforeIds, expectedTitle, repo, deps);
    }
    if (!parsed.wait) {
      return { status: 'preserve-dispatched', runId, artifactName: `harness-original-${candidate.sha256}` };
    }
    const watched = await waitForWorkflowRunWithOptionalApproval(runId, { cwd: repo }, deps);
    if (watched.run.conclusion !== 'success') {
      throw new Error(`preserve-harness run ${runId} finished with conclusion=${watched.run.conclusion}`);
    }
    const artifacts = JSON.parse(runCommand('gh', ['api', `repos/${HARNESS_RUNNER_REPO}/actions/runs/${runId}/artifacts`], repo, deps)).artifacts ?? [];
    const expectedName = `harness-original-${candidate.sha256}`;
    const match = artifacts.find((item: any) => item.name === expectedName);
    if (!match) throw new Error(`Expected preserved artifact ${expectedName} missing from run ${runId}.`);
    return { status: 'preserved', runId, artifactName: expectedName, artifactId: match.id, sizeInBytes: match.size_in_bytes, reused: Boolean(existing) };
  }
  if (parsed.action === 'publish') {
    if (!parsed.dir) throw new Error('publish requires --dir.');
    if (!parsed.authorized) throw new Error('publish requires explicit --authorized.');
    if (!Number.isSafeInteger(parsed.preserveRunId) || (parsed.preserveRunId ?? 0) < 1) {
      throw new Error('publish requires --preserve-run-id <id>.');
    }
    const { candidate } = inspectCandidate(parsed.dir);
    const artifactName = `harness-original-${candidate.sha256}`;
    const expectedTitle = `Harness publish ${candidate.target} ${candidate.version}`;
    const existing = listWorkflowRuns('publish-harness.yml', repo, deps).find(item => item.displayTitle === expectedTitle);
    let runId = existing?.databaseId;
    if (!runId) {
      const beforeIds = new Set(listWorkflowRuns('publish-harness.yml', repo, deps).map(item => item.databaseId));
      runCommand('gh', [
        'workflow', 'run', 'publish-harness.yml', '--repo', HARNESS_RUNNER_REPO, '--ref', 'main',
        '-f', `release_target=${candidate.target}`,
        '-f', `version=${candidate.version}`,
        '-f', `candidate_run_id=${parsed.preserveRunId}`,
        '-f', `candidate_artifact=${artifactName}`,
        '-f', `source_commit=${candidate.sourceCommit}`,
        '-f', `original_sha256=${candidate.sha256}`,
        '-f', 'mode=publish',
      ], repo, deps);
      runId = await waitForWorkflowRunDiscovery('publish-harness.yml', beforeIds, expectedTitle, repo, deps);
    }
    if (!parsed.wait) {
      return { status: 'publish-dispatched', publishRunId: runId, preserveRunId: parsed.preserveRunId, reused: Boolean(existing) };
    }
    const watched = await waitForWorkflowRunWithOptionalApproval(runId, { approveEnvironment: 'npm-production', cwd: repo }, deps);
    if (watched.run.conclusion === 'success') {
      const verified = await verifyPublicHarnessRelease(candidate, { expectedLatest: parsed.expectedLatest, repo }, deps);
      return { ...verified, publishRunId: runId, preserveRunId: parsed.preserveRunId, effects: watched.effects };
    }
    const publishJob = watched.jobs.find((job: any) => job.name === 'publish');
    const finalizeJob = watched.jobs.find((job: any) => job.name === 'finalize');
    if (publishJob?.conclusion === 'success' && finalizeJob?.conclusion && finalizeJob.conclusion !== 'success') {
      if (!parsed.autoReadback) {
        return {
          status: 'propagation-pending',
          publishRunId: runId,
          preserveRunId: parsed.preserveRunId,
          nextAction: `Upload succeeded in publish job of run ${runId}; run 'harness-release-runner.ts readback --dir ${parsed.dir} --preserve-run-id ${parsed.preserveRunId} --wait' without npm-production approval once npm settles.`,
        };
      }
      // Wait locally for npm propagation up to bounded pollTimeoutMs, then trigger non-approval readback
      const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
      const deadline = (deps.now ?? Date.now)() + parsed.pollTimeoutMs;
      let visible = false;
      while ((deps.now ?? Date.now)() < deadline) {
        try {
          const res = await (deps.fetch ?? fetch)(`${REGISTRY}${encodeURIComponent(candidate.packageName)}/${encodeURIComponent(candidate.version)}`, { signal: AbortSignal.timeout(10_000) });
          if (res.ok) { visible = true; break; }
        } catch { /* retry until deadline */ }
        await sleep(10_000);
      }
      if (!visible) {
        return { status: 'propagation-pending', publishRunId: runId, preserveRunId: parsed.preserveRunId };
      }
      return runHarnessReleaseCommand({ ...parsed, action: 'readback' }, deps);
    }
    throw new Error(`publish-harness run ${runId} failed (conclusion=${watched.run.conclusion}).`);
  }
  if (parsed.action === 'readback') {
    if (!parsed.dir) throw new Error('readback requires --dir.');
    if (!Number.isSafeInteger(parsed.preserveRunId) || (parsed.preserveRunId ?? 0) < 1) {
      throw new Error('readback requires --preserve-run-id <id>.');
    }
    const { candidate } = inspectCandidate(parsed.dir);
    const artifactName = `harness-original-${candidate.sha256}`;
    const expectedTitle = `Harness readback ${candidate.target} ${candidate.version}`;
    const beforeIds = new Set(listWorkflowRuns('publish-harness.yml', repo, deps).map(item => item.databaseId));
    runCommand('gh', [
      'workflow', 'run', 'publish-harness.yml', '--repo', HARNESS_RUNNER_REPO, '--ref', 'main',
      '-f', `release_target=${candidate.target}`,
      '-f', `version=${candidate.version}`,
      '-f', `candidate_run_id=${parsed.preserveRunId}`,
      '-f', `candidate_artifact=${artifactName}`,
      '-f', `source_commit=${candidate.sourceCommit}`,
      '-f', `original_sha256=${candidate.sha256}`,
      '-f', 'mode=readback',
    ], repo, deps);
    const runId = await waitForWorkflowRunDiscovery('publish-harness.yml', beforeIds, expectedTitle, repo, deps);
    if (!parsed.wait) {
      return { status: 'readback-dispatched', readbackRunId: runId, preserveRunId: parsed.preserveRunId };
    }
    const watched = await waitForWorkflowRunWithOptionalApproval(runId, { cwd: repo }, deps);
    if (watched.run.conclusion !== 'success') {
      throw new Error(`readback run ${runId} finished with conclusion=${watched.run.conclusion}`);
    }
    const verified = await verifyPublicHarnessRelease(candidate, { expectedLatest: parsed.expectedLatest, repo }, deps);
    return { ...verified, readbackRunId: runId, preserveRunId: parsed.preserveRunId };
  }
  if (parsed.action === 'cleanup') {
    if (parsed.dirs.length === 0) throw new Error('cleanup requires one or more --dir flags.');
    const cleaned: Array<{ target: string; ref: string; status: string }> = [];
    for (const dir of parsed.dirs) {
      const { candidate } = inspectCandidate(dir);
      await verifyPublicHarnessRelease(candidate, { expectedLatest: parsed.expectedLatest, repo }, deps);
      const ref = `refs/heads/release-data/harness-${candidate.sha256}`;
      const existingSha = runCommand('git', ['ls-remote', 'origin', ref], repo, deps).split(/\s+/u)[0] || null;
      if (!existingSha) {
        cleaned.push({ target: candidate.target, ref, status: 'already-absent' });
      } else if (parsed.dryRun) {
        cleaned.push({ target: candidate.target, ref, status: 'dry-run-ready' });
      } else {
        runCommand('git', ['push', 'origin', '--delete', `--force-with-lease=${ref}:${existingSha}`, ref.replace(/^refs\/heads\//u, '')], repo, deps, 60_000);
        cleaned.push({ target: candidate.target, ref, status: 'deleted' });
      }
    }
    return { status: 'cleaned', items: cleaned };
  }
  throw new Error(`Unhandled action: ${parsed.action}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const parsed = parseHarnessReleaseRunnerArgs(process.argv.slice(2));
  if (parsed.action === 'help') {
    console.log(harnessReleaseRunnerUsage());
  } else {
    const result = await runHarnessReleaseCommand(parsed);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'action-required' || result.status === 'propagation-pending') {
      process.exitCode = 1;
    }
  }
}
