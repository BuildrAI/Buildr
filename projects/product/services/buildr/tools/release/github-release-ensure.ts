#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const githubApi: any = 'https://api.github.com';

function headers(token: any): any  {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
}

async function readJson(response: any, label: any): Promise<any>  {
  try {
    return await response.json();
  } catch (error: any) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function githubRequest(repository: any, route: any, token: any, fetchImpl: any, options: any = {}): Promise<any>  {
  const response: any = await fetchImpl(`${githubApi}/repos/${repository}${route}`, {
    method: options.method ?? 'GET',
    headers: headers(token),
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return response;
}

export function assertGitHubRelease(release: any, expected: any): any  {
  if (release?.tag_name !== expected.tag) throw new Error(`GitHub Release tag does not match ${expected.tag}.`);
  if (release?.name !== expected.title) throw new Error(`GitHub Release title does not match ${expected.title}.`);
  if (release?.body !== expected.body) throw new Error(`GitHub Release body does not match ${expected.tag} release notes.`);
  if (release?.draft !== false) throw new Error('GitHub Release must not be a draft.');
  if (release?.prerelease !== expected.prerelease) throw new Error('GitHub Release prerelease state does not match release contract.');
  if (Array.isArray(release?.assets) && release.assets.length > 0) throw new Error('npm-only GitHub Release must not contain binary Assets.');
}

async function resolveTagCommit(repository: any, tag: any, token: any, fetchImpl: any): Promise<any>  {
  const refResponse: any = await githubRequest(repository, `/git/ref/tags/${encodeURIComponent(tag)}`, token, fetchImpl);
  if (refResponse.status !== 200) throw new Error(`GitHub tag lookup failed with HTTP ${refResponse.status}.`);
  let object: any = (await readJson(refResponse, 'GitHub tag lookup')).object;
  for (let depth: any = 0; object?.type === 'tag' && depth < 4; depth += 1) {
    const tagResponse: any = await githubRequest(repository, `/git/tags/${object.sha}`, token, fetchImpl);
    if (tagResponse.status !== 200) throw new Error(`GitHub annotated tag lookup failed with HTTP ${tagResponse.status}.`);
    object = (await readJson(tagResponse, 'GitHub annotated tag lookup')).object;
  }
  if (object?.type !== 'commit' || typeof object?.sha !== 'string') {
    throw new Error(`GitHub tag ${tag} does not resolve to a commit.`);
  }
  return object.sha;
}

async function assertLatestState(repository: any, expected: any, token: any, fetchImpl: any): Promise<any>  {
  const response: any = await githubRequest(repository, '/releases/latest', token, fetchImpl);
  if (response.status === 404) {
    if (expected.prerelease) return;
    throw new Error(`GitHub latest Release is missing after creating stable ${expected.tag}.`);
  }
  if (response.status !== 200) throw new Error(`GitHub latest Release lookup failed with HTTP ${response.status}.`);
  const latest: any = await readJson(response, 'GitHub latest Release lookup');
  if (expected.prerelease && latest.tag_name === expected.tag) {
    throw new Error(`Prerelease ${expected.tag} must not be Latest.`);
  }
  if (!expected.prerelease && latest.tag_name !== expected.tag) {
    throw new Error(`Stable release ${expected.tag} is not Latest.`);
  }
}

function stableTagTuple(tag: any): any  {
  const match: any = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? '');
  if (!match) throw new Error(`Stable GitHub Release tag cannot be ordered safely: ${tag}.`);
  return match.slice(1).map(Number);
}

function compareStableTags(left: any, right: any): any  {
  const leftTuple: any = stableTagTuple(left);
  const rightTuple: any = stableTagTuple(right);
  for (let index: any = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return leftTuple[index] - rightTuple[index];
  }
  return 0;
}

async function assertMissingReleaseLatestSafety(repository: any, expected: any, token: any, fetchImpl: any): Promise<any>  {
  if (expected.prerelease) return { latestMutation: false };
  const response: any = await githubRequest(repository, '/releases/latest', token, fetchImpl);
  if (response.status === 404) return { latestMutation: true, previousLatest: null };
  if (response.status !== 200) throw new Error(`GitHub latest Release preflight failed with HTTP ${response.status}.`);
  const latest: any = await readJson(response, 'GitHub latest Release preflight');
  if (compareStableTags(latest.tag_name, expected.tag) >= 0) {
    throw new Error(`Missing stable Release ${expected.tag} cannot replace existing Latest ${latest.tag_name}.`);
  }
  return { latestMutation: true, previousLatest: latest.tag_name };
}

export async function ensureGitHubRelease(expected: any, options: any = {}): Promise<any>  {
  const fetchImpl: any = options.fetchImpl ?? fetch;
  const token: any = options.token;
  const mode: any = options.mode ?? 'ensure';
  if (!['preflight', 'ensure'].includes(mode)) throw new Error(`Unsupported GitHub Release ensure mode: ${mode}.`);
  if (!/^[^/]+\/[^/]+$/.test(expected.repository || '')) throw new Error('GitHub repository must use owner/name form.');
  if (!token) throw new Error('GitHub token is required to ensure a Release.');
  const tagCommit: any = await resolveTagCommit(expected.repository, expected.tag, token, fetchImpl);
  if (tagCommit !== expected.targetCommit) {
    throw new Error(`GitHub tag ${expected.tag} resolves to ${tagCommit}, not ${expected.targetCommit}.`);
  }

  let response: any = await githubRequest(expected.repository, `/releases/tags/${encodeURIComponent(expected.tag)}`, token, fetchImpl);
  let action: any;
  let release: any;
  if (response.status === 404) {
    const latestSafety: any = await assertMissingReleaseLatestSafety(expected.repository, expected, token, fetchImpl);
    if (mode === 'preflight') return { action: 'release-missing', tag: expected.tag, targetCommit: tagCommit, prerelease: expected.prerelease, mutation: false, ...latestSafety };
    response = await githubRequest(expected.repository, '/releases', token, fetchImpl, {
      method: 'POST',
      body: {
        tag_name: expected.tag,
        target_commitish: expected.targetCommit,
        name: expected.title,
        body: expected.body,
        draft: false,
        prerelease: expected.prerelease,
        make_latest: expected.prerelease ? 'false' : 'true',
      },
    });
    if (response.status !== 201) throw new Error(`GitHub Release creation failed with HTTP ${response.status}.`);
    release = await readJson(response, 'GitHub Release creation');
    action = 'created';
  } else if (response.status === 200) {
    release = await readJson(response, 'GitHub Release lookup');
    action = 'reused';
  } else {
    throw new Error(`GitHub Release lookup failed with HTTP ${response.status}.`);
  }
  assertGitHubRelease(release, expected);
  await assertLatestState(expected.repository, expected, token, fetchImpl);
  return { action: mode === 'preflight' ? 'reusable' : action, tag: expected.tag, targetCommit: tagCommit, prerelease: expected.prerelease, ...(mode === 'preflight' ? { mutation: false } : {}) };
}

async function main(): Promise<any>  {
  const input: any = process.argv.slice(2);
  const mode: any = ['preflight', 'ensure'].includes(input[0]) ? input.shift() : 'ensure';
  const [tag, notesPath, prereleaseValue]: any = input;
  if (!tag || !notesPath || !['true', 'false'].includes(prereleaseValue)) {
    throw new Error('Usage: github-release-ensure.ts [preflight|ensure] <tag> <notes-path> <true|false>');
  }
  const result: any = await ensureGitHubRelease({
    repository: process.env.GITHUB_REPOSITORY,
    tag,
    title: tag,
    body: fs.readFileSync(notesPath, 'utf8'),
    prerelease: prereleaseValue === 'true',
    targetCommit: process.env.GITHUB_SHA,
  }, { token: process.env.GITHUB_TOKEN, mode });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error: any) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
