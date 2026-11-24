/** Protected consumer: never builds or executes code from candidate transport. */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectCandidate} from './harness-release.ts';
import {assertAdmittedHarnessOriginal} from './harness-release-admission.ts';

const REPO='BuildrAI/Buildr';
const WORKFLOW=`${REPO}/.github/workflows/publish-harness.yml@refs/heads/main`;
const digest=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',timeout:30000}).trim();
const registry='https://registry.npmjs.org/';
async function github(endpoint:string) {
  const response=await fetch(`https://api.github.com/repos/${REPO}/${endpoint}`,{
    headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`github-readback-unavailable: ${response.status}`);
  return response.json();
}
async function query(name:string,version:string) {
  const response=await fetch(registry+encodeURIComponent(name)+'/'+encodeURIComponent(version),{signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`registry-unavailable: ${response.status}`);
  const metadata=await response.json();
  if(metadata.name!==name||metadata.version!==version||typeof metadata.dist?.integrity!=='string')throw Error('registry-identity-invalid');
  return metadata;
}

const [dir,expectedCommit,expectedSha,mode] = process.argv.slice(2);
if (!dir||!expectedCommit||!expectedSha||!['publish','readback'].includes(mode??'') ||
    process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.env.GITHUB_REPOSITORY!==REPO||
    process.env.GITHUB_REPOSITORY_ID!=='993537957'||process.env.GITHUB_WORKFLOW_REF!==WORKFLOW||process.env.GITHUB_REF!=='refs/heads/main'||
    process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||!process.env.GH_TOKEN) throw Error('protected-harness-publisher-required');
const {candidate,file,distribution}=inspectCandidate(dir);
if(candidate.target!==process.env.RELEASE_TARGET||candidate.version!==process.env.RELEASE_VERSION||candidate.rehearsal||candidate.sourceCommit!==expectedCommit||candidate.sha256!==expectedSha||
    git('rev-parse','HEAD')!==process.env.GITHUB_SHA) throw Error('publication-candidate-source-mismatch');
if(candidate.target==='harness'&&distribution?.status!=='eligible')throw Error('distribution-approval-required');
const proof=assertAdmittedHarnessOriginal(candidate,fs.readFileSync(path.join(dir,'verification.json')));
if(candidate.target==='dsh-buildr-harness'){
  const provider=await query('@buildr-ai/buildr-harness',proof.harnessVersion);
  if(!provider||provider.dist.integrity!==proof.harnessIntegrity||!provider.buildrCompatibility?.provides?.some((item:any)=>item.feature==='desktop-entry'&&item.contracts?.includes('buildr.harness-desktop-web/v1'))) throw Error('verified-harness-peer-not-published');
} else if(candidate.target==='dsh-buildr-development'){
  const provider=await query('@buildr-ai/buildr',proof.buildrVersion);
  if(!provider||provider.dist.integrity!==proof.buildrIntegrity) throw Error('verified-buildr-peer-not-published');
}
const verifyPublished=(metadata:any)=>{if(metadata.dist.integrity!==candidate.integrity)throw Error('published-package-bytes-differ');};
const before=await query(candidate.packageName,candidate.version);
if(before) verifyPublished(before);
else {
  if(mode==='readback'||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('publication-not-confirmed: inspect the original attempt; not uploading');
  const selection=`Harness publish ${candidate.target} ${candidate.version}`;
  const runs=await github('actions/workflows/publish-harness.yml/runs?branch=main&event=workflow_dispatch&per_page=100');
  if(!runs||!Array.isArray(runs.workflow_runs)||runs.total_count>runs.workflow_runs.length||
      runs.workflow_runs.some((run:any)=>String(run.id)!==process.env.GITHUB_RUN_ID&&run.display_title===selection)) throw Error('prior-publication-request: readback only');
  console.log(JSON.stringify({status:'upload-attempted' ,name:candidate.packageName,version:candidate.version,sha256:candidate.sha256}));
  execFileSync('npm',['publish',file,'--access','public','--tag',candidate.version.includes('-rc.')?'next':'latest','--ignore-scripts','--provenance','--registry',registry,'--fetch-retries','0'],
    {cwd:dir,stdio:'inherit',timeout:180000});
}
let after=before;
for(let attempt=0;!after&&attempt<8;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,Math.min(2000*2**attempt,12000)));
  after=await query(candidate.packageName,candidate.version);
}
if(!after)throw Error('publication-readback-required');
verifyPublished(after);
const tagName=candidate.version.includes('-rc.')?'next':'latest';
const tagResponse=await fetch(registry+'-/package/'+encodeURIComponent(candidate.packageName)+'/dist-tags',{signal:AbortSignal.timeout(15000)});
if(!tagResponse.ok||(await tagResponse.json())[tagName]!==candidate.version)throw Error('publication-tag-readback-required');
if(candidate.target==='dsh-buildr-harness'||candidate.target==='dsh-buildr-development'){
  const tag=`${candidate.target}-v${candidate.version}`;
  const title=candidate.target==='dsh-buildr-development'?`DSH Buildr Development ${candidate.version}`:`DSH Buildr Harness ${candidate.version}`;
  const gh=(...args:string[])=>execFileSync('gh',[...args,'--repo',REPO],{encoding:'utf8',timeout:60000});
  let release=await github(`releases/tags/${tag}`);
  if(!release){
    if(mode==='readback')throw Error('github-release-absent: use approved publish mode after npm readback');
    gh('release','create',tag,file,'--target',candidate.sourceCommit,'--title',title,
      '--notes',`npm: ${candidate.packageName}@${candidate.version}\n\nSHA-256: ${candidate.sha256}\n\n实测 DSH Desktop: ${proof.dshVersion}`,
      ...(candidate.version.includes('-rc.')?['--prerelease']:[]));
    release=await github(`releases/tags/${tag}`);
  }
  const actualTag=git('ls-remote','origin',`refs/tags/${tag}`,`refs/tags/${tag}^{}`).split('\n').filter(Boolean).at(-1)?.split(/\s+/)[0];
  if(release?.tag_name!==tag||actualTag!==candidate.sourceCommit||!release.assets?.some((asset:any)=>asset.name===candidate.file))throw Error('github-release-identity-mismatch');
  const downloaded=path.join(dir,'public-readback.tgz');
  gh('release','download',tag,'--pattern',candidate.file,'--output',downloaded);
  if(digest(downloaded)!==candidate.sha256)throw Error('github-release-bytes-differ');
}
console.log(JSON.stringify({status:'confirmed',name:candidate.packageName,version:candidate.version,sha256:candidate.sha256}));
