import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareHarnessPackage} from './prepare-package.ts';
import {agentRuntimePackageTree} from './package-runtime.ts';

const release = process.argv[2] === '--release';
const version = release ? process.argv[3] : undefined;
if (release && (!version || !/^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/.test(version) || !process.argv[4])) {
  throw Error('Usage: pack-local.ts [<output> | --release <version> <output>]');
}
const {root} = prepareHarnessPackage();
const output = path.resolve((release ? process.argv[4] : process.argv[2]) ?? path.join(root, 'build/local-artifacts'));
fs.mkdirSync(output, {recursive:true});
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-local-pack-'));
try {
  agentRuntimePackageTree(root).materialize(stage);
  if (release) {
    const manifest = path.join(stage, 'package.json');
    const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    delete metadata.private;
    fs.writeFileSync(manifest, JSON.stringify({...metadata, version, publishConfig:{access:'public'},
      buildrCompatibility:{schemaVersion:'buildr.package-compatibility/v1',requires:[],provides:[{feature:'desktop-entry',contracts:['buildr.harness-desktop-web/v1']}]},
      repository:{type:'git',url:'git+https://github.com/BuildrAI/Buildr.git',directory:'projects/product/services/buildr-harness'}}, null, 2)+'\n');
  }
  if (fs.existsSync(path.join(root, 'README.md'))) fs.copyFileSync(path.join(root, 'README.md'), path.join(stage, 'README.md'));
  const result = spawnSync('npm', ['pack','--ignore-scripts','--pack-destination',output,'--json'],
    {cwd:stage,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  if (result.error || result.status!==0) throw result.error??new Error(result.stderr);
  const receipt=JSON.parse(result.stdout)[0];
  console.log(JSON.stringify({status:release?'packed-release-candidate':'packed-local-verification',publicationApproved:false,
    artifact:path.join(output,receipt.filename),sha512:receipt.integrity}));
} finally {fs.rmSync(stage,{recursive:true,force:true});}
