import fs from 'node:fs';
import process from 'node:process';
import { createVerificationResourceCoordinator } from '../../src/application/verification/resource-coordinator.mjs';

const [root, taskId, acquiredFile, releaseFile] = process.argv.slice(2);
const coordinator = createVerificationResourceCoordinator({
  root,
  resources: { browser: { strategy: 'coordinated', capacity: 1, cleanup: 'provider-owned', authorization: 'implicit' } },
  owner: { taskId, runId: `run-${taskId}` },
  pollMs: 10,
  ttlMs: 2_000,
  waitTimeoutMs: 5_000,
});
const handle = await coordinator.acquire(['browser']);
const { heartbeat, directory, token, ...claim } = handle.claims[0];
fs.writeFileSync(acquiredFile, `${JSON.stringify(claim)}\n`);
while (!fs.existsSync(releaseFile)) await new Promise((resolve) => setTimeout(resolve, 10));
const release = await handle.release();
process.stdout.write(`${JSON.stringify(release)}\n`);
