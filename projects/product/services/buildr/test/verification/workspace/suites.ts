import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { verificationSteps } from '../registry.ts';

const directory: any = path.dirname(fileURLToPath(import.meta.url));

export const workspaceSuites: any = Object.freeze(verificationSteps
  .filter((step: any) => step.executor.type === 'workspace-suite')
  .map((step: any) => Object.freeze({
    id: step.executor.selector,
    name: step.name,
    file: path.join(directory, `${step.executor.selector}.ts`),
    budgetMs: step.budgetMs,
  })));

export function selectWorkspaceSuites(selectors: any = []): any  {
  if (selectors.length === 0) return [...workspaceSuites];
  const byId: any = new Map(workspaceSuites.map((suite: any) => [suite.id, suite]));
  const selected: any[] = [];
  const seen: any = new Set();
  for (const selector of selectors) {
    const suite: any = byId.get(selector);
    if (!suite) throw new Error(`Unknown Workspace E2E suite: ${selector}`);
    if (!seen.has(selector)) selected.push(suite);
    seen.add(selector);
  }
  return selected;
}

export function workspaceSuiteSteps(options: any = {}): any  {
  const productRoot: any = options.productRoot ?? path.resolve(directory, '../../..');
  const env: any = options.env ?? process.env;
  return workspaceSuites.map((suite: any) => ({
    name: suite.name,
    command: process.execPath,
    args: [suite.file],
    cwd: productRoot,
    env,
    budgetMs: suite.budgetMs,
  }));
}
