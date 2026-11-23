/** Exact data objects only. Never check out or execute candidate bytes in GitHub Actions. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectCandidate} from './harness-release.ts';
import {assertAdmittedHarnessOriginal} from './harness-release-admission.ts';

const [mode,dir,digest,commit]=process.argv.slice(2);
const maxBuffer=65*1024*1024;
const git=(args:string[],input?:string)=>execFileSync('git',args,{input,maxBuffer,timeout:30000});
const sha=(text:Buffer)=>createHash('sha256').update(text).digest('hex');
const validSha=(value:string|undefined,length:number)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(value);
if(!dir||!validSha(digest,64))throw Error('exact candidate directory and sha256 required');
if(mode==='pack'){
  const {candidate,file}=inspectCandidate(dir);
  if(candidate.sha256!==digest||candidate.rehearsal)throw Error('only a frozen candidate may be transported');
  if(git(['rev-parse','HEAD^{tree}']).toString().trim()!==candidate.sourceTree)throw Error('candidate-source-tree-mismatch');
  const files=[['candidate.json',path.join(dir,'candidate.json')],['verification.json',path.join(dir,'verification.json')],[candidate.file,file]];
  const entries=files.map(([name,source])=>{
    const stat=fs.lstatSync(source!);
    if(!stat.isFile()||stat.size>(name!.endsWith('.json')?1024*1024:64*1024*1024))throw Error('unsafe transport input');
    const object=git(['hash-object','-w','--no-filters','--',source!]).toString().trim();
    return `100644 blob ${object}\t${name}\n`;
  }).join('');
  const tree=git(['mktree'],entries).toString().trim();
  const dataCommit=git(['commit-tree',tree,'-m',`Harness candidate ${candidate.sha256}`]).toString().trim();
  console.log(JSON.stringify({status:'prepared-data-object',candidate,commit:dataCommit,ref:`refs/heads/release-data/harness-${digest}`}));
}else if(mode==='restore'&&validSha(commit,40)){
  if(fs.readdirSync(dir).length)throw Error('restore destination must be empty');
  const entries=git(['ls-tree','-z',commit!]).toString().split('\0').filter(Boolean);
  const received=new Set<string>();
  if(entries.length!==3)throw Error('transport must contain exactly three ordinary files');
  for(const entry of entries){
    const match=/^100644 blob [a-f0-9]{40}\t(candidate\.json|verification\.json|buildr-ai-(?:buildr-harness|dsh-buildr-harness)-\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?\.tgz)$/.exec(entry);
    if(!match||received.has(match[1]!))throw Error('unsafe transport entry');
    const name=match[1]!; received.add(name);
    const value=git(['show',`${commit}:${name}`]);
    if(name.endsWith('.tgz')?sha(value)!==digest:value.length>1024*1024)throw Error('transport bytes differ');
    fs.writeFileSync(path.join(dir,name),value,{flag:'wx'});
  }
  const {candidate}=inspectCandidate(dir);
  if(candidate.sha256!==digest||candidate.rehearsal||!received.has('verification.json'))throw Error('transport identity differs');
  assertAdmittedHarnessOriginal(candidate,fs.readFileSync(path.join(dir,'verification.json')));
  console.log(JSON.stringify({status:'preserved',candidate}));
}else{throw Error('Usage: harness-handoff.ts pack <candidate-directory> <sha256> | restore <empty-directory> <sha256> <data-commit>');}
