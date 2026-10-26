import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { useLegacyAssetCatalog } from '../helpers/legacy-asset-catalog.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { createInstallationOrigin } from '../../src/modules/installation/infrastructure/installation-origin.ts';
import { candidateArtifact, runNpm, serviceRoot } from '../helpers/application-payload-release.ts';

test('formal npm entry fails closed before enrollment when receipt and payload identities diverge', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-origin-mismatch-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const prefix: any = path.join(root, 'prefix');
    const appData: any = path.join(root, 'app-data');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: path.join(root, 'npm-cache'),
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot: any = path.join(modules, '@buildr-ai/buildr');
    const originPath: any = path.join(packageRoot, 'installation-origin.json');
    const matching: any = JSON.parse(fs.readFileSync(originPath, 'utf8'));
    const mismatched: any = createInstallationOrigin({ ...matching, applicationPayloadDigest: `sha256-${'f'.repeat(64)}` });
    fs.writeFileSync(originPath, `${JSON.stringify(mismatched, null, 2)}\n`);

    const result: any = spawnSync(process.execPath, [path.join(packageRoot, 'bin/buildr.mjs'), '--help'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: '', BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Formal npm Buildr entry has no application-payload-bound installation origin/);
    assert.match(result.stderr, /applicationPayloadDigest/);
    assert.equal(fs.existsSync(path.join(appData, 'product-installations.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm global postinstall enrolls identity-bound update authority for two prefixes and startup preserves it', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-postinstall-'));
  try {
    const { artifact }: any = await candidateArtifact(root);
    const appData: any = path.join(root, 'app-data');
    const npmCache: any = path.join(root, 'npm-cache');
    const prefixes: any[] = [path.join(root, 'prefix-a'), path.join(root, 'prefix-b')];
    const entries: any[] = [];
    for (const prefix of prefixes) {
      const installed: any = runNpm(['install', '--offline', '--global', '--prefix', prefix, artifact.tarball], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
          BUILDR_APP_DATA_DIR: appData,
          BUILDR_PRODUCT_DATA_DIR: appData,
          npm_config_cache: npmCache,
          npm_config_update_notifier: 'false',
        },
      });
      assert.equal(installed.status, 0, installed.stderr || installed.stdout);
      const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
      entries.push(path.join(modules, '@buildr-ai/buildr', 'bin/buildr.mjs'));
    }
    const registryFile: any = path.join(appData, 'product-installations.json');
    const registry: any = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(registry.installations.length, 2);
    for (const [index, installation] of registry.installations.entries()) {
      assert.equal(installation.origin.channel, 'npm');
      assert.equal(installation.updateAuthority.type, 'npm-cli');
      assert.equal(sameFilesystemPath(installation.updateAuthority.nodeExecutable, process.execPath), true);
      assert.equal(sameFilesystemPath(installation.updateAuthority.prefix, prefixes[index]), true);
      assert.equal(fs.statSync(installation.updateAuthority.npmCliPath).isFile(), true);
      assert.equal(sameFilesystemPath(installation.entryPath, entries[index]), true);
    }
    const bytes: any = fs.readFileSync(registryFile, 'utf8');
    for (const entry of entries) {
      const help: any = spawnSync(process.execPath, [entry, '--help'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: '', BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: appData },
      });
      assert.equal(help.status, 0, help.stderr);
    }
    assert.equal(fs.readFileSync(registryFile, 'utf8'), bytes, 'ordinary startup must reuse authority entries without rewriting them');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm package uses only its compatible host Node for CLI and on-demand Buildr Web', async () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-installed-'));
  const appData: any = path.join(root, 'app-data');
  let web: any = null;
  try {
    const { artifact, payloadDigest }: any = await candidateArtifact(root);
    const prefix: any = path.join(root, 'prefix');
    const npmCache: any = path.join(root, 'npm-cache');
    const installed: any = runNpm(['install', '--offline', '--ignore-scripts', '--global', '--prefix', prefix, artifact.tarball], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
        npm_config_cache: npmCache,
        npm_config_update_notifier: 'false',
      },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const modules: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
    const packageRoot: any = path.join(modules, '@buildr-ai/buildr');
    const cli: any = path.join(packageRoot, 'bin/buildr.mjs');
    const runtimeEnv: any = {
      ...process.env,
      PATH: process.platform === 'win32' ? process.env.SystemRoot : '/usr/bin:/bin',
      NODE_PATH: '',
      BUILDR_APP_DATA_DIR: appData,
      BUILDR_PRODUCT_DATA_DIR: appData,
    };
    const run: any = (args: any) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env: runtimeEnv, encoding: 'utf8' });
    const help: any = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: buildr/);
    const developmentSchema: any = run(['__internal', 'task-development', 'planning', '--schema']);
    assert.notEqual(developmentSchema.status, 0, 'retired Task Development route must be absent');
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/modules/task/interfaces/internal/task-development-driver.mjs')), false);
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/modules/task/interfaces/internal/task-retrospective-driver.mjs')), false);
    assert.equal(fs.existsSync(path.join(packageRoot, 'src/modules/task/interfaces/internal/task-planning-identity-driver.mjs')), false);

    const workflowWorkspace: any = path.join(root, 'workflow-workspace');
    fs.mkdirSync(workflowWorkspace);
    const initialized: any = run(['init', '--target', workflowWorkspace, '--name', 'workflow-route-fixture', '--profile', 'team']);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    useLegacyAssetCatalog(workflowWorkspace); // Installed compatibility route, not the fresh catalog journey.
    const project: any = run(['project', 'create', 'demo', '--target', workflowWorkspace, '--name', 'Demo', '--description', 'Installed workflow route fixture.']);
    assert.equal(project.status, 0, project.stderr || project.stdout);

    const external = path.join(root, 'external-service');
    fs.mkdirSync(path.join(external, 'checks'), { recursive: true });
    fs.writeFileSync(path.join(external, 'README.md'), '# External service\n');
    fs.writeFileSync(path.join(external, 'checks/readme.test.mjs'), "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport test from 'node:test';\ntest('service README', () => assert.match(fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /External service/));\n");
    for (const args of [
      ['init', '-b', 'main'],
      ['add', '.'],
      ['-c', 'user.name=Buildr Test', '-c', 'user.email=buildr@example.com', 'commit', '-m', 'External service fixture'],
      ['remote', 'add', 'origin', external],
    ]) {
      const result = spawnSync('git', args, { cwd: external, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    // Service attachment and Task creation may inspect Git; preserve the narrow
    // Host Node environment above for all ordinary CLI and Web assertions.
    const runWithGit = (args: string[]) => spawnSync(process.execPath, [cli, ...args], {
      cwd: root, env: { ...runtimeEnv, PATH: process.env.PATH }, encoding: 'utf8',
    });
    const attached = runWithGit(['service', 'create', 'demo/external', '--attach', external, '--integration-branch', 'main', '--target', workflowWorkspace, '--name', 'External', '--description', 'Installed verification fixture', '--type', 'backend', '--json']);
    assert.equal(attached.status, 0, attached.stderr || attached.stdout);
    const bundledRg=path.join(packageRoot,'payload/runtime/ripgrep',process.platform+'-'+process.arch,process.platform==='win32'?'rg.exe':'rg');
    const rgVersion=spawnSync(bundledRg,['--version'],{encoding:'utf8',env:{...runtimeEnv,PATH:''}});assert.equal(rgVersion.status,0,rgVersion.stderr);assert.match(rgVersion.stdout,/ripgrep/);
    const codeCatalog=runWithGit(['code','repositories','--target',workflowWorkspace,'--json']);assert.equal(codeCatalog.status,0,codeCatalog.stderr);
    const codeRepository=JSON.parse(codeCatalog.stdout).repositories.find((repo:any)=>repo.location===fs.realpathSync(external));assert.ok(codeRepository);
    const inventoryCli=runWithGit(['code','source-control-inventory','--target',workflowWorkspace,'--json']);assert.equal(inventoryCli.status,0,inventoryCli.stderr);
    const pendingRepository=JSON.parse(inventoryCli.stdout).repositories.find((repo:any)=>repo.id===codeRepository.id);
    assert.ok(pendingRepository);assert.equal(pendingRepository.gitId,null);assert.equal(pendingRepository.fileCount,null);assert.ok(pendingRepository.diagnostics.some((item:any)=>item.code==='code_source_control_pending'));
    const codeSearch=runWithGit(['code','search','--repository',codeRepository.id,'--query','External service','--mode','content','--target',workflowWorkspace,'--json']);assert.equal(codeSearch.status,0,codeSearch.stderr);
    const codeResult=JSON.parse(codeSearch.stdout);assert.ok(codeResult.matches.some((match:any)=>match.path==='README.md'&&match.line===1));assert.equal(codeResult.truncated,false);assert.deepEqual(codeResult.diagnostics,[]);
    const pagedText='first\n'+'p'.repeat(5*1024*1024)+'\ninstalled [Needle]\n';fs.writeFileSync(path.join(external,'paged.txt'),pagedText);
    for(const args of [['add','paged.txt'],['-c','user.name=Buildr Test','-c','user.email=buildr@example.com','commit','-m','Installed paged source']]){const result=spawnSync('git',args,{cwd:external,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
    const pagedCommit=spawnSync('git',['rev-parse','HEAD'],{cwd:external,encoding:'utf8'}).stdout.trim();
    const pagedCli=runWithGit(['code','file','--repository',codeRepository.id,'--path','paged.txt','--target',workflowWorkspace,'--json']);assert.equal(pagedCli.status,0,pagedCli.stderr);
    const pagedResult=JSON.parse(pagedCli.stdout);assert.equal(pagedResult.page.index,0);assert.equal(pagedResult.limitBytes,5*1024*1024);assert.equal(pagedResult.content,Buffer.from(pagedText).subarray(0,pagedResult.page.endOffset).toString());
    const pagedNextCli=runWithGit(['code','file','--repository',codeRepository.id,'--path','paged.txt','--page','1','--expected-revision',pagedResult.revision,'--target',workflowWorkspace,'--json']);assert.equal(pagedNextCli.status,0,pagedNextCli.stderr);assert.equal(JSON.parse(pagedNextCli.stdout).page.index,1);
    const pagedHistoryCli=runWithGit(['code','file','--repository',codeRepository.id,'--path','paged.txt','--commit',pagedCommit,'--line','3','--match-query','installed [NEEDLE]','--target',workflowWorkspace,'--json']);assert.equal(pagedHistoryCli.status,0,pagedHistoryCli.stderr);
    const pagedHistory=JSON.parse(pagedHistoryCli.stdout);assert.equal(pagedHistory.source.commitHash,pagedCommit);assert.ok(pagedHistory.page.matchOffset>5*1024*1024);assert.ok(pagedHistory.content.includes('installed [Needle]'));
    const declaration = {
      schemaVersion: 'buildr.project-verification/v4',
      testing: [{
        id: 'external-tests', title: 'External service tests',
        scope: { project: 'demo', services: ['external'] },
        purpose: 'Validate the external service README',
        location: { kind: 'service', service: 'external' },
        sourcePaths: ['README.md'], testRoots: ['checks/**'],
        full: { kind: 'command', argv: ['node', '--test', 'readme.test.mjs'], cwd: 'checks' },
        requirements: ['node'],
      }],
    };
    const mapFile = path.join(root, 'external-verification.json');
    fs.writeFileSync(mapFile, JSON.stringify(declaration));
    const projectVerification = (operation: string, args: string[] = []) => {
      const result = run(['project', 'verification', operation, 'demo', ...args, '--target', workflowWorkspace, '--json']);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    };
    const expectedLocation = {
      testing: 'external-tests', kind: 'service', service: 'external',
      root: fs.realpathSync(external), cwd: fs.realpathSync(path.join(external, 'checks')),
      status: 'ready', diagnostics: [],
    };
    const validated = projectVerification('validate', ['--file', mapFile]);
    assert.equal(validated.status, 'ready');
    assert.deepEqual(validated.locations, [expectedLocation]);
    const updated = projectVerification('update', ['--file', mapFile, '--expected-identity', 'absent']);
    assert.equal(updated.status, 'updated');
    assert.deepEqual(updated.locations, [expectedLocation]);
    const inspected = projectVerification('inspect');
    assert.equal(inspected.identity, updated.identity);
    assert.deepEqual(inspected.declaration.testing[0].location, declaration.testing[0].location);
    assert.deepEqual(inspected.locations, [expectedLocation]);

    const taskId = 'installed-verification';
    const createdTask = runWithGit(['task', 'create', taskId, '--title', 'Installed verification', '--intent', 'Record the external service test gap', '--status', 'active', '--service', 'demo/external', '--target', workflowWorkspace, '--json']);
    assert.equal(createdTask.status, 0, createdTask.stderr || createdTask.stdout);
    const reportFile = path.join(root, 'verification-report.json');
    const gap = { project: 'demo', service: 'external', testing: 'external-tests', reason: 'The installed CLI verified the declaration location; the service test command was not executed.' };
    fs.writeFileSync(reportFile, JSON.stringify({
      contentIdentity: 'fixture:installed-verification', contentSummary: 'External service declaration',
      checks: [], gaps: [gap],
      conclusion: { outcome: 'incomplete', summary: 'The service test command remains unexecuted.' },
    }));
    const recordedResult = run(['task', 'verification', 'record', taskId, '--report', reportFile, '--expected-report', 'absent', '--target', workflowWorkspace, '--json']);
    assert.equal(recordedResult.status, 0, recordedResult.stderr || recordedResult.stdout);
    const recorded = JSON.parse(recordedResult.stdout);
    assert.equal(recorded.status, 'recorded');
    assert.deepEqual(recorded.slot.report.checks, []);
    assert.deepEqual(recorded.slot.report.gaps, [gap]);
    assert.equal(recorded.slot.report.declarations[0].status, 'ready');
    assert.equal(recorded.slot.report.declarations[0].identity, updated.identity);
    assert.equal(recorded.slot.report.conclusion.outcome, 'incomplete');
    const reportInspectionResult = run(['task', 'verification', 'inspect', taskId, '--content-identity', 'fixture:installed-verification', '--target', workflowWorkspace, '--json']);
    assert.equal(reportInspectionResult.status, 0, reportInspectionResult.stderr || reportInspectionResult.stdout);
    const reportInspection = JSON.parse(reportInspectionResult.stdout);
    assert.deepEqual(reportInspection.slot.report, recorded.slot.report);
    assert.equal(reportInspection.slot.applicability.status, 'current');
    assert.equal(JSON.stringify(reportInspection.slot.report).includes(fs.realpathSync(external)), false, 'portable reports must not persist local location paths');

    const planningIdentity: any = run(['__internal', 'task-planning-identity', 'inspect', '--task', 'planning-route-fixture', '--target', workflowWorkspace]);
    assert.notEqual(planningIdentity.status, 0, 'retired Planning Identity route must be absent');

    const retrospective: any = run(['__internal', 'task-retrospective', 'record', '--task', 'retrospective-route-fixture', '--target', workflowWorkspace, '--report-markdown', '# Installed route fixture\n\nThe bundled Retrospective writer reached the canonical Application.']);
    assert.notEqual(retrospective.status, 0, 'retired Task Retrospective internal route must be absent');
    assert.equal(fs.existsSync(path.join(packageRoot, 'payload/product/resources/workspace/skills/buildr/task-retrospective/SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'ordinary CLI must not start HTTP');
    const installationRegistryFile: any = path.join(appData, 'product-installations.json');
    const firstRegistryBytes: any = fs.readFileSync(installationRegistryFile, 'utf8');
    const installationRegistry: any = JSON.parse(firstRegistryBytes);
    assert.equal(installationRegistry.schemaVersion, 'buildr.product-installation-registry/v1');
    assert.equal(installationRegistry.installations.length, 1);
    assert.equal(installationRegistry.installations[0].origin.channel, 'npm');
    assert.equal(sameFilesystemPath(installationRegistry.installations[0].entryPath, cli), true);
    assert.equal(installationRegistry.installations[0].runtime.executable, process.execPath);
    assert.equal(installationRegistry.installations[0].updateAuthority, null);
    const assetHelp: any = run(['help', 'assets']);
    assert.equal(assetHelp.status, 0, assetHelp.stderr);
    assert.match(assetHelp.stdout, /serviceIds/);
    assert.equal(fs.existsSync(path.join(packageRoot, 'payload/product/docs/bootstrap-guide.md')), false);
    const offlineReference = fs.readFileSync(path.join(packageRoot, 'payload/product/docs/cli-reference.md'), 'utf8');
    assert.equal(offlineReference, fs.readFileSync(path.join(serviceRoot, 'docs/cli-reference.md'), 'utf8'));
    assert.match(offlineReference, /## 入口不可用与恢复/);
    for (const args of [['bootstrap', 'guide'], ['bootstrap', 'guide', '--help'], ['help', 'bootstrap', 'guide']]) {
      const retired: any = run([...args, '--json']);
      assert.equal(retired.status, 2);
      assert.match(JSON.parse(retired.stdout).error.code, /^cli\.unknown_(?:command|help_topic)$/);
    }
    assert.equal(fs.readFileSync(installationRegistryFile, 'utf8'), firstRegistryBytes, 'formal startup enrollment must be byte-idempotent');
    const installationStatus: any = run(['installation', 'status', '--json']);
    assert.equal(installationStatus.status, 0, installationStatus.stderr);
    const installation: any = JSON.parse(installationStatus.stdout);
    assert.equal(installation.channels.npm.status, 'current');
    assert.equal(installation.currentInstallation.channel, 'npm');
    assert.equal(installation.installationRegistry.status, 'ready');
    const identityResult: any = run(['version', '--json']);
    assert.equal(identityResult.status, 0, identityResult.stderr);
    const identity: any = JSON.parse(identityResult.stdout);
    assert.equal(identity.channel, 'npm');
    assert.equal(identity.runtime.role, 'host');
    assert.equal(identity.runtime.executable, process.execPath);
    assert.equal(identity.applicationPayloadDigest, payloadDigest);

    web = spawn(process.execPath, [cli, 'web', '--target', workflowWorkspace, '--no-open', '--port', '0'], { cwd: root, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr: any = '';
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk: any) => { stderr += chunk; });
    let instance: any = null;
    for (let attempt: any = 0; attempt < 100; attempt += 1) {
      try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
      if (instance) break;
      if (web.exitCode !== null) break;
      await new Promise((resolve: any) => setTimeout(resolve, 50));
    }
    assert.ok(instance, `Buildr Web did not create readiness identity: ${stderr}`);
    const health: any = await fetch(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
    assert.equal(health.status, 200);
    const healthIdentity: any = await health.json();
    assert.equal(healthIdentity.schemaVersion, 'buildr.local-app-health/v1');
    assert.equal(healthIdentity.status, 'ready');
    assert.equal(healthIdentity.pid, web.pid);
    assert.equal(healthIdentity.launcherIdentity, null);
    assert.equal(healthIdentity.previewIdentity, null);
    assert.equal(healthIdentity.productIdentity.channel, 'npm');
    assert.equal(healthIdentity.productIdentity.runtime.role, 'host');
    assert.equal(healthIdentity.productIdentity.applicationPayloadDigest, payloadDigest);
    assert.equal(instance.productIdentity.installationIdentity, healthIdentity.productIdentity.installationIdentity);
    const workspaceRegistry=await(await fetch(instance.url+'/api/v1/workspaces',{headers:{'x-buildr-instance':instance.secret}})).json();
    const registeredWorkspace=workspaceRegistry.workspaces.find((entry:any)=>sameFilesystemPath(entry.rootPath,workflowWorkspace));assert.ok(registeredWorkspace,JSON.stringify(workspaceRegistry));
    const inventoryResponse=await fetch(instance.url+'/api/v1/workspaces/'+registeredWorkspace.workspace.id+'/code/source-control-inventory',{headers:{'x-buildr-instance':instance.secret}});assert.equal(inventoryResponse.status,200);
    const pendingHttp=(await inventoryResponse.json()).repositories.find((repo:any)=>repo.id===codeRepository.id);
    assert.deepEqual(pendingHttp,pendingRepository,'installed CLI and bundled read worker expose the same unverified registration, without pretending it is clean');
    const codeQuery=new URLSearchParams({repositoryId:codeRepository.id,query:'External service',mode:'content'});
    const codeResponse=await fetch(instance.url+'/api/v1/workspaces/'+registeredWorkspace.workspace.id+'/code/search?'+codeQuery,{headers:{'x-buildr-instance':instance.secret}});assert.equal(codeResponse.status,200);
    const httpCodeResult=await codeResponse.json();
    const byPath=(left:any,right:any)=>left.path.localeCompare(right.path);
    assert.deepEqual([...httpCodeResult.matches].sort(byPath),[...codeResult.matches].sort(byPath));assert.equal(httpCodeResult.truncated,false);assert.deepEqual(httpCodeResult.diagnostics,[]);
    const fullText='x'.repeat(5*1024*1024);fs.writeFileSync(path.join(external,'five-mib.txt'),fullText);
    const fileQuery=new URLSearchParams({repositoryId:codeRepository.id,filePath:'five-mib.txt'});
    const fileResponse=await fetch(instance.url+'/api/v1/workspaces/'+registeredWorkspace.workspace.id+'/code/file?'+fileQuery,{headers:{'x-buildr-instance':instance.secret}});assert.equal(fileResponse.status,200);
    const httpFileResult=await fileResponse.json();assert.equal(httpFileResult.content,fullText);assert.equal(httpFileResult.limitBytes,5*1024*1024);assert.equal(httpFileResult.sizeBytes,5*1024*1024);assert.equal(httpFileResult.truncated,false);assert.equal(httpFileResult.page,null);
    const readPaged=async(query:Record<string,string>)=>fetch(instance.url+'/api/v1/workspaces/'+registeredWorkspace.workspace.id+'/code/file?'+new URLSearchParams({repositoryId:codeRepository.id,filePath:'paged.txt',...query}),{headers:{'x-buildr-instance':instance.secret}});
    const nextResponse=await readPaged({page:'1',expectedRevision:pagedResult.revision});assert.equal(nextResponse.status,200);const nextPage=await nextResponse.json();assert.equal(nextPage.page.index,1);assert.equal(nextPage.page.offset,pagedResult.page.endOffset);
    const historyResponse=await readPaged({commitHash:pagedCommit,line:'3',matchQuery:'installed [NEEDLE]'});assert.equal(historyResponse.status,200);assert.deepEqual((await historyResponse.json()).page,pagedHistory.page);
    fs.writeFileSync(path.join(external,'paged.txt'),'changed\n');const changedResponse=await readPaged({page:'1',expectedRevision:pagedResult.revision});assert.equal(changedResponse.status,409);assert.equal((await changedResponse.json()).error.code,'code_file_changed');
    const shell: any = await fetch(instance.url);
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /<div id="root"><\/div>/);
  } finally {
    if (web && web.exitCode === null) {
      web.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve: any) => web.once('close', resolve)),
        new Promise((resolve: any) => setTimeout(resolve, 2_000)),
      ]);
      if (web.exitCode === null) web.kill('SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
