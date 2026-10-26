import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownedBuildRoot, validatePreparedSourceSdk } from './prepare-source-sdk.ts';
import { prepareBuildrPeer, readPreparedBuildrPeer } from './buildr-peer.ts';

export interface PluginCheckEnvironmentInput {
  sourceSdk: string;
  peerInput?: string;
  peerManifest?: string;
  npmCli?: string;
}

/** Prepare exact isolated inputs once; it neither executes checks nor activates a desktop. */
export function preparePluginCheckEnvironment(root: string, request: PluginCheckEnvironmentInput) {
  const sdk = request.sourceSdk;
  const sdkReceipt = validatePreparedSourceSdk(sdk, root);
  const bundles = mkdtempSync(join(ownedBuildRoot(root), 'dsh-plugin-checks-'));
  const peer = request.peerInput
    ? prepareBuildrPeer({ artifactManifest: request.peerInput, npmCli: request.npmCli, ownedRoot: bundles })
    : readPreparedBuildrPeer(request.peerManifest!);
  const raw = request.peerInput ?? join(bundles, 'peer-input.json');
  if (!request.peerInput) writeFileSync(raw, JSON.stringify({ schemaVersion: 'buildr.package-artifact-input/v1', artifact: peer.artifact, tarball: join(peer.root, 'artifact.tgz') }));
  const environment = {
    ...process.env,
    BUILDR_DSH_SDK_ROOT: sdk,
    BUILDR_DSH_SOURCE_SDK_ROOT: sdk,
    BUILDR_DSH_BUNDLE_ROOT: bundles,
    BUILDR_DSH_SOURCE_UI_SDK_ROOT: sdk,
    BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT: join(bundles, 'dsh-plugin'),
    BUILDR_DSH_BUILDR_PEER_MANIFEST: peer.manifestPath,
    BUILDR_DSH_COMPOSITION_ROOT: join(bundles, 'composition'),
    BUILDR_DSH_COMPOSITION_DEV_ROOT: join(bundles, 'composition-dev'),
  };
  const run = (script: string, ...args: string[]) => {
    const output = execFileSync(process.execPath, [join(root, script), ...args], {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'inherit'], shell: false,
    });
    process.stderr.write(output);
  };
  run('tools/build-plugin.ts', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin'));
  run('tools/build-plugin.ts', '--dev', '--source-sdk', sdk, '--output', join(bundles, 'dsh-plugin-dev'));
  run('tools/build-composition.ts', '--source-sdk', sdk, '--entry', join(bundles, 'dsh-plugin'), '--output', environment.BUILDR_DSH_COMPOSITION_ROOT);
  run('tools/build-composition.ts', '--source-sdk', sdk, '--entry', join(bundles, 'dsh-plugin-dev'), '--output', environment.BUILDR_DSH_COMPOSITION_DEV_ROOT);
  return { sdk, sdkReceipt, bundles, peer, raw, environment };
}
