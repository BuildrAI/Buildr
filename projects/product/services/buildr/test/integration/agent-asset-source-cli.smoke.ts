import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { buildSkillProjectionReceipt, renderSkillProjectionReceipt } from '../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
import { SOURCE_OBSERVATIONS_SCHEMA, SOURCE_RESULT_SCHEMA, type SourceResult } from '../../src/modules/agent-assets/application/source-observations.ts';

const root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
assert.ok(root && process.env.BUILDR_APP_DATA_DIR && process.env.BUILDR_PRODUCT_DATA_DIR, 'must run through isolated workspace smoke wrapper');
const cli = path.resolve('bin/buildr.mjs');
const digest = (body: string) => `sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('hex')}`;
function run(args: string[], input?: string) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: process.cwd(), env: process.env, encoding: 'utf8', input, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '', 'successful source stdout has no hidden error');
  return result.stdout;
}
function write(relative: string, content: string) {
  const file = path.join(root!, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
}
function snapshot(directory: string) {
  const files: Record<string, { digest: string; size: number; mtimeMs: number }> = {};
  function visit(current: string, relative = '') {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name); const member = relative ? `${relative}/${entry.name}` : entry.name;
      assert.equal(entry.isSymbolicLink(), false, 'owned smoke snapshot never follows aliases');
      if (entry.isDirectory()) visit(file, member);
      else { const stat = fs.statSync(file); assert.ok(stat.isFile()); files[member] = { digest: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), size: stat.size, mtimeMs: stat.mtimeMs }; }
    }
  }
  visit(directory); return files;
}
run(['init', '--source-only', '--target', root, '--name', 'source-smoke', '--description', 'passive source reader', '--profile', 'personal']);

