#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { executeVerificationCommand } from '../../src/verification/infrastructure/process-executor.ts';

import { collectChangedProductPaths } from './changed-paths.ts';

export const BROWSER_SELECTORS: any = Object.freeze(['core', 'shell', 'project', 'service', 'change', 'task', 'articles']);

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot: any = path.resolve(productRoot, '../..');

function normalize(value: any): any  {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function buildrRelative(value: any): any  {
  const normalized: any = normalize(value);
  return normalized.startsWith('services/buildr/') ? normalized.slice('services/buildr/'.length) : normalized;
}

function isBrowserOwnedPath(value: any): any  {
  const normalized: any = normalize(value);
  const relative: any = buildrRelative(normalized);
  return normalized.startsWith('services/buildr-web/')
    || (relative.startsWith('src/web/') && !relative.startsWith('src/web/http/'))
    || relative.startsWith('test/browser-smoke/')
    || relative === 'test/verification/browser-selector-dispatcher.ts'
    || relative === 'test/verification/web-dist.ts';
}

export function parseChangedPaths(raw: any = process.env.BUILDR_CHANGED_PATHS_JSON): any  {
  if (!raw) {
    try {
      return collectChangedProductPaths({
        productRoot,
        projectRoot,
        base: process.env.BUILDR_VERIFICATION_BASE || null,
      }).paths;
    } catch (error: any) {
      const diagnostic: Error & Record<string, any> = new Error(`Browser changed dispatcher 无法解析 changed paths：${error.message}；请提供 BUILDR_CHANGED_PATHS_JSON 或 BUILDR_VERIFICATION_BASE。`);
      diagnostic.code = 'browser_changed_paths_unresolvable';
      throw diagnostic;
    }
  }
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch (error: any) {
    const diagnostic: Error & Record<string, any> = new Error(`BUILDR_CHANGED_PATHS_JSON 不是合法 JSON：${error.message}`);
    diagnostic.code = 'browser_changed_paths_invalid';
    throw diagnostic;
  }
  const paths: any = Array.isArray(parsed) ? parsed : parsed?.paths;
  if (!Array.isArray(paths) || paths.some((item: any) => typeof item !== 'string' || !item.trim())) {
    const error: Error & Record<string, any> = new Error('BUILDR_CHANGED_PATHS_JSON 必须是字符串路径数组。');
    error.code = 'browser_changed_paths_invalid';
    throw error;
  }
  return paths.map(normalize);
}

function add(plan: any, selector: any, pathValue: any, reason: any): any  {
  if (!plan.selectors.includes(selector)) plan.selectors.push(selector);
  plan.reasons.push({ path: pathValue, selector, reason });
}

export function selectBrowserSelectors(changedPaths: any): any  {
  const paths: any[] = [...new Set((changedPaths || []).map(normalize))];
  const plan: any = { status: 'not-applicable', mode: 'affected', paths, selectors: [], reasons: [], diagnostics: [] };
  for (const originalValue of paths) {
    const value: any = buildrRelative(originalValue);
    if (value.startsWith('test/browser-smoke/')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Browser Smoke implementation changed; run the explicit complete selector set.' });
      continue;
    }
    if (value === 'verification.yml' || originalValue === 'projects/product/verification.yml' || value === 'test/verification/registry.ts' || value.startsWith('test/verification/browser-') || value === 'test/verification/web-dist.ts') {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Browser verification selection mechanism changed; run the complete selector set.' });
      continue;
    }
    if (value.startsWith('src/web/http/')) {
      plan.reasons.push({ path: originalValue, selector: null, reason: 'HTTP/API owner; verify through the Buildr Web Runtime/System owner without starting Chrome.' });
      continue;
    }
    if (originalValue.startsWith('services/buildr-web/') && !originalValue.startsWith('services/buildr-web/src/')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Buildr Web package or build configuration changed; run the complete selector set.' });
      continue;
    }
    if (originalValue.startsWith('services/buildr-web/src/')) {
      if (/\/(?:pages\/)?(?:[Pp]roject|[Pp]rojects)/.test(originalValue) || originalValue.includes('/pages/Project')) add(plan, 'project', originalValue, 'Project page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Ss]ervice|[Ss]ervices)/.test(originalValue) || originalValue.includes('/pages/Service')) add(plan, 'service', originalValue, 'Service page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Cc]hange|[Cc]hanges)|TaskChange/.test(originalValue) || originalValue.includes('/pages/TaskChange') || originalValue.includes('AgentAction')) add(plan, 'change', originalValue, 'Change page or Agent Action interaction changed.');
      else if (/\/(?:pages\/)?(?:[Tt]ask|[Tt]asks)|task-detail/.test(originalValue) || originalValue.includes('/pages/Task') || originalValue.includes('/pages/task-detail')) add(plan, 'task', originalValue, 'Task page, tab or lifecycle interaction changed.');
      else if (originalValue.includes('/pages/Article') || originalValue.includes('/pages/Articles') || originalValue.includes('/articles')) add(plan, 'articles', originalValue, 'Articles page or publication interaction changed.');
      else if (value.endsWith('/main.tsx') || value.endsWith('/App.tsx') || value.endsWith('/AppLayout.tsx') || value.endsWith('/index.html')) {
        add(plan, 'shell', originalValue, 'Global app bootstrap or router changed.');
        add(plan, 'core', originalValue, 'Shared routing changed; run the representative Task route smoke.');
      } else add(plan, 'core', originalValue, 'Unclassified Buildr Web path uses the core smoke fallback.');
      continue;
    }
    if (value.startsWith('src/web/')) {
      add(plan, 'shell', originalValue, 'Buildr Web bootstrap/runtime changed.');
      add(plan, 'core', originalValue, 'Buildr Web runtime change requires the representative route smoke.');
      continue;
    }
    plan.reasons.push({ path: originalValue, selector: null, reason: 'Path is outside the Browser capability applicability.' });
  }
  if (plan.mode === 'full') plan.selectors = ['all'];
  const ownedPaths: any = paths.filter(isBrowserOwnedPath);
  if (plan.selectors.length > 0) plan.status = 'selected';
  else if (ownedPaths.length > 0) {
    plan.status = 'blocked';
    plan.diagnostics.push({ code: 'browser_selector_coverage_gap', paths: ownedPaths });
  }
  return plan;
}

