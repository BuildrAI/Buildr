import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createHash, type Hash } from 'node:crypto';
import { computeAgentRuntimeDigest } from '@buildr-ai/buildr-agent';
import { atomicWriteJson } from '../../infrastructure/filesystem/atomic-files.ts';

const CANDIDATE_SCHEMA = 'buildr.local-app-preview-candidate/v1';

function candidateError(message: string, code: string, details?: unknown): Error & { code: string; details?: unknown } {
  const error = Object.assign(new Error(message), { code });
  if (details !== undefined) Object.assign(error, { details });
  return error;
}

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function hashTree(hash: Hash, root: string): void {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) return;
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const info = fs.lstatSync(file);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) visit(file);
      else if (info.isFile()) {
        hash.update(path.relative(root, file));
        hash.update(fs.readFileSync(file));
      }
    }
  };
  visit(root);
}

/** Content digest of the worktree inputs that feed candidate preparation. A source
 * edit changes the digest, so a stale private package or web-dist is never reused. */
export function previewCandidateSourceDigest(serviceRoot: string): string {
  const root = path.resolve(serviceRoot);
  const agentRoot = path.resolve(root, '../buildr-agent');
  const webRoot = path.resolve(root, '../buildr-web');
  const hash = createHash('sha256');
  for (const directory of [path.join(root, 'src'), path.join(agentRoot, 'src'), path.join(webRoot, 'src')]) {
    hash.update(directory);
    hashTree(hash, directory);
  }
  for (const file of [
    path.join(root, 'package.json'), path.join(root, 'package-lock.json'),
    path.join(agentRoot, 'package.json'), path.join(agentRoot, 'package-lock.json'), path.join(agentRoot, 'tools/build.ts'),
    path.join(webRoot, 'package.json'), path.join(webRoot, 'package-lock.json'), path.join(webRoot, 'index.html'),
    path.join(root, 'tools/build/web-dist.ts'), path.resolve(root, '../../preparation.yml'),
  ]) {
    hash.update(file);
    if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) hash.update(fs.readFileSync(file));
  }
  if (fs.statSync(webRoot, { throwIfNoEntry: false })?.isDirectory()) {
    for (const name of fs.readdirSync(webRoot).sort()) {
      if (/^vite\.config\./.test(name)) { hash.update(name); hash.update(fs.readFileSync(path.join(webRoot, name))); }
    }
  }
  return hash.digest('hex');
}

function preparationToolEnv(node: string): NodeJS.ProcessEnv {
  return { ...process.env, PATH: [path.dirname(node), process.env.PATH].filter(Boolean).join(path.delimiter) };
}

function runPreparationTool(input: { node: string; serviceRoot: string; tool: string; args: string[]; stage: string }): { stdout: string; stderr: string } {
  const result = spawnSync(input.node, [path.join(input.serviceRoot, input.tool), ...input.args], {
    cwd: input.serviceRoot, encoding: 'utf8', env: preparationToolEnv(input.node),
  });
  if (result.error) throw candidateError(`候选产物准备无法启动（${input.stage}）：${result.error.message}`, 'preview_candidate_preparation_failed', { stage: input.stage });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '');
    let failedStage = input.stage;
    for (const line of stderr.split('\n')) {
      try {
        const event = JSON.parse(line);
        if (event?.event === 'stage-end' && event.status === 'failed' && typeof event.stage === 'string') failedStage = event.stage;
      } catch { /* progress lines are optional JSON */ }
    }
    throw candidateError(`候选产物准备失败（${failedStage}）：${(stderr || String(result.stdout || '')).trim().slice(-4096)}`, 'preview_candidate_preparation_failed', { stage: failedStage, exitCode: result.status });
  }
  return { stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

export type PreviewCandidateArtifacts = { status: 'prepared' | 'reused'; sourceDigest: string; webDist: string; agentPackage: string };

/** Prepare the worktree candidate artifacts before the host launches. All writes
 * stay inside the worktree; a freshness marker skips re-preparation when the
 * source inputs are unchanged and the artifacts are present. */
export function preparePreviewCandidateArtifacts(input: { serviceRoot: string; node: string }): PreviewCandidateArtifacts {
  const serviceRoot = path.resolve(input.serviceRoot);
  const webDist = path.join(serviceRoot, 'web-dist');
  const agentPackage = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-agent');
  const markerFile = path.join(serviceRoot, 'node_modules', '.buildr-preview-candidate.json');
  const sourceDigest = previewCandidateSourceDigest(serviceRoot);
  const artifactsPresent = fs.statSync(path.join(webDist, 'index.html'), { throwIfNoEntry: false })?.isFile() === true
    && fs.statSync(path.join(agentPackage, 'build/index.js'), { throwIfNoEntry: false })?.isFile() === true;
  const marker = readJson(markerFile);
  if (marker?.schemaVersion === CANDIDATE_SCHEMA && marker.sourceDigest === sourceDigest && artifactsPresent) {
    return { status: 'reused', sourceDigest, webDist, agentPackage };
  }
  runPreparationTool({ node: input.node, serviceRoot, tool: 'tools/development/prepare-development-dependencies.ts', args: [], stage: 'prepare-dependencies' });
  runPreparationTool({ node: input.node, serviceRoot, tool: 'tools/development/prepare-development-web.ts', args: ['--output', webDist], stage: 'prepare-web' });
  atomicWriteJson(markerFile, { schemaVersion: CANDIDATE_SCHEMA, sourceDigest, preparedAt: new Date().toISOString(), webDist, agentPackage });
  return { status: 'prepared', sourceDigest, webDist, agentPackage };
}

/** Digest of the already prepared worktree private package. MUST run after
 * preparation; never computed from an unprepared node_modules. */
export function computePreviewCandidateDigest(input: { serviceRoot: string; node: string }): string {
  const agentPackage = path.join(path.resolve(input.serviceRoot), 'node_modules/@buildr-ai/buildr-agent');
  if (fs.statSync(path.join(agentPackage, 'build/index.js'), { throwIfNoEntry: false })?.isFile() !== true) {
    throw candidateError('候选 Agent 私有包尚未准备，无法计算运行单元 digest。', 'preview_candidate_not_prepared', { agentPackage });
  }
  return computeAgentRuntimeDigest({ packageRoot: agentPackage, node: input.node });
}