/** Protected consumer and post-upload finalize handler: never builds or executes code from candidate transport. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectCandidate } from './harness-release.ts';
import { assertAdmittedHarnessOriginal } from './harness-release-admission.ts';

export const HARNESS_PUBLISH_REPOSITORY = 'BuildrAI/Buildr';
export const HARNESS_PUBLISH_WORKFLOW = `${HARNESS_PUBLISH_REPOSITORY}/.github/workflows/publish-harness.yml@refs/heads/main`;
const REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_READBACK_TIMEOUT_MS = 15 * 60_000;
const MIN_READBACK_TIMEOUT_MS = 1_000;
const MAX_READBACK_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_INITIAL_DELAY_MS = 5_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

export type HarnessPublishMode = 'publish' | 'readback';

export interface RunHarnessPublishOptions {
  dir: string;
  expectedCommit: string;
  expectedSha: string;
  mode: HarnessPublishMode | string;
  env?: NodeJS.ProcessEnv;
  readbackTimeoutMs?: number;
  readbackInitialDelayMs?: number;
  readbackMaxDelayMs?: number;
}

export interface RunHarnessPublishDependencies {
  fetch?: typeof fetch;
  execFileSync?: typeof execFileSync;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
  inspect?: typeof inspectCandidate;
  assertAdmitted?: typeof assertAdmittedHarnessOriginal;
}

const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function resolveReadbackTimeoutMs(explicit: number | undefined, env: NodeJS.ProcessEnv): number {
  const raw = explicit ?? (env.HARNESS_READBACK_TIMEOUT_MS ? Number(env.HARNESS_READBACK_TIMEOUT_MS) : DEFAULT_READBACK_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < MIN_READBACK_TIMEOUT_MS || raw > MAX_READBACK_TIMEOUT_MS) {
    throw Error('readback-timeout-invalid');
  }
  return Math.floor(raw);
}

export async function runHarnessPublish(
  options: RunHarnessPublishOptions,
  dependencies: RunHarnessPublishDependencies = {},
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  const mode = options.mode;
  const fetchImpl = dependencies.fetch ?? fetch;
  const runExec = dependencies.execFileSync ?? execFileSync;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? ((line: string) => console.log(line));
  const git = (...args: string[]) => String(runExec('git', args, { encoding: 'utf8', timeout: 30_000 })).trim();

  if (!options.dir || !options.expectedCommit || !options.expectedSha || !['publish', 'readback'].includes(mode) ||
      env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      env.GITHUB_REPOSITORY !== HARNESS_PUBLISH_REPOSITORY || env.GITHUB_REPOSITORY_ID !== '993537957' ||
      env.GITHUB_WORKFLOW_REF !== HARNESS_PUBLISH_WORKFLOW || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !env.GH_TOKEN ||
      (mode === 'publish' && (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN))) {
    throw Error('protected-harness-publisher-required');
  }

  async function github(endpoint: string) {
    const response = await fetchImpl(`https://api.github.com/repos/${HARNESS_PUBLISH_REPOSITORY}/${endpoint}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`github-readback-unavailable: ${response.status}`);
    return response.json() as Promise<any>;
  }

  async function queryVersion(name: string, version: string) {
    const response = await fetchImpl(`${REGISTRY}${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`registry-unavailable: ${response.status}`);
    const metadata = await response.json() as any;
    if (metadata?.name !== name || metadata?.version !== version || typeof metadata?.dist?.integrity !== 'string') {
      throw Error('registry-identity-invalid');
    }
    return metadata;
  }

  async function queryDistTags(name: string) {
    const response = await fetchImpl(`${REGISTRY}-/package/${encodeURIComponent(name)}/dist-tags`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`registry-unavailable: ${response.status}`);
    return response.json() as Promise<Record<string, string>>;
  }

  const { candidate, file, distribution } = (dependencies.inspect ?? inspectCandidate)(options.dir);
  if (candidate.target !== env.RELEASE_TARGET || candidate.version !== env.RELEASE_VERSION || candidate.rehearsal ||
      candidate.sourceCommit !== options.expectedCommit || candidate.sha256 !== options.expectedSha ||
      git('rev-parse', 'HEAD') !== env.GITHUB_SHA) {
    throw Error('publication-candidate-source-mismatch');
  }
  if (candidate.target === 'harness' && distribution?.status !== 'eligible') {
    throw Error('distribution-approval-required');
  }

  const verificationBytes = fs.readFileSync(path.join(options.dir, 'verification.json'));
  const gitFromCwd = (args: string[]) => git(...args);
  const proof = (dependencies.assertAdmitted ?? assertAdmittedHarnessOriginal)(candidate, verificationBytes, undefined, gitFromCwd);
  if (candidate.target === 'dsh-buildr-harness') {
    const provider = await queryVersion('@buildr-ai/buildr-harness', proof.harnessVersion);
    if (!provider || provider.dist.integrity !== proof.harnessIntegrity ||
        !provider.buildrCompatibility?.provides?.some((item: any) =>
          item.feature === 'desktop-entry' && item.contracts?.includes('buildr.harness-desktop-web/v1'))) {
      throw Error('verified-harness-peer-not-published');
    }
  } else if (candidate.target === 'dsh-buildr-development') {
    const provider = await queryVersion('@buildr-ai/buildr', proof.buildrVersion);
    if (!provider || provider.dist.integrity !== proof.buildrIntegrity) {
      throw Error('verified-buildr-peer-not-published');
    }
  }

  const tagName = candidate.version.includes('-rc.') ? 'next' : 'latest';
  const verifyPublished = (metadata: any) => {
    if (metadata.dist.integrity !== candidate.integrity) throw Error('published-package-bytes-differ');
  };

  if (mode === 'publish') {
    const before = await queryVersion(candidate.packageName, candidate.version);
    if (before) {
      verifyPublished(before);
      const result = { status: 'already-published', name: candidate.packageName, version: candidate.version, sha256: candidate.sha256 };
      log(JSON.stringify(result));
      return result;
    }
    if (env.GITHUB_RUN_ATTEMPT !== '1') {
      throw Error('publication-not-confirmed: inspect the original attempt; not uploading');
    }
    const selection = `Harness publish ${candidate.target} ${candidate.version}`;
    const runs = await github('actions/workflows/publish-harness.yml/runs?branch=main&event=workflow_dispatch&per_page=100');
    if (!runs || !Array.isArray(runs.workflow_runs) || runs.total_count > runs.workflow_runs.length ||
        runs.workflow_runs.some((run: any) => String(run.id) !== env.GITHUB_RUN_ID && run.display_title === selection)) {
      throw Error('prior-publication-request: readback only');
    }
    log(JSON.stringify({ status: 'upload-attempted', name: candidate.packageName, version: candidate.version, sha256: candidate.sha256 }));
    runExec('npm', [
      'publish', file, '--access', 'public', '--tag', tagName,
      '--ignore-scripts', '--provenance', '--registry', REGISTRY, '--fetch-retries', '0',
    ], { cwd: options.dir, stdio: 'inherit', timeout: 180_000 });
    const uploaded = { status: 'uploaded', name: candidate.packageName, version: candidate.version, sha256: candidate.sha256, distTag: tagName };
    log(JSON.stringify(uploaded));
    return uploaded;
  }

  // Readback mode never runs npm publish; poll until npm metadata & dist-tag propagate.
  const deadline = now() + resolveReadbackTimeoutMs(options.readbackTimeoutMs, env);
  const initialDelay = Math.max(0, options.readbackInitialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);
  const maxDelay = Math.max(initialDelay, options.readbackMaxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  let npmObserved = false;
  let distTagConfirmed = false;
  let attempt = 0;

  for (;;) {
    try {
      const metadata = await queryVersion(candidate.packageName, candidate.version);
      if (metadata) {
        verifyPublished(metadata);
        npmObserved = true;
        const distTags = await queryDistTags(candidate.packageName);
        if (distTags?.[tagName] === candidate.version) {
          distTagConfirmed = true;
          break;
        }
      }
    } catch (error: any) {
      if (error?.message === 'published-package-bytes-differ' || error?.message === 'registry-identity-invalid') {
        throw error;
      }
      // Transient registry/network unavailability keeps retrying until readback deadline.
    }

    const remaining = deadline - now();
    if (remaining <= 0) break;
    const waitMs = Math.min(remaining, Math.max(0, Math.round(initialDelay * Math.pow(1.5, attempt))), maxDelay);
    attempt += 1;
    if (waitMs > 0) await sleep(waitMs);
  }

  if (!npmObserved || !distTagConfirmed) {
    log(JSON.stringify({
      status: 'propagation-pending',
      name: candidate.packageName,
      version: candidate.version,
      sha256: candidate.sha256,
      npmObserved,
      distTagConfirmed,
      tag: tagName,
      nextAction: 'Re-run publish-harness.yml with mode=readback (no npm-production approval required) after npm propagation settles.',
    }));
    throw Error('npm-propagation-pending');
  }

  let releaseTag: string | undefined;
  if (candidate.target === 'dsh-buildr-harness' || candidate.target === 'dsh-buildr-development') {
    const tag = `${candidate.target}-v${candidate.version}`;
    releaseTag = tag;
    const title = candidate.target === 'dsh-buildr-development'
      ? `DSH Buildr Development ${candidate.version}`
      : `DSH Buildr Harness ${candidate.version}`;
    const gh = (...args: string[]) => String(runExec('gh', [...args, '--repo', HARNESS_PUBLISH_REPOSITORY], { encoding: 'utf8', timeout: 60_000 }));
    let release = await github(`releases/tags/${tag}`);
    if (!release) {
      gh('release', 'create', tag, file, '--target', candidate.sourceCommit, '--title', title,
        '--notes', `npm: ${candidate.packageName}@${candidate.version}\n\nSHA-256: ${candidate.sha256}\n\n实测 DSH Desktop: ${proof.dshVersion}`,
        ...(candidate.version.includes('-rc.') ? ['--prerelease'] : []));
      release = await github(`releases/tags/${tag}`);
    }
    const actualTag = git('ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
      .split('\n').filter(Boolean).at(-1)?.split(/\s+/)[0];
    if (release?.tag_name !== tag || actualTag !== candidate.sourceCommit ||
        !release.assets?.some((asset: any) => asset.name === candidate.file)) {
      throw Error('github-release-identity-mismatch');
    }
    const downloadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gh-readback-'));
    try {
      const downloaded = path.join(downloadRoot, candidate.file);
      gh('release', 'download', tag, '--pattern', candidate.file, '--output', downloaded);
      if (digest(downloaded) !== candidate.sha256) throw Error('github-release-bytes-differ');
    } finally {
      fs.rmSync(downloadRoot, { recursive: true, force: true });
    }
  }

  const confirmed = {
    status: 'confirmed',
    name: candidate.packageName,
    version: candidate.version,
    sha256: candidate.sha256,
    distTag: tagName,
    ...(releaseTag ? { releaseTag } : {}),
  };
  log(JSON.stringify(confirmed));
  return confirmed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [dir = '', expectedCommit = '', expectedSha = '', mode = ''] = process.argv.slice(2);
  await runHarnessPublish({ dir, expectedCommit, expectedSha, mode });
}
