import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer, type Server} from 'node:http';
import {waitForWebReadiness} from '../verification/release/package-consumption.ts';
import {stopOwnedChildProcess} from '../verification/support/owned-process.ts';
import {requestBuildrWebInstanceShutdown, waitForBuildrWebInstanceExit} from '../../src/web/infrastructure/instance-runtime.ts';

// Run only through the product's isolated Workspace runner. These are the actual
// supplied tarballs, not source imports or a fixture pretending to be a product.
const root = process.env.BUILDR_SMOKE_ROOT;
const harnessArtifact = process.env.BUILDR_HARNESS_ARTIFACT;
const developmentArtifact = process.env.BUILDR_DEVELOPMENT_ARTIFACT;
const nativeLaunchers = process.argv.includes('--platform-launchers');
const activeUninstall = process.argv.includes('--active-uninstall');
const execute = promisify(execFile);
if (!root || !harnessArtifact || !developmentArtifact) throw new Error('harness_product_artifacts_and_isolation_required');
const run = (file: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) => {
  const result = spawnSync(file, args, {env, cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024});
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + '\n' + result.stderr);
  return result.stdout;
};

for (const order of ['harness-first', 'development-first'] as const) {
  const directory = path.join(root, order), prefix = path.join(directory, 'installed');
  const dataRoot = path.join(directory, 'shared-data'), work = path.join(directory, 'work');
  fs.mkdirSync(work, {recursive: true});
  const env = {...process.env, BUILDR_APP_DATA_DIR: dataRoot, BUILDR_PRODUCT_DATA_DIR: path.join(directory, 'product-data')};
  const modules = path.join(prefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules');
  const harness = path.join(modules, '@buildr-ai/buildr-harness');
  const development = path.join(modules, '@buildr-ai/buildr');
  const harnessEntry = path.join(harness, 'bin/buildr-harness.mjs');
  const developmentEntry = path.join(development, 'bin/buildr.mjs');
  const artifacts = order === 'harness-first' ? [harnessArtifact, developmentArtifact] : [developmentArtifact, harnessArtifact];
  run('npm', ['install', '--global', '--offline', '--prefix', prefix, artifacts[0]!], env, work);
  const firstProduct = order === 'harness-first' ? harness : development;
  assert.equal(fs.existsSync(order === 'harness-first' ? development : harness), false, 'the first startup has only one product installed');
  const core = await import(pathToFileURL(path.join(firstProduct, ...(order==='harness-first'?['build/index.js']:['node_modules/@buildr-ai/buildr-harness/build/index.js']))).href);
  let web: ReturnType<typeof spawn> | undefined;
  let stderr = '';
  const startDevelopment = async () => {
    web = spawn(process.execPath, [developmentEntry, 'web', '--no-open', '--port', '0'], {cwd: work, env, stdio: ['ignore', 'ignore', 'pipe']});
    web.stderr?.on('data', value => {stderr = (stderr + value).slice(-16384);});
    const health = await waitForWebReadiness({appData: dataRoot, child: web, stderr: () => stderr, timeoutMs: 45000});
    assert.equal(health.productIdentity.channel, 'npm');
  };
  let client: any;
  let fixtureServer: Server | undefined;
  let fixtureAccountId: string | undefined;
  let fixtureAccountIdentity: string | undefined;
  let launcherWebPid: number | undefined;
  const stopLauncherWeb = async () => {
    const receiptPath = path.join(dataRoot, 'instance.json');
    if (!fs.existsSync(receiptPath)) return;
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (!receipt.launcherIdentity) return;
    assert.equal(receipt.launcherIdentity.target, path.join(directory, 'Applications/Buildr.app'));
    if (launcherWebPid) assert.equal(receipt.pid, launcherWebPid, 'cleanup cannot stop an unobserved replacement');
    await requestBuildrWebInstanceShutdown(receipt);
    assert.equal((await waitForBuildrWebInstanceExit(receipt, {attempts: 200, intervalMs: 50})).status, 'exited');
  };
  try {
    if (order === 'harness-first') run(process.execPath, [harnessEntry, 'web', '--no-open', '--data-root', dataRoot], env, work);
    else await startDevelopment();
    client = await core.connectHarnessProcess({dataRoot, profileId: 'released', sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
    const first = await client.lifecycle.identity();
    console.log(JSON.stringify({order, singleProductStartup: 'passed', onlyInstalledProduct: order === 'harness-first' ? 'harness' : 'development'}));
    if (order === 'development-first') assert.equal((await client.web.status()).enabled, false, 'Development alone does not enable the standalone page');
    run('npm', ['install', '--global', '--offline', '--prefix', prefix, artifacts[1]!], env, work);
    if (order === 'harness-first') await startDevelopment();
    else run(process.execPath, [harnessEntry, 'web', '--no-open', '--data-root', dataRoot], env, work);
    assert.equal((await client.lifecycle.identity()).generation, first.generation, 'ordinary second-product startup reuses the exact core');
    const directoryRef = await client.directories.register(work);
    const scope = core.executionScopeKey(directoryRef.ref);
    const conversation = await client.operations.conversations.create(scope, {title: 'Package coexistence acceptance'});
    assert.equal((await client.operations.conversations.read(scope, conversation.id)).id, conversation.id);
    let activeRunId: string | undefined;
    if (activeUninstall) {
      // Only the native program is a fixture. Both installed products, core,
      // configuration isolation, public operations and npm effects stay real.
      // This test must never contact a paid provider or inherit a live account.
      const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../../buildr-harness/test/integration/executors/fixtures/codex-cli.mjs'), 'utf8');
      // Seed only this test's managed-program collaborator. This does not
      // claim to verify an official program download or its install receipt.
      const executable = path.join(dataRoot, 'agent-service/programs/codex/uninstall-fixture/codex.mjs');
      fs.mkdirSync(path.dirname(executable), {recursive: true});
      fs.writeFileSync(executable, source);
      const connection = await client.operations.connections.read('codex');
      const preparing = await client.operations.connections.prepare('codex', {expectedRevision: connection.revision, executable});
      let prepared = preparing;
      const preparationDeadline = Date.now() + 15000;
      while (Date.now() < preparationDeadline && ['discovering', 'installing', 'connecting'].includes(prepared.state)) {
        await new Promise(resolve => setTimeout(resolve, 50));
        prepared = await client.operations.connections.preparation('codex', preparing.id);
      }
      assert.equal(prepared.state, 'ready', prepared.message);
      // A loopback-only model catalog keeps this fixture independent from
      // ChatGPT auth, quota and tokens; the native program never infers.
      fixtureServer = createServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        if (request.method === 'GET' && request.url === '/models') response.end(JSON.stringify({data: [{id: 'fixture-model'}]}));
        else {response.statusCode = 404; response.end('{}');}
      });
      await new Promise<void>(resolve => fixtureServer!.listen(0, '127.0.0.1', resolve));
      const address = fixtureServer.address();
      assert.ok(address && typeof address !== 'string');
      const added = await client.operations.models.accounts.add({provider: 'custom', custom: {
        label: 'Isolated package model fixture', baseUrl: 'http://127.0.0.1:' + address.port,
        protocol: 'responses', useApiKey: false, models: [{id: 'fixture-model'}],
      }});
      let account = await client.operations.models.accounts.check(added.id);
      assert.equal(account.status, 'ready');
      account = await client.operations.models.accounts.preferences(account.id, {expectedRevision: account.revision, models: [{id: 'fixture-model', enabled: true}]});
      fixtureAccountId = account.id;
      fixtureAccountIdentity = account.identity;
      const current = await client.operations.conversations.read(scope, conversation.id);
      const started = await client.operations.conversations.send(scope, conversation.id, {
        expectedRevision: current.revision, clientRequestId: randomUUID(), connectionId: 'codex',
        modelAccountId: account.id, modelAccountIdentity: account.identity, modelAccountRevision: account.revision,
        model: 'fixture-model', permissionMode: 'default', text: 'Package uninstall fixture: wait for the exact question reply.',
      });
      activeRunId = started.run.id;
      const deadline = Date.now() + 15000;
      let waiting = await client.operations.conversations.read(scope, conversation.id);
      while (Date.now() < deadline && waiting.run?.status !== 'waiting-question') {
        await new Promise(resolve => setTimeout(resolve, 50));
        waiting = await client.operations.conversations.read(scope, conversation.id);
      }
      assert.equal(waiting.run?.id, activeRunId);
      assert.equal(waiting.run?.status, 'waiting-question');
      assert.equal(waiting.requests.length, 1);
    }
    const assertActivePreserved = async (effect: string) => {
      if (!activeRunId) return;
      const current = await client.operations.conversations.read(scope, conversation.id);
      assert.equal((await client.lifecycle.identity()).generation, first.generation, effect + ': exact core generation');
      assert.equal(current.run?.id, activeRunId, effect + ': exact execution');
      assert.equal(current.run?.status, 'waiting-question', effect + ': native wait remains active');
      assert.equal(current.requests.length, 1, effect + ': question remains actionable');
    };
    if (nativeLaunchers && process.platform === 'darwin') {
      const applications = path.join(directory, 'Applications'), home = path.join(directory, 'launcher-home');
      const harnessApp = path.join(applications, 'Buildr Harness.app'), developmentApp = path.join(applications, 'Buildr.app');
      fs.mkdirSync(home, {recursive: true});
      run(process.execPath, [harnessEntry, 'launcher', 'install', '--target', harnessApp, '--data-root', dataRoot], env, work);
      run(process.execPath, [developmentEntry, 'web', 'launcher', 'install', '--target', developmentApp, '--port', '0', '--json'], env, work);
      const harnessLog = path.join(harnessApp, 'Contents/Resources/harness-launcher.log');
      const developmentLog = path.join(home, 'Library/Logs/Buildr/launcher.log');
      const launchHelper = pathToFileURL(path.resolve(import.meta.dirname, '../verification/release/platform-launcher-invocation.ts')).href;
      const program = `const {launchPlatformLauncher}=await import(${JSON.stringify(launchHelper)});launchPlatformLauncher({target:process.argv[1],workspace:process.cwd(),environment:process.env});`;
      const launcherEnv = {...env, HOME: home, BUILDR_NODE_EXECUTABLE: process.execPath, BUILDR_LAUNCHER_NO_OPEN: '1', BUILDR_LAUNCHER_NO_NOTIFY: '1'};
      for (let attempt = 0; attempt < 2; attempt++) {
        const started = Date.now(), previousDevelopmentBytes = fs.existsSync(developmentLog) ? fs.statSync(developmentLog).size : 0;
        await Promise.all([harnessApp, developmentApp].map(target => execute(process.execPath, ['--input-type=module', '-e', program, target], {cwd: work, env: launcherEnv, timeout: 15000})));
        const deadline = Date.now() + 30000;
        let harnessReady: any;
        while (Date.now() < deadline) {
          try {
            if (fs.statSync(harnessLog).mtimeMs >= started) {
              const text = fs.readFileSync(harnessLog, 'utf8');
              assert.doesNotMatch(text, /#ticket=|Bearer |ownerToken|callerToken/u);
              harnessReady = text.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)).find(value => value.status === 'ready');
            }
            const developmentText = fs.readFileSync(developmentLog).subarray(previousDevelopmentBytes).toString('utf8');
            if (harnessReady && (attempt === 0 ? /Buildr Web：http:/u : /Buildr Web 已运行：/u).test(developmentText)) break;
          } catch {}
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.ok(harnessReady, 'the actual Harness app must produce a fresh ready receipt');
        assert.doesNotMatch(fs.readFileSync(harnessLog, 'utf8'), /#ticket=|Bearer |ownerToken|callerToken/u);
        assert.equal(fs.statSync(harnessLog).mode & 0o777, 0o600);
        assert.equal(harnessReady.generation, first.generation);
        assert.ok(Number.isSafeInteger(harnessReady.entryPid) && harnessReady.entryPid > 0 && harnessReady.entryPid !== first.pid);
        assert.match(fs.readFileSync(developmentLog).subarray(previousDevelopmentBytes).toString('utf8'), attempt === 0 ? /Buildr Web：http:/u : /Buildr Web 已运行：/u);
        const launcherHealth = await waitForWebReadiness({appData: dataRoot, timeoutMs: 15000});
        const launcherReceipt = JSON.parse(fs.readFileSync(path.join(dataRoot, 'instance.json'), 'utf8'));
        assert.equal(launcherReceipt.launcherIdentity.target, developmentApp);
        assert.equal(launcherReceipt.pid, launcherHealth.pid);
        if (launcherWebPid) assert.equal(launcherHealth.pid, launcherWebPid, 'repeated native app opens reuse the exact Development Web process');
        else {
          assert.notEqual(launcherHealth.pid, web?.pid, 'the first bound launcher authenticates a CLI-to-launcher handoff');
          if (web) {await stopOwnedChildProcess(web); web = undefined;}
          launcherWebPid = launcherHealth.pid;
        }
        assert.equal((await client.lifecycle.identity()).generation, first.generation, 'native concurrent/repeated app opens cannot replace the core');
        const exitDeadline = Date.now() + 10000;
        while (Date.now() < exitDeadline) {
          try {process.kill(harnessReady.entryPid, 0);} catch {break;}
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.throws(() => process.kill(harnessReady.entryPid, 0), 'the short-lived Harness app must exit');
      }
      await stopLauncherWeb();
      run(process.execPath, [harnessEntry, 'launcher', 'uninstall', '--target', harnessApp], env, work);
      run(process.execPath, [developmentEntry, 'web', 'launcher', 'uninstall', '--target', developmentApp, '--json'], env, work);
      assert.equal((await client.lifecycle.identity()).generation, first.generation, 'launcher uninstall preserves the shared core');
      await assertActivePreserved('launcher uninstall');
      console.log(JSON.stringify({order, nativeLaunchers: 'darwin', concurrentAndRepeated: 'passed', corePreserved: true}));
    }
    if (web) {await stopOwnedChildProcess(web); web = undefined;}
    assert.equal((await client.lifecycle.identity()).generation, first.generation, 'closing Development does not terminate shared work');
    const removed = order === 'harness-first' ? '@buildr-ai/buildr-harness' : '@buildr-ai/buildr';
    run('npm', ['uninstall', '--global', '--ignore-scripts', '--offline', '--prefix', prefix, removed], env, work);
    assert.equal((await client.operations.conversations.read(scope, conversation.id)).id, conversation.id, 'uninstalling either product preserves shared history');
    await assertActivePreserved('first package uninstall');
    const remaining = removed === '@buildr-ai/buildr' ? '@buildr-ai/buildr-harness' : '@buildr-ai/buildr';
    run('npm', ['uninstall', '--global', '--ignore-scripts', '--offline', '--prefix', prefix, remaining], env, work);
    await assertActivePreserved('both package installations removed');
    if (activeRunId) {
      for (const artifact of artifacts) run('npm', ['install', '--global', '--offline', '--prefix', prefix, artifact], env, work);
      await assertActivePreserved('both packages reinstalled');
      const current = await client.operations.conversations.read(scope, conversation.id), selected = current.run;
      await client.operations.conversations.stop(scope, conversation.id, {
        expectedRevision: current.revision, runId: selected.id, participantId: selected.participantId, generation: selected.generation,
      });
      const stopped = await client.operations.conversations.read(scope, conversation.id);
      assert.equal(stopped.run?.status, 'stopped');
      assert.equal(stopped.run?.executionState, 'ended');
      assert.equal(stopped.requests.length, 0);
      const account = await client.operations.models.accounts.read(fixtureAccountId);
      assert.equal(account.status, 'ready', 'uninstall/reinstall never logs out the shared account');
      assert.equal(account.identity, fixtureAccountIdentity);
      const connection = await client.operations.connections.read('codex');
      await client.operations.connections.disconnect('codex', {expectedRevision: connection.revision});
      for (const name of [removed, remaining]) run('npm', ['uninstall', '--global', '--ignore-scripts', '--offline', '--prefix', prefix, name], env, work);
      console.log(JSON.stringify({order, activeUninstall: 'passed', nativeProgram: 'fixture', paidCalls: 0, sameRunAndQuestionPreserved: true, accountPreserved: true}));
    }
    const retained = await import(pathToFileURL(path.join(first.runtime.directory, 'build/index.js')).href);
    await client.disconnect(); client = undefined;
    await retained.stopAgentProcess({dataRoot, profileId: 'released', mode: 'if-idle'});
    client = await retained.connectHarnessProcess({dataRoot, profileId: 'released', runtime: first.runtime, sourceId: 'harness-local', caller: {kind: 'first-party-user', product: 'buildr-harness'}});
    assert.notEqual((await client.lifecycle.identity()).generation, first.generation);
    assert.equal((await client.operations.conversations.read(scope, conversation.id)).id, conversation.id, 'the retained payload restarts without either installation');
    assert.equal((await client.web.status()).ready, true, 'the retained standalone production assets remain usable');
    console.log(JSON.stringify({order, status: 'passed', sharedGeneration: true, uninstallPreservedHistory: true, retainedRestartWithoutInstallations: true}));
  } finally {
    await stopLauncherWeb();
    if (web) await stopOwnedChildProcess(web);
    if (client) await client.disconnect();
    try {
      await core.stopAgentProcess({dataRoot, profileId: 'released', mode: activeUninstall ? 'stop-owned' : 'if-idle'});
    } finally {
      if (fixtureServer) await new Promise<void>((resolve, reject) => fixtureServer!.close(error => error ? reject(error) : resolve()));
    }
  }
}
