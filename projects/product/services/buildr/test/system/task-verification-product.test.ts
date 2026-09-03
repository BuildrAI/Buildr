import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..'); const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
after(() => cleanupLocalTaskLifecycleSystemContext());
function json(args: string[], expected = 0) { const result = spawnSync(process.execPath, [BUILDR, ...args, '--json'], { cwd: PRODUCT_ROOT, encoding: 'utf8' }); assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`); return JSON.parse(result.stdout); }
function fixture(t: any) { const { root } = copyTaskLifecycleWorkspace(t, 'task-verification-product-v4'); fs.writeFileSync(path.join(root, 'projects', 'demo', 'verification.yml'), YAML.stringify({ schemaVersion: 'buildr.project-verification/v4', testing: [{ id: 'demo-unit', title: 'Demo unit', scope: { project: 'demo', services: [] }, purpose: 'Validate demo', sourcePaths: ['src/**'], testRoots: ['test/**'], full: { kind: 'command', argv: ['node', '--test'], cwd: '.' }, requirements: [] }] })); (createRuntime() as any).createTaskRecord(root, { taskId: 'verification-task', title: 'Verification Task', intent: 'Record completion report', projects: ['demo'], services: [], changes: [] }); return root; }
test('Task Verification CLI records and inspects one meaningful completion report', (t: any) => { const root = fixture(t); const reportFile = path.join(root, 'report.json'); fs.writeFileSync(reportFile, JSON.stringify({ contentIdentity: 'git:tree-one', contentSummary: 'Demo content', checks: [{ id: 'demo-unit-full', project: 'demo', testing: 'demo-unit', selection: 'full', targets: ['complete unit suite'], source: 'command', outcome: 'passed', summary: 'All unit tests passed' }], gaps: [], conclusion: { outcome: 'passed', summary: 'Completion verification passed' } })); const recorded = json(['task', 'verification', 'record', 'verification-task', '--report', reportFile, '--expected-report', 'absent', '--target', root]); assert.equal(recorded.status, 'recorded'); assert.equal(recorded.slot.report.checks[0].testing, 'demo-unit'); const inspected = json(['task', 'verification', 'inspect', 'verification-task', '--content-identity', 'git:tree-one', '--target', root]); assert.equal(inspected.slot.applicability.status, 'current'); });