if (process.argv.includes('--project-reader-only')) {
  const workspaceId = YAML.parse(fs.readFileSync(path.join(root, 'skills/manifest.yml'), 'utf8')).workspaceId;
  const project = { id: crypto.randomUUID(), workspaceId, code: 'product', name: 'Product fixture', description: 'registered viewing context', source: { type: 'workspace', path: 'projects/product' } };
  write('projects/manifest.yml', YAML.stringify({ schemaVersion: 'buildr.projects/v2', projects: { product: project } }));
  const input = { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, scope: 'projects/product', observations: [{ id: 'view-context-core', type: 'file', locator: { path: 'AGENTS.md' } }] };
  const beforeValid = { workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
  const valid: SourceResult = JSON.parse(run(['agent-assets', 'source', 'inspect', '--target', root, '--input', '-', '--json'], JSON.stringify(input)));
  assert.equal(valid.workspace.scope, 'projects/product'); assert.equal(valid.items[0].status, 'detected'); assert.equal(valid.items[0].objects[0].scope, '.'); assert.deepEqual(valid.effects, []);
  assert.deepEqual({ workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, beforeValid);
  write('projects/manifest.yml', YAML.stringify({ schemaVersion: 'buildr.projects/v2', projects: { product: project } }) + `# ${'x'.repeat(512 * 1024 + 1)}\n`);
  const beforeFailure = { workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
  const failed = spawnSync(process.execPath, [cli, 'agent-assets', 'source', 'inspect', '--target', root, '--input', '-', '--json'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', input: JSON.stringify(input), timeout: 15000 });
  assert.notEqual(failed.status, 0); assert.ok((failed.stdout + failed.stderr).includes('来源文件无法在授权根内确认'));
  assert.ok(!(failed.stdout + failed.stderr).includes('x'.repeat(30)), 'oversized metadata never leaks to the source response');
  const unaffected: SourceResult = JSON.parse(run(['agent-assets', 'source', 'inspect', '--target', root, '--input', '-', '--json'], JSON.stringify({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: input.observations })));
  assert.equal(unaffected.items[0].status, 'detected'); assert.deepEqual(unaffected.effects, []);
  assert.deepEqual({ workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, beforeFailure);
  console.log(JSON.stringify({ schemaVersion: 'buildr.source-cli-smoke/v1', status: 'passed', checks: ['registered-viewing-context-supported', 'scope-not-source-authority', 'project-registry-bounded-kernel-proof', 'oversized-view-rejected-no-body-leak', 'root-scope-core-remains-detected', 'workspace-profile-and-mtime-unchanged'], effects: [] }));
  process.exit(0);
}

if (process.argv.includes('--rules-reader-only')) {
  write('rules/manifest.yml', `schemaVersion: buildr.rules/v1\nrules: []\n# ${'x'.repeat(512 * 1024 + 1)}\n`);
  const before = { workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
  const observed = JSON.parse(run(['agent-assets', 'source', 'inspect', '--target', root, '--input', '-', '--json'], JSON.stringify({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [{ id: 'oversized-rule-manifest', type: 'file', locator: { path: 'rules/probe.md' } }, { id: 'unrelated-core', type: 'file', locator: { path: 'AGENTS.md' } }] })));
  assert.deepEqual(observed.items.map((item: { status: string }) => item.status), ['error', 'detected']);
  assert.equal(observed.items[0].diagnostic.code, 'skill_content_unavailable');
  assert.equal(observed.items[0].diagnostic.message, '对象当前不可读取；未改变任何工作资产。');
  assert.ok(!JSON.stringify(observed).includes('x'.repeat(30)), 'no oversized body or parser detail leaks');
  assert.equal(observed.items[1].objects[0].providedBy, 'buildr');
  assert.deepEqual(observed.effects, []);
  assert.deepEqual({ workspace: snapshot(root), app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, before, 'passive manifest failure writes no source, registry or profile files');
  console.log(JSON.stringify({ schemaVersion: 'buildr.source-cli-smoke/v1', status: 'passed', checks: ['rules-manifest-bounded-before-YAML', 'oversized-rule-local-sanitized-error', 'unrelated-core-remains-detected', 'workspace-profile-and-mtime-unchanged'], effects: [] }));
  process.exit(0);
}

const help = run(['help', 'agent-assets', 'source', 'inspect']);
assert.match(help, /Usage: buildr agent-assets source inspect/);
assert.match(help, /buildr\.agent-asset-source-observations\/v1/);

// Explicit test fixture assets; the CLI must read real files and real serialized receipts.
const agentsBefore = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const agents = `${agentsBefore}\n工作空间自有后缀（非 Buildr 核心块）。\n`;
write('AGENTS.md', agents);
const manifestPath = path.join(root, 'skills/manifest.yml');
const manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
const workspaceId = manifest.workspaceId;
assert.equal(typeof workspaceId, 'string', 'initialized workspace has exact skills workspace identity');
const assetIdentity = 'fixture:skill:source-probe'; const sourceIdentity = 'workspace:fixture:source-probe';
manifest.skills.push({ id: 'source-probe', path: 'fixture/source-probe', source: 'workspace', assetIdentity, sourceIdentity, enabled: true, description: '隔离来源读取 fixture' });
write('skills/manifest.yml', YAML.stringify(manifest));
const body = '---\nname: source-probe\ndescription: isolated passive source proof\n---\n# 来源检查\n\n当前技能正文。\n';
write('skills/fixture/source-probe/SKILL.md', body);
write('.agents/skills/source-probe/SKILL.md', body);
write('.agents/skills/outsider/SKILL.md', body); // Same name and bytes alone are not ownership.
const receipt = buildSkillProjectionReceipt({ adapterId: 'agents-standard', destination: 'workspace', skillId: 'source-probe', runtimePath: 'source-probe', sources: ['.'], assetIdentity, sourceIdentity, sourceWorkspaceId: workspaceId, sourceDigest: digest(body), renderDigest: digest(body), files: [{ path: 'SKILL.md', integrity: digest(body), executable: false }] });
write('.buildr/agent-runtime/workspace/agents-standard/skill-projection-ownership-receipts/source-probe.json', renderSkillProjectionReceipt(receipt));
const serviceCwd = path.join(root, 'projects/product/services/example');
fs.mkdirSync(serviceCwd, { recursive: true });
const profileBefore = { app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
const workspaceBefore = snapshot(root);
const locator = { path: '.agents/skills/source-probe/SKILL.md', resourceBase: '.agents/skills/source-probe', provider: 'filesystem', adapterId: 'agents-standard' };
const observations = [
  { id: 'mixed-rule', type: 'file', locator: { path: 'AGENTS.md' }, observedContent: agents },
  { id: 'receipt-body', type: 'skill', locator, observedContent: body },
  { id: 'receipt-digest', type: 'skill', locator, observedDigest: digest(body) },
  { id: 'current-only', type: 'skill', locator },
  { id: 'historical-different', type: 'skill', locator, observedDigest: digest('old historical body') },
  { id: 'same-name-outsider', type: 'skill', locator: { path: '.agents/skills/outsider/SKILL.md' }, observedContent: body },
  { id: 'name-only', type: 'skill', locator: { provider: 'filesystem' } },
  { id: 'ordinary-product', type: 'file', locator: { path: 'ordinary-buildr-source.ts' } },
  { id: 'secret', type: 'file', locator: { path: '.env' } },
  { id: 'user-brief', type: 'task-brief', taskId: 'not-created', observedContent: 'PRIVATE USER BRIEF' },
  { id: 'user-material', type: 'task-material', taskId: 'not-created', materialId: 'not-created', observedContent: 'PRIVATE USER MATERIAL' },
];
const raw = run(['agent-assets', 'source', 'inspect', '--target', root, '--input', '-', '--json'], JSON.stringify({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations }));
const output: SourceResult = JSON.parse(raw);
assert.equal(output.schemaVersion, SOURCE_RESULT_SCHEMA);
assert.equal(output.workspace.id, workspaceId);
assert.deepEqual(output.items.map(item => item.status), ['detected', 'detected', 'detected', 'detected', 'conflict', 'unknown', 'unknown', 'unknown', 'error', 'unknown', 'unknown']);
assert.ok(output.items.slice(9).every(item => item.objects.length === 0 && item.diagnostic?.code === 'source_user_material_excluded'));
assert.equal(raw.includes('PRIVATE USER'), false);
const core = output.items[0]; assert.equal(core.mixed, true); assert.equal(core.objects[0].providedBy, 'buildr');
assert.equal(core.objects[0].selector.managedBlock, 'buildr:required');
assert.ok(!core.objects[0].current!.content.includes('工作空间自有后缀'));
assert.equal(output.items[1].objects[0].identity, assetIdentity);
assert.equal(output.items[1].objects[0].providedBy, 'workspace'); assert.equal(output.items[1].objects[0].managedBy, 'buildr');
assert.equal(output.items[1].objects[0].current?.digest, digest(body));
assert.equal(output.items[1].objects[0].historical, 'matched-current');
assert.equal(output.items[2].objects[0].historical, 'matched-current');
assert.equal(output.items[3].objects[0].historical, 'unknown');
assert.deepEqual(output.effects, []);
const fromService: SourceResult = JSON.parse(run(['agent-assets', 'source', 'inspect', '--target', serviceCwd, '--input', '-', '--json'], JSON.stringify({ schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [{ id: 'service-cwd', type: 'skill', locator: { path: path.join(fs.realpathSync(root), '.agents/skills/source-probe/SKILL.md'), resourceBase: path.join(fs.realpathSync(root), '.agents/skills/source-probe'), adapterId: 'agents-standard' }, observedDigest: digest(body) }] })));
assert.equal(fromService.workspace.id, output.workspace.id);
assert.equal(fromService.items[0].status, 'detected', JSON.stringify(fromService.items[0].diagnostic));
assert.equal(fromService.items[0].objects[0].identity, output.items[1].objects[0].identity);
assert.equal(fromService.items[0].objects[0].current?.digest, output.items[1].objects[0].current?.digest);
assert.deepEqual(fromService.effects, []);

assert.ok(!raw.includes('sessionId') && !raw.includes('rawseq'), 'Buildr source inspection does not invent session producers');
assert.deepEqual(snapshot(root), workspaceBefore, 'all workspace files and mtimes remain unchanged');
assert.deepEqual({ app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, profileBefore, 'no registry/touch/profile writes');
console.log(JSON.stringify({ schemaVersion: 'buildr.source-cli-smoke/v1', status: 'passed', inputSchema: SOURCE_OBSERVATIONS_SCHEMA, outputSchema: SOURCE_RESULT_SCHEMA, cases: output.items.map(item => ({ id: item.id, status: item.status })), checks: ['help-discovery', 'bounded-stdin-json', 'mixed-managed-block', 'real-receipt-body-and-full-file-digest', 'current-vs-history', 'same-name-and-name-only-unknown', 'user-brief-material-excluded-without-read', 'no-register-touch-source-profile-write', 'no-session-producer-or-server', 'service-cwd-public-nearest-workspace-with-absolute-locator'], effects: [] }));
