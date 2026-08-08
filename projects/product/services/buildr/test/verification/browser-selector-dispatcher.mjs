#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { collectChangedProductPaths } from './changed-paths.mjs';

export const BROWSER_SELECTORS = Object.freeze(['core', 'shell', 'project', 'service', 'change', 'task', 'articles']);

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
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
  const plan = { mode: 'affected', paths, selectors: [], reasons: [], diagnostics: [] };
  for (const value of paths) {
    if (value.startsWith('test/browser-smoke/')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: value, selector: 'all', reason: 'Browser Smoke implementation changed; run the explicit complete selector set.' });
      continue;
    }
    if (value === 'verification.yml' || value === 'projects/product/verification.yml' || value === 'test/verification/registry.mjs' || value.startsWith('test/verification/browser-')) {
      plan.mode = 'full';
      plan.selectors = ['all'];
      plan.reasons.push({ path: value, selector: 'all', reason: 'Browser verification selection mechanism changed; run the complete selector set.' });
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/http/')) {
      plan.reasons.push({ path: value, selector: null, reason: 'HTTP/API owner; verify through the Local App HTTP/System owner without starting Chrome.' });
      continue;
    }
    if (value.startsWith('services/buildr-web/src/') || value.startsWith('src/interfaces/local-app/web-dist/')) {
      if (/\/(?:pages\/)?(?:[Pp]roject|[Pp]rojects)/.test(value) || value.includes('/pages/Project')) add(plan, 'project', value, 'Project page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Ss]ervice|[Ss]ervices)/.test(value) || value.includes('/pages/Service')) add(plan, 'service', value, 'Service page or interaction changed.');
      else if (/\/(?:pages\/)?(?:[Cc]hange|[Cc]hanges)|TaskChange/.test(value) || value.includes('/pages/TaskChange') || value.includes('AgentAction')) add(plan, 'change', value, 'Change page or Agent Action interaction changed.');
      else if (/\/(?:pages\/)?(?:[Tt]ask|[Tt]asks)|task-detail/.test(value) || value.includes('/pages/Task') || value.includes('/pages/task-detail')) add(plan, 'task', value, 'Task page, tab or lifecycle interaction changed.');
      else if (value.includes('/pages/Article') || value.includes('/pages/Articles') || value.includes('/articles')) add(plan, 'articles', value, 'Articles page or publication interaction changed.');
      else if (value.endsWith('/main.tsx') || value.endsWith('/App.tsx') || value.endsWith('/AppLayout.tsx') || value.endsWith('/index.html') || value.includes('/web-dist/')) {
        add(plan, 'shell', value, 'Global app bootstrap or router changed.');
        add(plan, 'core', value, 'Shared routing changed; run the representative Task route smoke.');
      } else add(plan, 'core', value, 'Unclassified Local App Web path uses the core smoke fallback.');
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/runtime/')) {
      add(plan, 'shell', value, 'Local App bootstrap/runtime changed.');
      add(plan, 'core', value, 'Local App runtime change requires the representative route smoke.');
      continue;
    }
    if (value.startsWith('src/interfaces/local-app/')) add(plan, 'core', value, 'Unclassified Local App path uses the core smoke fallback.');
  }
  if (plan.mode === 'full') plan.selectors = ['all'];
  return plan;
}

function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const run = args.includes('--run');
  let plan;
  try {
    plan = full
      ? { mode: 'full', paths: [], selectors: ['all'], reasons: [{ path: null, selector: 'all', reason: 'Explicit full Browser Smoke.' }], diagnostics: [] }
      : selectBrowserSelectors(parseChangedPaths());
  } catch (error) {
    process.stderr.write(`${error.code || 'browser_selector_dispatch_failed'}: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.browser-selector-plan/v1', ...plan }, null, 2)}\n`);
  if (!run || plan.selectors.length === 0) return;
  const browserTest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser-smoke/local-app-browser.test.mjs');
  const result = spawnSync(process.execPath, [browserTest, plan.selectors.join(',')], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    stdio: 'inherit',
    env: { ...process.env, BUILDR_BROWSER_SELECTOR_PLAN_JSON: JSON.stringify(plan) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
