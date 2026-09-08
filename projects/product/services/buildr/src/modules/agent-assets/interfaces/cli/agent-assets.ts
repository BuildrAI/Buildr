import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../infrastructure/contracts/public-json.ts';
import { assertNoUnknownOptions, hasFlag, optionValue, optionValueRaw, positionalArgs } from '../../../../infrastructure/cli-arguments.ts';

function repeatedOptionValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values.push(value);
    index += 1;
  }
  return values;
}

function parseVersionArgs(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) throw new Error('--version-args must be a JSON array of strings or a comma-separated string.');
    return parsed;
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function printCommandsMutationReceipt(receipt: any) {
  console.log(`已${receipt.action}命令行工具清单条目：${receipt.id}`);
  console.log('已更新 Buildr 源资产：');
  for (const file of receipt.updatedPaths) console.log(`  ${path.relative(receipt.targetRoot, file).split(path.sep).join('/')}`);
  console.log('下一步：');
  console.log(`  ${receipt.nextAction}`);
}

function runCommandsAdd(application: any, args: string[]) {
  const allowed = new Set(['--target', '--collection', '--purpose', '--executable', '--name', '--description', '--version-constraint', '--version-args', '--install-hint', '--installHint', '--replace']);
  assertNoUnknownOptions(args, allowed, new Set(['--replace']));
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing command id');
  const versionConstraint = optionValue(args, '--version-constraint', null);
  const versionArgs = parseVersionArgs(optionValueRaw(args, '--version-args', null));
  const receipt = application.commandsAdd({
    id,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    collection: optionValue(args, '--collection', null),
    purpose: optionValue(args, '--purpose', null),
    executable: optionValue(args, '--executable', id),
    name: optionValue(args, '--name', null),
    description: optionValue(args, '--description', null),
    installHint: optionValue(args, '--install-hint', optionValue(args, '--installHint', null)),
    versionConstraint,
    versionArgs,
    replace: hasFlag(args, '--replace'),
  });
  printCommandsMutationReceipt(receipt);
  return receipt;
}

function runCommandsRemove(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--target', '--collection']));
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing command id');
  const receipt = application.commandsRemove({ id, targetRoot: path.resolve(optionValue(args, '--target', process.cwd())), collection: optionValue(args, '--collection', null) });
  printCommandsMutationReceipt(receipt);
  return receipt;
}

function printCommandsCheckReport(result: any) {
  console.log(`Buildr commands check for ${result.targetRoot}`);
  console.log(`Status: ok=${result.summary.ok} warning=${result.summary.warning} error=${result.summary.error}`);
  for (const manifest of result.manifests) console.log(`Manifest: ${manifest.path} exists=${manifest.exists} valid=${manifest.valid}`);
  if (result.manifests.length === 0) console.log(`Manifest: ${result.manifest.path} exists=${result.manifest.exists} valid=${result.manifest.valid}`);
  for (const command of result.commands) {
    console.log(`[${command.status}] ${command.id} (${command.executable}) [${command.sources.join(', ')}] - ${command.message}`);
    if (command.installHint && command.status !== 'ok') console.log(`  安装提示：${command.installHint}`);
  }
  for (const finding of result.findings) {
    console.log(`[${finding.status}] ${finding.code} - ${finding.message}`);
    if (finding.suggestion) console.log(`  建议：${finding.suggestion}`);
  }
}

