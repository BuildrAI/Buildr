import path from 'node:path';
import { createGeneratedReleaseInputs } from './generated-release-inputs.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { createReleaseArtifact } from '../../tools/release/release-artifact.ts';

// Real package bytes with the small, declared Web/Test Context fixture. Full
// React and clean-checkout packaging are exercised by the hosted Candidate.
export async function createReleaseArtifactFixture(root: string, sourceCommit: string): Promise<any> {
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), sourceCommit);
  const payload = await buildApplicationPayload(path.join(root, 'payload'), sourceCommit, {
    generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot,
  });
  return createReleaseArtifact(payload.root, path.join(root, 'package'), { testContextRoot: generated.testContextRoot });
}
