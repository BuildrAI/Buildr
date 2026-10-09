import type { PackageCompatibility } from '../../tools/release/package-compatibility.ts';

/** Representative public contracts for pure planning tests; source authority is checked separately. */
export const mainCompatibilityFixture: PackageCompatibility = {
  schemaVersion: 'buildr.package-compatibility/v1',
  provides: ['buildr.agent-asset-source-observations/v1', 'buildr.agent-asset-source-result/v1', 'buildr.installation-status/v1', 'buildr.web-protocol/v1'],
  requires: [],
};
export const pluginCompatibilityFixture: PackageCompatibility = {
  schemaVersion: 'buildr.package-compatibility/v1',
  provides: [],
  requires: [
    { packageName: '@buildr-ai/buildr', feature: 'entry', required: true,
      versions: { minInclusive: '0.1.0-rc.38', maxExclusive: '0.2.0-0', includePrerelease: true },
      contracts: ['buildr.installation-status/v1', 'buildr.web-protocol/v1'] },
    { packageName: '@buildr-ai/buildr', feature: 'sourceCapture', required: false,
      versions: { minInclusive: '0.1.0-rc.38', maxExclusive: '0.2.0-0', includePrerelease: true },
      contracts: ['buildr.agent-asset-source-observations/v1', 'buildr.agent-asset-source-result/v1'] },
  ],
};
