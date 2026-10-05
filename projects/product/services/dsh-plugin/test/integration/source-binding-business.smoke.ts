/** Real producer capture through a source-only candidate and stdin under the official isolated runner.
 * Original event windows and public installation status are fixtures. No open/launcher/profile activation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveSourceBinding } from '../../plugin/source-binding.ts';
import { sourceRecord } from '../../plugin/source-gateway.ts';
import { createEventSourceCapture } from '../../plugin/source-capture.ts';
import { fileDigest } from '../../plugin/process.ts';
import type { Config } from '../../plugin/src/types.ts';
import type { SourceProcessDependencies } from '../../plugin/source-process.ts';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../buildr');
const cli = path.join(serviceRoot, 'bin/buildr.mjs');
const wrapper = path.resolve(serviceRoot, '../../buildr');
const workspaceEntry = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
const app = process.env.BUILDR_APP_DATA_DIR;
const product = process.env.BUILDR_PRODUCT_DATA_DIR;
const runnerRoot = process.env.BUILDR_SMOKE_ROOT;
assert.ok(workspaceEntry && app && product && runnerRoot);
assert.ok(fs.statSync(path.join(runnerRoot, '.buildr-smoke-owner')).isFile());
for (const directory of [workspaceEntry, app, product]) assert.ok(path.relative(runnerRoot, directory) && !path.relative(runnerRoot, directory).startsWith('..'));
const setup = spawnSync(process.execPath, [cli, 'init', '--source-only', '--target', workspaceEntry, '--name', 'source-binding-integration', '--description', 'isolated source-only candidate', '--profile', 'personal'], { env: process.env, encoding: 'utf8', timeout: 15_000 });
assert.equal(setup.status, 0, setup.stderr);
const workspace = fs.realpathSync(workspaceEntry);
const hash = (data: Uint8Array) => crypto.createHash('sha256').update(data).digest('hex');
function snapshot(root: string) {
  const result: Record<string, { digest: string; size: number; mtimeMs: number }> = {};
  const visit = (directory: string, prefix = '') => {
    if (!fs.existsSync(directory)) return;
    for (const member of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.equal(member.isSymbolicLink(), false);
      const target = path.join(directory, member.name); const relative = prefix ? prefix + '/' + member.name : member.name;
      if (member.isDirectory()) visit(target, relative);
      else { const info = fs.statSync(target); result[relative] = { digest: hash(fs.readFileSync(target)), size: info.size, mtimeMs: info.mtimeMs }; }
    }
  }; visit(root); return result;
}
const before = { workspace: snapshot(workspace), app: snapshot(app), product: snapshot(product) };
const installed = { nodeExecutable: '/existing/open/node', cliEntry: '/existing/open/buildr.mjs' };
const candidate = { nodeExecutable: process.execPath, cliEntry: cli, nodeSha256: await fileDigest(process.execPath), cliSha256: await fileDigest(cli) };
const config: Config = { binding: installed, sourceBinding: candidate };
let sourceQueries = 0, statusQueries = 0;
const processDependencies: SourceProcessDependencies = {
    environment: process.env, timeoutMs: 20_000,
    exec: async (file, args) => {
      assert.equal(file, process.execPath); assert.deepEqual(args, [cli, 'installation', 'status', '--json']);
      statusQueries++;
      return { stdout: JSON.stringify({ schemaVersion: 'buildr.installation-status/v1', channels: { development: { status: 'current', identity: { ownershipIdentity: 'fixture-source-candidate', version: 'fixture', protocolIdentity: 'fixture-v1', sourceRoot: serviceRoot }, runtime: { executable: process.execPath } } }, instances: { development: { status: 'absent' } } }) };
    },
    runInput: (file, args, options, input) => {
      sourceQueries++; assert.equal(file, wrapper);
      assert.deepEqual(args, ['agent-assets', 'source', 'inspect', '--target', workspace, '--input', '-', '--json']);
      assert.equal(options.env?.BUILDR_NODE, process.execPath); assert.equal(options.env?.BUILDR_APP_DATA_DIR, undefined);
      return new Promise((resolve, reject) => {
        const child = execFile(file, args, { ...options, env: { ...options.env, BUILDR_APP_DATA_DIR: app, BUILDR_PRODUCT_DATA_DIR: product, BUILDR_LOCAL_APP_NO_OPEN: '1' } }, (error, stdout, stderr) => {
          if (error) reject(error); else { assert.equal(stderr, ''); resolve({ stdout, stderr }); }
        });
        assert.ok(child.stdin); child.stdin.on('error', reject); child.stdin.end(input, 'utf8');
      });
    },
};
const captureDependencies = { channel: 'development' as const, processDependencies,
  resolveBinding: () => resolveSourceBinding(config, 'development', () => assert.fail('explicit source candidate fell back to discovery')) };
const capture = createEventSourceCapture(captureDependencies);
const originalPath = path.join(workspace, 'AGENTS.md'), originalText = fs.readFileSync(originalPath, 'utf8'), rawDigest = hash(Buffer.from(originalText));
const ruleHint = { kind: 'rule', action: 'read', name: 'AGENTS.md', locator: { path: originalPath }, rawDigest: { algorithm: 'sha256', digest: rawDigest },
  renderedContent: originalText, contentRefs: [{ block: 0, start: 0, end: originalText.length, unit: 'utf16' }], completeness: 'complete' };
const frame = (hint: unknown) => ({ hint, agent: { session: { header: { cwd: workspace } } }, signal: new AbortController().signal }) as Parameters<typeof capture>[0];
const ruleSource = await capture(frame(ruleHint));
assert.equal(ruleSource.status, 'confirmed'); assert.equal(ruleSource.matches[0].providedBy, 'buildr');
assert.deepEqual(ruleSource.matches[0].observedVersion, { algorithm: 'sha256', digest: rawDigest, target: 'file' });
assert.equal(ruleSource.matches[0].completeness, 'complete'); assert.equal(sourceQueries, 1);
const actual = spawnSync(wrapper, ['version', '--json'], { cwd: workspace, env: { ...process.env, BUILDR_NODE: process.execPath }, encoding: 'utf8', timeout: 15_000 });
assert.equal(actual.status, 0, actual.stderr); JSON.parse(actual.stdout);
const commandSource = await capture(frame({ kind: 'command', action: 'call', name: 'bash', command: { text: JSON.stringify(wrapper) + ' version --json', cwd: workspace }, completeness: 'none' }));
assert.equal(commandSource.status, 'confirmed'); assert.equal(commandSource.matches[0].kind, 'capability');
assert.deepEqual(commandSource.matches[0].observedVersion, { algorithm: 'sha256', digest: (await fileDigest(wrapper)).slice(7), target: 'entry' });
assert.equal(commandSource.matches[0].locator?.entry, wrapper); assert.equal(commandSource.matches[0].completeness, 'none');
assert.equal(statusQueries, 2, 'rule and command provenance are checked at their own producer boundary');
const drift = createEventSourceCapture({ ...captureDependencies, resolveBinding: () => resolveSourceBinding({ ...config, sourceBinding: { ...candidate, cliSha256: 'sha256-' + '0'.repeat(64) } }, 'development') });
assert.equal((await drift(frame(ruleHint))).status, 'unknown', 'actual digest drift cannot invoke the candidate or fall back');
const wrongChannel = createEventSourceCapture({ ...captureDependencies, channel: 'npm', resolveBinding: () => resolveSourceBinding(config, 'npm') });
assert.equal((await wrongChannel(frame(ruleHint))).status, 'unknown', 'development sourceBinding cannot cross into npm');
assert.equal(sourceQueries, 1); assert.equal(statusQueries, 2);
const originals = [
  { seq: 42, type: 'tool/result', data: { eventSources: ruleSource, message: { toolCallId: 'rule-call', isError: false, content: [{ type: 'text', text: originalText }] } } },
  { seq: 43, type: 'tool/result', data: { eventSources: { ...commandSource, execution: { outcome: 'succeeded', exitCode: actual.status } }, message: { toolCallId: 'command-call', isError: false, content: [{ type: 'text', text: actual.stdout }] } } },
];
const originalFile = path.join(runnerRoot, 'source-binding-original-events.json');
fs.writeFileSync(originalFile, JSON.stringify(originals));
const savedOriginals = JSON.parse(fs.readFileSync(originalFile, 'utf8'));
const results = [];
for (const [index, callId] of ['rule-call', 'command-call'].entries()) {
  const result = await sourceRecord({ sessionId: 'source-binding-session', record: { recordId: 'source-binding-record-' + index, kind: 'tool', transient: false, callId, eventRefs: [{ sessionId: 'source-binding-session', seq: 42 + index }] } }, {
    readEvents: async request => { assert.deepEqual(request, { sessionId: 'source-binding-session', seqs: [42 + index] }); return { session: { id: request.sessionId }, events: [savedOriginals[index]] }; },
  });
  assert.equal(result.ready, true); if (!result.ready) throw new Error(result.code);
  assert.equal(result.result.schemaVersion, 'buildr.dsh-event-source-result/v1'); assert.equal(result.marker?.basis, 'recorded-source');
  assert.equal(result.result.items[0].objects[0].historical, 'recorded'); assert.equal(result.result.items[0].objects[0].current, null); assert.deepEqual(result.result.effects, []); results.push(result);
}
assert.ok(results[0].result.items[0].objects[0].observed.content?.startsWith('<!-- buildr:required begin -->'));
assert.ok(results[0].result.items[0].objects[0].observed.content?.endsWith('<!-- buildr:required end -->'));
assert.equal(results[1].result.items[0].objects[0].observed.content, undefined); assert.equal(results[1].participation?.[0].outcome, 'succeeded');
const dtoFile = path.join(runnerRoot, 'source-binding-recorded-dtos.json'); fs.writeFileSync(dtoFile, JSON.stringify(results)); assert.deepEqual(JSON.parse(fs.readFileSync(dtoFile, 'utf8')), results);
assert.equal(sourceQueries, 1, 'viewer must run zero current-source CLI queries'); assert.equal(statusQueries, 2, 'viewer must not resolve the current installation');
assert.equal(config.binding, installed); assert.equal(config.sourceBinding, candidate);
assert.deepEqual({ workspace: snapshot(workspace), app: snapshot(app), product: snapshot(product) }, before);
console.log(JSON.stringify({ schemaVersion: 'buildr.plugin-source-binding-smoke/v1', status: 'passed', queries: 1, viewerQueries: 0, effects: [], checks: ['producer-explicit-dev-source-pointer-and-real-file-digests', 'actual-raw-file-version', 'development-wrapper-real-stdin-metadata-query', 'bound-command-entry-digest-and-actual-exit', 'source-binding-drift-and-channel-rejected', 'original-events-and-recorded-dtos-saved-roundtrip', 'viewer-zero-cli-and-original-method-fragment', 'installed-open-pointer-unchanged', 'no-discovery-fallback-or-web-start', 'workspace-app-product-snapshot-unchanged'], simulated: ['exact-session-window-not-native-persistence', 'current-development-installation-status'], isolation: 'official-runner-owned-process-adapter' }));
