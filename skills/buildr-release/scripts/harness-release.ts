import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {inspectArtifactDistribution} from '../../../projects/product/services/buildr-harness/tools/inspect-artifact-distribution.ts';

const repo = path.resolve(import.meta.dirname, '../../..');
const services = path.join(repo, 'projects/product/services');
const targets = {
  harness: {name:'@buildr-ai/buildr-harness', directory:'buildr-harness', builder:'tools/pack-local.ts', filename:'buildr-ai-buildr-harness'},
  'dsh-buildr-harness': {name:'@buildr-ai/dsh-buildr-harness', directory:'buildr-harness-dsh-plugin', builder:'tools/build-dev.ts', filename:'buildr-ai-dsh-buildr-harness'},
} as const;
export type Target = keyof typeof targets;
const versionPattern = /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/;
const sha = (algorithm: string, value: Buffer, encoding: 'hex' | 'base64') => createHash(algorithm).update(value).digest(encoding);
const git = (...args: string[]) => execFileSync('git', args, {cwd:repo, encoding:'utf8', timeout:15000}).trim();
const exact = (value: unknown, length: number) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const packageFile = (file: string, item: string) => execFileSync('tar', ['-xOzf', file, item], {encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
const schemaVersion = 'buildr.harness-release-candidate/v1';
interface Candidate {
  schemaVersion: typeof schemaVersion; target: Target; packageName: string; version: string;
  file: string; sha256: string; integrity: string; size: number; sourceCommit: string; sourceTree: string;
  rehearsal: boolean;
}

function artifact(dir: string, value: Candidate) {
  const target = Object.hasOwn(targets, value.target) && targets[value.target];
  if (!target || value.schemaVersion !== schemaVersion || !versionPattern.test(value.version) || value.packageName !== target.name ||
      value.file !== `${target.filename}-${value.version}.tgz` || !exact(value.sourceCommit,40) || !exact(value.sourceTree,40) ||
      !exact(value.sha256,64) || typeof value.rehearsal !== 'boolean') throw Error('candidate-identity-invalid');
  const file = path.join(dir, value.file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size !== value.size || stat.size > 64 * 1024 * 1024) throw Error('candidate-size-invalid');
  const bytes = fs.readFileSync(file);
  if (sha('sha256',bytes,'hex') !== value.sha256 || `sha512-${sha('sha512',bytes,'base64')}` !== value.integrity) throw Error('candidate-bytes-changed');
  const names = execFileSync('tar',['-tzf',file],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024}).trim().split('\n');
  if (names.some(n => !n.startsWith('package/') || /(?:^|\/)\.\.?($|\/)|[\\\x00-\x1f]/.test(n)) || new Set(names).size !== names.length) throw Error('candidate-archive-invalid');
  const entries = execFileSync('tar',['-tvzf',file],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024}).trim().split('\n');
  if (entries.length !== names.length || entries.some(line => !/^[-d]/.test(line))) throw Error('candidate-archive-entry-invalid');
  const metadata = JSON.parse(packageFile(file, 'package/package.json'));
  if (metadata.name !== target.name || metadata.version !== value.version || metadata.private === true || metadata.scripts ||
      metadata.publishConfig?.access !== 'public' || metadata.repository?.url !== 'git+https://github.com/BuildrAI/Buildr.git') throw Error('candidate-metadata-invalid');
  const harness = value.target === 'harness';
  const required = harness
    ? ['bin/buildr-harness.mjs','build/index.js','build/harness-web-dist/index.html','resources/icons/BuildrHarness.icns','LICENSE','README.md']
    : ['lib/index.js','lib/launcher.js','lib/client.js','cordis.patch.yml','LICENSE','README.md'];
  if (required.some(name => !names.includes('package/'+name)) || names.some(n => /\/node_modules\/@(?:anthropic-ai|qoder-ai|deepseek-ai)\//.test(n))) throw Error('candidate-payload-invalid');
  if (!harness && (metadata.engines?.dsh !== '>=0.2.0-0 <0.3.0-0' || metadata.dependencies || metadata.dsh?.manifestVersion !== 1 ||
      metadata.buildrCompatibility?.requires?.[0]?.packageName !== targets.harness.name || !packageFile(file,'package/cordis.patch.yml').includes(`name: '${target.name}'`))) throw Error('candidate-plugin-contract-invalid');
  return {file, metadata};
}

export function inspectCandidate(dir: string) {
  const candidate: Candidate = JSON.parse(fs.readFileSync(path.join(dir,'candidate.json'),'utf8'));
  const {file} = artifact(dir,candidate);
  const distribution = candidate.target === 'harness' ? inspectArtifactDistribution(file, candidate.packageName) : null;
  if (distribution?.status === 'eligible') {
    const approval = distribution.platformSupport?.publicationApproval;
    if (approval?.version !== candidate.version || approval.platform !== 'darwin' ||
        !Array.isArray(approval.architectures) || approval.architectures.length !== 1 || approval.architectures[0] !== 'arm64' ||
        typeof approval.authority !== 'string' || !approval.authority.trim()) throw Error('candidate-platform-approval-mismatch');
  }
  return {candidate, file, distribution};
}

function prepare(target: Target, version: string, dir: string, rehearsal: boolean) {
  if (!Object.hasOwn(targets,target) || !versionPattern.test(version)) throw Error('candidate-target-or-version-invalid');
  const sourceCommit = git('rev-parse','HEAD'), sourceTree = git('rev-parse','HEAD^{tree}');
  if (!rehearsal && git('status','--porcelain','--untracked-files=normal')) throw Error('candidate-source-must-be-clean');
  fs.mkdirSync(dir, {recursive:true});
  if (fs.readdirSync(dir).length) throw Error('candidate-directory-must-be-empty');
  const spec=targets[target];
  const result=spawnSync(process.execPath, [spec.builder,'--release',version,dir],
    {cwd:path.join(services,spec.directory),stdio:'inherit',timeout:600000});
  if (result.error || result.status !== 0) throw result.error ?? Error('candidate-build-failed');
  if (git('rev-parse','HEAD') !== sourceCommit || (!rehearsal && git('status','--porcelain','--untracked-files=normal'))) throw Error('candidate-source-changed');
  const file=`${spec.filename}-${version}.tgz`, bytes=fs.readFileSync(path.join(dir,file));
  const candidate: Candidate = {schemaVersion,target,packageName:spec.name,version,file,sourceCommit,sourceTree,rehearsal,
    size:bytes.length,sha256:sha('sha256',bytes,'hex'),integrity:`sha512-${sha('sha512',bytes,'base64')}`};
  artifact(dir,candidate);
  fs.writeFileSync(path.join(dir,'candidate.json'), JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
  return inspectCandidate(dir);
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('harness-release.ts prepare <harness|dsh-buildr-harness> <version> <artifact-directory> [--rehearsal]\n'+
      'harness-release.ts inspect <artifact-directory>');
  } else if (command === 'prepare' && (args.length === 3 || args.length === 4 && args[3] === '--rehearsal')) {
    console.log(JSON.stringify(prepare(args[0] as Target,args[1]!,path.resolve(args[2]!),args[3]==='--rehearsal'),null,2));
  } else if (command === 'inspect' && args.length === 1) {
    console.log(JSON.stringify(inspectCandidate(path.resolve(args[0]!)),null,2));
  } else { throw Error('invalid-command: see --help'); }
}
