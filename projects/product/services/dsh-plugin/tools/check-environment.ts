import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { ownedBuildRoot, validatePreparedSourceSdk } from './prepare-source-sdk.ts';
import { prepareBuildrPeer, readPreparedBuildrPeer } from './buildr-peer.ts';

export interface PluginCheckEnvironmentInput {
  sourceSdk: string;
  peerInput?: string;
  peerManifest?: string;
  npmCli?: string;
}

/** Only the invocation that created the staging directory can reclaim its installs. */
export function completedStagingCleanup(bundles: string) {
  const original = lstatSync(bundles);
  const canonical = realpathSync(bundles);
  return (inputs: string[], retained: string[]) => {
    const current = lstatSync(bundles, { throwIfNoEntry: false });
    if (!original.isDirectory() || !current?.isDirectory() || current.ino !== original.ino ||
        current.dev !== original.dev || realpathSync(bundles) !== canonical) return;
    const protectedPaths = retained.map(file => realpathSync(file));
    for (const input of inputs) {
      if (dirname(input) !== bundles || !lstatSync(input, { throwIfNoEntry: false })?.isDirectory()) continue;
      const directory = realpathSync(input);
      if (dirname(directory) !== canonical || protectedPaths.some(file => {
        const nested = relative(directory, file);
        return !nested || (!isAbsolute(nested) && nested.split(/[\\/]/u)[0] !== '..');
      })) continue;
      rmSync(input, { recursive: true });
    }
  };
}

/** Prepare exact isolated inputs once; it neither executes checks nor activates a desktop. */
export function preparePluginCheckEnvironment(root: string, request: PluginCheckEnvironmentInput) {
  const sdk = request.sourceSdk;
  const sdkReceipt = validatePreparedSourceSdk(sdk, root);
  const bundles = mkdtempSync(join(ownedBuildRoot(root), 'dsh-plugin-checks-'));
  const cleanup = completedStagingCleanup(bundles);
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
  const discardCompletedStaging = (retained: string[]) => cleanup([
    environment.BUILDR_DSH_SOURCE_UI_CONSUMER_ROOT, join(bundles, 'dsh-plugin-dev'),
    environment.BUILDR_DSH_COMPOSITION_ROOT, environment.BUILDR_DSH_COMPOSITION_DEV_ROOT,
    join(bundles, 'pack-scope'), ...(request.peerInput ? [peer.root] : []),
  ], retained);
  return { sdk, sdkReceipt, bundles, peer, raw, environment, discardCompletedStaging };
}
