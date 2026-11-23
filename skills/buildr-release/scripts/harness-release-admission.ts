/** Protected main approves exact data, not a candidate checkout as an executor. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoName = 'BuildrAI/Buildr';
const root = path.resolve(import.meta.dirname, '../../..');
const approvalPath = 'skills/buildr-release/scripts/harness-release-admissions.json';
const commitId = /^[a-f0-9]{40}$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/u;
const integrityPattern = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const keys = ['target','version','sourceCommit','sourceTree','sha256','integrity','proofSha256'] as const;
const targets = ['harness','dsh-buildr-harness'];
const trustedPublishingSetupRef = 'codex/release-harness-admission-trusted-publishing';
const authorityProbePath = 'skills/buildr-release/scripts/harness-npm-authority.ts';
export const trustedPublishingSetupPaths = [
  '.github/workflows/publish-harness.yml',
  'projects/product/knowledge/docs/flows/open-source-release.md',
  'projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts',
  authorityProbePath,
  'skills/buildr-release/scripts/harness-release-admission.test.ts',
  'skills/buildr-release/scripts/harness-release-admission.ts',
];
export const firstReleasePaths = [
  '.github/workflows/preserve-harness.yml',
  '.github/workflows/publish-harness.yml',
  'projects/product/knowledge/docs/flows/open-source-release.md',
  'projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts',
  'skills/buildr-release/scripts/harness-handoff.ts',
  'skills/buildr-release/scripts/harness-publish.ts',
  'skills/buildr-release/scripts/harness-release-admission.test.ts',
  'skills/buildr-release/scripts/harness-release-admission.ts',
  approvalPath,
  'skills/buildr-release/scripts/harness-release.ts',
];

type Git = (args: string[]) => string;
const gitAt = (cwd: string): Git => args => execFileSync('git', args, {cwd,encoding:'utf8',timeout:30_000,maxBuffer:2*1024*1024}).trim();
export function parseAdmissions(raw: string) {
  const value = JSON.parse(raw);
  if (value?.schemaVersion !== 'buildr.harness-release-admissions/v1' || Object.keys(value).length !== 2 ||
      !Array.isArray(value.admissions) || !value.admissions.length || value.admissions.length > 200) throw Error('harness-admissions-invalid');
  const seen = new Set<string>();
  for (const item of value.admissions) {
    if (!item || Object.keys(item).length !== keys.length || keys.some(key => typeof item[key] !== 'string') ||
        !targets.includes(item.target) || !versionPattern.test(item.version) || !commitId.test(item.sourceCommit) ||
        !commitId.test(item.sourceTree) || !sha256.test(item.sha256) || !sha256.test(item.proofSha256) || !integrityPattern.test(item.integrity)) {
      throw Error('harness-admission-invalid');
    }
    const id = `${item.target}@${item.version}`;
    if (seen.has(id)) throw Error('harness-admission-duplicate');
    seen.add(id);
  }
  return value.admissions as Array<Record<typeof keys[number], string>>;
}

export function verifySources(items: ReturnType<typeof parseAdmissions>, git: Git) {
  const dev = git(['rev-parse','--verify','refs/remotes/origin/dev']);
  if (!commitId.test(dev)) throw Error('harness-development-ref-invalid');
  for (const item of items) {
    git(['merge-base','--is-ancestor',item.sourceCommit,dev]);
    if (git(['rev-parse',`${item.sourceCommit}^{tree}`]) !== item.sourceTree) throw Error('harness-source-tree-mismatch');
  }
}

export function assertAdmittedHarnessOriginal(candidate: any, proofBytes: Buffer, cwd = root, git: Git = gitAt(cwd)) {
  const all = parseAdmissions(fs.readFileSync(path.join(cwd,approvalPath),'utf8'));
  const approved = all.find(item => item.target === candidate.target && item.version === candidate.version);
  const proofHash = createHash('sha256').update(proofBytes).digest('hex');
  if (!approved || candidate.rehearsal !== false || keys.filter(key => key !== 'proofSha256').some(key => candidate[key] !== approved[key]) ||
      proofBytes.length > 1024 * 1024 || proofHash !== approved.proofSha256) throw Error('harness-original-not-admitted');
  verifySources([approved],git);
  const proof = JSON.parse(proofBytes.toString('utf8'));
  if (proof?.status !== 'passed' || proof.sha256 !== approved.sha256 || proof.platform !== 'darwin' || proof.arch !== 'arm64') throw Error('harness-proof-invalid');
  if (approved.target === 'harness') {
    if (proof.check !== 'installed-cli-launcher-web' || proof.node !== 'v24.15.0') throw Error('harness-proof-invalid');
  } else {
    const harness = all.find(item => item.target === 'harness' && item.version === proof.harnessVersion && item.integrity === proof.harnessIntegrity);
    if (proof.check !== 'installed-dsh-npm-and-github' || proof.installEvidence !== 'isolated-npm-and-http-tarball' ||
        !/^0\.2\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(proof.dshVersion) || !harness) throw Error('harness-pair-proof-invalid');
  }
  return proof;
}

function verifyHarnessPRIdentity(event: any, repository: string, git: Git) {
  const pr = event?.pull_request;
  if (repository !== repoName || pr?.base?.ref !== 'main' || pr?.base?.repo?.full_name !== repoName ||
      pr?.head?.repo?.full_name !== repoName ||
      !commitId.test(pr?.base?.sha ?? '') || !commitId.test(pr?.head?.sha ?? '') ||
      git(['rev-parse','HEAD']) !== pr.head.sha || git(['rev-parse','refs/remotes/origin/main']) !== pr.base.sha ||
      git(['rev-list','--parents','-1',pr.head.sha]) !== `${pr.head.sha} ${pr.base.sha}`) throw Error('harness-release-pr-identity-invalid');
  return pr;
}

function verifyHarnessPRPaths(pr: any, paths: string[], git: Git) {
  const changed = git(['diff','--name-only','--no-renames','-z',pr.base.sha,pr.head.sha,'--']).split('\0').filter(Boolean);
  if (changed.length !== paths.length || changed.some(name => !paths.includes(name))) throw Error('harness-release-pr-paths-invalid');
  for (const name of changed) if (!/^100644 blob [a-f0-9]{40}\t/u.test(git(['ls-tree',pr.head.sha,'--',name]))) throw Error('harness-release-pr-file-invalid');
}

export function verifyHarnessFirstReleasePR(event: any, repository: string, cwd: string, git: Git = gitAt(cwd)) {
  const pr = verifyHarnessPRIdentity(event, repository, git);
  if (pr.head.ref !== 'codex/release-harness-first-rc1') throw Error('harness-release-pr-identity-invalid');
  verifyHarnessPRPaths(pr, firstReleasePaths, git);
  const admitted = parseAdmissions(git(['show',`${pr.head.sha}:${approvalPath}`]));
  if (admitted.length !== 2 || admitted.some(item => item.version !== '0.1.0-rc.1') || new Set(admitted.map(item => item.target)).size !== 2 ||
      new Set(admitted.map(item => item.sourceCommit)).size !== 1) throw Error('harness-first-release-pair-invalid');
  verifySources(admitted,git);
  return {status:'passed',kind:'harness-independent-release-admission',sourceCommit:admitted[0]!.sourceCommit,targets:admitted.map(({target,version})=>({target,version}))};
}

export function verifyHarnessReleaseAdmissionPR(event: any, repository: string, cwd: string, git: Git = gitAt(cwd)) {
  const pr = verifyHarnessPRIdentity(event, repository, git);
  if (pr.head.ref === trustedPublishingSetupRef) {
    verifyHarnessPRPaths(pr, trustedPublishingSetupPaths, git);
    // The initial setup can add the probe, but cannot amend or admit any candidate.
    if (git(['ls-tree',pr.base.sha,'--',authorityProbePath])) throw Error('harness-trusted-publishing-setup-already-admitted');
    return {status:'passed',kind:'harness-trusted-publishing-setup',targets:[]};
  }
  if (!/^codex\/release-harness-admission-v\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/u.test(pr.head.ref)) throw Error('harness-release-pr-identity-invalid');
  verifyHarnessPRPaths(pr, [approvalPath], git);
  const version = pr.head.ref.slice('codex/release-harness-admission-v'.length);
  const before = parseAdmissions(git(['show',`${pr.base.sha}:${approvalPath}`]));
  const after = parseAdmissions(git(['show',`${pr.head.sha}:${approvalPath}`]));
  if (after.length <= before.length ||
      before.some((item, index) => keys.some(key => item[key] !== after[index]?.[key]))) throw Error('harness-release-admission-not-append-only');
  const added = after.slice(before.length);
  if (added.some(item => item.version !== version)) throw Error('harness-release-admission-version-mismatch');
  verifySources(added, git);
  return {status:'passed',kind:'harness-independent-release-admission',targets:added.map(({target,version})=>({target,version}))};
}
