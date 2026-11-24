import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {firstReleasePaths, parseAdmissions, trustedPublishingSetupPaths, verifyHarnessFirstReleasePR, verifyHarnessReleaseAdmissionPR} from './harness-release-admission.ts';
import {checkHarnessNpmAuthority} from './harness-npm-authority.ts';

const admissions = fs.readFileSync(path.join(import.meta.dirname,'harness-release-admissions.json'),'utf8');
const [original] = parseAdmissions(admissions);
const firstPair = JSON.stringify({ schemaVersion: 'buildr.harness-release-admissions/v1', admissions: parseAdmissions(admissions).slice(0, 2) });
const repo = 'BuildrAI/Buildr';
const base = '1'.repeat(40), head = '2'.repeat(40), dev = '3'.repeat(40);
const event = {pull_request:{base:{ref:'main',sha:base,repo:{full_name:repo}},head:{ref:'codex/release-harness-first-rc1',sha:head,repo:{full_name:repo}}}};
function evidence({paths = firstReleasePaths, tree = original!.sourceTree, liveMain = base, raw = firstPair, ancestor = true, setupAdmitted = false} = {}) {
  return (args: string[]) => {
    if (args[0]==='diff') return paths.join('\0')+'\0';
    if (args[0]==='show') return args[1]?.startsWith(`${base}:`) ? admissions : raw;
    if (args[0]==='ls-tree') return args[1]===base && !setupAdmitted ? '' : `100644 blob ${head}\t${args.at(-1)}`;
    if (args[0]==='rev-list') return `${head} ${base}`;
    if (args[0]==='merge-base') {if(!ancestor) throw Error('source-not-retained');return '';}
    if (args.join(' ')==='rev-parse HEAD') return head;
    if (args.includes('refs/remotes/origin/main')) return liveMain;
    if (args.includes('refs/remotes/origin/dev')) return dev;
    if (args[1]===`${original!.sourceCommit}^{tree}`) return tree;
    throw Error('unexpected git invocation');
  };
}
test('RC PR admits only the exact pair, from retained dev data, and only the listed files',()=>{
  assert.equal(verifyHarnessFirstReleasePR(event,repo,'.',evidence()).status,'passed');
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({paths:[...firstReleasePaths.slice(1),'projects/product/services/buildr/package.json']})),/paths-invalid/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({tree:'4'.repeat(40)})),/source-tree-mismatch/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({liveMain:'4'.repeat(40)})),/pr-identity-invalid/);
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({ancestor:false})),/source-not-retained/);
  const fork = structuredClone(event);fork.pull_request.head.repo.full_name='other/Buildr';
  assert.throws(()=>verifyHarnessFirstReleasePR(fork,repo,'.',evidence()),/pr-identity-invalid/);
});
test('duplicate candidates and non-RC evidence cannot substitute for first release pair',()=>{
  const value=JSON.parse(firstPair);value.admissions[1]=value.admissions[0];
  assert.throws(()=>parseAdmissions(JSON.stringify(value)),/admission-duplicate/);
  const next=JSON.parse(firstPair);next.admissions[0].version='0.1.0-rc.3';
  assert.throws(()=>verifyHarnessFirstReleasePR(event,repo,'.',evidence({raw:JSON.stringify(next)})),/first-release-pair-invalid/);
  const devPlugin = JSON.parse(firstPair);
  devPlugin.admissions.push({ ...original, target: 'dsh-buildr-development', version: '0.1.0-rc.1' });
  assert.equal(parseAdmissions(JSON.stringify(devPlugin)).length, 3);
});

