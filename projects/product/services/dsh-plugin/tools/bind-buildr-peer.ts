/** Reconsume final archive bytes after matching the fully tested package contents. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readReleaseCandidate } from './release-candidate.ts';
import { readArtifactInput } from './buildr-peer.ts';
import { archiveTreeIdentity } from './verify-all.ts';
import { artifactFromTarball } from '../../buildr/tools/release/package-artifact-observation.ts';
import { verifyBuildrPluginPair } from './verify-buildr-plugin-pair.ts';
import { captureVerificationSource, gitTreeSourceIdentity } from './verification-source.ts';
import { assertBoundVerification } from './full-verification.ts';
export function bindFinalCandidate(options: { candidate: string; peerInput: string; verification: string; npmCli?: string }) {
  const candidate = readReleaseCandidate(options.candidate), input = readArtifactInput(options.peerInput), report = JSON.parse(readFileSync(options.verification, 'utf8'));
  const bytes = readFileSync(candidate.tarball);
  if (report.schemaVersion !== 'buildr.dsh-full-verification/v1' || report.status !== 'passed' || report.consumerTreeSha256 !== archiveTreeIdentity(bytes) || report.consumer.version !== candidate.manifest.version || !isDeepStrictEqual(report.sourceSdk,candidate.manifest.sourceSdk)) throw new Error('Final candidate differs from the fully verified bundle or complete SDK identity');
  const verifiedSource=report.verificationSource;
  if(!verifiedSource || verifiedSource.observedCommit!==report.sourceCommit || verifiedSource.contentSha256!==gitTreeSourceIdentity(candidate.manifest.sourceTree) || verifiedSource.contentSha256!==captureVerificationSource().contentSha256)throw new Error('最终候选与实际验证的插件来源内容不一致，不能重贴来源身份。');
  if (!isDeepStrictEqual(report.peer, input.artifact)) throw new Error('Final candidate peer changed');
  const consumer = {...artifactFromTarball(bytes, { origin: 'candidate', packageName: candidate.manifest.packageName, version: candidate.manifest.version, integrity: candidate.manifest.integrity, sourceCommit: candidate.manifest.sourceCommit }),sourceTree:candidate.manifest.sourceTree};
  const pair = verifyBuildrPluginPair({ consumer: { artifact: consumer, tarball: candidate.tarball }, provider: { artifact: input.artifact, tarball: input.tarball }, npmCli: options.npmCli });
  if (pair.status !== 'passed') throw new Error('Final candidate actual package consumption failed');
  const bound = { ...report, sourceCommit: candidate.manifest.sourceCommit, sourceTree: candidate.manifest.sourceTree, consumer, pair, candidateBound: true,
    sourceBinding:{method:'git-tree-content-equivalence',testedGitHead:verifiedSource.observedCommit,testedWorkingTreeDirty:verifiedSource.dirty,verifiedContentSha256:verifiedSource.contentSha256,candidateSourceCommit:candidate.manifest.sourceCommit,candidateSourceTree:candidate.manifest.sourceTree} };
  assertBoundVerification(bound,candidate);
  writeFileSync(options.verification, `${JSON.stringify(bound, null, 2)}\n`); return bound;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const values = new Map<string, string>(), args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) { if (!['--candidate', '--buildr-peer', '--verification', '--npm'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: bind-buildr-peer.ts --candidate <candidate.json> --buildr-peer <input> --verification <full.json>'); values.set(args[i], args[i + 1]); }
  for (const key of ['--candidate', '--buildr-peer', '--verification']) if (!values.has(key)) throw new Error('Final candidate, frozen peer and full verification are required');
  console.log(JSON.stringify(bindFinalCandidate({ candidate: resolve(values.get('--candidate')!), peerInput: resolve(values.get('--buildr-peer')!), verification: resolve(values.get('--verification')!), npmCli: values.get('--npm') })));
}
