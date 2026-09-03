export function createBuildrSelfInvoker({ currentProductInvocation, productInvocationArgs, execFileSync, spawnSync }: any): any  {
  let invocation;
  const invoke = (runner: any, args: any, options: any) => {
    invocation ??= currentProductInvocation();
    const [command, invocationArgs] = productInvocationArgs(invocation, args);
    return runner(command, invocationArgs, options);
  };
  return Object.freeze({
    exec: (args: any, options: any) => invoke(execFileSync, args, options),
    spawn: (args: any, options: any) => invoke(spawnSync, args, options),
  });
}

export function createPackageSmokeChecks(deps: any): any  {
  const {
    BUILDR_REQUIRED_BLOCK_START,
    buildRuleDiscoveryPlan,
    checkClaudeCodeRuntime,
    checkCodexRuntime,
    collectFiles,
    commandsCheck,
    ensureDirectory,
    execFileSync,
    existsDirectory,
    existsFile,
    fs,
    hasManagedRulesMarker,
    os,
    parseCommandsManifestYaml,
    parseProjectCommandsYaml,
    parseManifestFileEntry,
    parseProjectsYaml,
    parseRulesManifestYaml,
    renderRulesManifestYaml,
    rootRequiredBlockStatus,
    path,
    readSkillManifest,
    renderClaudeCodeRules,
    resolveRuleScope,
    spawnSync,
    toPosixRelative,
    writeServicesManifest,
  } = deps;
  const buildrSelf = createBuildrSelfInvoker(deps);

  function verifyRecursiveRules(context: any): any  {
    const { root, problems } = context;
    const recursiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-rules-'));
    try {
      buildrSelf.exec(['init', '--target', recursiveRoot, '--name', 'recursive', '--profile', 'team'], { cwd: root, stdio: 'ignore' });
      buildrSelf.exec(['project', 'create', 'demo', '--target', recursiveRoot], { cwd: root, stdio: 'ignore' });
      const recursiveProjectRoot = path.join(recursiveRoot, 'projects', 'demo');
      const apiRoot = path.join(recursiveProjectRoot, 'services', 'api');
      const webRoot = path.join(recursiveProjectRoot, 'services', 'web');
      const customRoot = path.join(apiRoot, 'modules', 'custom');
      const ordersRoot = path.join(apiRoot, 'modules', 'orders');
      for (const directory of [apiRoot, webRoot, customRoot, ordersRoot]) fs.mkdirSync(directory, { recursive: true });
      writeServicesManifest(recursiveProjectRoot, {
        schemaVersion: 'buildr.services/v1',
        project: 'demo',
        services: {
          api: { title: 'api', description: 'API service', type: 'backend', path: 'services/api', repo: { kind: 'workspace' } },
          web: { title: 'web', description: 'Web service', type: 'frontend', path: 'services/web', repo: { kind: 'workspace' } },
        },
      });
      fs.writeFileSync(path.join(apiRoot, 'AGENTS.md'), '# API rules\n', 'utf8');
      fs.writeFileSync(path.join(webRoot, 'AGENTS.md'), '# Web rules\n', 'utf8');
      fs.writeFileSync(path.join(customRoot, 'AGENTS.md'), '# Custom module rules\n', 'utf8');
      fs.writeFileSync(path.join(ordersRoot, 'AGENTS.md'), '# Orders rules\n', 'utf8');

      const excludedRoot = path.join(apiRoot, 'node_modules', 'dependency');
      const unregisteredGitRoot = path.join(apiRoot, 'external-repo');
      const linkedRoot = path.join(apiRoot, 'linked-rules');
      const taskWorktreeRoot = path.join(recursiveRoot, '.worktrees', 'ignored-task');
      fs.mkdirSync(excludedRoot, { recursive: true });
      fs.mkdirSync(path.join(unregisteredGitRoot, '.git'), { recursive: true });
      fs.mkdirSync(path.join(ordersRoot, 'deep'), { recursive: true });
      fs.mkdirSync(taskWorktreeRoot, { recursive: true });
      fs.writeFileSync(path.join(excludedRoot, 'AGENTS.md'), '# Excluded rules\n', 'utf8');
      fs.writeFileSync(path.join(unregisteredGitRoot, 'AGENTS.md'), '# External rules\n', 'utf8');
      fs.writeFileSync(path.join(taskWorktreeRoot, 'AGENTS.md'), '# Task copy rules\n', 'utf8');
      fs.symlinkSync(ordersRoot, linkedRoot, 'dir');

      const rootPlan = buildRuleDiscoveryPlan(recursiveRoot, resolveRuleScope(recursiveRoot, '.'));
      if (rootPlan.files.some((file: any) => file.startsWith(path.join(recursiveRoot, '.worktrees')))
        || !rootPlan.boundaries.some((boundary: any) => boundary.path === '.worktrees' && boundary.reason === 'excluded-directory')) {
        problems.push('Rules discovery must treat workspace .worktrees as an excluded task-copy boundary.');
      }

      const serviceScope = resolveRuleScope(recursiveRoot, 'projects/demo/services/api');
      const servicePlan = buildRuleDiscoveryPlan(recursiveRoot, serviceScope);
      const serviceSources = servicePlan.files.map((file: any) => toPosixRelative(recursiveRoot, file));
      const expectedSources: any[] = [
        'AGENTS.md',
        'projects/demo/AGENTS.md',
        'projects/demo/services/api/AGENTS.md',
        'projects/demo/services/api/modules/custom/AGENTS.md',
        'projects/demo/services/api/modules/orders/AGENTS.md',
      ];
      if (JSON.stringify(serviceSources) !== JSON.stringify(expectedSources)) {
        problems.push(`Rules discovery order or Service subtree isolation is invalid: ${JSON.stringify(serviceSources)}`);
      }
      for (const reason of ['excluded-directory', 'symbolic-link', 'unregistered-nested-git-repository']) {
        if (!servicePlan.boundaries.some((boundary: any) => boundary.reason === reason)) {
          problems.push(`Rules discovery did not report ${reason} boundary.`);
        }
      }
      const legacyScope = resolveRuleScope(recursiveRoot, 'projects/demo/api');
      if (legacyScope.scope !== 'projects/demo/services/api' || legacyScope.warnings.length !== 1) {
        problems.push('Legacy Service scope must resolve to one canonical workspace path with a warning.');
      }
      for (const invalidScope of ['../outside', '/tmp/outside', '.worktrees/ignored-task', 'projects/demo/node_modules', 'projects/demo/services/api/linked-rules/deep']) {
        try {
          resolveRuleScope(recursiveRoot, invalidScope);
          problems.push(`Invalid Rules scope unexpectedly resolved: ${invalidScope}`);
        } catch {
          // Expected rejection.
        }
      }
      fs.mkdirSync(path.join(recursiveProjectRoot, 'api'), { recursive: true });
      try {
        resolveRuleScope(recursiveRoot, 'projects/demo/api');
        problems.push('Ambiguous legacy Service scope unexpectedly resolved.');
      } catch (error: any) {
        if (!error.message.includes('Ambiguous legacy Service scope')) problems.push(`Ambiguous legacy Service scope returned the wrong error: ${error.message}`);
      }
      fs.rmSync(path.join(recursiveProjectRoot, 'api'), { recursive: true, force: true });

      const codexBefore = collectFiles(recursiveRoot).map((file: any) => toPosixRelative(recursiveRoot, file)).sort();
      const codexRules = checkCodexRuntime(['--scope', 'projects/demo/services/api', '--target', recursiveRoot], {
        repoRoot: recursiveRoot,
        command: 'buildr package check',
      }).findings.filter((finding: any) => finding.code === 'runtime.codex_rules_ok').map((finding: any) => finding.path);
      const codexAfter = collectFiles(recursiveRoot).map((file: any) => toPosixRelative(recursiveRoot, file)).sort();
      if (JSON.stringify(codexRules) !== JSON.stringify(expectedSources) || JSON.stringify(codexBefore) !== JSON.stringify(codexAfter)) {
        problems.push('Codex Rules diagnostics must report recursive native sources without writing a bridge.');
      }

      fs.writeFileSync(path.join(recursiveRoot, 'CLAUDE.md'), '# Custom root Claude rules\n', 'utf8');
      fs.writeFileSync(path.join(recursiveProjectRoot, 'CLAUDE.md'), '# Custom Project Claude rules\n', 'utf8');
      try {
        renderClaudeCodeRules(['--scope', 'projects/demo/services/api', '--target', recursiveRoot], {
          repoRoot: recursiveRoot,
          command: 'buildr package check',
        });
        problems.push('Claude Rules render unexpectedly accepted a non-managed conflict.');
      } catch (error: any) {
        if (!error.message.includes('no files were changed')) problems.push(`Claude Rules conflict did not report atomic reconcile: ${error.message}`);
        if (!error.message.includes('2 conflict(s)')) problems.push('Claude Rules render must report every conflict in the selected scope.');
      }
      if (fs.readFileSync(path.join(recursiveRoot, 'CLAUDE.md'), 'utf8') !== '# Custom root Claude rules\n'
        || fs.readFileSync(path.join(recursiveProjectRoot, 'CLAUDE.md'), 'utf8') !== '# Custom Project Claude rules\n'
        || existsFile(path.join(apiRoot, 'CLAUDE.md'))) {
        problems.push('Claude Rules conflict must leave every planned target unchanged.');
      }
      fs.rmSync(path.join(recursiveRoot, 'CLAUDE.md'));
      fs.rmSync(path.join(recursiveProjectRoot, 'CLAUDE.md'));

      const firstRender = renderClaudeCodeRules(['--scope', 'projects/demo/services/api', '--target', recursiveRoot], {
        repoRoot: recursiveRoot,
        command: 'buildr package check',
      });
      if (firstRender.actions.some((action: any) => action.action !== 'created') || existsFile(path.join(webRoot, 'CLAUDE.md'))) {
        problems.push('Claude Service render must create only ancestor and selected Service subtree bridges.');
      }
      fs.appendFileSync(path.join(customRoot, 'CLAUDE.md'), '\nCustom Claude-only content.\n', 'utf8');
      fs.rmSync(path.join(customRoot, 'AGENTS.md'));
      fs.rmSync(path.join(ordersRoot, 'AGENTS.md'));
      const orphanRender = renderClaudeCodeRules(['--scope', 'projects/demo/services/api', '--target', recursiveRoot], {
        repoRoot: recursiveRoot,
        command: 'buildr package check',
      });
      if (!orphanRender.actions.some((action: any) => action.action === 'removed' && action.targetFile === path.join(ordersRoot, 'CLAUDE.md')) || existsFile(path.join(ordersRoot, 'CLAUDE.md'))) {
        problems.push('Claude Rules reconcile must remove managed orphan bridges.');
      }
      const preservedOrphan = fs.readFileSync(path.join(customRoot, 'CLAUDE.md'), 'utf8');
      if (!orphanRender.actions.some((action: any) => action.action === 'updated' && action.targetFile === path.join(customRoot, 'CLAUDE.md'))
        || hasManagedRulesMarker(preservedOrphan)
        || !preservedOrphan.includes('Custom Claude-only content.')) {
        problems.push('Claude Rules reconcile must preserve custom content outside an orphan managed block.');
      }
    } finally {
      fs.rmSync(recursiveRoot, { recursive: true, force: true });
    }
  }

  function verifyWorkspaceAssetLifecycle(context: any, tempRoot: any, kind: any, finalize: any = true): any  {
    const { root, manifest, problems, parseJsonOutput } = context;
    if (kind === 'runtime') {
    buildrSelf.exec(['rules', 'render', 'claude-code', '--scope', 'projects/demo', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    const oldReferenceBlock = [
      '<!-- BEGIN Buildr managed Claude Code rules bridge; hash: 0000000000000000000000000000000000000000000000000000000000000000 -->',
      '@AGENTS.md',
      '<!-- END Buildr managed Claude Code rules bridge -->',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tempRoot, 'CLAUDE.md'), `# CLAUDE.md\n\n${oldReferenceBlock}`, 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'projects', 'demo', 'CLAUDE.md'), `# CLAUDE.md\n\n${oldReferenceBlock}`, 'utf8');
    const referenceRuntime = checkClaudeCodeRuntime(['--scope', 'projects/demo', '--target', tempRoot], {
      repoRoot: tempRoot,
      command: 'buildr package check',
    });
    const referenceFindings = referenceRuntime.findings.filter((finding: any) => finding.path === 'CLAUDE.md' || finding.path === 'projects/demo/CLAUDE.md');
    if (referenceFindings.some((finding: any) => finding.status === 'stale')) {
      problems.push('reference bridge hash drift must not make rules bridge stale.');
    }
    if (referenceFindings.filter((finding: any) => finding.code === 'runtime.reference_bridge_metadata_stale').length !== 2) {
      problems.push('reference bridge hash drift must be reported as metadata info for both root and project bridges.');
    }
    if (referenceRuntime.repairCommands.some((command: any) => command.includes('rules render'))) {
      problems.push('reference bridge metadata info must not suggest required rules render.');
    }
    const doctorWithoutInfo = parseJsonOutput('doctor without info', buildrSelf.exec(['doctor', '--target', tempRoot, '--scope', 'projects/demo', '--json', '--detail', 'full'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    if (doctorWithoutInfo.findings.some((finding: any) => finding.code === 'runtime.reference_bridge_metadata_stale')) {
      problems.push('doctor --json must not include reference bridge metadata info by default.');
    }
    if (doctorWithoutInfo.runtime.claudeCode.some((entry: any) => entry.findings.some((finding: any) => finding.status === 'info'))) {
      problems.push('doctor --json runtime details must not include info findings by default.');
    }
    const doctorWithInfo = parseJsonOutput('doctor with info', buildrSelf.exec(['doctor', '--target', tempRoot, '--scope', 'projects/demo', '--json', '--include-info'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    if (!doctorWithInfo.findings.some((finding: any) => finding.code === 'runtime.reference_bridge_metadata_stale' && finding.userActionRequired === false)) {
      problems.push('doctor --json --include-info must include non-actionable reference bridge metadata info.');
    }
    if (doctorWithInfo.nextSteps.some((step: any) => step.code === 'runtime.reference_bridge_metadata_stale')) {
      problems.push('reference bridge metadata info must not be listed as a doctor next step.');
    }
    }
    if (kind === 'commands') {
    const installedCommandsManifest = path.join(tempRoot, 'commands', 'manifest.yml');
    if (!existsFile(installedCommandsManifest)) {
      problems.push('buildr init did not install commands/manifest.yml.');
    } else {
      const commandsCheckJson = buildrSelf.exec(['commands', 'check', '--target', tempRoot, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const commandsCheck = parseJsonOutput('commands check', commandsCheckJson);
      if (!commandsCheck.ok || !commandsCheck.manifest.valid) {
        problems.push(`Default commands manifest check failed: ${JSON.stringify(commandsCheck.summary)}`);
      }
        if (!Array.isArray(commandsCheck.catalog?.definitions)
          || !Array.isArray(commandsCheck.requirements)
          || !Array.isArray(commandsCheck.effectiveConstraints)
          || !Array.isArray(commandsCheck.observations)
          || !Array.isArray(commandsCheck.findings)) {
          problems.push('commands check JSON must expose catalog, requirements, effectiveConstraints, observations, and findings layers.');
        }
        if (commandsCheck.commands.length !== 1 || commandsCheck.commands[0].id !== 'openspec'
          || !commandsCheck.commands[0].sources.includes('commands/buildr/openspec/manifest.yml')) {
          problems.push('Default workspace must aggregate the OpenSpec Component command collection.');
        }
      }
      buildrSelf.exec(['commands', 'add', 'demo-tool', '--purpose', '测试命令行工具维护', '--description', 'package check temporary command', '--install-hint', 'https://example.com/demo-tool', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      const commandsAfterAdd = parseJsonOutput('commands check after add', buildrSelf.exec(['commands', 'check', '--target', tempRoot, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
      const demoDefinition = commandsAfterAdd.catalog?.definitions?.find((item: any) => item.id === 'demo-tool');
      if (demoDefinition?.installHint !== 'https://example.com/demo-tool' || Object.hasOwn(demoDefinition ?? {}, 'install')) {
        problems.push('commands add/check catalog must use installHint and must not emit install.');
      }
      buildrSelf.exec(['commands', 'remove', 'demo-tool', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      const commandsAfterRemove = parseCommandsManifestYaml(fs.readFileSync(installedCommandsManifest, 'utf8'));
      if (!Array.isArray(commandsAfterRemove.commands) || commandsAfterRemove.commands.length !== 0) {
        problems.push('commands remove must keep an empty commands array.');
      }
    }
    if (kind === 'rules') {
      const rulesManifestFile = path.join(tempRoot, 'rules', 'manifest.yml');
      const packageCheckRuleFile = path.join(tempRoot, 'rules', 'package-check-rule.md');
      const claudeBeforeRulesAdd = existsFile(path.join(tempRoot, 'CLAUDE.md')) ? fs.readFileSync(path.join(tempRoot, 'CLAUDE.md'), 'utf8') : null;
      fs.writeFileSync(packageCheckRuleFile, '# Package Check Rule\n', 'utf8');
      const missingDescription = buildrSelf.spawn(['rules', 'add', 'missing-description', '--target', tempRoot], { cwd: root, encoding: 'utf8' });
      if (missingDescription.status === 0 || !missingDescription.stderr.includes('Missing required option: --description')) {
        problems.push('rules add must require a non-empty description.');
      }
      const missingRuleFile = buildrSelf.spawn(['rules', 'add', 'missing-rule-file', '--description', 'missing file', '--target', tempRoot], { cwd: root, encoding: 'utf8' });
      if (missingRuleFile.status === 0 || !missingRuleFile.stderr.includes('registers an existing root Rule file')) {
        problems.push('rules add must reject missing Rule source files.');
      }
      const projectRulesScope = buildrSelf.spawn(['rules', 'add', 'project-rule', '--scope', 'projects/demo', '--description', 'project scope', '--target', tempRoot], { cwd: root, encoding: 'utf8' });
      if (projectRulesScope.status === 0 || !projectRulesScope.stderr.includes('Project rules are maintained through projects/<project>/AGENTS.md')) {
        problems.push('rules add must reject Project scope usage with Project AGENTS.md guidance.');
      }
      buildrSelf.exec(['rules', 'add', 'package-check-rule', '--description', 'package check temporary rule', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      let packageCheckRules = parseRulesManifestYaml(fs.readFileSync(rulesManifestFile, 'utf8'));
      let packageCheckRule = packageCheckRules.rules.find((rule: any) => rule.id === 'package-check-rule');
      if (packageCheckRule?.path !== 'rules/package-check-rule.md' || packageCheckRule?.description !== 'package check temporary rule' || packageCheckRule?.source !== 'workspace') {
        problems.push('rules add must default to rules/<id>.md and register a workspace Rule with description.');
      }
      if (claudeBeforeRulesAdd !== null && fs.readFileSync(path.join(tempRoot, 'CLAUDE.md'), 'utf8') !== claudeBeforeRulesAdd) {
        problems.push('rules add must not write Agent runtime output.');
      }
      packageCheckRules.rules.push({ id: 'package-required-rule', source: 'buildr', path: 'rules/package-required-rule.md', description: 'required rule fixture', required: true, enabled: true, state: 'installed' });
      fs.writeFileSync(rulesManifestFile, renderRulesManifestYaml(packageCheckRules), 'utf8');
      const requiredRuleRemove = buildrSelf.spawn(['rules', 'remove', 'package-required-rule', '--target', tempRoot], { cwd: root, encoding: 'utf8' });
      if (requiredRuleRemove.status === 0 || !requiredRuleRemove.stderr.includes('Required Buildr Rule cannot be removed')) {
        problems.push('rules remove must protect required Buildr Rules.');
      }
      packageCheckRules.rules = packageCheckRules.rules.filter((rule: any) => rule.id !== 'package-required-rule');
      fs.writeFileSync(rulesManifestFile, renderRulesManifestYaml(packageCheckRules), 'utf8');
      buildrSelf.exec(['rules', 'remove', 'package-check-rule', '--keep-file', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      if (!existsFile(packageCheckRuleFile)) {
        problems.push('rules remove --keep-file must keep the Rule source file.');
      }
      packageCheckRules = parseRulesManifestYaml(fs.readFileSync(rulesManifestFile, 'utf8'));
      if (packageCheckRules.rules.some((rule: any) => rule.id === 'package-check-rule')) {
        problems.push('rules remove --keep-file must remove the manifest entry.');
      }
      const doctorAfterKeepRule = parseJsonOutput('doctor after rules remove --keep-file', buildrSelf.exec(['doctor', '--target', tempRoot, '--agent', 'codex', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
      if (!doctorAfterKeepRule.findings.some((finding: any) => finding.code === 'rules.unregistered' && finding.path === 'rules/package-check-rule.md')) {
        problems.push('doctor must report a Rule file kept by rules remove --keep-file as unregistered.');
      }
      buildrSelf.exec(['rules', 'add', 'package-check-rule', '--description', 'package check temporary rule', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      buildrSelf.exec(['rules', 'remove', 'package-check-rule', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      if (existsFile(packageCheckRuleFile)) {
        problems.push('rules remove must delete the Rule source file by default.');
      }
      packageCheckRules = parseRulesManifestYaml(fs.readFileSync(rulesManifestFile, 'utf8'));
      if (packageCheckRules.rules.some((rule: any) => rule.id === 'package-check-rule')) {
        problems.push('rules remove must remove the manifest entry.');
      }
    }
    if (kind === 'skills') {
      const packageCheckSkillSource = path.join(tempRoot, 'package-check-skill-source');
      ensureDirectory(path.join(packageCheckSkillSource, 'scripts'));
      fs.writeFileSync(path.join(packageCheckSkillSource, 'SKILL.md'), [
        '---',
        'name: package-check-skill',
        'description: package check temporary skill',
        '---',
        '',
        '# Package Check Skill',
        '',
      ].join('\n'));
      fs.writeFileSync(path.join(packageCheckSkillSource, 'scripts', 'run.sh'), 'echo package-check\n');
      buildrSelf.exec(['skills', 'add', '--source', packageCheckSkillSource, '--scope', '.', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      const packageCheckSkills = readSkillManifest(path.join(tempRoot, 'skills', 'manifest.yml'));
      const packageCheckSkill = packageCheckSkills.find((skill: any) => skill.id === 'package-check-skill');
      if (!packageCheckSkill || packageCheckSkill.description !== 'package check temporary skill') {
        problems.push('skills add must write manifest description for loaded Skill source.');
      }
      if (!existsFile(path.join(tempRoot, 'skills', 'package-check-skill', 'scripts', 'run.sh'))) {
        problems.push('skills add must load supported Skill source directories.');
      }
      if (existsDirectory(path.join(tempRoot, '.claude', 'skills', 'package-check-skill'))) {
        problems.push('skills add must not write Agent runtime output.');
      }
      buildrSelf.exec(['skills', 'remove', 'package-check-skill', '--scope', '.', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      if (existsDirectory(path.join(tempRoot, 'skills', 'package-check-skill'))) {
        problems.push('skills remove must delete the loaded Skill source directory.');
      }
      buildrSelf.exec(['skills', 'add', 'package-check-remote', '--remote-source', 'https://example.com/package-check-remote', '--description', 'remote info source', '--scope', '.', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      let remoteSkills = readSkillManifest(path.join(tempRoot, 'skills', 'manifest.yml'));
      let remoteSkill = remoteSkills.find((skill: any) => skill.id === 'package-check-remote');
      if (remoteSkill?.source?.kind !== 'url' || remoteSkill?.install?.mode !== 'agent') {
        problems.push('skills add --remote-source must write source.kind=url and install.mode=agent.');
      }
      buildrSelf.exec(['skills', 'add', 'package-check-remote', '--remote-source', 'https://example.com/package-check-remote', '--resolved-source', 'https://example.com/package-check-remote/SKILL.md', '--integrity', 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '--replace', '--scope', '.', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      remoteSkills = readSkillManifest(path.join(tempRoot, 'skills', 'manifest.yml'));
      remoteSkill = remoteSkills.find((skill: any) => skill.id === 'package-check-remote');
      if (remoteSkill?.resolved?.kind !== 'skill-url' || remoteSkill?.install?.mode !== 'buildr' || remoteSkill?.source?.url !== 'https://example.com/package-check-remote') {
        problems.push('skills add --resolved-source must preserve source and write resolved.kind=skill-url with install.mode=buildr.');
      }
      buildrSelf.exec(['skills', 'remove', 'package-check-remote', '--scope', '.', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    }
    if (finalize) {
      for (const rawEntry of manifest.workspaceFiles) {
        const entry = parseManifestFileEntry(rawEntry, 'workspaceFiles');
        if (!existsFile(path.join(tempRoot, entry.target))) {
        problems.push(`buildr init did not install workspace file: ${entry.target}`);
      }
    }
    const doctorJson = buildrSelf.exec(['doctor', '--target', tempRoot, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const doctorResult = parseJsonOutput('doctor final', doctorJson);
    if (!doctorResult.ok) {
      problems.push(`Temporary init doctor failed: ${JSON.stringify(doctorResult.summary)}`);
    }
    }
  }

  function verifyInitializedWorkspace(context: any, tempRoot: any): any  {
    const { root, problems, bootstrapContract, parseJsonOutput } = context;
    if (existsDirectory(path.join(tempRoot, 'practices'))) {
      problems.push('buildr init must not create the removed root practices/ baseline.');
    }
    if (!existsFile(path.join(tempRoot, 'projects', 'manifest.yml'))) {
      problems.push('buildr init did not install projects/manifest.yml.');
    } else {
      const initialProjects = parseProjectsYaml(fs.readFileSync(path.join(tempRoot, 'projects', 'manifest.yml'), 'utf8'));
      if (Object.keys(initialProjects.projects).length !== 0) {
        problems.push('Default projects/manifest.yml must start with an empty Project registry.');
      }
    }
    buildrSelf.exec(['project', 'create', 'demo', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    if (existsDirectory(path.join(tempRoot, 'projects', 'demo', 'practices'))) {
      problems.push('project create must not create the removed Project practices/ baseline.');
    }
    const projectsAfterCreate = parseProjectsYaml(fs.readFileSync(path.join(tempRoot, 'projects', 'manifest.yml'), 'utf8'));
    if (projectsAfterCreate.schemaVersion !== 'buildr.projects/v2'
      || !/^[0-9a-f-]{36}$/.test(projectsAfterCreate.projects.demo?.id || '')
      || projectsAfterCreate.projects.demo?.code !== 'demo'
      || projectsAfterCreate.projects.demo?.name !== 'demo'
      || projectsAfterCreate.projects.demo?.source?.type !== 'workspace'
      || projectsAfterCreate.projects.demo?.source?.path !== 'projects/demo') {
      problems.push('project create must register workspace-managed Project metadata in projects/manifest.yml.');
    }
    if (!existsFile(path.join(tempRoot, 'projects', 'demo', 'services', 'manifest.yml'))) {
      problems.push('project create must install services/manifest.yml.');
    }
    if (!existsFile(path.join(tempRoot, 'projects', 'demo', 'capabilities.yml')) || existsDirectory(path.join(tempRoot, 'projects', 'demo', 'skills'))) {
      problems.push('project create must install capabilities.yml without creating a legacy Project Skill source scope.');
    }
    const projectCommandsFile = path.join(tempRoot, 'projects', 'demo', 'commands.yml');
    if (!existsFile(projectCommandsFile)) {
      problems.push('project create must install commands.yml.');
    } else {
      const projectCommands = parseProjectCommandsYaml(fs.readFileSync(projectCommandsFile, 'utf8'), 'projects/demo/commands.yml');
      if (projectCommands?.schemaVersion !== 'buildr.project-commands/v1' || !Array.isArray(projectCommands.requirements)) {
        problems.push('Project commands.yml must use buildr.project-commands/v1 with a requirements array.');
      }
    }
    const legacyRootPractices = path.join(tempRoot, 'practices');
    const legacyProjectPractices = path.join(tempRoot, 'projects', 'demo', 'practices');
    ensureDirectory(legacyRootPractices);
    ensureDirectory(legacyProjectPractices);
    const rootPracticeSentinel = path.join(legacyRootPractices, 'keep-root.md');
    const projectPracticeSentinel = path.join(legacyProjectPractices, 'keep-project.md');
    fs.writeFileSync(rootPracticeSentinel, 'root legacy content\n', 'utf8');
    fs.writeFileSync(projectPracticeSentinel, 'project legacy content\n', 'utf8');
    buildrSelf.exec(['project', 'create', 'demo', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    buildrSelf.exec(['sync', 'codex', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    if (fs.readFileSync(rootPracticeSentinel, 'utf8') !== 'root legacy content\n'
      || fs.readFileSync(projectPracticeSentinel, 'utf8') !== 'project legacy content\n') {
      problems.push('sync and Project repair must preserve legacy practices/ content unchanged.');
    }
    const legacyPracticesDoctor = parseJsonOutput('doctor legacy practices', buildrSelf.exec(['doctor', '--target', tempRoot, '--agent', 'codex', '--json', '--include-info'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const legacyPracticeFindings = legacyPracticesDoctor.findings.filter((finding: any) => finding.code === 'practices.legacy_directory_present');
    if (legacyPracticeFindings.length !== 2
      || legacyPracticeFindings.some((finding: any) => finding.status !== 'info' || finding.userActionRequired !== false)
      || legacyPracticesDoctor.nextSteps.some((step: any) => step.code === 'practices.legacy_directory_present')) {
      problems.push('doctor --include-info must report root and Project legacy practices/ as non-actionable info only.');
    }
    buildrSelf.exec(['skill', 'install', 'claude-code', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
    const installedBuildrSkill = path.join(tempRoot, '.claude', 'skills', 'buildr', 'SKILL.md');
    if (!existsFile(installedBuildrSkill)) {
      problems.push('buildr skill install did not install Buildr Skill runtime.');
    } else {
      const installedContent = fs.readFileSync(installedBuildrSkill, 'utf8');
      for (const required of bootstrapContract?.generatedSkillRequiredText ?? []) {
        if (!installedContent.includes(required)) {
          problems.push(`Generated Buildr Skill required text ${JSON.stringify(required)} is missing.`);
        }
      }
      for (const forbidden of bootstrapContract?.generatedSkillForbiddenText ?? []) {
        if (forbidden && installedContent.includes(forbidden)) {
          problems.push(`Generated Buildr Skill forbidden text ${JSON.stringify(forbidden)} is present.`);
        }
      }
    }
    if (existsFile(path.join(tempRoot, 'ASSETS.md'))) {
      problems.push('buildr init generated ASSETS.md, but ASSETS.md is not part of the default root baseline.');
    }
    if (existsFile(path.join(tempRoot, 'skills', 'buildr', 'SKILL.md'))) {
      problems.push('buildr init copied product Agent Skill into workspace skills source.');
    }

  }

  function verifyExistingAgentsCompatibility(context: any): any  {
    const { root, problems } = context;
    const compatRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-check-existing-agents-'));
    try {
      const existingAgents = path.join(compatRoot, 'AGENTS.md');
      fs.writeFileSync(existingAgents, '# Existing root entry\n');
      buildrSelf.exec(['init', '--target', compatRoot, '--name', 'demo', '--profile', 'team'], { cwd: root, stdio: 'ignore' });
      const existingContent = fs.readFileSync(existingAgents, 'utf8');
      if (!existingContent.includes('# Existing root entry') || !existingContent.includes(BUILDR_REQUIRED_BLOCK_START) || !rootRequiredBlockStatus(compatRoot).valid) {
        problems.push('buildr init must preserve existing root AGENTS.md body and add only the Buildr required block.');
      }
      if (existsFile(path.join(compatRoot, 'AGENTS.workspace.md'))) {
        problems.push('buildr init must not write AGENTS.workspace.md for existing root AGENTS.md.');
      }
    } finally {
      fs.rmSync(compatRoot, { recursive: true, force: true });
    }
  }

  function verifyPackageSupportTools(context: any): any  {
    const { root, problems, files } = context;
    for (const relative of [
      'bin/buildr.mjs',
      'src/bootstrap/cli/main.ts',
      'src/agent-assets/application/package-maintenance/verification-registry.ts',
    ]) {
      const runtimeFile = path.join(root, relative);
      if (!existsFile(runtimeFile)) problems.push(`Package runtime support module is missing: ${relative}`);
      else files.push(runtimeFile);
    }
  }

  function runPackageWorkspaceSmoke(context: any): any  {
    const { root } = context;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-workspace-'));
    try {
      buildrSelf.exec(['init', '--target', tempRoot, '--name', 'demo', '--profile', 'team'], { cwd: root, stdio: 'ignore' });
      verifyInitializedWorkspace(context, tempRoot);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    verifyExistingAgentsCompatibility(context);
  }

  function runPackageDomainIntegration(context: any, kind: any): any  {
    const { root } = context;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-package-${kind}-`));
    try {
      buildrSelf.exec(['init', '--target', tempRoot, '--name', 'assets', '--profile', 'team'], { cwd: root, stdio: 'ignore' });
      buildrSelf.exec(['project', 'create', 'demo', '--target', tempRoot], { cwd: root, stdio: 'ignore' });
      verifyWorkspaceAssetLifecycle(context, tempRoot, kind);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  function runPackageRuntimeIntegration(context: any): any  {
    runPackageDomainIntegration(context, 'runtime');
    verifyRecursiveRules(context);
  }

  function runPackageAggregateSmoke(context: any): any  {
    const { root } = context;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-package-check-'));
    try {
      buildrSelf.exec(['init', '--target', tempRoot, '--name', 'demo', '--profile', 'team'], { cwd: root, stdio: 'ignore' });
      verifyInitializedWorkspace(context, tempRoot);
      for (const kind of ['runtime', 'commands', 'rules', 'skills']) {
        verifyWorkspaceAssetLifecycle(context, tempRoot, kind, kind === 'skills');
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    verifyRecursiveRules(context);
    verifyExistingAgentsCompatibility(context);
  }

  function validatePackageSupportTools(context: any): any  {
    verifyPackageSupportTools(context);
  }

  return {
    runPackageWorkspaceSmoke,
    runPackageDomainIntegration,
    runPackageRuntimeIntegration,
    runPackageAggregateSmoke,
    validatePackageSupportTools,
  };
}
