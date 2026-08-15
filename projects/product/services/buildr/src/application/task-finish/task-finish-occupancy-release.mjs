import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';

import { removeIsolatedGitCarrier } from './git-task-contribution.mjs';
import { inspectFinishRun } from './task-finish-run.mjs';

function occupancyError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, {
    code,
    usage: 'buildr help task finish run',
    nextAction: 'buildr help task finish run',
  });
  if (details) error.details = details;
  return error;
}

export function hasSuccessfulFinishDelivery(run) {
  const delivery = run?.delivery;
  const completion = run?.completion;
  return delivery?.status === 'delivered'
    || Boolean(delivery?.remoteAfterRef)
    || Boolean(delivery?.finalRemoteRef)
    || Boolean(completion?.finalRemoteRef);
}

function currentTaskStatus(runtime, root, taskId) {
  try {
    const inspected = runtime.inspectTaskRecord?.(root, taskId);
    return inspected?.record?.status || null;
  } catch (error) {
    throw occupancyError(
      'task_finish.release_occupancy_task_unreadable',
      'Unable to inspect the Task Record required to authorize occupancy release.',
      { taskId, diagnostic: { code: error.code || null, message: error.message } },
    );
  }
}

export function releaseFinishOccupancy({ root, run, taskId, runtime, clock = Date.now }) {
  if (!run) {
    throw occupancyError('task_finish.release_occupancy_run_missing', 'Occupancy release requires an existing Task Finish run.');
  }
  if (!taskId) {
    throw occupancyError('task_finish.release_occupancy_task_required', '--release-occupancy requires --task <task-id>.');
  }
  if (run.identity?.task !== taskId) {
    throw occupancyError(
      'task_finish.release_occupancy_task_mismatch',
      'Occupancy release --task must match the Finish run Task identity.',
      { expected: run.identity?.task || null, actual: taskId },
    );
  }
  if (!sameFilesystemPath(run.identity.workspaceRoot, root)) {
    throw occupancyError('task_finish.environment_mismatch', 'Task Finish run is bound to a different canonical Workspace.');
  }
  if (run.status === 'complete' || hasSuccessfulFinishDelivery(run)) {
    throw occupancyError(
      'task_finish.release_occupancy_already_delivered',
      'Occupancy release refuses a Finish run that already formed a successful delivery.',
      {
        status: run.status || null,
        deliveryStatus: run.delivery?.status || null,
        remoteAfterRef: run.delivery?.remoteAfterRef || null,
        finalRemoteRef: run.delivery?.finalRemoteRef || run.completion?.finalRemoteRef || null,
      },
    );
  }
  const taskStatus = currentTaskStatus(runtime, root, taskId);
  if (taskStatus !== 'abandoned') {
    throw occupancyError(
      'task_finish.release_occupancy_not_abandoned',
      'Occupancy release is only authorized when the Task Record is currently abandoned.',
      { taskId, taskStatus },
    );
  }
  return persistOccupancyRelease({ root, run, runtime, clock });
}

function persistOccupancyRelease({ root, run, runtime, clock }) {
  if (run.occupancy?.status === 'released') {
    const leftover = removeIsolatedGitCarrier({
      repositoryRoot: run.identity.workspaceRoot,
      workspaceRoot: run.identity.workspaceRoot,
      runId: run.runId,
      expectedRoot: run.occupancy.cleanup?.root || null,
    });
    if (!['removed', 'not-applicable'].includes(leftover.status)) {
      throw occupancyError(
        leftover.code || 'task-finish.carrier-cleanup-failed',
        'Unable to confirm the previously released occupancy is gone.',
        leftover,
      );
    }
    return inspectFinishRun({ root, runId: run.runId, clock, runtime });
  }

  const expectedRoot = run.deliveryCarrier?.root || null;
  const carrierCleanup = removeIsolatedGitCarrier({
    repositoryRoot: run.identity.workspaceRoot,
    workspaceRoot: run.identity.workspaceRoot,
    runId: run.runId,
    expectedRoot,
  });
  if (!['removed', 'not-applicable'].includes(carrierCleanup.status)) {
    throw occupancyError(
      carrierCleanup.code || 'task-finish.carrier-cleanup-failed',
      'Unable to clean the run-owned isolated Delivery Carrier.',
      carrierCleanup,
    );
  }

  const releasedAt = new Date(clock()).toISOString();
  const next = JSON.parse(JSON.stringify(run));
  next.occupancy = {
    status: 'released',
    releasedAt,
    previousCarrierIdentity: run.deliveryCarrier?.identity || null,
    cleanup: {
      status: carrierCleanup.status,
      root: carrierCleanup.root || expectedRoot,
    },
  };
  next.deliveryCarrier = null;
  next.resume = null;
  next.updatedAt = releasedAt;
  runtime.writeTaskFinishRunPersistence(root, next);
  return inspectFinishRun({ root, runId: next.runId, clock, runtime });
}
