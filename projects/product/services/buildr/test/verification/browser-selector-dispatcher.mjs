#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { spawnSync } from 'node:child_process';

import { collectChangedProductPaths } from './changed-paths.mjs';

export const BROWSER_SELECTORS = Object.freeze(['core', 'shell', 'project', 'service', 'change', 'task', 'articles']);

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function buildrRelative(value) {
  const normalized = normalize(value);
  return normalized.startsWith('services/buildr/') ? normalized.slice('services/buildr/'.length) : normalized;
}

function isBrowserOwnedPath(value) {
  const normalized = normalize(value);
  const relative = buildrRelative(normalized);
  return normalized.startsWith('services/buildr-web/')
    || relative.startsWith('src/interfaces/local-app/web-dist/')
    || relative.startsWith('src/interfaces/local-app/runtime/')
    || relative.startsWith('test/browser-smoke/')
    || relative === 'test/verification/browser-selector-dispatcher.mjs'
    || relative === 'test/verification/web-dist.mjs';
}

export function parseChangedPaths(raw = process.env.BUILDR_CHANGED_PATHS_JSON) {
  if (!raw) {
    try {
      return collectChangedProductPaths({
        productRoot,
        projectRoot,
        base: process.env.BUILDR_VERIFICATION_BASE || null,
      }).paths;
    } catch (error) {
      const diagnostic = new Error(`Browser changed dispatcher 无法解析 changed paths：${error.message}；请提供 BUILDR_CHANGED_PATHS_JSON 或 BUILDR_VERIFICATION_BASE。`);
      diagnostic.code = 'browser_changed_paths_unresolvable';
      throw diagnostic;
    }
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) {
    const diagnostic = new Error(`BUILDR_CHANGED_PATHS_JSON 不是合法 JSON：${error.message}`);
    diagnostic.code = 'browser_changed_paths_invalid';
    throw diagnostic;
  }
  const paths = Array.isArray(parsed) ? parsed : parsed?.paths;
  if (!Array.isArray(paths) || paths.some((item) => typeof item !== 'string' || !item.trim())) {
    const error = new Error('BUILDR_CHANGED_PATHS_JSON 必须是字符串路径数组。');
    error.code = 'browser_changed_paths_invalid';
    throw error;
  }
  return paths.map(normalize);
}

function add(plan, selector, pathValue, reason) {
  if (!plan.selectors.includes(selector)) plan.selectors.push(selector);
  plan.reasons.push({ path: pathValue, selector, reason });
}

