import process from 'node:process';
import { assertNoUnknownOptions, hasFlag, optionValue } from '../../../../infrastructure/cli-arguments.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../infrastructure/contracts/public-json.ts';

function humanValue(value: any) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function printHumanInstallation(item: any, label: any = item?.channel || 'unknown') {
  const identity = item?.identity;
  const runtime = item?.runtime;
  console.log(`${label}: channel=${humanValue(item?.channel)} status=${humanValue(item?.status)} path=${humanValue(item?.location)}`);
  console.log(`  identity: Buildr=${humanValue(identity?.version)} protocol=${humanValue(identity?.protocolIdentity)} payload=${humanValue(identity?.applicationPayloadDigest)} ownership=${humanValue(identity?.ownershipIdentity)}`);
  console.log(`  runtime: role=${humanValue(runtime?.role)} Node=${humanValue(runtime?.version)} executable=${humanValue(runtime?.executable)} identity=${humanValue(runtime?.identity)}`);
}

function printHumanInstance(instance: any) {
  const identity = instance?.identity;
  const runtime = identity?.runtime;
  console.log(`current instance: status=${humanValue(instance?.status)} readiness=${humanValue(instance?.observation?.health)} pid=${humanValue(identity?.pid)} url=${humanValue(identity?.url)}`);
  console.log(`  identity: channel=${humanValue(identity?.channel)} Buildr=${humanValue(identity?.version)} protocol=${humanValue(identity?.protocolIdentity)} payload=${humanValue(identity?.applicationPayloadDigest)} ownership=${humanValue(identity?.ownershipIdentity)}`);
  console.log(`  runtime: role=${humanValue(identity?.runtimeRole || runtime?.role)} Node=${humanValue(runtime?.version)} executable=${humanValue(runtime?.executable)} identity=${humanValue(runtime?.identity)}`);
}

async function runInstallationStatus(application: any, args: string[]) {
  assertNoUnknownOptions(args, new Set(['--json']), new Set(['--json']));
  const result: any = await application.installationStatus();
  if (args.includes('--json')) process.stdout.write(`${JSON.stringify({ schemaVersion: 'buildr.installation-status/v1', ...result }, null, 2)}\n`);
  else {
    for (const channel of ['npm', 'development']) printHumanInstallation(result.channels[channel]);
    console.log(`npm launcher: status=${humanValue(result.launcher?.status)} target=${humanValue(result.launcher?.target)} binding=${humanValue(result.launcher?.binding?.bindingIdentity)}`);
    printHumanInstallation(result.currentInstallation, 'current installation');
    for (const profile of ['released', 'development']) {
      console.log(`${profile} Web Data Root: ${result.instances[profile].dataRoot}`);
      printHumanInstance(result.instances[profile]);
    }
    printHumanInstance(result.currentInstance);
  }
  return result;
}


export function createInstallationCliContributions(application: any = null) {
  return Object.freeze([
    {
      key: 'installation status',
      surface: 'primary',
      summary: '分别报告 npm、development、本机 Launcher 与当前运行实例的可信身份。',
      help: [
        'Usage: buildr installation status [--json]',
        '',
        '只读取 embedded identity 与 ownership receipt；不会扫描 PATH 或按文件名猜测来源。',
      ],
      match: ({ domain, action }: any) => domain === 'installation' && action === 'status',
      run: (runtime: any, context: any) => runInstallationStatus(application || runtime, context.argv.slice(4)),
    },
    {
      key: 'update check',
      surface: 'primary',
      summary: '同时检查 GA 正式版与 RC 候选版；不读取 workspace。',
      help: [
        'Usage: buildr update check [--json]',
        '',
        '同时检查 latest 对应的 GA 正式版与 next 对应的 RC 候选版；不读取 workspace。',
      ],
      match: ({ domain, action }: any) => domain === 'update' && action === 'check',
      run: (runtime: any, context: any) => runUpdate(application || runtime, 'check', context.argv.slice(4)),
    },
    {
      key: 'update',
      surface: 'primary',
      summary: '更新 Buildr CLI 自身；npm installation 可显式选择 GA 或 RC。',
      help: [
        'Usage: buildr update [--track <stable|candidate>] [--json]',
        '',
        'npm installation 使用 --track stable 选择 GA 正式版，使用 --track candidate 选择 RC 候选版。',
        '省略 --track 时，当前 RC 跟随 candidate，当前正式版跟随 stable；不会自动切轨或降级。',
        '同步 workspace 请使用 buildr sync <agent> --target <dir>。',
      ],
      match: ({ domain }: any) => domain === 'update',
      run: (runtime: any, context: any) => runUpdate(application || runtime, 'update', context.argv.slice(3)),
    },
  ].map(Object.freeze));
}

function printPlan(plan: any, label: any) {
  if (plan.tracks && plan.current?.version) {
    console.log(`当前安装：${plan.current.version}`);
    const candidate = plan.tracks.candidate;
    const stable = plan.tracks.stable;
    const trackText = (track: any) => {
      if (track.status === 'update-available') return `${track.version} 可更新`;
      if (track.status === 'current') return `${track.version}（当前版本）`;
      if (track.status === 'behind-current') return `${track.version}（低于当前版本，不自动降级）`;
      if (track.status === 'not-published') return '尚未发布';
      return track.observedVersion ? `配置异常（${track.observedVersion}）` : '配置异常';
    };
    console.log(`RC 候选版：${trackText(candidate)}`);
    console.log(`GA 正式版：${trackText(stable)}`);
    for (const notice of plan.notices || []) if (!notice.command) console.log(`提示：${notice.message}`);
    for (const action of plan.nextActions || []) console.log(`下一步：${action}`);
    return;
  }
  console.log(`${label}: ${plan.status}`);
  console.log(`mode: ${plan.mode}`);
  if (plan.current?.version) console.log(`current: ${plan.current.version}`);
  if (plan.available?.version) console.log(`available: ${plan.available.version}`);
  if (plan.available?.releasedVersion) console.log(`released: ${plan.available.releasedVersion}`);
  if (plan.current?.branch) console.log(`branch: ${plan.current.branch}`);
  if (plan.current?.upstream) console.log(`upstream: ${plan.current.upstream}`);
  for (const reason of plan.blockingReasons) console.log(`blocked: ${reason}`);
  for (const action of plan.nextActions) console.log(`next: ${action}`);
}


function runUpdate(application: any, action: 'check' | 'update', args: string[]) {
  if (args.includes('--target')) throw new Error('buildr update 不接收 workspace --target；请使用 buildr sync <agent> --target <dir> 同步 workspace。');
  assertNoUnknownOptions(args, new Set(action === 'check' ? ['--json'] : ['--json', '--track']), new Set(['--json']));
  const track = action === 'update' ? optionValue(args, '--track', null) : null;
  if (track !== null && !['stable', 'candidate'].includes(track)) throw new Error('--track must be stable or candidate.');
  const result = action === 'check' ? application.updateCheck() : application.updateBuildr({ track });
  if (hasFlag(args, '--json')) process.stdout.write(`${JSON.stringify(withJsonSchema(action === 'check' ? PUBLIC_JSON_SCHEMAS.updateCheck : PUBLIC_JSON_SCHEMAS.update, result), null, 2)}\n`);
  else printPlan(result, action === 'check' ? 'Buildr CLI update check' : 'Buildr CLI update');
  if (result.status === 'blocked') process.exitCode = 1;
  return result;
}
