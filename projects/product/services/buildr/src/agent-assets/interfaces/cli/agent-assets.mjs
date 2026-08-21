import process from 'node:process';

function route({ key, surface = 'primary', summary, usage, details = [], match, run, requiresAgent = false }) {
  const usages = Array.isArray(usage) ? usage : [usage];
  return Object.freeze({
    key,
    surface,
    summary,
    help: Object.freeze([...usages, '', summary, ...details]),
    match,
    run,
    ...(requiresAgent ? { requiresAgent: true } : {}),
  });
}

function runScopedRender(runtime, context) {
  const adapter = runtime.getRuntimeAdapter(context.runtimeId);
  const renderer = context.domain === 'skills'
    ? (args) => runtime.renderSkillsRuntime(context.runtimeId, args)
    : context.domain === 'rules' && adapter.renderCapabilities['rules-entry'].writesFiles
      ? (args) => runtime.renderRulesRuntime(context.runtimeId, args)
      : null;
  if (!renderer) { runtime.usage(); process.exit(2); }
  const command = runtime.withResolvedTarget(context.args);
  const result = renderer(command.args, { repoRoot: command.targetRoot, command: `buildr ${context.domain} render ${context.runtimeId}` });
  const { targetRoot, files } = result;
  for (const warning of result.warnings || []) console.error(`Warning: ${warning}`);
  if (result.jsonReported) return;
  if (context.domain === 'skills' && files.length === 0) {
    runtime.optionValue(command.args, '--scope');
    console.log('No workspace Skills declared.');
    return;
  }
  if (context.domain === 'rules' && result.actions) {
    for (const item of result.actions) console.log(`[${item.action}] ${runtime.toPosixRelative(targetRoot, item.targetFile)}`);
    return;
  }
  for (const file of files) console.log(runtime.toPosixRelative(targetRoot, file));
}

