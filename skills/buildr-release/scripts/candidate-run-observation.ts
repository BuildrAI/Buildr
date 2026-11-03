import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readReleaseArtifact, RELEASE_ARTIFACT_METADATA_MAX_BYTES } from './release-artifact.ts';
import { releaseManifestFromTarball } from './package-artifact-observation.ts';
import { releasePublishAuthority } from './release-authority.ts';

/** Read-only timing projection: missing timestamps are unknown, never estimated. */
export function candidateRunTimings(run: any, jobs: any[]): any {
  const time = (value: any) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  const duration = (start: any, finish: any) => {
    const a = time(start), b = time(finish);
    return a !== null && b !== null && b >= a ? b - a : null;
  };
  const phase = (name: string) => /upload|archive/i.test(name) ? 'upload'
    : /cleanup|clean up|post /i.test(name) ? 'cleanup'
    : /readback|read back|aggregate|evidence/i.test(name) ? 'readback'
    : /prepare|setup|set up|checkout|download|install/i.test(name) ? 'preparation' : 'check';
  return { queueScope: 'run-created-to-started', queueMs: duration(run.created_at, run.run_started_at),
    jobs: jobs.map(job => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion,
      durationMs: duration(job.started_at, job.completed_at),
      steps: (job.steps ?? []).map((step: any) => ({ number: step.number, name: step.name, phase: phase(String(step.name)),
        status: step.status, conclusion: step.conclusion, durationMs: duration(step.started_at, step.completed_at) })) })) };
}

/** Return a usable handoff only after the original artifact is visible and its
 * manifest, archive and source agree. Temporary partial downloads are owned here. */
export function observeCandidatePackage(options: any, dependencies: any): any {
  const { candidate, handoff, repo } = options;
  if (!handoff || options.hasLocalEvidence || candidate.repair) return { status: 'not-required' };
  const gh = dependencies.gh;
  let listing: any;
  try { listing = JSON.parse(gh(['api', `repos/${releasePublishAuthority.repository}/actions/runs/${candidate.runId}/artifacts?per_page=100`])); }
  catch (error: any) { return { status: 'unknown', diagnostic: error.diagnostic ?? { code: 'candidate-artifact-readback-unknown', message: error.message } }; }
  if (!Array.isArray(listing.artifacts) || !Number.isSafeInteger(listing.total_count) || listing.total_count > listing.artifacts.length) return { status: 'unknown' };
  const matches = listing.artifacts.filter((artifact: any) => artifact.name === 'candidate-package' && artifact.expired === false);
  if (!matches.length) return { status: 'pending' };
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id < 1 || matches[0].workflow_run?.id !== candidate.runId
    || matches[0].workflow_run?.head_sha !== candidate.sourceCommit) throw new Error('Candidate package artifact belongs to a different or ambiguous workflow source.');
  const pointer = { runId: candidate.runId, artifactId: matches[0].id, sourceCommit: candidate.sourceCommit };
  const destination = handoff.artifactDirectory;
  const root = fs.realpathSync(repo);
  const relative = path.relative(root, path.resolve(destination));
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Candidate handoff destination escapes its owned checkout.');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) throw new Error('Candidate handoff destination has an unsafe directory or symbolic link.');
  }
  const inspect = (directory: string) => {
    const manifestFile = path.join(directory, 'release-artifact.json');
    const stat = fs.lstatSync(manifestFile, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > RELEASE_ARTIFACT_METADATA_MAX_BYTES) throw new Error('Candidate handoff manifest is absent or unsafe.');
    const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const tarball = typeof raw.filename === 'string' && path.basename(raw.filename) === raw.filename
      ? fs.lstatSync(path.join(directory, raw.filename), { throwIfNoEntry: false }) : null;
    if (!tarball?.isFile() || tarball.size > 256 * 1024 * 1024) throw new Error('Candidate handoff archive is absent or unsafe.');
    const artifact = readReleaseArtifact(manifestFile, { packageName: '@buildr-ai/buildr', version: options.version });
    if (artifact.manifest.sourceCommit !== candidate.sourceCommit
      || !isDeepStrictEqual(releaseManifestFromTarball(fs.readFileSync(artifact.tarball), artifact.manifest.filename), artifact.manifest)) {
      throw new Error('Candidate handoff package differs from the frozen source or embedded manifest.');
    }
    return artifact.manifest;
  };
  let manifest: any;
  if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
    const prior = candidate.awaitingLocalArtifact;
    if (!prior || prior.runId !== pointer.runId || prior.artifactId !== pointer.artifactId) throw new Error('Existing Candidate handoff directory has no matching original artifact ownership.');
    manifest = inspect(destination);
    if (prior.artifact && manifest.sha256 !== prior.artifact.sha256) throw new Error('Retained Candidate handoff bytes changed.');
  } else {
    // Persist the exact download ownership before filesystem effects so an
    // interrupted rename/readback can be recovered without adopting strangers.
    dependencies.onDownloadIntent?.({ ...handoff, ...pointer, status: 'download-requested' });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.candidate-download-'));
    try {
      const result = dependencies.execute(options.ghCommand || 'gh', [...handoff.download.args.slice(0, -1), temporary],
        { cwd: repo, encoding: 'utf8', timeout: 300_000, maxBuffer: 2 * 1024 * 1024 });
      if (result.status !== 0 || result.error) return { status: 'unknown', diagnostic: { code: 'candidate-artifact-download-unconfirmed',
        exitCode: result.status ?? null, signal: result.signal ?? null, errorCode: result.error?.code ?? null } };
      manifest = inspect(temporary);
      if (fs.lstatSync(destination, { throwIfNoEntry: false })) throw new Error('Candidate handoff destination appeared during download.');
      fs.renameSync(temporary, destination);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  return { status: 'ready', localArtifact: { ...handoff, ...pointer, status: 'ready', artifact: manifest,
    nextAction: `使用 Node 24.15.0 执行 artifact.ts --artifact-dir ${destination} --output ${handoff.evidenceDirectory}，完成后以 --artifact-verification ${handoff.evidenceDirectory} 接续同一 prepare；远端继续，不重新制包。` } };
}
