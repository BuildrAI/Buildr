import assert from 'node:assert/strict';

/** Remove only the three exact unreachable identity expressions controlled by the released LOCALE constant. */
export function assertReleasedIdentity(client: string): void {
  assert.match(client, /LOCALE = false \? "buildr-dev" : "buildr"/);
  const declarations = 'false ? "buildr-dev" : "buildr"';
  const remote = 'const remoteKey = LOCALE === "buildr-dev" ? "remote.buildr-dev" : "remote.buildr";';
  const view = client.match(/label: \(\) => ctx\d*\.locale\.bind\(LOCALE\)\(LOCALE === "buildr-dev" \? "sourceViewDev" : "sourceView"\)/)?.[0];
  assert.ok(client.includes(remote), 'source readers must select the released Remote namespace from the fixed LOCALE');
  assert.ok(view !== undefined, 'the source tab must select its released label from the fixed LOCALE');
  const reachable = client.replace(declarations, '"buildr"').replace(remote, 'const remoteKey = "remote.buildr";').replace(view!, 'label: () => ctx.locale.bind(LOCALE)("sourceView")');
  assert.equal(/"(?:buildr-dev|remote\.buildr-dev|@buildr-ai\/buildr-dsh-plugin-dev)"/.test(reachable), false,
    'the released entry must not resolve to the development identity');
}
