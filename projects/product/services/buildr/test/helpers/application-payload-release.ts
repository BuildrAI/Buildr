import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildApplicationPayload } from '../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createReleaseArtifact } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { readSharedCandidatePackage } from '../../../../../../skills/buildr-release/scripts/candidate-package.ts';
import { createGeneratedReleaseInputs } from './generated-release-inputs.ts';

export const SOURCE_COMMIT: any = 'b'.repeat(40);
export const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
export const testContextConsumerFixture: any = path.join(serviceRoot, 'test/fixtures/test-context-consumer');

function npmCliForCurrentNode(): any  {
  const executableDirectory: any = path.dirname(process.execPath);
  const candidates: any = [
    path.resolve(executableDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(executableDirectory, 'node_modules/npm/bin/npm-cli.js'),
    process.env.npm_execpath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch {}
  }
  throw new Error(`npm CLI for the current Host Node was not found beside ${process.execPath}`);
}

export function runNpm(args: any, options: any): any  {
  return spawnSync(process.execPath, [npmCliForCurrentNode(), ...args], options);
}

export async function candidateArtifact(root: any): Promise<any>  {
  const shared: any = readSharedCandidatePackage();
  if (shared?.manifest) return {
    artifact: { tarball: shared.tarball, manifestPath: shared.manifestPath, manifest: shared.manifest },
    payloadDigest: shared.manifest.applicationPayloadDigest,
  };
  const generated: any = createGeneratedReleaseInputs(path.join(root, 'generated'), SOURCE_COMMIT);
  const payload: any = await buildApplicationPayload(path.join(root, 'payload'), SOURCE_COMMIT, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  return {
    artifact: createReleaseArtifact(payload.root, path.join(root, 'artifact'), { testContextRoot: generated.testContextRoot }),
    payloadDigest: payload.manifest.applicationPayloadDigest,
  };
}