function runCommandsCheck(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--target', '--project', '--json']), new Set(['--json']));
  const json = hasFlag(args, '--json');
  const result = application.commandsCheck({ targetRoot: path.resolve(optionValue(args, '--target', process.cwd())), projects: repeatedOptionValues(args, '--project') });
  if (json) process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.commandsCheck, result), null, 2)}\n`);
  else printCommandsCheckReport(result);
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

function printRulesMutationReceipt(receipt: any) {
  console.log(`已${receipt.action}规则资产：${receipt.id}`);
  console.log('已更新 Buildr 源资产：');
  for (const file of receipt.updatedPaths) console.log(`  ${path.relative(receipt.targetRoot, file).split(path.sep).join('/')}`);
  console.log('下一步：');
  console.log(`  ${receipt.nextAction}`);
}

function runRulesAdd(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--target', '--scope', '--path', '--description', '--replace']), new Set(['--replace']));
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing rule id');
  const receipt = application.rulesAdd({
    id,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    scope: optionValue(args, '--scope', '.'),
    path: optionValue(args, '--path', `rules/${id}.md`),
    description: optionValue(args, '--description', null),
    replace: hasFlag(args, '--replace'),
  });
  printRulesMutationReceipt(receipt);
  return receipt;
}

function runRulesRemove(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--target', '--scope', '--keep-file']), new Set(['--keep-file']));
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing rule id');
  const receipt = application.rulesRemove({
    id,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    scope: optionValue(args, '--scope', '.'),
    keepFile: hasFlag(args, '--keep-file'),
  });
  printRulesMutationReceipt(receipt);
  return receipt;
}

function runComponentListOrCheck(application: any, args: string[], checkOnlyOne: boolean) {
  assertNoUnknownOptions(args, new Set(['--target', '--json', '--scope']), new Set(['--json']));
  const [id] = positionalArgs(args);
  if (!checkOnlyOne && id) throw new Error('component list does not accept a Component id.');
  const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
  const result = application.componentListOrCheck({ targetRoot, scope: optionValue(args, '--scope', '.'), id, checkOnlyOne });
  if (hasFlag(args, '--json')) {
    const schema = checkOnlyOne ? PUBLIC_JSON_SCHEMAS.componentCheck : PUBLIC_JSON_SCHEMAS.componentList;
    console.log(JSON.stringify(withJsonSchema(schema, { ...result, ownership: undefined }), null, 2));
  } else {
    console.log(`Buildr Components for ${targetRoot}`);
    for (const item of result.components) console.log(`[${item.status}] ${item.id} source=${item.source} expected=${item.expectedState} installed=${item.installedVersion || '-'} available=${item.availableVersion || '-'}`);
    for (const finding of result.findings) console.log(`[${finding.status}] ${finding.code} ${finding.member || finding.message || ''}`);
  }
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

function parseComponentMutation(args: string[], operation: 'install' | 'uninstall') {
  const allowed = new Set(['--target', '--agent', '--scope', ...(operation === 'uninstall' ? ['--reason'] : [])]);
  assertNoUnknownOptions(args, allowed);
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing Component id.');
  const agent = optionValue(args, '--agent', null);
  if (!agent) throw new Error('Missing required option: --agent');
  return {
    id,
    agent,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    scope: optionValue(args, '--scope', '.'),
    reason: optionValue(args, '--reason', null),
  };
}

function printComponentMutation(result: any) {
  console.log(`已${result.operation === 'install' ? '安装' : '卸载'} Component：${result.id}`);
  for (const file of result.changed) console.log(`  ${file}`);
  for (const file of result.renderedFiles) console.log(`  ${path.relative(result.targetRoot, file).split(path.sep).join('/')}`);
  console.log('doctor 通过。');
}

function runComponentMutation(application: any, args: string[], operation: 'install' | 'uninstall') {
  const input = parseComponentMutation(args, operation);
  const result = operation === 'install' ? application.componentInstall(input) : application.componentUninstall(input);
  printComponentMutation(result);
  return result;
}

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.push(value);
    index += 1;
  }
  return values;
}

function printCapabilityImpacts(receipt: any) {
  if (!receipt.impacts?.length) return;
  console.log('Capability dependency impact（写入前）：');
  for (const impact of receipt.impacts) {
    const next = impact.mode === 'required' ? 'blocked' : 'degraded';
    console.log(`  [${impact.mode}] ${impact.scope}:${impact.consumer} -> ${impact.capability}@${impact.version}; 写入后可能 ${next}`);
  }
}

function printSkillsMutationReceipt(receipt: any) {
  printCapabilityImpacts(receipt);
  if (receipt.deprecatedScope) console.error('Warning: --scope . is deprecated; workspace is now the only Skill source authority. Omit --scope.');
  console.log(`已${receipt.action} ${receipt.assetLabel}：${receipt.id}`);
  console.log('已更新 Buildr 源资产：');
  for (const file of receipt.updatedPaths) console.log(`  ${path.relative(receipt.targetRoot, file).split(path.sep).join('/')}`);
  if (receipt.skippedEntries.length) {
    console.log('未装载的顶层内容：');
    for (const entry of receipt.skippedEntries) console.log(`  ${entry}`);
  }
  console.log('下一步：');
  console.log(`  ${receipt.nextAction}`);
}

function runMutationDoctor(runtime: any, targetRoot: string, scope: string | null, options: Record<string, unknown> = {}) {
  const previousExitCode = process.exitCode;
  runtime.doctor(scope ? ['--target', targetRoot, '--scope', scope, '--json'] : ['--target', targetRoot, '--json'], options);
  process.exitCode = previousExitCode;
}

function runSkillsAdd(application: any, args: string[]) {
  const allowed = new Set(['--target', '--scope', '--source', '--remote-source', '--source-kind', '--resolved-source', '--resolved-kind', '--version', '--integrity', '--description', '--replace', '--ignore-unsupported', '--provides', '--requires']);
  assertNoUnknownOptions(args, allowed, new Set(['--replace', '--ignore-unsupported']));
  const [explicitId] = positionalArgs(args, new Set(['--replace', '--ignore-unsupported']));
  const receipt = application.skillsAdd({
    explicitId,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    scopeInput: optionValue(args, '--scope', null),
    sourceInput: optionValue(args, '--source', null),
    remoteSourceInput: optionValue(args, '--remote-source', null),
    sourceKindInput: optionValue(args, '--source-kind', 'url'),
    resolvedSourceInput: optionValue(args, '--resolved-source', null),
    resolvedKindInput: optionValue(args, '--resolved-kind', 'skill-url'),
    versionInput: optionValue(args, '--version', null),
    integrityInput: optionValue(args, '--integrity', null),
    descriptionInput: optionValue(args, '--description', null),
    replace: hasFlag(args, '--replace'),
    ignoreUnsupported: hasFlag(args, '--ignore-unsupported'),
    provides: optionValues(args, '--provides'),
    requires: optionValues(args, '--requires'),
  });
  runMutationDoctor(application, receipt.targetRoot, optionValue(args, '--scope', null), { skipRuntime: Boolean(optionValue(args, '--resolved-source', null)) });
  printSkillsMutationReceipt(receipt);
  return receipt;
}

function runSkillsRemove(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--target', '--scope']));
  const [id] = positionalArgs(args);
  if (!id) throw new Error('Missing skill id');
  const receipt = application.skillsRemove({ id, targetRoot: path.resolve(optionValue(args, '--target', process.cwd())), scopeInput: optionValue(args, '--scope', null) });
  runMutationDoctor(application, receipt.targetRoot, optionValue(args, '--scope', null));
  printSkillsMutationReceipt(receipt);
  return receipt;
}

function runSkillsBinding(application: any, args: string[], remove: boolean) {
  assertNoUnknownOptions(args, remove ? new Set(['--target', '--scope']) : new Set(['--target', '--scope', '--provider']));
  const [rawCapability] = positionalArgs(args);
  if (!rawCapability) throw new Error('Missing capability identity.');
  const provider = remove ? null : optionValue(args, '--provider', null);
  if (!remove && !provider) throw new Error('Missing required option: --provider');
  const result = (remove ? application.skillsUnbind : application.skillsBind)({
    rawCapability,
    provider,
    targetRoot: path.resolve(optionValue(args, '--target', process.cwd())),
    scopeInput: optionValue(args, '--scope', '.'),
  });
  runMutationDoctor(application, result.targetRoot, result.scope);
  printCapabilityImpacts(result);
  console.log(`${remove ? '已删除' : '已写入'} capability binding：${rawCapability}${remove ? '' : ` -> ${provider}`} (${result.scope})`);
  return result;
}

function route({ key, surface = 'primary', summary, usage, details = [], match, run, requiresAgent = false }: any): any  {
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

function runScopedRender(runtime: any, context: any): any  {
  const adapter = runtime.getRuntimeAdapter(context.runtimeId);
  const renderer = context.domain === 'skills'
    ? (args: any) => runtime.renderSkillsRuntime(context.runtimeId, args)
    : context.domain === 'rules' && adapter.renderCapabilities['rules-entry'].writesFiles
      ? (args: any) => runtime.renderRulesRuntime(context.runtimeId, args)
      : null;
  if (!renderer) { runtime.usage(); process.exit(2); }
  const command = runtime.withResolvedTarget(context.args);
  const result = renderer(command.args);
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

export function createAgentAssetsCliContributions(): any  {
  return Object.freeze([
    route({
      key: 'package check', surface: 'maintenance',
      summary: '供 Buildr 产品维护者检查产品包发布边界和基础行为；不是 workspace onboarding 必需步骤。',
      usage: 'Usage: buildr package check',
      match: ({ domain, action }: any) => domain === 'package' && action === 'check',
      run: (runtime: any) => {
        const entry = path.join(runtime.productRoot(), 'tools/verification/package-check.ts');
        if (!fs.existsSync(entry)) throw new Error('package check requires the Buildr development checkout.');
        return execFileSync(process.execPath, [entry], {
          stdio: 'inherit',
          env: { ...process.env, BUILDR_NPM_ENTRY_PATH: process.env.BUILDR_NPM_ENTRY_PATH || path.join(runtime.productRoot(), 'bin/buildr.mjs') },
        });
      },
    }),
    route({
      key: 'package build', surface: 'maintenance',
      summary: '供 Buildr 产品维护者构建产品包文件；不是 workspace onboarding 必需步骤。',
      usage: 'Usage: buildr package build [--out <dir>]',
      match: ({ domain, action }: any) => domain === 'package' && action === 'build',
      run: (runtime: any, context: any) => runtime.packageBuild(context.argv.slice(4)),
    }),
    route({
      key: 'runtime list',
      summary: '列出 Buildr 支持的 Agent runtime adapter；不要求当前目录是 Buildr workspace。',
      usage: 'Usage: buildr runtime list [--json]',
      match: ({ domain, action }: any) => domain === 'runtime' && action === 'list',
      run: (runtime: any, context: any) => runtime.runtimeList(context.argv.slice(4)),
    }),
    route({
      key: 'commands check',
      summary: '不传 --project 时只检查 workspace defaults；重复 --project 可表达跨 Project task context。',
      usage: 'Usage: buildr commands check [--project <project> ...] [--target <dir>] [--json]',
      details: [
        'Project requirements 维护在 projects/<project>/commands.yml，只允许 id、required、version 和 purpose 引用字段。',
        '输出分离 catalog、requirements、effectiveConstraints、observations 和 findings；Buildr 不 render 或安装 Commands。',
      ],
      match: ({ domain, action }: any) => domain === 'commands' && action === 'check',
      run: (runtime: any, context: any) => runCommandsCheck(runtime, context.argv.slice(4)),
    }),
    route({
      key: 'commands add',
      summary: '新增或替换 workspace Command catalog definition；不会修改 Project requirements 或安装 binary。',
      usage: 'Usage: buildr commands add <id> --purpose <text> [--target <dir>] [--collection <path>] [--executable <name>] [--name <text>] [--description <text>] [--version-constraint <constraint>] [--version-args <args>] [--install-hint <text>] [--replace]',
      match: ({ domain, action }: any) => domain === 'commands' && action === 'add',
      run: (runtime: any, context: any) => runCommandsAdd(runtime, context.argv.slice(4)),
    }),
    route({
      key: 'commands remove',
      summary: '删除 workspace Command catalog definition；最后一个 definition 仍被 workspace default 或 Project requirement 引用时整次零写入。',
      usage: 'Usage: buildr commands remove <id> [--target <dir>] [--collection <path>]',
      match: ({ domain, action }: any) => domain === 'commands' && action === 'remove',
      run: (runtime: any, context: any) => runCommandsRemove(runtime, context.argv.slice(4)),
    }),
    ...[
      ['component list', '列出 workspace Components。当前不支持 Project 或 Service scope。', 'Usage: buildr component list [--target <dir>] [--json]', (runtime: any, context: any) => runComponentListOrCheck(runtime, context.argv.slice(4), false)],
      ['component check', '检查 Component definition、成员 integrity 和唯一所有权。', 'Usage: buildr component check [<id>] [--target <dir>] [--json]', (runtime: any, context: any) => runComponentListOrCheck(runtime, context.argv.slice(4), true)],
      ['component install', '安装 workspace Component，reconcile 指定 Agent runtime，并运行 doctor。', 'Usage: buildr component install <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>]', (runtime: any, context: any) => runComponentMutation(runtime, context.argv.slice(4), 'install')],
      ['component uninstall', '卸载 workspace Component 及其受管源资产；不会卸载外部 CLI，也不会删除 Project 内容。', 'Usage: buildr component uninstall <id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--target <dir>] [--reason <text>]', (runtime: any, context: any) => runComponentMutation(runtime, context.argv.slice(4), 'uninstall')],
    ].map(([key, summary, usage, run]: any) => route({ key, summary, usage, match: ({ domain, action }: any) => domain === 'component' && action === key.split(' ')[1], run })),
    ...[
      ['rules add', '注册已存在的 root Rule 文件到 rules/manifest.yml。未传 --path 时默认使用 rules/<id>.md。', 'Usage: buildr rules add <id> [--path <rules/file.md>] --description <text> [--target <dir>] [--replace]', (runtime: any, context: any) => runRulesAdd(runtime, context.argv.slice(4))],
      ['rules remove', '删除 root Rule 登记和规则文件。传入 --keep-file 时只取消注册并保留文件。', 'Usage: buildr rules remove <id> [--target <dir>] [--keep-file]', (runtime: any, context: any) => runRulesRemove(runtime, context.argv.slice(4))],
    ].map(([key, summary, usage, run]: any) => route({ key, summary, usage, match: ({ domain, action }: any) => domain === 'rules' && action === key.split(' ')[1], run })),
    ...[
      ['builtin list', '列出 Buildr 内置能力状态。', 'Usage: buildr builtin list [--target <dir>] [--json]', (runtime: any, context: any) => runtime.builtinList(context.argv.slice(4)), []],
      ['builtin uninstall', '卸载 optional Buildr 内置能力。required 内置能力不能卸载。', 'Usage: buildr builtin uninstall <id> --target <dir> [--reason <text>]', (runtime: any, context: any) => runtime.builtinUninstall(context.argv.slice(4)), []],
      ['builtin restore', '恢复 optional Buildr 内置能力；该命令表示明确放弃此 Builtin 的本地修改。', 'Usage: buildr builtin restore <id> --target <dir>', (runtime: any, context: any) => runtime.builtinRestore(context.argv.slice(4)), ['当当前 Builtin 声明 predecessor 时，只接管 manifest 可证明为 Buildr-managed 的旧 identity；随后运行 sync 收敛 Agent runtime。']],
    ].map(([key, summary, usage, run, details]: any) => route({ key, summary, usage, details, match: ({ domain, action }: any) => domain === 'builtin' && action === key.split(' ')[1], run })),
    route({
      key: 'render', surface: 'agent-machine',
      summary: '组合渲染 rules entry 和 workspace Skills 到 workspace destination；仅显式传入 --product-skill 时同时投射产品入口 Buildr Skill。不会同步 workspace 源资产或迁移 Structured Store。',
      usage: 'Usage: buildr render <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>] [--product-skill]',
      match: ({ domain }: any) => domain === 'render',
      run: (runtime: any, context: any) => {
        const args = context.argv.slice(4);
        const { targetRoot, files, rulesActions, warnings } = runtime.renderRuntime(context.action, args, { productSkill: args.includes('--product-skill') });
        for (const warning of warnings) console.error(`Warning: ${warning}`);
        const ruleTargets: any = new Set(rulesActions.map((item: any) => item.targetFile));
        for (const item of rulesActions) console.log(`[${item.action}] ${runtime.toPosixRelative(targetRoot, item.targetFile)}`);
        for (const file of files) if (!ruleTargets.has(file)) console.log(runtime.toPosixRelative(targetRoot, file));
      },
    }),
    route({
      key: 'sync',
      summary: '同步 Buildr 产品能力，安装产品入口 Buildr Skill，并准备当前 Agent 的 workspace 入口 runtime。不是 Project scope 同步工具。',
      usage: 'Usage: buildr sync <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir> [--scope <scope>]',
      match: ({ domain }: any) => domain === 'sync',
      run: (runtime: any, context: any) => runtime.syncRuntime(context.action, context.argv.slice(4)),
    }),
    route({
      key: 'skills add',
      summary: '只维护 workspace Skills 源资产；Project 使用 capabilities.yml 引用 workspace Skill。',
      usage: [
        'Usage: buildr skills add [<id>] --source <skill-dir> [--target <workspace>] [--replace] [--ignore-unsupported] [--provides <capability>@<version>] [--requires <capability>@<version>:<required|optional>]',
        'Usage: buildr skills add <id> --remote-source <url> [--target <workspace>] [--source-kind <kind>] [--description <text>] [--replace]',
        'Usage: buildr skills add <id> --resolved-source <url> [--target <workspace>] [--resolved-kind <kind>] [--remote-source <url>] [--source-kind <kind>] [--version <version>] [--integrity <hash>] [--description <text>] [--replace]',
      ],
      match: ({ domain, action }: any) => domain === 'skills' && action === 'add',
      run: (runtime: any, context: any) => runSkillsAdd(runtime, context.argv.slice(4)),
    }),
    ...[
      ['skills remove', '删除 workspace Skills 源资产登记。', 'Usage: buildr skills remove <id> [--target <workspace>]', (runtime: any, context: any) => runSkillsRemove(runtime, context.argv.slice(4))],
      ['skills bind', '显式选择当前 scope 的 capability provider；不会安装 Skill 或证明其行为正确。', 'Usage: buildr skills bind <capability>@<version> --provider <skill-id> --scope <.|projects/project> [--target <dir>]', (runtime: any, context: any) => runSkillsBinding(runtime, context.argv.slice(4), false)],
      ['skills unbind', '删除当前 scope 的显式 binding，由 resolver 重新判断唯一 provider、歧义或缺失。', 'Usage: buildr skills unbind <capability>@<version> --scope <.|projects/project> [--target <dir>]', (runtime: any, context: any) => runSkillsBinding(runtime, context.argv.slice(4), true)],
    ].map(([key, summary, usage, run]: any) => route({ key, summary, usage, match: ({ domain, action }: any) => domain === 'skills' && action === key.split(' ')[1], run })),
    route({
      key: 'skill install', surface: 'agent-machine', requiresAgent: true,
      summary: '只安装或修复产品入口 Buildr Skill。',
      usage: 'Usage: buildr skill install <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <dir>',
      match: ({ domain, action }: any) => domain === 'skill' && action === 'install',
      run: (runtime: any, context: any) => {
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
      match: ({ domain, action }: any) => domain === 'runtime' && action === 'check',
      run: (runtime: any, context: any) => {
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
      match: ({ domain, action }: any) => domain === 'skills' && action === 'render',
      run: runScopedRender,
    }),
    route({
      key: 'rules render', surface: 'agent-machine', requiresAgent: true,
      summary: '递归发现 canonical workspace scope 的祖先链和子树，并按 adapter reconcile rules bridge 或 vendor rule files。原生消费 AGENTS.md 的 adapter 不执行 rules render。',
      usage: 'Usage: buildr rules render <claude-code|cursor|qoder|trae|trae-work|workbuddy> --scope <.|projects/project[/services/service[/path...]]> --target <dir>',
      match: ({ domain, action }: any) => domain === 'rules' && action === 'render',
      run: runScopedRender,
    }),
  ]);
}
