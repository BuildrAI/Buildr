#!/usr/bin/env node
/** Read existing per-machine timing evidence. This is a CI consumer, not a
 * second test registry or an executor, and never changes original conclusions. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const types = new Set(['Static', 'Unit', 'Integration', 'E2E']);
const normalizePlatform = (value: string) => value === 'macos' ? 'darwin' : value === 'windows' ? 'win32' : value;

export function aggregateDevelopmentEvidence(summaries: any[], options: { sourceCommit: string; comparisonBase?: string; jobResults?: Record<string, string> }) {
  const gaps: any[] = [];
  const failures: any[] = [];
  const valid: any[] = [];
  const expected = new Map<string, any>();
  const proofs = new Map<string, any[]>();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.sourceCommit)) throw new Error('An exact expected source commit is required.');
  for (const [job, result] of Object.entries(options.jobResults ?? {})) if (result !== 'success') gaps.push({ code: 'producer-job-not-successful', job, result });
  for (const summary of summaries) {
    if (summary?.schemaVersion !== 'buildr.verification-timing/v1' || !summary.coverage) continue;
    const coverage = summary.coverage;
    if (!['check', 'related'].includes(coverage.mode)) continue;
    if (summary.source?.head !== options.sourceCommit || summary.source?.dirty !== false) {
      gaps.push({ code: 'source-evidence-mismatch', runId: summary.run?.id, expected: options.sourceCommit, observed: summary.source?.head, dirty: summary.source?.dirty });
      continue;
    }
    if (typeof summary.run?.id !== 'string' || !['darwin', 'win32'].includes(summary.environment?.platform) || !Array.isArray(coverage.selected) || !Array.isArray(coverage.gaps) || !Array.isArray(summary.steps)
      || !['passed', 'not-passed', 'incomplete'].includes(coverage.conclusion) || coverage.target !== 'source') {
      gaps.push({ code: 'invalid-coverage-evidence', runId: summary.run?.id });
      continue;
    }
    if (options.comparisonBase && coverage.selection !== 'explicit' && coverage.base !== options.comparisonBase) { gaps.push({ code: 'comparison-base-mismatch', runId: summary.run?.id, expected: options.comparisonBase, observed: coverage.base }); continue; }
    valid.push(summary);
    if (coverage.conclusion === 'not-passed' && coverage.failedCount > 0) failures.push({ checkId: '<reported-failure>', runId: summary.run?.id, status: 'failed' });
    const selectedIds = new Set<string>();
    for (const item of coverage.selected) {
      if (typeof item.id !== 'string' || !types.has(item.type) || item.target !== 'source' || selectedIds.has(item.id)
        || !Array.isArray(item.requiredPlatforms) || item.requiredPlatforms.some((value: any) => typeof value !== 'string')) {
        gaps.push({ code: 'invalid-selected-check', runId: summary.run?.id, checkId: item.id });
        continue;
      }
      selectedIds.add(item.id);
      const prior = expected.get(item.id);
      if (prior && (prior.type !== item.type || prior.target !== item.target || JSON.stringify(prior.requiredPlatforms) !== JSON.stringify(item.requiredPlatforms))) {
        gaps.push({ code: 'check-definition-mismatch', checkId: item.id });
        continue;
      }
      expected.set(item.id, { id: item.id, type: item.type, target: item.target, requiredPlatforms: item.requiredPlatforms });
      const result = summary.steps.find((step: any) => step.id === item.id);
      if (item.status === 'passed') {
        const platform = item.proofPlatform;
        if (!result || result.status !== 'passed' || result.exitCode !== 0 || item.exitCode !== 0
          || typeof platform !== 'string' || !platform
          || (result.disposition !== 'reused' && platform !== summary.environment?.platform)
          || (result.disposition === 'reused' && platform !== result.reusedFrom?.environment?.platform)
          || (item.requiredPlatforms.length && !item.requiredPlatforms.includes(platform))) {
          gaps.push({ code: 'passed-proof-invalid', checkId: item.id, runId: summary.run?.id });
        } else proofs.set(item.id, [...(proofs.get(item.id) ?? []), { runId: summary.run.id, platform, disposition: result.disposition === 'reused' ? 'reused' : 'executed' }]);
      } else if (!['unavailable', 'not-run', 'blocked'].includes(item.status)) failures.push({ checkId: item.id, runId: summary.run?.id, status: item.status });
      if (['not-run', 'blocked'].includes(item.status)) gaps.push({ code: 'selected-check-not-executed', checkId: item.id, runId: summary.run?.id, status: item.status });
      if (item.status === 'unavailable' && !coverage.gaps.some((gap: any) => gap.code === 'different-platform-required' && gap.checkId === item.id)) {
        gaps.push({ code: 'unavailable-without-platform-handoff', checkId: item.id, runId: summary.run?.id });
      }
    }
    for (const result of summary.steps) if (!['passed', 'blocked'].includes(result.status)) {
      failures.push({ checkId: result.id, runId: summary.run?.id, status: result.status, exitCode: result.exitCode });
    }
    for (const gap of coverage.gaps) {
      if (gap.code !== 'different-platform-required') {
        gaps.push({ ...gap, runId: summary.run?.id });
        continue;
      }
      if (!selectedIds.has(gap.checkId) || !Array.isArray(gap.platforms) || gap.platforms.length === 0) {
        gaps.push({ code: 'invalid-platform-handoff', checkId: gap.checkId, runId: summary.run?.id });
      }
    }
  }
  if (!valid.some(summary => summary.environment?.platform === 'darwin' && summary.coverage.mode === 'check' && summary.coverage.selection === 'full')) gaps.push({ code: 'full-static-unit-evidence-missing' });
  if (!valid.some(summary => summary.environment?.platform === 'darwin' && summary.coverage.mode === 'related' && summary.coverage.selection === 'related-plus-explicit')) gaps.push({ code: 'task-related-evidence-missing' });
  for (const summary of valid) for (const gap of summary.coverage.gaps) if (gap.code === 'different-platform-required' && Array.isArray(gap.platforms)) {
    if (!(proofs.get(gap.checkId) ?? []).some(proof => gap.platforms.map(normalizePlatform).includes(proof.platform))) gaps.push({ code: 'platform-proof-missing', checkId: gap.checkId, requiredPlatforms: gap.platforms, runId: summary.run?.id });
  }
  const checks = [...expected.values()].map(item => ({ ...item, proofs: proofs.get(item.id) ?? [], status: proofs.has(item.id) ? 'passed' : 'unverified' }));
  for (const item of checks) if (item.status !== 'passed') gaps.push({ code: 'selected-check-proof-missing', checkId: item.id });
  const uniqueFailures = failures.filter((item, index, all) => all.findIndex(other => other.checkId === item.checkId && other.runId === item.runId && other.status === item.status) === index);
  const conclusion = uniqueFailures.length ? 'not-passed' : gaps.length ? 'incomplete' : 'passed';
  return { schemaVersion: 'buildr.development-verification-aggregate/v1', sourceCommit: options.sourceCommit, conclusion,
    originalConclusions: valid.map(summary => ({ runId: summary.run.id, platform: summary.environment?.platform, mode: summary.coverage.mode, conclusion: summary.coverage.conclusion })),
    checks, failures: uniqueFailures, gaps, counts: { selected: checks.length, proved: checks.filter(item => item.status === 'passed').length, failed: uniqueFailures.length, gaps: gaps.length },
    selectionExclusions: valid.flatMap(summary => summary.coverage.selectionExclusions ?? []).filter((item, index, all) => all.findIndex(other => other.id === item.id) === index),
    targetExclusions: valid.flatMap(summary => summary.coverage.targetExclusions ?? []).filter((item, index, all) => all.findIndex(other => other.id === item.id) === index) };
}

function readSummaries(directory: string): any[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return readSummaries(file);
    if (!entry.isFile() || !/(?:^|-)timing\.json$/u.test(entry.name)) return [];
    try { return [JSON.parse(fs.readFileSync(file, 'utf8'))]; }
    catch { throw new Error(`Malformed development evidence: ${file}`); }
  });
}

export function runDevelopmentAggregate(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--source', '--base', '--evidence-dir', '--output'].includes(key) || !value || value.startsWith('-') || options[key]) throw new Error('Usage: node development-aggregate.ts --source <commit> --evidence-dir <directory> --output <json>');
    options[key] = value;
  }
  if (!options['--source'] || !options['--evidence-dir'] || !options['--output']) throw new Error('Expected source, evidence directory and output are required.');
  const result = aggregateDevelopmentEvidence(readSummaries(path.resolve(options['--evidence-dir'])), {
    sourceCommit: options['--source'], comparisonBase: options['--base'], jobResults: { macos: process.env.BUILDR_DEV_MACOS_RESULT ?? 'success', windows: process.env.BUILDR_DEV_WINDOWS_RESULT ?? 'success' },
  });
  const output = path.resolve(options['--output']); fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`Development verification ${result.conclusion}: selected=${result.counts.selected} proved=${result.counts.proved} failed=${result.counts.failed} gaps=${result.counts.gaps}.\n`);
  for (const finding of [...result.failures, ...result.gaps]) process.stdout.write(`${JSON.stringify(finding)}\n`);
  return result.conclusion === 'passed' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runDevelopmentAggregate(process.argv.slice(2)); }
  catch (error: any) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
