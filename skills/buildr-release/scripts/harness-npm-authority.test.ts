import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkHarnessNpmAuthority} from './harness-npm-authority.ts';

const repo = 'BuildrAI/Buildr';
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
  for (const [target, name] of [['harness', '@buildr-ai/buildr-harness'], ['dsh-buildr-harness', '@buildr-ai/dsh-buildr-harness'], ['dsh-buildr', '@buildr-ai/dsh-buildr']]) {
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