export function selectBrowserSelectors(changedPaths) {
  const paths = [...new Set((changedPaths || []).map(normalize))];
  const plan = { status: 'not-applicable', mode: 'affected', paths, selectors: [], reasons: [], diagnostics: [] };
  for (const originalValue of paths) {
    const value = buildrRelative(originalValue);
    if (value.startsWith('test/browser-smoke/')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Browser Smoke implementation changed; run the explicit complete selector set.' });
      continue;
    }
    if (value === 'verification.yml' || originalValue === 'projects/product/verification.yml' || value === 'test/verification/registry.mjs' || value.startsWith('test/verification/browser-') || value === 'test/verification/web-dist.mjs') {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Browser verification selection mechanism changed; run the complete selector set.' });
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/http/')) {
      plan.reasons.push({ path: originalValue, selector: null, reason: 'HTTP/API owner; verify through the Buildr Web Runtime/System owner without starting Chrome.' });
      continue;
    }
    if (originalValue.startsWith('services/buildr-web/') && !originalValue.startsWith('services/buildr-web/src/')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: originalValue, selector: 'all', reason: 'Buildr Web package or build configuration changed; run the complete selector set.' });
      continue;
    }
    if (originalValue.startsWith('services/buildr-web/src/') || value.startsWith('src/interfaces/local-app/web-dist/')) {
      if (/\/(?:pages\/)?(?:[Pp]roject|[Pp]rojects)/.test(originalValue) || originalValue.includes('/pages/Project')) add(plan, 'project', originalValue, 'Project page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Ss]ervice|[Ss]ervices)/.test(originalValue) || originalValue.includes('/pages/Service')) add(plan, 'service', originalValue, 'Service page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Cc]hange|[Cc]hanges)|TaskChange/.test(originalValue) || originalValue.includes('/pages/TaskChange') || originalValue.includes('AgentAction')) add(plan, 'change', originalValue, 'Change page or Agent Action interaction changed.');
      else if (/\/(?:pages\/)?(?:[Tt]ask|[Tt]asks)|task-detail/.test(originalValue) || originalValue.includes('/pages/Task') || originalValue.includes('/pages/task-detail')) add(plan, 'task', originalValue, 'Task page, tab or lifecycle interaction changed.');
      else if (originalValue.includes('/pages/Article') || originalValue.includes('/pages/Articles') || originalValue.includes('/articles')) add(plan, 'articles', originalValue, 'Articles page or publication interaction changed.');
      else if (value.endsWith('/main.tsx') || value.endsWith('/App.tsx') || value.endsWith('/AppLayout.tsx') || value.endsWith('/index.html') || value.includes('/web-dist/')) {
        add(plan, 'shell', originalValue, 'Global app bootstrap or router changed.');
        add(plan, 'core', originalValue, 'Shared routing changed; run the representative Task route smoke.');
      } else add(plan, 'core', originalValue, 'Unclassified Buildr Web path uses the core smoke fallback.');
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/runtime/')) {
      add(plan, 'shell', originalValue, 'Buildr Web bootstrap/runtime changed.');
      add(plan, 'core', originalValue, 'Buildr Web runtime change requires the representative route smoke.');
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/')) {
      add(plan, 'core', originalValue, 'Unclassified Buildr Web path uses the core smoke fallback.');
      continue;
    }
    plan.reasons.push({ path: originalValue, selector: null, reason: 'Path is outside the Browser capability applicability.' });
  }
  if (plan.mode === 'full') plan.selectors = ['all'];
  const ownedPaths = paths.filter(isBrowserOwnedPath);
  if (plan.selectors.length > 0) plan.status = 'selected';
  else if (ownedPaths.length > 0) {
    plan.status = 'blocked';
    plan.diagnostics.push({ code: 'browser_selector_coverage_gap', paths: ownedPaths });
  }
  return plan;
}

function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const run = args.includes('--run');
  let plan;
  try {
    plan = full
      ? { status: 'selected', mode: 'full', paths: [], selectors: ['all'], reasons: [{ path: null, selector: 'all', reason: 'Explicit full Browser Smoke.' }], diagnostics: [] }
      : selectBrowserSelectors(parseChangedPaths());
  } catch (error) {
    process.stderr.write(`${error.code || 'browser_selector_dispatch_failed'}: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  const payload = { schemaVersion: 'buildr.browser-selector-plan/v1', ...plan };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex === -1 ? process.env.BUILDR_BROWSER_PLAN_OUTPUT : args[outputIndex + 1];
  if (outputIndex !== -1 && (!outputPath || outputPath.startsWith('--'))) {
    process.stderr.write('browser_selector_output_missing: --output requires a file path.\n');
    process.exitCode = 2;
    return;
  }
  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (plan.status === 'blocked') {
    process.stderr.write(`browser_selector_coverage_gap: Browser-owned paths selected no Browser selector: ${plan.diagnostics[0].paths.join(', ')}\n`);
    process.exitCode = 2;
    return;
  }
  if (!run || plan.status === 'not-applicable') return;
  const webDistVerifier = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'web-dist.mjs');
  const webDistResult = spawnSync(process.execPath, [webDistVerifier], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    stdio: 'inherit',
    env: process.env,
  });
  if (webDistResult.error) throw webDistResult.error;
  if (webDistResult.status !== 0) {
    process.exitCode = webDistResult.status ?? 1;
    return;
  }
  const browserTest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser-smoke/local-app-browser.test.mjs');
  const result = spawnSync(process.execPath, [browserTest, plan.selectors.join(',')], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    stdio: 'inherit',
    env: { ...process.env, BUILDR_BROWSER_SELECTOR_PLAN_JSON: JSON.stringify(plan) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
