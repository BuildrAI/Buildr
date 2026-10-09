import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { artifactFromTarball } from '../../../buildr/tools/release/package-artifact-observation.ts';
import { packageArchiveFiles, prepareBuildrPeer, readArtifactInput, readPreparedBuildrPeer, resolvePeerNpm, smokePeerEnvironment } from '../../tools/buildr-peer.ts';
import { parseVerificationInputs } from '../../tools/verify-all.ts';
const npmCli = resolvePeerNpm(process.execPath);
function archive(entries: Array<{ name: string; body: string; kind?: string }>) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body), h = Buffer.alloc(512);
    h.write(`package/${entry.name}`, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116); h.write(`${body.length.toString(8).padStart(11,'0')}\0`,124); h.write('00000000000\0',136); h.fill(32,148,156); h[156]=(entry.kind??'0').charCodeAt(0); h.write('ustar\0',257); h.write('00',263); h.write(`${h.reduce((sum,b)=>sum+b,0).toString(8).padStart(6,'0')}\0 `,148);
    chunks.push(h,body,Buffer.alloc((512-body.length%512)%512));
  }
  return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));
}
function fixture(t: TestContext) {
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),'buildr-peer-fixture-'))); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const bytes=archive([{name:'package.json',body:JSON.stringify({name:'@buildr-ai/buildr',version:'1.0.0',bin:{buildr:'bin/buildr.mjs'},scripts:{postinstall:'node scripts/postinstall.mjs'}})},{name:'bin/buildr.mjs',body:'console.log(JSON.stringify({version:"1.0.0"}));\n'},{name:'scripts/postinstall.mjs',body:`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path.join(root,'scripts-ran'))},'wrong');`}]);
  const integrity=`sha512-${createHash('sha512').update(bytes).digest('base64')}`,artifact=artifactFromTarball(bytes,{origin:'registry',packageName:'@buildr-ai/buildr',version:'1.0.0',integrity});
  const tarball=path.join(root,'artifact.tgz'), input=path.join(root,'input.json');writeFileSync(tarball,bytes);writeFileSync(input,JSON.stringify({schemaVersion:'buildr.package-artifact-input/v1',artifact,tarball}));return{root,bytes,artifact,tarball,input};
}
test('raw peer reads original metadata and refuses name/version/SRI/SHA substitutions before installation',t=>{
  const f=fixture(t); assert.equal(readArtifactInput(f.input).artifact.compatibility,null);
  for(const patch of [{version:'1.0.1'},{artifactSha256:'a'.repeat(64)},{compatibility:{schemaVersion:'buildr.package-compatibility/v1',provides:['buildr.web-protocol/v1'],requires:[]}}]){writeFileSync(f.input,JSON.stringify({schemaVersion:'buildr.package-artifact-input/v1',artifact:{...f.artifact,...patch},tarball:f.tarball}));assert.throws(()=>readArtifactInput(f.input),/identity|metadata/);}
});
test('archive links, traversal, duplicates and input symlinks are refused without execution',t=>{
  const f=fixture(t), metadata={name:'package.json',body:'{}'};
  for(const extra of [{name:'../escape',body:''},{name:'link',body:'',kind:'2'},metadata])assert.throws(()=>packageArchiveFiles(archive([metadata,extra])),/archive/);
  const alias=path.join(f.root,'alias.json');symlinkSync(f.input,alias);assert.throws(()=>readArtifactInput(alias),/regular file/);
});
test('candidate peer retains a separately frozen source tree without inventing registry metadata',t=>{
  const f=fixture(t),artifact={...f.artifact,origin:'candidate',sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)};
  writeFileSync(f.input,JSON.stringify({schemaVersion:'buildr.package-artifact-input/v1',artifact,tarball:f.tarball}));
  const parsed=readArtifactInput(f.input);assert.equal(parsed.artifact.sourceTree,artifact.sourceTree);assert.equal(parsed.artifact.compatibility,null);assert.equal(parsed.artifact.artifactSha256,f.artifact.artifactSha256);
});
test('real offline local installation preserves archive files and never runs lifecycle scripts',t=>{
  const f=fixture(t),peer=prepareBuildrPeer({artifactManifest:f.input,npmCli,ownedRoot:f.root});
  assert.equal(peer.artifact.integrity,f.artifact.integrity);assert.equal(peer.sourceCapture,false);assert.equal(readdirSync(f.root).includes('scripts-ran'),false);
  assert.equal(readPreparedBuildrPeer(peer.manifestPath).cliEntry,peer.cliEntry);
  writeFileSync(peer.cliEntry,'changed');assert.throws(()=>readPreparedBuildrPeer(peer.manifestPath),/drift/);
});
test('failed preparation produces no ready manifest or forwarded diagnostic material',t=>{
  const f=fixture(t);assert.throws(()=>prepareBuildrPeer({artifactManifest:f.input,npmCli,ownedRoot:f.root,execute:(_node,args)=>({status:args[1]==='--version'?0:1,stdout:args[1]==='--version'?'11.5.1':'private-output',stderr:'private-diagnostic'})}),error=>error instanceof Error&&error.message==='buildr_peer_invalid: isolated npm operation failed');
  const stage=readdirSync(f.root).find(x=>x.startsWith('buildr-peer-'))!;assert.equal(readdirSync(path.join(f.root,stage)).includes('peer.json'),false);
});
test('owned runtime environment has no inherited account or source selection and supports all platform roots',t=>{
  const f=fixture(t),env=smokePeerEnvironment({root:f.root,workspace:path.join(f.root,'workspace'),appData:path.join(f.root,'app'),productData:path.join(f.root,'product')},process.execPath);
  for(const key of ['NPM_TOKEN','NODE_AUTH_TOKEN','NODE_OPTIONS','NODE_PATH','BUILDR_SOURCE_ROOT'])assert.equal(env[key],undefined);
  for(const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','XDG_STATE_HOME','XDG_CONFIG_HOME','TMPDIR','NPM_CONFIG_CACHE'])assert.ok(env[key]?.startsWith(f.root));
  assert.equal(readFileSync(env.NPM_CONFIG_USERCONFIG!,'utf8'),'');assert.equal(readFileSync(env.NPM_CONFIG_GLOBALCONFIG!,'utf8'),'');
});
test('full verifier requires one explicit peer and supports manifest-only environment inputs',()=>{
  assert.throws(()=>parseVerificationInputs(['--source-sdk','/sdk'],{}),/完整验证需要/);
  assert.throws(()=>parseVerificationInputs(['--source-sdk','/sdk','--buildr-peer','/raw','--buildr-peer-manifest','/ready'],{}),/唯一/);
  assert.equal(parseVerificationInputs([],{BUILDR_DSH_SOURCE_SDK_ROOT:'/sdk',BUILDR_DSH_BUILDR_PEER_INPUT:'/raw'}).peerInput,'/raw');
  assert.equal(parseVerificationInputs(['--source-sdk','/sdk','--buildr-peer','/raw'],{BUILDR_DSH_BUILDR_PEER_MANIFEST:'/stale'}).peerInput,'/raw');
  assert.throws(()=>parseVerificationInputs(['--source-sdk','/sdk','--buildr-peer','/raw','--buildr-peer','/again'],{}),/Usage/);
});
