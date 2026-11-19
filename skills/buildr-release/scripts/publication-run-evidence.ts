import { candidateRunTimings } from './candidate-run-observation.ts';
import { releasePublishAuthority } from './release-authority.ts';

export function observePublicationRun(run: any, gh: (args: string[]) => string, log = '') {
  const repository = releasePublishAuthority.repository;
  let jobs: any[] = [];
  try {
    const pages = JSON.parse(gh(['api', '--paginate', '--slurp',
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`]));
    if (Array.isArray(pages) && pages.every(page => Array.isArray(page.jobs))) jobs = pages.flatMap(page => page.jobs);
  } catch { /* Missing evidence must not alter the status of the observed run. */ }
  const lines = log.split(/\r?\n/u);
  const failures = jobs.filter(job => job.conclusion === 'failure').flatMap(job => {
    const failedSteps = (job.steps ?? []).filter((step: any) => step.conclusion === 'failure');
    return (failedSteps.length ? failedSteps : [null]).map((step: any) => {
      const stepLines = lines.filter(line => {
        const [name, stepName] = line.split('\t');
        return name === job.name && (!step || step.name === stepName);
      });
      const propagation = stepLines.some(line => /"status":"publication-pending"[^\r\n]*"code":"registry-propagation-pending"/u.test(line));
      const message = stepLines.find(line => line.includes('##[error]'))?.split('##[error]').at(-1)?.trim();
      const safeMessage = message && !/credential|token|secret|password|authorization|https?:|\b[A-Za-z0-9_=-]{24,}\b/iu.test(message)
        ? message.slice(0, 500) : `GitHub recorded failure in ${step?.name ?? job.name}.`;
      return { checkName: step?.name ?? job.name, jobName: job.name, stepName: step?.name ?? null,
        runId: run.id, runAttempt: run.run_attempt, errorCode: propagation ? 'registry-propagation-pending' : 'github-job-failed',
        message: propagation ? '发布后的注册表回读仍在等待传播。' : safeMessage,
        logUrl: job.html_url ?? run.html_url ?? null };
    });
  });
  if (!failures.length && run.status === 'completed' && run.conclusion !== 'success') {
    failures.push({ checkName: 'publication', jobName: null, stepName: null, runId: run.id, runAttempt: run.run_attempt,
      errorCode: 'github-run-failed', message: `GitHub run concluded: ${run.conclusion}.`, logUrl: run.html_url ?? null });
  }
  return { remoteTiming: { runId: run.id, runAttempt: run.run_attempt, ...candidateRunTimings(run, jobs) }, publicationFailures: failures };
}
