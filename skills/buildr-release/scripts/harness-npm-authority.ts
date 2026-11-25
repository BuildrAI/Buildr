/** Check the real workflow/package exchange without uploading or returning credentials. */
export async function checkHarnessNpmAuthority(env = process.env, request = globalThis.fetch) {
  const target = env.RELEASE_TARGET;
  const name = target === 'harness' ? '@buildr-ai/buildr-harness'
    : target === 'dsh-buildr-harness' ? '@buildr-ai/dsh-buildr-harness'
    : target === 'dsh-buildr-development' ? '@buildr-ai/dsh-buildr-development' : null;
  if (!name || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      env.GITHUB_REPOSITORY !== 'BuildrAI/Buildr' || env.GITHUB_REPOSITORY_ID !== '993537957' ||
      env.GITHUB_WORKFLOW_REF !== 'BuildrAI/Buildr/.github/workflows/publish-harness.yml@refs/heads/main' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw Error('protected-harness-authority-check-required');
  }
  let url: URL;
  try { url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL); } catch { throw Error('github-oidc-endpoint-invalid'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') ||
      url.username || url.password || url.port) throw Error('github-oidc-endpoint-invalid');
  url.searchParams.set('audience', 'npm:registry.npmjs.org');
  const identity = await exchangeRequest(url, env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 200, 'github-oidc', request);
  if (typeof identity?.value !== 'string' || !identity.value) throw Error('github-oidc-response-invalid');
  const credential = await exchangeRequest(
    new URL(`https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`),
    identity.value, 201, 'npm-oidc', request, 'POST',
  );
  if (typeof credential?.token !== 'string' || !credential.token) throw Error('npm-oidc-response-invalid');
  return { status: 'exchange-confirmed', package: name };
}

async function exchangeRequest(url: URL, token: string, status: number, step: string, request: typeof fetch, method = 'GET') {
  let response: Response;
  try {
    response = await request(url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw Error(`${step}-request-failed`);
  }
  if (response.status !== status) throw Error(`${step}-http-${response.status}`);
  try { return await response.json(); } catch { throw Error(`${step}-response-invalid`); }
}
