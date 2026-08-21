#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

const githubApi = 'https://api.github.com';

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function githubRequest(repository, route, token, fetchImpl, options = {}) {
  const response = await fetchImpl(`${githubApi}/repos/${repository}${route}`, {
    method: options.method ?? 'GET',
    headers: headers(token),
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return response;
}

export function assertGitHubRelease(release, expected) {
  if (release?.tag_name !== expected.tag) throw new Error(`GitHub Release tag does not match ${expected.tag}.`);
  if (release?.name !== expected.title) throw new Error(`GitHub Release title does not match ${expected.title}.`);
  if (release?.body !== expected.body) throw new Error(`GitHub Release body does not match ${expected.tag} release notes.`);
  if (release?.draft !== false) throw new Error('GitHub Release must not be a draft.');
  if (release?.prerelease !== expected.prerelease) throw new Error('GitHub Release prerelease state does not match release contract.');
  if (Array.isArray(release?.assets) && release.assets.length > 0) throw new Error('npm-only GitHub Release must not contain binary Assets.');
}

async function resolveTagCommit(repository, tag, token, fetchImpl) {
  const refResponse = await githubRequest(repository, `/git/ref/tags/${encodeURIComponent(tag)}`, token, fetchImpl);
  if (refResponse.status !== 200) throw new Error(`GitHub tag lookup failed with HTTP ${refResponse.status}.`);
  let object = (await readJson(refResponse, 'GitHub tag lookup')).object;
  for (let depth = 0; object?.type === 'tag' && depth < 4; depth += 1) {
    const tagResponse = await githubRequest(repository, `/git/tags/${object.sha}`, token, fetchImpl);
    if (tagResponse.status !== 200) throw new Error(`GitHub annotated tag lookup failed with HTTP ${tagResponse.status}.`);
    object = (await readJson(tagResponse, 'GitHub annotated tag lookup')).object;
  }
  if (object?.type !== 'commit' || typeof object?.sha !== 'string') {
    throw new Error(`GitHub tag ${tag} does not resolve to a commit.`);
  }
  return object.sha;
}

async function assertLatestState(repository, expected, token, fetchImpl) {
  const response = await githubRequest(repository, '/releases/latest', token, fetchImpl);
  if (response.status === 404) {
    if (expected.prerelease) return;
    throw new Error(`GitHub latest Release is missing after creating stable ${expected.tag}.`);
  }
  if (response.status !== 200) throw new Error(`GitHub latest Release lookup failed with HTTP ${response.status}.`);
  const latest = await readJson(response, 'GitHub latest Release lookup');
  if (expected.prerelease && latest.tag_name === expected.tag) {
    throw new Error(`Prerelease ${expected.tag} must not be Latest.`);
  }
  if (!expected.prerelease && latest.tag_name !== expected.tag) {
    throw new Error(`Stable release ${expected.tag} is not Latest.`);
  }
}

function stableTagTuple(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? '');
  if (!match) throw new Error(`Stable GitHub Release tag cannot be ordered safely: ${tag}.`);
  return match.slice(1).map(Number);
}

function compareStableTags(left, right) {
  const leftTuple = stableTagTuple(left);
  const rightTuple = stableTagTuple(right);
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return leftTuple[index] - rightTuple[index];
  }
  return 0;
}

async function assertMissingReleaseLatestSafety(repository, expected, token, fetchImpl) {
  if (expected.prerelease) return { latestMutation: false };
  const response = await githubRequest(repository, '/releases/latest', token, fetchImpl);
  if (response.status === 404) return { latestMutation: true, previousLatest: null };
  if (response.status !== 200) throw new Error(`GitHub latest Release preflight failed with HTTP ${response.status}.`);
  const latest = await readJson(response, 'GitHub latest Release preflight');
  if (compareStableTags(latest.tag_name, expected.tag) >= 0) {
    throw new Error(`Missing stable Release ${expected.tag} cannot replace existing Latest ${latest.tag_name}.`);
  }
  return { latestMutation: true, previousLatest: latest.tag_name };
}

export async function ensureGitHubRelease(expected, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.token;
  const mode = options.mode ?? 'ensure';
  if (!['preflight', 'ensure'].includes(mode)) throw new Error(`Unsupported GitHub Release ensure mode: ${mode}.`);
  if (!/^[^/]+\/[^/]+$/.test(expected.repository || '')) throw new Error('GitHub repository must use owner/name form.');
  if (!token) throw new Error('GitHub token is required to ensure a Release.');
  const tagCommit = await resolveTagCommit(expected.repository, expected.tag, token, fetchImpl);
  if (tagCommit !== expected.targetCommit) {
    throw new Error(`GitHub tag ${expected.tag} resolves to ${tagCommit}, not ${expected.targetCommit}.`);
  }

  let response = await githubRequest(expected.repository, `/releases/tags/${encodeURIComponent(expected.tag)}`, token, fetchImpl);
  let action;
  let release;
  if (response.status === 404) {
    const latestSafety = await assertMissingReleaseLatestSafety(expected.repository, expected, token, fetchImpl);
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

async function main() {
  const input = process.argv.slice(2);
  const mode = ['preflight', 'ensure'].includes(input[0]) ? input.shift() : 'ensure';
  const [tag, notesPath, prereleaseValue] = input;
  if (!tag || !notesPath || !['true', 'false'].includes(prereleaseValue)) {
    throw new Error('Usage: github-release-ensure.mjs [preflight|ensure] <tag> <notes-path> <true|false>');
  }
  const result = await ensureGitHubRelease({
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
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
