/** Validate portable final-candidate evidence without installing, fetching or querying Git. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { parseReleaseCandidate, type readReleaseCandidate, type ReleaseCandidate, type SourceSdkIdentity } from './release-candidate.ts';
import { archiveTreeIdentity } from './verify-all.ts';
import { artifactFromTarball } from '../../buildr/tools/release/package-artifact-observation.ts';
import { parseCompatibilityArtifact, evaluatePackageCompatibility, type CompatibilityArtifact } from '../../buildr/tools/release/package-compatibility.ts';
import { assertPairReport, type PairReport } from './verify-buildr-plugin-pair.ts';
export interface VerificationSource { observedCommit:string; dirty:boolean; contentSha256:string }
export interface SourceBinding { method:'git-tree-content-equivalence'; testedGitHead:string; testedWorkingTreeDirty:boolean; verifiedContentSha256:string; candidateSourceCommit:string; candidateSourceTree:string }
export interface BoundVerification {
  schemaVersion:'buildr.dsh-full-verification/v1'; status:'passed'; candidateBound:true; sourceCommit:string; sourceTree:string;
  verificationSource:VerificationSource; sourceBinding:SourceBinding; consumer:CompatibilityArtifact; consumerTreeSha256:string;
  peer:CompatibilityArtifact; pair:PairReport; sourceSdk:SourceSdkIdentity; checks:string[]; variants:string[];
  runtimeActivated:false; desktopValidated:false;
}
const checks=['unit','integration','source-ui','released-loader','development-loader','actual-package-pair'];
/** Remote admission checks the trusted producer receipt and manifest; it does not claim to reread bytes. */
export function assertBoundVerificationManifest(value:unknown,manifestValue:ReleaseCandidate):BoundVerification {
  const report=value as BoundVerification,manifest=parseReleaseCandidate(manifestValue);
  if(!report || report.schemaVersion!=='buildr.dsh-full-verification/v1' || report.status!=='passed' || report.candidateBound!==true || report.sourceCommit!==manifest.sourceCommit || report.sourceTree!==manifest.sourceTree || report.runtimeActivated!==false || report.desktopValidated!==false || !isDeepStrictEqual(report.checks,checks) || !isDeepStrictEqual(report.variants,['released','development']) || !isDeepStrictEqual(report.sourceSdk,manifest.sourceSdk) || !/^[a-f0-9]{64}$/.test(report.consumerTreeSha256))throw new Error('最终候选完整验证的身份或检查范围不一致。');
  const consumer=parseCompatibilityArtifact(report.consumer), peer=parseCompatibilityArtifact(report.peer);
  const expected={origin:'candidate',packageName:manifest.packageName,version:manifest.version,integrity:manifest.integrity,artifactSha256:manifest.sha256,sourceCommit:manifest.sourceCommit,sourceTree:manifest.sourceTree,compatibility:manifest.compatibility??null};
  if(!isDeepStrictEqual(consumer,expected) || peer.packageName!=='@buildr-ai/buildr' || peer.verifiedContracts!==undefined)throw new Error('最终候选或冻结对端与原始归档身份不一致。');
  const source=report.verificationSource,binding=report.sourceBinding;
  if(!source || !/^[a-f0-9]{40,64}$/.test(source.observedCommit) || typeof source.dirty!=='boolean' || !/^[a-f0-9]{64}$/.test(source.contentSha256) || !binding || binding.method!=='git-tree-content-equivalence' || binding.testedGitHead!==source.observedCommit || binding.testedWorkingTreeDirty!==source.dirty || binding.verifiedContentSha256!==source.contentSha256 || binding.candidateSourceCommit!==manifest.sourceCommit || binding.candidateSourceTree!==manifest.sourceTree)throw new Error('最终候选缺少实际测试来源的内容等价证据。');
  const pair=assertPairReport(report.pair,consumer,peer);
  if(pair.status!=='passed')throw new Error('最终候选的原始归档消费验证未通过。');
  const provider=pair.providerContracts?{...peer,verifiedContracts:pair.providerContracts}:peer;
  if(evaluatePackageCompatibility(consumer,provider,{legacyPairEvidence:[pair.legacyPairEvidence]}).status!=='passed')throw new Error('最终候选与冻结对端的公开契约不兼容。');
  return report;
}
/** Local producer and publication checks additionally consume the original archive bytes. */
export function assertBoundVerification(value:unknown,candidate:ReturnType<typeof readReleaseCandidate>):BoundVerification {
  const report=assertBoundVerificationManifest(value,candidate.manifest),manifest=candidate.manifest,bytes=readFileSync(candidate.tarball);
  const actual={...artifactFromTarball(bytes,{origin:'candidate',packageName:manifest.packageName,version:manifest.version,integrity:manifest.integrity,sourceCommit:manifest.sourceCommit}),sourceTree:manifest.sourceTree};
  if(!isDeepStrictEqual(parseCompatibilityArtifact(report.consumer),actual) || report.consumerTreeSha256!==archiveTreeIdentity(bytes))throw new Error('最终候选完整验证与实际归档字节不一致。');
  return report;
}
