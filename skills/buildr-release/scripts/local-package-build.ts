import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createCandidatePackage } from './candidate-package.ts';
import { assertFrozenCandidateCheckout } from '../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts';

// This entry is launched from the frozen release checkout. Its imported build
// helpers therefore cannot accidentally consume the maintainer/controller tree.
const service = path.resolve(import.meta.dirname, '../../../projects/product/services/buildr');
export async function buildLocalPackage(source: string, destination: string): Promise<any> {
  if (!source || !destination) throw new Error('Local package build requires a frozen source and an explicit output directory.');
  assertFrozenCandidateCheckout(service, source);
  const artifact = await createCandidatePackage(service, path.resolve(destination));
  assertFrozenCandidateCheckout(service, source);
  if (artifact.manifest.sourceCommit !== source) throw new Error('Local package producer changed its frozen source.');
  return { status: 'passed', sourceCommit: source, manifestPath: artifact.manifestPath, sha256: artifact.manifest.sha256 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(await buildLocalPackage(process.env.BUILDR_CANDIDATE_SOURCE_SHA ?? '', process.argv[2] ?? '')) + '\n');
}