const setup = structuredClone(event);
setup.pull_request.head.ref = 'codex/release-harness-admission-trusted-publishing';
const update = structuredClone(event);
update.pull_request.head.ref = 'codex/release-harness-admission-v0.1.0-rc.3';
const dataPaths = ['skills/buildr-release/scripts/harness-release-admissions.json'];
function nextAdmissions() {
  const update = JSON.parse(admissions);
  update.admissions.push({...original, version:'0.1.0-rc.3', sha256:'a'.repeat(64)});
  return update;
}
test('trusted publishing setup cannot change the candidate data or admit a new version', () => {
  assert.deepEqual(verifyHarnessReleaseAdmissionPR(setup, repo, '.', evidence({paths:trustedPublishingSetupPaths})).targets, []);
  assert.throws(() => verifyHarnessReleaseAdmissionPR(setup, repo, '.', evidence({paths:[...trustedPublishingSetupPaths, ...dataPaths]})), /paths-invalid/);
  assert.throws(() => verifyHarnessReleaseAdmissionPR(setup, repo, '.', evidence({paths:trustedPublishingSetupPaths, setupAdmitted:true})), /setup-already-admitted/);
});
test('follow-up admission appends only the selected version, without product or workflow changes', () => {
  const candidate = nextAdmissions();
  const valid = {paths:dataPaths, raw:JSON.stringify(candidate)};
  assert.deepEqual(verifyHarnessReleaseAdmissionPR(update, repo, '.', evidence(valid)).targets, [{target:'harness',version:'0.1.0-rc.3'}]);
  assert.throws(() => verifyHarnessReleaseAdmissionPR(update, repo, '.', evidence({...valid, paths:[...dataPaths, '.github/workflows/publish-harness.yml']})), /paths-invalid/);
  assert.throws(() => verifyHarnessReleaseAdmissionPR(update, repo, '.', evidence({...valid, ancestor:false})), /source-not-retained/);
  candidate.admissions.at(-1).version = '0.1.0-rc.4';
  assert.throws(() => verifyHarnessReleaseAdmissionPR(update, repo, '.', evidence({...valid, raw:JSON.stringify(candidate)})), /version-mismatch/);
  candidate.admissions[0].proofSha256 = 'a'.repeat(64);
  assert.throws(() => verifyHarnessReleaseAdmissionPR(update, repo, '.', evidence({...valid, raw:JSON.stringify(candidate)})), /not-append-only/);
});

const hosted = {
  RELEASE_TARGET: 'harness',
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_REPOSITORY: repo,
  GITHUB_REPOSITORY_ID: '993537957',
  GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/publish-harness.yml@refs/heads/main`,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/oidc?api-version=2',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fake-request-token',
};
test('authority checks each exact package with no upload or credential in the result', async () => {
  for (const [target, name] of [['harness', '@buildr-ai/buildr-harness'], ['dsh-buildr-harness', '@buildr-ai/dsh-buildr-harness'], ['dsh-buildr-development', '@buildr-ai/dsh-buildr-development']]) {
    let calls = 0;
    const result = await checkHarnessNpmAuthority({...hosted, RELEASE_TARGET:target}, async (input, options) => {
      const url = new URL(String(input));
      const headers = new Headers(options?.headers);
      if (++calls === 1) {
        assert.equal(url.hostname, 'pipelines.actions.githubusercontent.com');
        assert.equal(url.searchParams.get('audience'), 'npm:registry.npmjs.org');
        assert.equal(options?.method, 'GET');
        assert.equal(headers.get('Authorization'), 'Bearer fake-request-token');
        return Response.json({value:'fake-id-token'});
      }
      assert.equal(url.href, `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name!)}`);
      assert.equal(options?.method, 'POST');
      assert.equal(options?.redirect, 'error');
      assert.equal(headers.get('Authorization'), 'Bearer fake-id-token');
      return Response.json({token:'fake-publish-token'}, {status:201});
    });
    assert.deepEqual(result, {status:'exchange-confirmed', package:name});
    assert.equal(calls, 2);
  }
});
test('authority rejects untrusted identity before exchange and redacts registry errors', async () => {
  const noRequest = async () => {assert.fail('unexpected request');};
  await assert.rejects(checkHarnessNpmAuthority({...hosted,GITHUB_REF:'refs/heads/dev'}, noRequest), /protected-harness-authority-check-required/);
  await assert.rejects(checkHarnessNpmAuthority({...hosted,RELEASE_TARGET:'buildr'}, noRequest), /protected-harness-authority-check-required/);
  await assert.rejects(checkHarnessNpmAuthority({...hosted,ACTIONS_ID_TOKEN_REQUEST_URL:'https://example.com/?s=secret'}, noRequest), /github-oidc-endpoint-invalid/);
  let calls = 0;
  await assert.rejects(checkHarnessNpmAuthority(hosted, async () => ++calls === 1
    ? Response.json({value:'fake-id-token'})
    : Response.json({message:'fake-sensitive-body'}, {status:403})), {message:'npm-oidc-http-403'});
});
