import test from 'node:test';
import assert from 'node:assert/strict';
import { dshProgramPolicy, dshSdkForVersion } from '../../src/executors/dsh/program.ts';
import { resolveCompanionPackages } from '../../src/executors/program-policy.ts';

test('DSH program validation and runtime share the release-specific account SDK', () => {
  for (const [version, cordis, account] of [
    ['0.2.1-rc.2', '4.0.5', 'dsh-api-account-controller'],
    ['0.2.2-alpha.2', '4.0.6-alpha.1', 'dsh-api-account-controller'],
    ['0.2.2-alpha.3', '4.0.6-alpha.2', 'dsh-api-account-controller'],
    ['0.2.2-rc.1', '4.1.0', 'dsh-api-account-controller'],
    ['0.2.2-rc.2', '4.1.0', 'dsh-deepseek-account'],
    ['0.2.2-rc.5', '4.1.0', 'dsh-deepseek-account'],
  ]) {
    const sdk = dshSdkForVersion(version!);
    assert.deepEqual(sdk, { cordis, accountPackage: `@deepseek-ai/${account}` });
    assert.equal(dshProgramPolicy.distribution.kind, 'npm');
    const specs = resolveCompanionPackages(dshProgramPolicy.distribution, version!);
    assert.deepEqual(specs.filter(spec => /cordis|account/.test(spec)), [`@deepseek-ai/cordis@${cordis}`, `${sdk.accountPackage}@${version}`]);
    assert.ok(specs.includes(`@deepseek-ai/dsh-api-gateway@${version}`));
  }
});