export async function runPhase(id: any, argv: any, cwd: any, timeoutMs: any, env: any = process.env): Promise<any>  {
  const startedAt: any = Date.now();
  process.stderr.write(`[buildr-verification-phase] ${JSON.stringify({ scope: 'buildr-web-browser', id, status: 'started', startedAt: new Date(startedAt).toISOString() })}\n`);
  const result: any = await executeVerificationCommand({ name: id, command: { argv, cwd, timeoutMs } }, { env });
  const finishedAt: any = Date.now();
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.stderr.write(`[buildr-verification-phase] ${JSON.stringify({ scope: 'buildr-web-browser', id, status: result.status === 'passed' ? 'passed' : 'failed', startedAt: new Date(startedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString(), durationMs: finishedAt - startedAt, failureCode: result.failureCode || null })}\n`);
  return result;
}

async function main(): Promise<any>  {
  const args: any = process.argv.slice(2);
  const full: any = args.includes('--full');
  const selectorIndex: any = args.indexOf('--selector');
  const explicitSelector: any = selectorIndex < 0 ? null : args[selectorIndex + 1];
  if (selectorIndex >= 0 && (!explicitSelector || !BROWSER_SELECTORS.includes(explicitSelector))) throw new Error('--selector requires one known Browser selector.');
  const run: any = args.includes('--run');
  let plan: any;
  try {
    plan = explicitSelector
      ? { status: 'selected', mode: 'explicit', paths: [], selectors: [explicitSelector], reasons: [{ path: null, selector: explicitSelector, reason: 'Explicit Browser selector.' }], diagnostics: [] }
      : full
      ? { status: 'selected', mode: 'full', paths: [], selectors: ['all'], reasons: [{ path: null, selector: 'all', reason: 'Explicit full Browser Smoke.' }], diagnostics: [] }
      : selectBrowserSelectors(parseChangedPaths());
  } catch (error: any) {
    process.stderr.write(`${error.code || 'browser_selector_dispatch_failed'}: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const payload: any = { schemaVersion: 'buildr.browser-selector-plan/v1', ...plan };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  const outputIndex: any = args.indexOf('--output');
  const outputPath: any = outputIndex === -1 ? process.env.BUILDR_BROWSER_PLAN_OUTPUT : args[outputIndex + 1];
  if (outputIndex !== -1 && (!outputPath || outputPath.startsWith('--'))) {
    process.stderr.write('browser_selector_output_missing: --output requires a file path.\n');
    process.exitCode = 2;
    return;
  }
  if (outputPath) {
    const resolvedOutput: any = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (plan.status === 'blocked') {
    process.stderr.write(`browser_selector_coverage_gap: Browser-owned paths selected no Browser selector: ${plan.diagnostics[0].paths.join(', ')}\n`);
    process.exitCode = 2;
    return;
  }
  if (!run || plan.status === 'not-applicable') return;
  const webDistVerifier: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'web-dist.ts');
  const stagingParent: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-browser-web-dist-'));
  const stagingRoot: any = path.join(stagingParent, 'web-dist');
  try {
    const webDistResult: any = await runPhase('web-dist', [process.execPath, webDistVerifier, '--output', stagingRoot], path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 300_000);
    if (webDistResult.status !== 'passed') {
      process.exitCode = webDistResult.exitCode ?? 1;
      return;
    }
    const browserTest: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser-smoke/buildr-web-browser.test.ts');
    const isolationRunner: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/development/run-isolated-workspace-smoke.ts');
    const result: any = await runPhase('browser', [process.execPath, isolationRunner, '--script', browserTest, '--', plan.selectors.join(',')], path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 360_000, { ...process.env, BUILDR_BROWSER_SELECTOR_PLAN_JSON: JSON.stringify(plan), BUILDR_BROWSER_WEB_DIST_ROOT: stagingRoot });
    if (result.status !== 'passed') process.exitCode = result.exitCode ?? 1;
  } finally {
    fs.rmSync(stagingParent, { recursive: true, force: true });
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error: any) => {
    process.stderr.write(`${error.code || 'browser_selector_dispatch_failed'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