export function createAgentAssetsCliContributions() {
  return Object.freeze([
    route({
      key: 'package check', surface: 'maintenance',
      summary: '供 Buildr 产品维护者检查产品包发布边界和基础行为；不是 workspace onboarding 必需步骤。',
      usage: 'Usage: buildr package check',
      match: ({ domain, action }) => domain === 'package' && action === 'check',
      run: (runtime) => runtime.packageCheck(),
    }),
    route({
      key: 'package build', surface: 'maintenance',
      summary: '供 Buildr 产品维护者构建产品包文件；不是 workspace onboarding 必需步骤。',
      usage: 'Usage: buildr package build [--out <dir>]',
      match: ({ domain, action }) => domain === 'package' && action === 'build',
      run: (runtime, context) => runtime.packageBuild(context.argv.slice(4)),
    }),
    route({
      key: 'runtime list',
      summary: '列出 Buildr 支持的 Agent runtime adapter；不要求当前目录是 Buildr workspace。',
      usage: 'Usage: buildr runtime list [--json]',
      match: ({ domain, action }) => domain === 'runtime' && action === 'list',
      run: (runtime, context) => runtime.runtimeList(context.argv.slice(4)),
    }),
    route({
      key: 'commands check',
      summary: '不传 --project 时只检查 workspace defaults；重复 --project 可表达跨 Project task context。',
      usage: 'Usage: buildr commands check [--project <project> ...] [--target <dir>] [--json]',
      details: [
        'Project requirements 维护在 projects/<project>/commands.yml，只允许 id、required、version 和 purpose 引用字段。',
        '输出分离 catalog、requirements、effectiveConstraints、observations 和 findings；Buildr 不 render 或安装 Commands。',
      ],
      match: ({ domain, action }) => domain === 'commands' && action === 'check',
      run: (runtime, context) => runtime.commandsCheck(context.argv.slice(4)),
    }),
    route({
      key: 'commands add',
      summary: '新增或替换 workspace Command catalog definition；不会修改 Project requirements 或安装 binary。',
      usage: 'Usage: buildr commands add <id> --purpose <text> [--target <dir>] [--collection <path>] [--executable <name>] [--name <text>] [--description <text>] [--version-constraint <constraint>] [--version-args <args>] [--install-hint <text>] [--replace]',
      match: ({ domain, action }) => domain === 'commands' && action === 'add',
      run: (runtime, context) => runtime.commandsAdd(context.argv.slice(4)),
    }),
    route({
      key: 'commands remove',
      summary: '删除 workspace Command catalog definition；最后一个 definition 仍被 workspace default 或 Project requirement 引用时整次零写入。',
      usage: 'Usage: buildr commands remove <id> [--target <dir>] [--collection <path>]',
      match: ({ domain, action }) => domain === 'commands' && action === 'remove',
      run: (runtime, context) => runtime.commandsRemove(context.argv.slice(4)),
    }),
    ...[
      ['component list', '列出 workspace Components。当前不支持 Project 或 Service scope。', 'Usage: buildr component list [--target <dir>] [--json]', (runtime, context) => runtime.componentListOrCheck(context.argv.slice(4), false)],
      ['component check', '检查 Component definition、成员 integrity 和唯一所有权。', 'Usage: buildr component check [<id>] [--target <dir>] [--json]', (runtime, context) => runtime.componentListOrCheck(context.argv.slice(4), true)],
      ['component install', '安装 workspace Component，reconcile 指定 Agent runtime，并运行 doctor。', 'Usage: buildr component install <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>]', (runtime, context) => runtime.componentInstall(context.argv.slice(4))],
      ['component uninstall', '卸载 workspace Component 及其受管源资产；不会卸载外部 CLI，也不会删除 Project 内容。', 'Usage: buildr component uninstall <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>] [--reason <text>]', (runtime, context) => runtime.componentUninstall(context.argv.slice(4))],
    ].map(([key, summary, usage, run]) => route({ key, summary, usage, match: ({ domain, action }) => domain === 'component' && action === key.split(' ')[1], run })),
    ...[
      ['rules add', '注册已存在的 root Rule 文件到 rules/manifest.yml。未传 --path 时默认使用 rules/<id>.md。', 'Usage: buildr rules add <id> [--path <rules/file.md>] --description <text> [--target <dir>] [--replace]', (runtime, context) => runtime.rulesAdd(context.argv.slice(4))],
      ['rules remove', '删除 root Rule 登记和规则文件。传入 --keep-file 时只取消注册并保留文件。', 'Usage: buildr rules remove <id> [--target <dir>] [--keep-file]', (runtime, context) => runtime.rulesRemove(context.argv.slice(4))],
    ].map(([key, summary, usage, run]) => route({ key, summary, usage, match: ({ domain, action }) => domain === 'rules' && action === key.split(' ')[1], run })),
    ...[
      ['builtin list', '列出 Buildr 内置能力状态。', 'Usage: buildr builtin list [--target <dir>] [--json]', (runtime, context) => runtime.builtinList(context.argv.slice(4)), []],
      ['builtin uninstall', '卸载 optional Buildr 内置能力。required 内置能力不能卸载。', 'Usage: buildr builtin uninstall <id> --target <dir> [--reason <text>]', (runtime, context) => runtime.builtinUninstall(context.argv.slice(4)), []],
      ['builtin restore', '恢复 optional Buildr 内置能力；该命令表示明确放弃此 Builtin 的本地修改。', 'Usage: buildr builtin restore <id> --target <dir>', (runtime, context) => runtime.builtinRestore(context.argv.slice(4)), ['当当前 Builtin 声明 predecessor 时，只接管 manifest 可证明为 Buildr-managed 的旧 identity；随后运行 sync 收敛 Agent runtime。']],
    ].map(([key, summary, usage, run, details]) => route({ key, summary, usage, details, match: ({ domain, action }) => domain === 'builtin' && action === key.split(' ')[1], run })),
    route({
      key: 'render', surface: 'agent-machine',
      summary: '组合渲染 rules entry 和 workspace Skills 到 workspace destination；不安装产品入口 Buildr Skill。',
      usage: 'Usage: buildr render <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>]',
      match: ({ domain }) => domain === 'render',
      run: (runtime, context) => {
        const { targetRoot, files, rulesActions, warnings } = runtime.renderRuntime(context.action, context.argv.slice(4));
        for (const warning of warnings) console.error(`Warning: ${warning}`);
        const ruleTargets = new Set(rulesActions.map((item) => item.targetFile));
        for (const item of rulesActions) console.log(`[${item.action}] ${runtime.toPosixRelative(targetRoot, item.targetFile)}`);
        for (const file of files) if (!ruleTargets.has(file)) console.log(runtime.toPosixRelative(targetRoot, file));
      },
    }),
    route({
      key: 'sync',
      summary: '同步 Buildr 产品能力，安装产品入口 Buildr Skill，并准备当前 Agent 的 workspace 入口 runtime。不是 Project scope 同步工具。',
      usage: 'Usage: buildr sync <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>]',
      match: ({ domain }) => domain === 'sync',
      run: (runtime, context) => runtime.syncRuntime(context.action, context.argv.slice(4)),
    }),
    route({
      key: 'skills add',
      summary: '只维护 workspace Skills 源资产；Project 使用 capabilities.yml 引用 workspace Skill。',
      usage: [
        'Usage: buildr skills add [<id>] --source <skill-dir> [--target <workspace>] [--replace] [--ignore-unsupported] [--provides <capability>@<version>] [--requires <capability>@<version>:<required|optional>]',
        'Usage: buildr skills add <id> --remote-source <url> [--target <workspace>] [--source-kind <kind>] [--description <text>] [--replace]',
        'Usage: buildr skills add <id> --resolved-source <url> [--target <workspace>] [--resolved-kind <kind>] [--remote-source <url>] [--source-kind <kind>] [--version <version>] [--integrity <hash>] [--description <text>] [--replace]',
      ],
      match: ({ domain, action }) => domain === 'skills' && action === 'add',
      run: (runtime, context) => runtime.skillsAdd(context.argv.slice(4)),
    }),
    ...[
      ['skills remove', '删除 workspace Skills 源资产登记。', 'Usage: buildr skills remove <id> [--target <workspace>]', (runtime, context) => runtime.skillsRemove(context.argv.slice(4))],
      ['skills bind', '显式选择当前 scope 的 capability provider；不会安装 Skill 或证明其行为正确。', 'Usage: buildr skills bind <capability>@<version> --provider <skill-id> --scope <.|projects/project> [--target <dir>]', (runtime, context) => runtime.skillsBind(context.argv.slice(4))],
      ['skills unbind', '删除当前 scope 的显式 binding，由 resolver 重新判断唯一 provider、歧义或缺失。', 'Usage: buildr skills unbind <capability>@<version> --scope <.|projects/project> [--target <dir>]', (runtime, context) => runtime.skillsUnbind(context.argv.slice(4))],
    ].map(([key, summary, usage, run]) => route({ key, summary, usage, match: ({ domain, action }) => domain === 'skills' && action === key.split(' ')[1], run })),
    route({
      key: 'skill install', surface: 'agent-machine', requiresAgent: true,
      summary: '只安装或修复产品入口 Buildr Skill。',
      usage: 'Usage: buildr skill install <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir>',
      match: ({ domain, action }) => domain === 'skill' && action === 'install',
      run: (runtime, context) => {
        const command = runtime.withResolvedTarget(context.args);
        const adapter = runtime.getRuntimeAdapter(context.runtimeId);
        const { targetRoot, files } = runtime.installProductRuntimeSkill(adapter.id, command.args, { repoRoot: command.targetRoot, command: `buildr skill install ${context.runtimeId}` });
        for (const file of files) console.log(runtime.path.relative(targetRoot, file).split(runtime.path.sep).join('/'));
      },
    }),
    route({
      key: 'runtime check', surface: 'agent-machine', requiresAgent: true,
      summary: '专项检查某个 Agent runtime render 状态。',
      usage: 'Usage: buildr runtime check <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --scope <.|projects/project[/services/service[/path...]]> --target <dir>',
      match: ({ domain, action }) => domain === 'runtime' && action === 'check',
      run: (runtime, context) => {
        const command = runtime.withResolvedTarget(context.args);
        const adapter = runtime.getRuntimeAdapter(context.runtimeId);
        const checker = runtime.runtimeImplementation(adapter, 'checker', runtime.RUNTIME_CHECKERS);
        const printer = runtime.runtimeImplementation(adapter, 'checker', runtime.RUNTIME_CHECK_PRINTERS);
        const result = checker(command.args, { repoRoot: command.targetRoot, adapterId: adapter.id, command: `buildr runtime check ${context.runtimeId}` });
        printer(result);
        process.exit(result.exitCode);
      },
    }),
    route({
      key: 'skills render', surface: 'agent-machine', requiresAgent: true,
      summary: '--target 始终是 Skill source workspace；workspace destination 写当前工作目录 runtime，user destination 写当前 Agent 用户层。默认 workspace。',
      usage: 'Usage: buildr skills render <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--destination workspace|user] --target <workspace> [--json]',
      match: ({ domain, action }) => domain === 'skills' && action === 'render',
      run: runScopedRender,
    }),
    route({
      key: 'rules render', surface: 'agent-machine', requiresAgent: true,
      summary: '递归发现 canonical workspace scope 的祖先链和子树，并按 adapter reconcile rules bridge 或 vendor rule files。原生消费 AGENTS.md 的 adapter 不执行 rules render。',
      usage: 'Usage: buildr rules render <claude-code|cursor|qoder|trae|trae-work|workbuddy> --scope <.|projects/project[/services/service[/path...]]> --target <dir>',
      match: ({ domain, action }) => domain === 'rules' && action === 'render',
      run: runScopedRender,
    }),
  ]);
}
