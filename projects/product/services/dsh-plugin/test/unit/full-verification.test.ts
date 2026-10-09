import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createReleaseCandidate,readReleaseCandidate,sourceSdkIdentityFromFiles} from '../../tools/release-candidate.ts';
import {artifactFromTarball} from '../../../buildr/tools/release/package-artifact-observation.ts';
import {hash} from '../../tools/buildr-peer.ts';
import {archiveTreeIdentity} from '../../tools/verify-all.ts';
import {assertBoundVerification,assertBoundVerificationManifest,type BoundVerification} from '../../tools/full-verification.ts';
import {identity} from '../../tools/verify-buildr-plugin-pair.ts';
function archive(metadata:unknown):Buffer {
 const chunks:Buffer[]=[];
 for(const [name,text] of [['package/package.json',JSON.stringify(metadata)],['package/lib/index.js','export default class Host {}']]) {
  const body=Buffer.from(text),header=Buffer.alloc(512);header.write(name,0,100);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);header.write(`${body.length.toString(8).padStart(11,'0')}\0`,124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);header.write('00',263);header.write(`${header.reduce((sum,b)=>sum+b,0).toString(8).padStart(6,'0')}\0 `,148);chunks.push(header,body,Buffer.alloc((512-body.length%512)%512));
 }
 return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));
}
function fixture(t:TestContext) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'buildr-full-evidence-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const sourceSdk=sourceSdkIdentityFromFiles(readFileSync(new URL('../../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json',import.meta.url)),readFileSync(new URL('../../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch',import.meta.url)));
 const sourceCommit='a'.repeat(40),sourceTree='b'.repeat(40),version='0.1.0-rc.1';
 const compatibility={schemaVersion:'buildr.package-compatibility/v1',provides:[],requires:[{packageName:'@buildr-ai/buildr',feature:'entry',required:true,versions:{minInclusive:'0.1.0-rc.1',maxExclusive:'1.0.0',includePrerelease:true},contracts:['buildr.installation-status/v1','buildr.web-protocol/v1']},{packageName:'@buildr-ai/buildr',feature:'sourceCapture',required:false,versions:{minInclusive:'0.1.0-rc.1',maxExclusive:'1.0.0',includePrerelease:true},contracts:['buildr.agent-asset-source-result/v1']}]};
 const bytes=archive({name:'@buildr-ai/buildr-dsh-plugin',version,repository:'https://github.com/BuildrAI/Buildr',buildrCompatibility:compatibility,buildrDshSourceSdk:{upstream:sourceSdk.baseline,sourceManifestSha256:sourceSdk.manifestSha256,sourcePatchSha256:sourceSdk.patchSha256,compiledContracts:sourceSdk.contracts}});
 const manifest=createReleaseCandidate({version,sourceCommit,sourceTree,filename:'plugin.tgz',bytes,sourceSdk,fileCount:2});writeFileSync(join(root,'plugin.tgz'),bytes);writeFileSync(join(root,'candidate.json'),JSON.stringify(manifest));const candidate=readReleaseCandidate(join(root,'candidate.json'));
 const consumer={...artifactFromTarball(bytes,{origin:'candidate',packageName:manifest.packageName,version,integrity:manifest.integrity,sourceCommit}),sourceTree};
 const peer={packageName:'@buildr-ai/buildr' as const,origin:'registry' as const,version:'0.1.0-rc.38',integrity:'sha512-'+createHash('sha512').update('provider').digest('base64'),artifactSha256:'c'.repeat(64),compatibility:null};
 const c=identity(consumer),p=identity(peer),features=[{feature:'entry',required:true,status:'passed' as const},{feature:'sourceCapture',required:false,status:'unsupported' as const}],contracts=['buildr.installation-status/v1','buildr.web-protocol/v1'],diagnostic=null;
 const evidenceSha256=hash(Buffer.from(JSON.stringify({consumer:c,provider:p,features,contracts,diagnostic})));
 const pair={schemaVersion:'buildr.dsh-package-pair-verification/v1' as const,status:'passed' as const,consumer:c,provider:p,features,contracts,diagnostic,evidenceSha256,legacyPairEvidence:{schemaVersion:'buildr.package-pair-evidence/v1' as const,consumer:c,provider:p,features,evidenceSha256},providerContracts:{schemaVersion:'buildr.package-contract-proof/v1' as const,...p,contracts,evidenceSha256}};
 const verificationSource={observedCommit:'d'.repeat(40),dirty:true,contentSha256:'e'.repeat(64)};
 const report:BoundVerification={schemaVersion:'buildr.dsh-full-verification/v1',status:'passed',candidateBound:true,sourceCommit,sourceTree,consumer,peer,pair,sourceSdk,consumerTreeSha256:archiveTreeIdentity(bytes),verificationSource,sourceBinding:{method:'git-tree-content-equivalence',testedGitHead:verificationSource.observedCommit,testedWorkingTreeDirty:true,verifiedContentSha256:verificationSource.contentSha256,candidateSourceCommit:sourceCommit,candidateSourceTree:sourceTree},checks:['unit','integration','source-ui','released-loader','development-loader','actual-package-pair'],variants:['released','development'],runtimeActivated:false,desktopValidated:false};return{candidate,report};
}
test('portable final evidence retains dirty feedback baseline with exact byte-bound legacy pair',t=>{const f=fixture(t);assert.equal(assertBoundVerification(f.report,f.candidate).verificationSource.observedCommit,'d'.repeat(40));});
test('remote manifest validation shares full source and pair guards without claiming local archive readback',t=>{
 const f=fixture(t);rmSync(f.candidate.tarball);assert.equal(assertBoundVerificationManifest(f.report,f.candidate.manifest).status,'passed');assert.throws(()=>assertBoundVerification(f.report,f.candidate));
 for(const field of ['verificationSource','sourceBinding','variants','runtimeActivated','desktopValidated']){const incomplete={...f.report};delete(incomplete as any)[field];assert.throws(()=>assertBoundVerificationManifest(incomplete,f.candidate.manifest));}
});
test('portable gate refuses missing checks, SDK contract drift, relabelled sources and same-version other bytes',t=>{
 const f=fixture(t);
 for(const mutate of [
  (r:BoundVerification)=>{r.candidateBound=false as true;},
  (r:BoundVerification)=>{r.checks.pop();},
  (r:BoundVerification)=>{r.sourceSdk.contracts.rawEventRefs=false;},
  (r:BoundVerification)=>{r.sourceBinding.candidateSourceTree='f'.repeat(40);},
  (r:BoundVerification)=>{r.sourceBinding.testedGitHead='f'.repeat(40);},
  (r:BoundVerification)=>{r.sourceBinding.verifiedContentSha256='f'.repeat(64);},
  (r:BoundVerification)=>{r.consumer.artifactSha256='f'.repeat(64);},
  (r:BoundVerification)=>{r.peer.artifactSha256='f'.repeat(64);},
  (r:BoundVerification)=>{r.pair.features[1].status='failed';},
 ]) {const value=structuredClone(f.report);mutate(value);assert.throws(()=>assertBoundVerification(value,f.candidate));}
});
