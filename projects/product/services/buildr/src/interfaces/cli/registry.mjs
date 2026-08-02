import process from 'node:process';
import { createRuntime } from '../../application/compose-runtime.mjs';
import { registerCommandHelp } from './help.mjs';
import { isVersionRequest, printVersion } from './identity.mjs';
import { printCliError } from './diagnostics.mjs';
import { registerLocalWorkspaceAppInterface } from '../local-app/http/server.mjs';
import { registerLauncherInterface } from './launcher.mjs';
import { taskRecordCommand } from './task-record.mjs';
import { taskReviewCommand } from './task-review.mjs';
import { taskEnvironmentCommand } from './task-environment.mjs';
import { gitWorktreeCommand } from './git-worktree.mjs';

export const COMMAND_REGISTRY = [
  { key: 'init', match: ({ domain }) => domain === 'init', run: (r, c) => r.initBuildr(c.argv.slice(3)) },
  { key: 'app launcher install', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'launcher' && runtimeId === 'install', run: (r, c) => r.manageLocalAppLauncher('install', c.argv.slice(5)) },
  { key: 'app launcher status', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'launcher' && runtimeId === 'status', run: (r, c) => r.manageLocalAppLauncher('status', c.argv.slice(5)) },
  { key: 'app launcher uninstall', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'launcher' && runtimeId === 'uninstall', run: (r, c) => r.manageLocalAppLauncher('uninstall', c.argv.slice(5)) },
  { key: 'app preview start', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'preview' && runtimeId === 'start', run: (r, c) => r.manageLocalAppPreview('start', c.argv.slice(5)) },
  { key: 'app preview list', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'preview' && runtimeId === 'list', run: (r, c) => r.manageLocalAppPreview('list', c.argv.slice(5)) },
  { key: 'app preview stop', match: ({ domain, action, runtimeId }) => domain === 'app' && action === 'preview' && runtimeId === 'stop', run: (r, c) => r.manageLocalAppPreview('stop', c.argv.slice(5)) },
  { key: 'app', match: ({ domain }) => domain === 'app', run: (r, c) => r.startLocalWorkspaceApp(c.argv.slice(3)) },
  { key: 'bootstrap guide', match: ({ domain, action }) => domain === 'bootstrap' && action === 'guide', run: (r) => r.bootstrapGuide() },
  { key: 'package check', match: ({ domain, action }) => domain === 'package' && action === 'check', run: (r) => r.packageCheck() },
  { key: 'package build', match: ({ domain, action }) => domain === 'package' && action === 'build', run: (r, c) => r.packageBuild(c.argv.slice(4)) },
  { key: 'project create', match: ({ domain, action }) => domain === 'project' && action === 'create', run: (r, c) => r.createProject(c.argv.slice(4)) },
  { key: 'service create', match: ({ domain, action }) => domain === 'service' && action === 'create', run: (r, c) => r.createService(c.argv.slice(4)) },
  { key: 'worktree create', match: ({ domain, action }) => domain === 'worktree' && action === 'create', run: (r, c) => gitWorktreeCommand(r, 'create', c.argv.slice(4)) },
  { key: 'worktree cleanup', match: ({ domain, action }) => domain === 'worktree' && action === 'cleanup', run: (r, c) => gitWorktreeCommand(r, 'cleanup', c.argv.slice(4)) },
  { key: 'worktree inspect', match: ({ domain, action }) => domain === 'worktree' && action === 'inspect', run: (r, c) => gitWorktreeCommand(r, 'inspect', c.argv.slice(4)) },
  { key: 'verification run', match: ({ domain, action }) => domain === 'verification' && action === 'run', run: (r, c) => r.verificationRun(c.argv.slice(4)) },
  { key: 'verification cleanup', match: ({ domain, action }) => domain === 'verification' && action === 'cleanup', run: (r, c) => r.verificationCleanup(c.argv.slice(4)) },
  { key: 'task create', match: ({ domain, action }) => domain === 'task' && action === 'create', run: (r, c) => taskRecordCommand(r, 'create', c.argv.slice(4)) },
  { key: 'task inspect', match: ({ domain, action }) => domain === 'task' && action === 'inspect', run: (r, c) => taskRecordCommand(r, 'inspect', c.argv.slice(4)) },
  { key: 'task update', match: ({ domain, action }) => domain === 'task' && action === 'update', run: (r, c) => taskRecordCommand(r, 'update', c.argv.slice(4)) },
  { key: 'task complete', match: ({ domain, action }) => domain === 'task' && action === 'complete', run: (r, c) => taskRecordCommand(r, 'complete', c.argv.slice(4)) },
  { key: 'task abandon', match: ({ domain, action }) => domain === 'task' && action === 'abandon', run: (r, c) => taskRecordCommand(r, 'abandon', c.argv.slice(4)) },
  { key: 'task review inspect', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'inspect', run: (r, c) => taskReviewCommand(r, 'inspect', c.argv.slice(5)) },
  { key: 'task review record', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'record', run: (r, c) => taskReviewCommand(r, 'record', c.argv.slice(5)) },
  { key: 'task environment prepare', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'prepare', run: (r, c) => taskEnvironmentCommand(r, 'prepare', c.argv.slice(5)) },
  { key: 'task environment inspect', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'inspect', run: (r, c) => taskEnvironmentCommand(r, 'inspect', c.argv.slice(5)) },
  { key: 'task environment cleanup', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'cleanup', run: (r, c) => taskEnvironmentCommand(r, 'cleanup', c.argv.slice(5)) },
  { key: 'task finish inspect', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'inspect', run: (r, c) => r.taskFinish('inspect', c.argv.slice(5)) },
  { key: 'task finish run', match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'run', run: (r, c) => r.taskFinish('run', c.argv.slice(5)) },
  { key: 'doctor', match: ({ domain }) => domain === 'doctor', run: (r, c) => r.doctor(c.argv.slice(3)) },
  { key: 'mutation recover', match: ({ domain, action }) => domain === 'mutation' && action === 'recover', run: (r, c) => r.mutationRecover(c.argv.slice(4)) },
  { key: 'runtime list', match: ({ domain, action }) => domain === 'runtime' && action === 'list', run: (r, c) => r.runtimeList(c.argv.slice(4)) },
  { key: 'commands check', match: ({ domain, action }) => domain === 'commands' && action === 'check', run: (r, c) => r.commandsCheck(c.argv.slice(4)) },
  { key: 'commands add', match: ({ domain, action }) => domain === 'commands' && action === 'add', run: (r, c) => r.commandsAdd(c.argv.slice(4)) },
  { key: 'commands remove', match: ({ domain, action }) => domain === 'commands' && action === 'remove', run: (r, c) => r.commandsRemove(c.argv.slice(4)) },
  { key: 'openspec baseline create', match: ({ domain, action, runtimeId }) => domain === 'openspec' && action === 'baseline' && runtimeId === 'create', run: (r, c) => r.openspecBaselineCreate(c.argv.slice(5)) },
  { key: 'openspec check', match: ({ domain, action }) => domain === 'openspec' && action === 'check', run: (r, c) => r.openspecCheck(c.argv.slice(4)) },
  { key: 'openspec sync-plan', match: ({ domain, action }) => domain === 'openspec' && action === 'sync-plan', run: (r, c) => r.openspecSyncPlan(c.argv.slice(4)) },
  { key: 'openspec sync-apply', match: ({ domain, action }) => domain === 'openspec' && action === 'sync-apply', run: (r, c) => r.openspecSyncApply(c.argv.slice(4)) },
  { key: 'openspec converge', match: ({ domain, action }) => domain === 'openspec' && action === 'converge', run: (r, c) => r.openspecConverge(c.argv.slice(4)) },
  { key: 'openspec audit', match: ({ domain, action }) => domain === 'openspec' && action === 'audit', run: (r, c) => r.openspecAudit(c.argv.slice(4)) },
  { key: 'component list', match: ({ domain, action }) => domain === 'component' && action === 'list', run: (r, c) => r.componentListOrCheck(c.argv.slice(4), false) },
  { key: 'component check', match: ({ domain, action }) => domain === 'component' && action === 'check', run: (r, c) => r.componentListOrCheck(c.argv.slice(4), true) },
  { key: 'component install', match: ({ domain, action }) => domain === 'component' && action === 'install', run: (r, c) => r.componentInstall(c.argv.slice(4)) },
  { key: 'component uninstall', match: ({ domain, action }) => domain === 'component' && action === 'uninstall', run: (r, c) => r.componentUninstall(c.argv.slice(4)) },
  { key: 'rules add', match: ({ domain, action }) => domain === 'rules' && action === 'add', run: (r, c) => r.rulesAdd(c.argv.slice(4)) },
  { key: 'rules remove', match: ({ domain, action }) => domain === 'rules' && action === 'remove', run: (r, c) => r.rulesRemove(c.argv.slice(4)) },
  { key: 'builtin list', match: ({ domain, action }) => domain === 'builtin' && action === 'list', run: (r, c) => r.builtinList(c.argv.slice(4)) },
  { key: 'builtin uninstall', match: ({ domain, action }) => domain === 'builtin' && action === 'uninstall', run: (r, c) => r.builtinUninstall(c.argv.slice(4)) },
  { key: 'builtin restore', match: ({ domain, action }) => domain === 'builtin' && action === 'restore', run: (r, c) => r.builtinRestore(c.argv.slice(4)) },
  { key: 'update check', match: ({ domain, action }) => domain === 'update' && action === 'check', run: (r, c) => r.updateCheck(c.argv.slice(4)) },
  { key: 'update', match: ({ domain }) => domain === 'update', run: (r, c) => r.updateBuildr(c.argv.slice(3)) },
  { key: 'render', match: ({ domain }) => domain === 'render', run: (r, c) => {
    const { targetRoot, files, rulesActions, warnings } = r.renderRuntime(c.action, c.argv.slice(4));
    for (const warning of warnings) console.error(`Warning: ${warning}`);
    const ruleTargets = new Set(rulesActions.map((item) => item.targetFile));
    for (const item of rulesActions) console.log(`[${item.action}] ${r.toPosixRelative(targetRoot, item.targetFile)}`);
    for (const file of files) if (!ruleTargets.has(file)) console.log(r.toPosixRelative(targetRoot, file));
  } },
  { key: 'sync', match: ({ domain }) => domain === 'sync', run: (r, c) => r.syncRuntime(c.action, c.argv.slice(4)) },
  { key: 'skills add', match: ({ domain, action }) => domain === 'skills' && action === 'add', run: (r, c) => r.skillsAdd(c.argv.slice(4)) },
  { key: 'skills remove', match: ({ domain, action }) => domain === 'skills' && action === 'remove', run: (r, c) => r.skillsRemove(c.argv.slice(4)) },
  { key: 'skills bind', match: ({ domain, action }) => domain === 'skills' && action === 'bind', run: (r, c) => r.skillsBind(c.argv.slice(4)) },
  { key: 'skills unbind', match: ({ domain, action }) => domain === 'skills' && action === 'unbind', run: (r, c) => r.skillsUnbind(c.argv.slice(4)) },
  { key: 'skills migrate-project-assets', match: ({ domain, action }) => domain === 'skills' && action === 'migrate-project-assets', run: (r, c) => r.skillsMigrateProjectAssets(c.argv.slice(4)) },
  { key: 'skill install', requiresAgent: true, match: ({ domain, action }) => domain === 'skill' && action === 'install', run: (r, c) => {
    const command = r.withResolvedTarget(c.args);
    const adapter = r.getRuntimeAdapter(c.runtimeId);
    const { targetRoot, files } = r.installProductRuntimeSkill(adapter.id, command.args, { repoRoot: command.targetRoot, command: `buildr skill install ${c.runtimeId}` });
    for (const file of files) console.log(r.path.relative(targetRoot, file).split(r.path.sep).join('/'));
  } },
  { key: 'runtime check', requiresAgent: true, match: ({ domain, action }) => domain === 'runtime' && action === 'check', run: (r, c) => {
    const command = r.withResolvedTarget(c.args);
    const adapter = r.getRuntimeAdapter(c.runtimeId);
    const checker = r.runtimeImplementation(adapter, 'checker', r.RUNTIME_CHECKERS);
    const printer = r.runtimeImplementation(adapter, 'checker', r.RUNTIME_CHECK_PRINTERS);
    const result = checker(command.args, { repoRoot: command.targetRoot, adapterId: adapter.id, command: `buildr runtime check ${c.runtimeId}` });
    printer(result); process.exit(result.exitCode);
  } },
  { key: 'skills render', requiresAgent: true, match: ({ domain, action }) => domain === 'skills' && action === 'render', run: (r, c) => runScopedRender(r, c) },
  { key: 'rules render', requiresAgent: true, match: ({ domain, action }) => domain === 'rules' && action === 'render', run: (r, c) => runScopedRender(r, c) },
];

