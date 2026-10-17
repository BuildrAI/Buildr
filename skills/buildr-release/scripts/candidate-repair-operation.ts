import { createCandidateSourceBinding } from './candidate-source-binding.ts';
import { releaseDispatchRejected } from './release-failure.ts';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

export function assertCandidateDispatchBudget(fields: string[]): void {
  const inputs = Object.fromEntries(fields.map(field => { const split = field.indexOf('='); return [field.slice(0, split), field.slice(split + 1)]; }));
  if (Buffer.byteLength(JSON.stringify({ ref: 'reserved-frozen-candidate-reference', inputs })) > 60_000) throw new Error('Combined Candidate inputs exceed the dispatch byte budget; no remote request was sent.');
}

/** Repairs checks on the original workflow/carrier. It neither changes the
 * frozen product selection nor creates another package or public effect. */
export function continueCandidateRepair(options: {
  repo: string; candidate: any; verificationSource: string; fields: string[]; sourceTransport?: string; artifactTransport?: string;
}, scope: { gh: (args: string[]) => string; git: (args: string[]) => string; save: () => void; ensureCarrier: () => void },
dependencies: any = {}): any {
  const { candidate } = options;
  if (!candidate?.runId || !candidate.sourceCommit || !candidate.branch) throw new Error('Candidate repair requires an original completed candidate.');
  const source = scope.git(['rev-parse', '--verify', options.verificationSource + '^{commit}']).trim();
  // Completing local package evidence on the original frozen checkout does
  // not introduce executable code from another source.
  if (source !== candidate.sourceCommit) scope.git(['merge-base', '--is-ancestor', source, 'origin/dev']);
  const binding = (dependencies.bind ?? createCandidateSourceBinding)(options.repo, candidate.sourceCommit, source);
  let pointer = candidate.repair;
  const hasImports = options.sourceTransport !== undefined || options.artifactTransport !== undefined;
  const inputIdentity = hasImports ? createHash('sha256').update(JSON.stringify({ source: options.sourceTransport ?? null, artifact: options.artifactTransport ?? null })).digest('hex') : pointer?.inputIdentity ?? null;
  if (pointer && (pointer.verificationSource !== source || hasImports && pointer.inputIdentity !== inputIdentity)) {
    if (!pointer.runId) throw new Error('Original candidate repair request is still unconfirmed.');
    const previous = JSON.parse(scope.gh(['api', 'repos/BuildrAI/Buildr/actions/runs/' + pointer.runId]));
    if (previous.status !== 'completed') return { status: 'candidate-running', run: previous, effects: [], nextActions: ['等待原补验运行结束；不替换其输入或重复派发。'] };
    candidate.repairHistory = [...(candidate.repairHistory ?? []), pointer];
    pointer = null;
  }
  if (pointer?.runId) {
    candidate.runId = pointer.runId; scope.save();
    return { status: 'adopted', effects: [], sourceBinding: binding };
  }
  if (!pointer) {
    const original = JSON.parse(scope.gh(['api', 'repos/BuildrAI/Buildr/actions/runs/' + candidate.runId]));
    if (original.status !== 'completed' || original.head_sha !== candidate.sourceCommit || original.repository?.full_name !== 'BuildrAI/Buildr'
      || original.event !== 'workflow_dispatch' || original.path?.split('@')[0] !== '.github/workflows/verify.yml') throw new Error('Candidate repair requires the completed original product run.');
    pointer = { originalRunId: candidate.runId, verificationSource: source, sourceBinding: binding, inputIdentity, requested: false, runId: null };
    candidate.repair = pointer;
    scope.save();
  }
  if (!isDeepStrictEqual(pointer.sourceBinding, binding)) throw new Error('Candidate repair source binding changed.');
  const title = 'Candidate repair ' + pointer.originalRunId + ' ' + source;
  const find = () => {
    const runs = JSON.parse(scope.gh(['run', 'list', '--repo', 'BuildrAI/Buildr', '--workflow', 'verify.yml', '--branch', candidate.branch,
      '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,headSha,displayTitle,status,conclusion']));
    if (!Array.isArray(runs)) throw new Error('Candidate repair history is unknown.');
    const matches = runs.filter(run => run.headSha === candidate.sourceCommit && run.displayTitle === title);
    if (matches.length > 1) throw new Error('Candidate repair request is ambiguous.');
    return matches[0] ?? null;
  };
  const effects: any[] = [];
  let found = find();
  if (!found && pointer.rejected) pointer.requested = false;
  if (!found && !pointer.requested) {
    const fields = [...options.fields, 'purpose=candidate', 'repair_candidate_run_id=' + pointer.originalRunId,
      'product_source=' + candidate.sourceCommit, 'verification_source=' + source,
      ...(options.sourceTransport ? ['source_verification=' + options.sourceTransport] : []),
      ...(options.artifactTransport ? ['artifact_verification=' + options.artifactTransport] : [])];
    assertCandidateDispatchBudget(fields);
    scope.ensureCarrier();
    pointer.requested = true; pointer.rejected = false; scope.save();
    const effect = { type: 'candidate-repair-dispatched', sourceCommit: candidate.sourceCommit, verificationSource: source, state: 'unknown' };
    effects.push(effect);
    try {
      scope.gh(['workflow', 'run', 'verify.yml', '--repo', 'BuildrAI/Buildr', '--ref', candidate.branch, ...fields.flatMap(field => ['-f', field])]);
      effect.state = 'confirmed';
    } catch (error: any) {
      pointer.diagnostic = error.diagnostic ?? { code: 'candidate-repair-dispatch-unknown', message: String(error.message).slice(-8192) };
      pointer.rejected = releaseDispatchRejected(pointer.diagnostic);
      if (pointer.rejected) effect.state = 'not-applied';
      pointer.attempts = [...(pointer.attempts ?? []), { diagnostic: pointer.diagnostic, rejected: pointer.rejected }];
    }
    scope.save();
    try { found = find(); }
    catch (error: any) { return { status: 'candidate-repair-readback-required', effects, diagnostic: error.diagnostic ?? { message: error.message }, nextActions: ['回读原补验请求；保留原包及请求，不重新派发。'] }; }
  }
  if (!found) {
    if (pointer.rejected) { pointer.requested = false; scope.save(); }
    return { status: pointer.rejected ? 'candidate-repair-dispatch-rejected' : 'candidate-repair-dispatch-unconfirmed', effects,
      diagnostic: pointer.diagnostic ?? null, nextActions: [pointer.rejected ? '修复明确拒绝的请求条件后继续原补验。' : '回读同一补验请求，不重新生成候选包或派发。'] };
  }
  pointer.runId = Number(found.databaseId); candidate.runId = pointer.runId; scope.save();
  return { status: 'adopted', effects, sourceBinding: binding };
}
