import { registerArtifactApplication } from './application/artifact-application.ts';
import { registerArtifactDiscovery } from './infrastructure/artifact-discovery.ts';
import { registerArtifactRepository } from './persistence/artifact-repository.ts';
import { artifactCommand } from './interfaces/cli/artifact-cli.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_TASK_SUPPORT } from '../workspace/module.ts';

export const ARTIFACT_LIFECYCLE_MODULE_ID = 'artifact-lifecycle';
export const ARTIFACT_LIFECYCLE_APPLICATION = 'artifact-lifecycle.application';

const ARTIFACT_METHODS = Object.freeze([
  'registerArtifact', 'listArtifacts', 'artifactStatus', 'releaseArtifact', 'cleanArtifacts',
]);

function pick(source: Record<string, unknown>, methods: readonly string[]) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, Reflect.get(source, method)])));
}

export function createArtifactLifecycleModule(runtime: Record<string, unknown>) {
  return Object.freeze({
    id: ARTIFACT_LIFECYCLE_MODULE_ID,
    requires: Object.freeze([WORKSPACE_TASK_SUPPORT, WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION]),
    create(requires: Record<string, Record<string, unknown>>) {
      const composition = Object.create(runtime);
      Object.assign(composition, requires[WORKSPACE_TASK_SUPPORT], requires[WORKSPACE_APPLICATION], requires[TASK_QUERY_APPLICATION]);
      registerArtifactRepository(composition);
      registerArtifactDiscovery(composition);
      registerArtifactApplication(composition);
      const application = pick(composition, ARTIFACT_METHODS);
      return Object.freeze({
        provides: { [ARTIFACT_LIFECYCLE_APPLICATION]: application },
        contributions: { cli: createArtifactLifecycleCliContributions(application) },
      });
    },
  });
}

export function createArtifactLifecycleCliContributions(application: any = null) {
  const descriptor = (key: string, summary: string, help: string[], match: (input: any) => boolean, action: string) => Object.freeze({
    key, surface: 'agent-machine', summary, help,
    match,
    run: (runtime: any, context: any) => artifactCommand(application || runtime, action as any, context.argv.slice(4)),
  });
  return Object.freeze([
    descriptor('artifact register',
      '在工作区登记一条产物记录：归属任务、用途、处置策略与保留引用；以已观察 recordDigest 条件更新，不静默覆盖。',
      [
        'Usage: buildr artifact register <path> --purpose <text> --disposition <ephemeral|retained|evidence> [--task <task-id>] [--by <registrant>] [--retain-reason <text>] [--reference <text> ...] [--reference-check <workspace-path> ...] [--expected-record <absent|sha256-digest>] [--target <canonical-workspace>] [--json]',
        '',
        '为工作区内真实存在的路径建立 .buildr/local/artifacts/ 下的产物记录；retained 必须同时提供 --retain-reason 与 --reference。',
        '登记是描述性可选动作：不移动目标、不形成门禁；更新既有记录需提交当前 recordDigest。',
      ],
      ({ domain, action }: any) => domain === 'artifact' && action === 'register', 'register'),
    descriptor('artifact list',
      '枚举已登记产物与 scratch 根内未登记对象，逐项给出路径、大小、归属任务状态与即时计算的处置状态。',
      [
        'Usage: buildr artifact list [--task <task-id>] [--state <state>] [--target <canonical-workspace>] [--json]',
        '',
        '处置状态由当前事实即时计算：active、retained、retained-stale、expired、released、unattributed、missing；.buildr/local 证据类目录仅作观察。',
      ],
      ({ domain, action }: any) => domain === 'artifact' && action === 'list', 'list'),
    descriptor('artifact status',
      '汇总产物总量、各处置状态计数、可清扫项、失效 retained 与未归属对象及登记健康诊断。',
      [
        'Usage: buildr artifact status [--target <canonical-workspace>] [--json]',
        '',
        '只读汇总：核验 retained 引用、列出 cleanable 候选与 unattributed 对象；不执行删除，不形成统一就绪结论。',
      ],
      ({ domain, action }: any) => domain === 'artifact' && action === 'status', 'status'),
    descriptor('artifact release',
      '以当前 recordDigest 显式释放一条产物登记：标记 released 并记录原因，删除仍须由 artifact clean --execute 执行。',
      [
        'Usage: buildr artifact release <artifact-id|path> --reason <text> --expected-record <sha256-digest> [--target <canonical-workspace>] [--json]',
        '',
        '把 retained/ephemeral 登记显式标记为 released；不删除目标。释放后由 artifact clean --execute 核验并删除。',
      ],
      ({ domain, action }: any) => domain === 'artifact' && action === 'release', 'release'),
    descriptor('artifact clean',
      '默认 dry-run 输出逐项处置计划；--execute 只删除复核后仍为 expired/released 的项，逐项失败隔离。',
      [
        'Usage: buildr artifact clean [--execute] [--target <canonical-workspace>] [--json]',
        '',
        '计划逐项说明路径、大小、归属与依据；--execute 删除前重新核验记录版本、归属任务终态与路径身份。',
        'retained、evidence、unattributed、missing 与其他所有者管理的目标永不进入删除集，逐项报告保留原因。',
      ],
      ({ domain, action }: any) => domain === 'artifact' && action === 'clean', 'clean'),
  ]);
}
