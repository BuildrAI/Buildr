#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createExactNodeExecutionEnvironment, spawnCommandSync } from '../../../src/infrastructure/process.ts';
import { stopOwnedChildProcess } from '../support/owned-process.ts';

/** This independent diagnostic never produces Candidate evidence, runs source
 * checks, initializes a workspace, or prepares SDKs. One install, one Web. */
export function packageSmokePlan(): string[] {
  return ['original-bytes', 'install', 'cli-help', 'cli-identity', 'web-health', 'owned-process-cleanup'];
}

export function assertPackageSmokeHealth(health: any, expected: any): void {
  assert.equal(health?.schemaVersion, 'buildr.local-app-health/v1');
  assert.equal(health.status, 'ready');
  assert.equal(health.pid, expected.pid);
  assert.equal(health.productIdentity?.channel, 'npm');
  assert.equal(health.productIdentity?.applicationPayloadDigest, expected.payloadDigest);
  assert.equal(health.productIdentity?.installationIdentity, expected.installationIdentity);
  assert.equal(health.productIdentity?.runtime?.role, 'host');
  assert.equal(health.productIdentity?.runtime?.version, '24.15.0');
}

export async function runPackageSmoke(options: { artifactDirectory: string; output: string }): Promise<any> {
  assert.equal(process.versions.node, '24.15.0', 'Package smoke requires the actual minimum Node, not a version label');
  assert.ok(process.env.BUILDR_SMOKE_ROOT && process.env.BUILDR_SMOKE_WORKSPACE_ROOT, 'Use the isolated workspace runner');
  const root = path.join(process.env.BUILDR_SMOKE_ROOT, 'package-smoke');
  const workspace = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
  const appData = path.join(root, 'app-data'), prefix = path.join(root, 'prefix');
  const exact = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true, minimumVersion: '24.15.0' });
  const env = { ...exact.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData,
    npm_config_cache: path.join(root, 'npm-cache'), NPM_CONFIG_CACHE: path.join(root, 'npm-cache'), npm_config_update_notifier: 'false', BUILDR_LOCAL_APP_NO_OPEN: '1' };
  const phases: any[] = [];
  const report: any = { schemaVersion: 'buildr.package-smoke/v1', qualification: 'diagnostic-only',
    platform: process.platform, node: process.versions.node, verificationSource: process.env.GITHUB_SHA ?? null, status: 'failed', phases };
  let web: ReturnType<typeof spawn> | undefined;
  let stdout = '', stderr = '', current = '';
  const phase = async (id: string, operation: () => any) => {
    current = id;
    const start = Date.now();
    process.stdout.write(`[package-smoke] ${id} started\n`);
    try {
      const result = await operation();
      phases.push({ id, status: 'passed', durationMs: Date.now() - start });
      process.stdout.write(`[package-smoke] ${id} passed (${Date.now() - start}ms)\n`);
      return result;
    } catch (error) {
      phases.push({ id, status: 'failed', durationMs: Date.now() - start });
      throw error;
    }
  };
  const run = (command: string, args: string[], timeout: number) => {
    const result = spawnCommandSync(command, args, { cwd: workspace, env, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 });
    assert.ok(!result.error && result.status === 0, `${current}: ${result.error?.message || result.status}\n${result.stdout || ''}\n${result.stderr || ''}`);
    return String(result.stdout);
  };
  try {
    fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(root, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(options.artifactDirectory, 'release-artifact.json'), 'utf8'));
    const tarball = await phase('original-bytes', () => {
      assert.match(manifest.filename, /^[A-Za-z0-9._-]+\.tgz$/u);
      const file = path.join(options.artifactDirectory, manifest.filename);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.length, manifest.size);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
      report.artifactSha256 = manifest.sha256;
      report.sourceCommit = manifest.sourceCommit;
      return file;
    });
    await phase('install', () => run(exact.npmExecutable, ['install', '--offline', '--global', '--prefix', prefix, tarball], 180_000));
    const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const entry = path.join(modules, '@buildr-ai/buildr/bin/buildr.mjs');
    await phase('cli-help', () => assert.match(run(exact.nodeExecutable, [entry, '--help'], 30_000), /Buildr/u));
    const identity = await phase('cli-identity', () => {
      const value = JSON.parse(run(exact.nodeExecutable, [entry, 'version', '--json'], 30_000));
      assert.equal(value.channel, 'npm');
      assert.equal(value.applicationPayloadDigest, manifest.applicationPayloadDigest);
      assert.equal(value.runtime?.role, 'host');
      assert.equal(value.runtime?.version, '24.15.0');
      return value;
    });
    await phase('web-health', async () => {
      web = spawn(exact.nodeExecutable, [entry, 'web', '--no-open', '--port', '0'], {
        cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      let spawnError: Error | undefined;
      web.on('error', error => { spawnError = error; });
      web.stdout!.on('data', chunk => { stdout = (stdout + chunk).slice(-16384); });
      web.stderr!.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        assert.equal(web.exitCode, null, `Web exited before readiness: ${web.exitCode}`);
        assert.equal(web.signalCode, null, `Web signalled before readiness: ${web.signalCode}`);
        let instance: any;
        try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
        if (instance?.pid === web.pid && typeof instance.secret === 'string') {
          const url = new URL(instance.url);
          assert.equal(url.protocol, 'http:');
          assert.equal(url.hostname, '127.0.0.1');
          let response: Response | undefined;
          try { response = await fetch(`${url.origin}/api/v1/health`, {
            headers: { 'x-buildr-instance': instance.secret }, signal: AbortSignal.timeout(2000),
          }); } catch {}
          if (response?.ok) {
            assertPackageSmokeHealth(await response.json(), { pid: web.pid, payloadDigest: manifest.applicationPayloadDigest,
              installationIdentity: identity.installationIdentity });
            return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Web did not become healthy within 45000ms; see the exact startup output, not an inferred package pass.');
    });
    report.status = 'passed';
  } catch (error: any) {
    report.failure = { phase: current, message: error.message, stdout, stderr };
    process.stderr.write(`[package-smoke] ${current}: ${error.message}\n${stderr}\n${stdout}\n`);
  } finally {
    try { await phase('owned-process-cleanup', () => stopOwnedChildProcess(web, 5_000)); }
    catch (error: any) { report.status = 'failed'; report.cleanupError = error.message; }
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--artifact-dir' || args[2] !== '--output') throw new Error('Usage: package-smoke.ts --artifact-dir <original> --output <report>');
  const result = await runPackageSmoke({ artifactDirectory: path.resolve(args[1]!), output: path.resolve(args[3]!) });
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
