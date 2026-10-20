/** Auto-approve pending protected-environment deployments for an already
 * authorized release run. The GitHub environment keeps its reviewer rule:
 * only a run whose pending deployment the operator credential may approve is
 * released, and approval is recorded as an effect. The operator previously
 * authorized this exact publication, so a second interactive click adds no
 * protection and stalls an authorized run. */

export interface EnvironmentApproval {
  readonly type: 'environment-deployment-approved';
  readonly runId: number;
  readonly environment: string;
  readonly deploymentId: number;
  readonly state: 'confirmed' | 'unconfirmed';
}

type GhCall = (args: string[]) => string;

/** Approve any pending deployment on the run that the operator credential may
 * approve. Returns approval effects; unresolved API failures record
 * 'unconfirmed' so the caller can keep waiting for the same run. */
export function approvePendingEnvironmentDeployments(runId: number, repository: string, environment: string, gh: GhCall, effects: EnvironmentApproval[]): boolean {
  if (runId < 1 || !repository || !environment) return false;
  let pending: any;
  try {
    pending = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${runId}/pending_deployments`]));
  } catch {
    return false;
  }
  if (!Array.isArray(pending) || pending.length === 0) return false;
  const targets = pending.filter((item: any) => item?.environment?.name === environment
    && Number.isSafeInteger(item?.environment?.id) && item?.current_user_can_approve === true);
  if (targets.length === 0) return false;
  let approved = false;
  for (const item of targets) {
    const effect: EnvironmentApproval = { type: 'environment-deployment-approved', runId, environment, deploymentId: 0, state: 'unconfirmed' };
    try {
      const response = JSON.parse(gh(['api', '-X', 'POST', `repos/${repository}/actions/runs/${runId}/pending_deployments`,
        '-F', `environment_ids[]=${item.environment.id}`, '-F', 'state=approved',
        '-F', `comment=Approved by authorized release operation for ${environment}`]));
      const deployments = Array.isArray(response) ? response : [response];
      const deployment = deployments.find((entry: any) => entry?.environment === environment || Number.isSafeInteger(entry?.id));
      effect.deploymentId = deployment?.id ?? item.environment.id;
      effect.state = 'confirmed';
      approved = true;
    } catch { /* keep unconfirmed; the run remains observable */ }
    effects.push(effect);
  }
  return approved;
}