function runScopedRender(r, context) {
  const adapter = r.getRuntimeAdapter(context.runtimeId);
  const renderer = context.domain === 'skills'
    ? (args) => r.renderSkillsRuntime(context.runtimeId, args)
    : context.domain === 'rules' && adapter.renderCapabilities['rules-entry'].writesFiles
      ? (args) => r.renderRulesRuntime(context.runtimeId, args)
      : null;
  if (!renderer) { r.usage(); process.exit(2); }
  const command = r.withResolvedTarget(context.args);
  const result = renderer(command.args, { repoRoot: command.targetRoot, command: `buildr ${context.domain} render ${context.runtimeId}` });
  const { targetRoot, files } = result;
  for (const warning of result.warnings || []) console.error(`Warning: ${warning}`);
  if (result.jsonReported) return;
  if (context.domain === 'skills' && files.length === 0) {
    const scope = r.optionValue(command.args, '--scope');
    console.log('No workspace Skills declared.');
    return;
  }
  if (context.domain === 'rules' && result.actions) {
    for (const item of result.actions) console.log(`[${item.action}] ${r.toPosixRelative(targetRoot, item.targetFile)}`);
    return;
  }
  for (const file of files) console.log(r.toPosixRelative(targetRoot, file));
}

export function dispatch(argv = process.argv) {
  const runtime = createRuntime();
  registerLocalWorkspaceAppInterface(runtime);
  registerLauncherInterface(runtime);
  registerCommandHelp(runtime);
  const rawArgs = argv.slice(2);
  const commandCandidates = ['version', 'help', ...COMMAND_REGISTRY.map((item) => item.key)];
  if (isVersionRequest(rawArgs)) { printVersion(rawArgs); return; }
  if (runtime.isHelpRequest(rawArgs)) {
    const helpArgs = rawArgs[0] === 'help' ? rawArgs.slice(1) : rawArgs;
    if (runtime.printHelp(helpArgs)) return;
    process.exit(printCliError(rawArgs, { candidates: commandCandidates, helpTopic: rawArgs[0] === 'help' }));
  }
  const [domain, action, runtimeId, ...args] = rawArgs;
  const context = { argv, rawArgs, domain, action, runtimeId, args };
  const direct = COMMAND_REGISTRY.find((item) => !item.requiresAgent && item.match(context));
  if (direct) return direct.run(runtime, context);
  if (!runtime.isSupportedAgent(runtimeId)) {
    process.exit(printCliError(rawArgs, { candidates: commandCandidates }));
  }
  const agent = COMMAND_REGISTRY.find((item) => item.requiresAgent && item.match(context));
  if (agent) return agent.run(runtime, context);
  process.exit(printCliError(rawArgs, { candidates: commandCandidates }));
}
