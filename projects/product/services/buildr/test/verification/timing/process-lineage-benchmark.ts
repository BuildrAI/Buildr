#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createOwnedDescendantTracker, readProcessLineageSamplingMetrics, resetProcessLineageSamplingMetrics } from './parallel-runner.ts';

function positiveInteger(value: any, fallback: any, label: any): any  {
  if (value === undefined) return fallback;
  const number: any = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer.`);
  return number;
}

export async function runProcessLineageBenchmark(options: any = {}): Promise<any>  {
  const durationMs: any = positiveInteger(options.durationMs, 3_000, 'durationMs');
  const trackers: any = positiveInteger(options.trackers, 1, 'trackers');
  const intervalMs: any = positiveInteger(options.intervalMs, 50, 'intervalMs');
  resetProcessLineageSamplingMetrics();
  const cpuBefore: any = process.cpuUsage();
  const wallStartedAt: any = process.hrtime.bigint();
  const active: any = Array.from({ length: trackers }, () => createOwnedDescendantTracker(process.pid, { lineageSampleIntervalMs: intervalMs }));
  await new Promise((resolve: any) => setTimeout(resolve, durationMs));
  for (const tracker of active) tracker.stop();
  const wallDurationMs: any = Number(process.hrtime.bigint() - wallStartedAt) / 1_000_000;
  const cpu: any = process.cpuUsage(cpuBefore);
  return {
    schemaVersion: 'buildr.process-lineage-sampling-benchmark/v1',
    status: 'passed',
    configuration: { durationMs, trackers, intervalMs, sharedCacheMs: 40 },
    sampling: readProcessLineageSamplingMetrics(),
    timing: { wallDurationMs, userCpuMs: cpu.user / 1_000, systemCpuMs: cpu.system / 1_000, totalCpuMs: (cpu.user + cpu.system) / 1_000 },
    node: { executable: process.execPath, version: process.versions.node },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argumentsByName: any = Object.fromEntries(process.argv.slice(2).reduce((entries: any, value: any, index: any, all: any) => index % 2 === 0 ? [...entries, [value.replace(/^--/u, ''), all[index + 1]]] : entries, []));
    const result: any = await runProcessLineageBenchmark({ durationMs: argumentsByName.duration, trackers: argumentsByName.trackers, intervalMs: argumentsByName.interval });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: 'buildr.process-lineage-sampling-benchmark/v1', status: 'blocked', error: error.message })}\n`);
    process.exitCode = 1;
  }
}
