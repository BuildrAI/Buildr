import assert from 'node:assert/strict';
import test from 'node:test';
import { channelForPackage } from '../../plugin/platform.ts';
import { assertReleasedIdentity } from '../helpers/variant-identity.ts';

test('the package name alone decides which Buildr installation an entry serves', () => {
  assert.equal(channelForPackage('@buildr-ai/buildr-dsh-plugin'), 'npm');
  assert.equal(channelForPackage('@buildr-ai/buildr-dsh-plugin-dev'), 'development');
});

test('released identity scanning does not excuse another development literal or a different conditional', () => {
  const fixture = 'var LOCALE = false ? "buildr-dev" : "buildr";\nconst remoteKey = LOCALE === "buildr-dev" ? "remote.buildr-dev" : "remote.buildr";\nlabel: () => ctx.locale.bind(LOCALE)(LOCALE === "buildr-dev" ? "sourceViewDev" : "sourceView")';
  assert.doesNotThrow(() => assertReleasedIdentity(fixture));
  for (const extra of ['\nconst other = "buildr-dev";', '\nconst namespace = "remote.buildr-dev";', '\nconst name = "@buildr-ai/buildr-dsh-plugin-dev";']) assert.throws(() => assertReleasedIdentity(fixture + extra), /development identity/);
  assert.throws(() => assertReleasedIdentity(fixture.replace('LOCALE === "buildr-dev" ? "remote.buildr-dev"', 'enabled ? "remote.buildr-dev"')), /source readers/);
});
