import { inspectChangeChecklist, parseChangeChecklistText } from './application/change-checklist.ts';
import { registerOpenSpecApplication } from './application/openspec-application.ts';
import { PROJECT_APPLICATION } from '../../workspace/module.ts';

export const OPENSPEC_MODULE_ID = 'openspec';
export const OPENSPEC_APPLICATION = 'openspec.application';
export const OPENSPEC_QUERY = 'openspec.query';

const APPLICATION_METHODS = Object.freeze([
  'normalizeOpenSpecContractText', 'openSpecContractHash', 'openSpecContractChangePath',
  'resolveOpenSpecContractProject', 'openSpecContractComponent', 'parseOpenSpecRequirementBlocks',
  'openSpecSection', 'parseOpenSpecDeltaSpec', 'parseOpenSpecChangeDelta',
  'readOpenSpecCanonicalRequirements', 'parseOpenSpecProposalCapabilities',
  'readOpenSpecContractJson', 'writeOpenSpecContractJson', 'createOpenSpecContractResult',
  'addOpenSpecContractFinding', 'listActiveOpenSpecChangeRoots', 'openSpecDeltaIdentities',
  'detectOpenSpecActiveConflicts', 'openSpecContractContext', 'openSpecExecutableIdentity',
  'observeOpenSpecCanonicalProject', 'openSpecConvergencePlanningInputs',
  'openspecConverge', 'openspecConvergencePreflight', 'openspecConvergenceInspect',
]);

function methodPort(source: any, methods: any) {
  return Object.freeze(Object.fromEntries(methods.map((method: any) => [method, (...args: any[]) => source[method](...args)])));
}

function invoke(application: any, method: any, args: any) {
  return (application || args.runtime)[method](args.argv);
}

export function createOpenSpecCliContributions(application: any = null) {
  return Object.freeze([
    Object.freeze({
      key: 'openspec converge', surface: 'maintenance',
      summary: '产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。',
      help: [
        'Usage: buildr openspec converge <change> --project <project> [--target <actual-work-root>] [--json]',
        '',
        '--target 使用Agent已核对的当前Workspace或matching Worktree真实根；不会自动搜索或选择其他worktree。',
        '产品内部完成确定性规划、隔离 strict validation、条件式原子应用、写后确认和 archive --skip-specs。',
      ],
      match: ({ domain, action }: any) => domain === 'openspec' && action === 'converge',
      run: (runtime: any, context: any) => invoke(application, 'openspecConverge', { runtime, argv: context.argv.slice(4) }),
    }),
    Object.freeze({
      key: 'openspec convergence preflight', surface: 'maintenance',
      summary: '只读检查Change能否按当前delta、canonical、active Changes与executable形成唯一且strict有效的收敛计划。',
      help: [
        'Usage: buildr openspec convergence preflight <change> --project <project> [--target <actual-work-root>] [--json]',
        '',
        '--target 使用Agent已核对的当前Workspace或matching Worktree真实根；不会自动搜索或选择其他worktree。',
        '只读检查当前语义就绪性；不会写canonical、Receipt或archive。ready会在delta、canonical、active Changes或executable变化后失效，最终converge始终重新检查。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'openspec' && action === 'convergence' && runtimeId === 'preflight',
      run: (runtime: any, context: any) => invoke(application, 'openspecConvergencePreflight', { runtime, argv: context.argv.slice(5) }),
    }),
    Object.freeze({
      key: 'openspec convergence inspect', surface: 'maintenance',
      summary: '只读检查未终结收敛事务的 before/expected 与当前实际摘要；未开始或已归档时不适用。',
      help: [
        'Usage: buildr openspec convergence inspect <change> --project <project> [--target <dir>] [--json]',
        '',
        '只读检查当前事务 Receipt；不会写 canonical、Receipt 或 archive，也不用于归档后的长期审计。',
      ],
      match: ({ domain, action, runtimeId }: any) => domain === 'openspec' && action === 'convergence' && runtimeId === 'inspect',
      run: (runtime: any, context: any) => invoke(application, 'openspecConvergenceInspect', { runtime, argv: context.argv.slice(5) }),
    }),
  ]);
}

export function createOpenSpecModule(runtime: any) {
  return Object.freeze({
    id: OPENSPEC_MODULE_ID,
    requires: Object.freeze([PROJECT_APPLICATION]),
    create(requires: any) {
      registerOpenSpecApplication(runtime, { projectQuery: requires[PROJECT_APPLICATION] });
      const application = methodPort(runtime, APPLICATION_METHODS);
      const query = Object.freeze({
        inspectChangeChecklist,
        parseChangeChecklistText,
      });
      return Object.freeze({
        provides: {
          [OPENSPEC_APPLICATION]: application,
          [OPENSPEC_QUERY]: query,
        },
        contributions: {
          cli: createOpenSpecCliContributions(application),
        },
      });
    },
  });
}
