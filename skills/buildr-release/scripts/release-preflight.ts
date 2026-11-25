#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { collectThirdParty } from '../../../projects/product/services/buildr-harness/tools/collect-third-party.ts';
import { inspectDistributionEvidence } from '../../../projects/product/services/buildr-harness/src/distribution-evidence.ts';
import type { DistributionDecision } from '../../../projects/product/services/buildr-harness/src/distribution.ts';
import { extractReleaseNotes } from './release-notes.ts';
import { parseAdmissions } from './harness-release-admission.ts';

export const RELEASE_PREFLIGHT_SCHEMA = 'buildr.release-preflight/v1';
export type PreflightTarget = 'buildr' | 'harness' | 'dsh-buildr-harness' | 'dsh-buildr';

export interface ReleasePreflightCheck {
  id: string;
  target: string;
  status: 'passed' | 'action-required' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

export interface ReleasePreflightOptions {
  repo?: string;
  targets: string[];
  buildrVersion?: string;
  harnessVersion?: string;
  pluginVersion?: string;
  devPluginVersion?: string;
}

export interface ReleasePreflightResult {
  schemaVersion: typeof RELEASE_PREFLIGHT_SCHEMA;
  status: 'ready' | 'action-required';
  repo: string;
  targets: PreflightTarget[];
  checks: ReleasePreflightCheck[];
}

const VALID_TARGETS = new Set<PreflightTarget>(['buildr', 'harness', 'dsh-buildr-harness', 'dsh-buildr']);

export function releasePreflightUsage(): string {
  return [
    'Usage: release-preflight.ts [--repo <workspace-root>] --targets <buildr,harness,dsh-buildr-harness,dsh-buildr> [--buildr-version <v>] [--harness-version <v>] [--plugin-version <v>] [--dev-plugin-version <v>]',
    '',
    'Read-only pre-worktree release preflight:',
    '  - Verifies package.json / package-lock.json alignment & CHANGELOG section for buildr',
    '  - Verifies third-party distribution-decisions.json coverage into a clean temporary directory',
    '  - Verifies platform-support.json publicationApproval for requested versions',
    '  - Parses harness-release-admissions.json and reports current admission status',
  ].join('\n');
}

export function parseReleasePreflightArgs(argv: string[]): { help: boolean; options: ReleasePreflightOptions } {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, options: { targets: [] } };
  }
  const options: ReleasePreflightOptions = { targets: ['buildr'] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${flag ?? '<missing>'}`);
    }
    if (flag === '--repo') options.repo = path.resolve(value);
    else if (flag === '--targets') options.targets = value.split(',').map(item => item.trim()).filter(Boolean);
    else if (flag === '--buildr-version') options.buildrVersion = value;
    else if (flag === '--harness-version') options.harnessVersion = value;
    else if (flag === '--plugin-version') options.pluginVersion = value;
    else if (flag === '--dev-plugin-version') options.devPluginVersion = value;
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  return { help: false, options };
}

function normalizeTargets(input: string[]): PreflightTarget[] {
  if (input.length === 0) throw new Error('At least one target is required.');
  const result: PreflightTarget[] = [];
  for (const item of input) {
    if (!VALID_TARGETS.has(item as PreflightTarget)) {
      throw new Error(`Unsupported release preflight target: ${item}`);
    }
    if (!result.includes(item as PreflightTarget)) result.push(item as PreflightTarget);
  }
  return result;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkThirdPartyCoverage(
  tmpRoot: string,
  subdir: string,
  packageRoots: string[],
  decisionsFile: string,
  target: PreflightTarget,
): ReleasePreflightCheck {
  const missingNodeModules = packageRoots.filter(root => !fs.existsSync(path.join(root, 'node_modules')));
  if (missingNodeModules.length > 0) {
    return {
      id: `${target}-third-party-decisions`,
      target,
      status: 'action-required',
      message: `缺少已安装依赖目录，无法扫描第三方许可闭环：${missingNodeModules.join(', ')}`,
    };
  }
  const outDir = path.join(tmpRoot, subdir);
  try {
    const collected = collectThirdParty(outDir, packageRoots);
    const decisions = (readJson(decisionsFile).decisions ?? []) as DistributionDecision[];
    const inspection = inspectDistributionEvidence(outDir, decisions);
    if (inspection.status !== 'eligible') {
      return {
        id: `${target}-third-party-decisions`,
        target,
        status: 'action-required',
        message: `${target} 第三方发行许可未闭环（${inspection.findings.length} 项）`,
        details: { findings: inspection.findings },
      };
    }
    return {
      id: `${target}-third-party-decisions`,
      target,
      status: 'passed',
      message: `${target} 第三方发行许可检查通过（${collected.components.length} 个组件已全部决策并附证据）。`,
      details: { components: collected.components.length },
    };
  } catch (error: unknown) {
    return {
      id: `${target}-third-party-decisions`,
      target,
      status: 'action-required',
      message: `${target} 第三方发行检查失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function runReleasePreflight(options: ReleasePreflightOptions): ReleasePreflightResult {
  const repo = path.resolve(options.repo ?? path.resolve(import.meta.dirname, '../../..'));
  const targets = normalizeTargets(options.targets);
  const checks: ReleasePreflightCheck[] = [];
  const servicesRoot = path.join(repo, 'projects/product/services');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-preflight-'));

  let admissions: Array<Record<string, string>> = [];
  const admissionsFile = path.join(repo, 'skills/buildr-release/scripts/harness-release-admissions.json');
  try {
    if (fs.existsSync(admissionsFile)) {
      admissions = parseAdmissions(fs.readFileSync(admissionsFile, 'utf8'));
      checks.push({
        id: 'harness-admissions-format',
        target: 'harness',
        status: 'passed',
        message: `harness-release-admissions.json 格式有效，当前共 ${admissions.length} 条记录。`,
        details: { count: admissions.length },
      });
    } else if (targets.some(item => item !== 'buildr')) {
      checks.push({
        id: 'harness-admissions-format',
        target: 'harness',
        status: 'action-required',
        message: '缺少 skills/buildr-release/scripts/harness-release-admissions.json。',
      });
    }
  } catch (error: unknown) {
    checks.push({
      id: 'harness-admissions-format',
      target: 'harness',
      status: 'action-required',
      message: `harness-release-admissions.json 校验失败：${error instanceof Error ? error.message : String(error)}`,
    });
  }

  try {
    if (targets.includes('buildr')) {
      const buildrRoot = path.join(servicesRoot, 'buildr');
      const pkg = readJson(path.join(buildrRoot, 'package.json'));
      const lockPath = path.join(buildrRoot, 'package-lock.json');
      const lock = fs.existsSync(lockPath) ? readJson(lockPath) : null;
      const expectedVersion = options.buildrVersion ?? String(pkg.version ?? '');

      if (!expectedVersion || pkg.version !== expectedVersion) {
        checks.push({
          id: 'buildr-package-version',
          target: 'buildr',
          status: 'action-required',
          message: `projects/product/services/buildr/package.json 版本为 ${pkg.version}，与目标 ${expectedVersion} 不一致。`,
        });
      } else if (lock && (lock.version !== expectedVersion || lock.packages?.['']?.version !== expectedVersion)) {
        checks.push({
          id: 'buildr-package-version',
          target: 'buildr',
          status: 'action-required',
          message: `package-lock.json 版本 (${lock.version} / ${lock.packages?.['']?.version}) 与 package.json (${expectedVersion}) 不一致。`,
        });
      } else {
        checks.push({
          id: 'buildr-package-version',
          target: 'buildr',
          status: 'passed',
          message: `Buildr 主包与锁文件版本均已对齐为 ${expectedVersion}。`,
          details: { version: expectedVersion },
        });
      }

      const changelogPath = path.join(repo, 'CHANGELOG.md');
      try {
        extractReleaseNotes(fs.readFileSync(changelogPath, 'utf8'), expectedVersion);
        checks.push({
          id: 'buildr-changelog-notes',
          target: 'buildr',
          status: 'passed',
          message: `CHANGELOG.md 已包含 ${expectedVersion} 的有效发布说明。`,
        });
      } catch (error: unknown) {
        checks.push({
          id: 'buildr-changelog-notes',
          target: 'buildr',
          status: 'action-required',
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const supportPath = path.join(buildrRoot, 'tools/build/platform-support.json');
      const support = fs.existsSync(supportPath) ? readJson(supportPath) : null;
      if (support?.publicationApproved === true) {
        checks.push({
          id: 'buildr-platform-support',
          target: 'buildr',
          status: 'passed',
          message: 'buildr platform-support.json 已标记 publicationApproved=true。',
        });
      } else {
        checks.push({
          id: 'buildr-platform-support',
          target: 'buildr',
          status: 'action-required',
          message: 'projects/product/services/buildr/tools/build/platform-support.json 尚未批准发布。',
        });
      }

      checks.push(checkThirdPartyCoverage(
        tmpRoot,
        'buildr-third-party',
        [buildrRoot, path.join(servicesRoot, 'buildr-harness-web'), path.join(servicesRoot, 'buildr-web')],
        path.join(servicesRoot, 'buildr-harness/resources/distribution-decisions.json'),
        'buildr',
      ));
    }

    if (targets.includes('harness')) {
      const harnessRoot = path.join(servicesRoot, 'buildr-harness');
      const supportPath = path.join(harnessRoot, 'resources/platform-support.json');
      const support = fs.existsSync(supportPath) ? readJson(supportPath) : null;
      const approval = support?.publicationApproval;
      const versionOk = !options.harnessVersion || approval?.version === options.harnessVersion;
      if (support?.publicationApproved === true && versionOk && typeof approval?.authority === 'string' && approval.authority.trim()) {
        checks.push({
          id: 'harness-platform-support',
          target: 'harness',
          status: 'passed',
          message: `buildr-harness platform-support.json 已批准版本 ${approval.version} (${approval.platform}/${approval.architectures?.join(',')})。`,
        });
      } else {
        checks.push({
          id: 'harness-platform-support',
          target: 'harness',
          status: 'action-required',
          message: options.harnessVersion
            ? `buildr-harness platform-support.json publicationApproval.version (${approval?.version ?? 'missing'}) 与目标 ${options.harnessVersion} 不匹配。`
            : 'buildr-harness platform-support.json 缺少有效 publicationApproval。',
        });
      }

      checks.push(checkThirdPartyCoverage(
        tmpRoot,
        'harness-third-party',
        [harnessRoot, path.join(servicesRoot, 'buildr-harness-web')],
        path.join(harnessRoot, 'resources/distribution-decisions.json'),
        'harness',
      ));

      if (options.harnessVersion) {
        const admitted = admissions.some(item => item.target === 'harness' && item.version === options.harnessVersion);
        checks.push({
          id: 'harness-admission-status',
          target: 'harness',
          status: 'info',
          message: admitted
            ? `harness@${options.harnessVersion} 已存在于准入清单（新候选版本不应复用已有版本号）。`
            : `harness@${options.harnessVersion} 尚未写入 main 准入清单（准备并验收原包后需发起 append-only 准入 PR）。`,
          details: { admitted, version: options.harnessVersion },
        });
      }
    }

    if (targets.includes('dsh-buildr-harness')) {
      const builderPath = path.join(servicesRoot, 'buildr-harness-dsh-plugin/tools/build-dev.ts');
      checks.push({
        id: 'dsh-buildr-harness-builder',
        target: 'dsh-buildr-harness',
        status: fs.existsSync(builderPath) ? 'passed' : 'action-required',
        message: fs.existsSync(builderPath)
          ? 'dsh-buildr-harness 独立打包入口存在。'
          : '缺少 projects/product/services/buildr-harness-dsh-plugin/tools/build-dev.ts。',
      });
      if (options.pluginVersion) {
        const admitted = admissions.some(item => item.target === 'dsh-buildr-harness' && item.version === options.pluginVersion);
        checks.push({
          id: 'dsh-buildr-harness-admission-status',
          target: 'dsh-buildr-harness',
          status: 'info',
          message: admitted
            ? `dsh-buildr-harness@${options.pluginVersion} 已存在于准入清单。`
            : `dsh-buildr-harness@${options.pluginVersion} 尚未写入 main 准入清单。`,
          details: { admitted, version: options.pluginVersion },
        });
      }
    }

    if (targets.includes('dsh-buildr')) {
      const builderPath = path.join(servicesRoot, 'buildr-development-dsh-plugin/tools/build-dev.ts');
      checks.push({
        id: 'dsh-buildr-builder',
        target: 'dsh-buildr',
        status: fs.existsSync(builderPath) ? 'passed' : 'action-required',
        message: fs.existsSync(builderPath)
          ? 'dsh-buildr 独立打包入口存在。'
          : '缺少 projects/product/services/buildr-development-dsh-plugin/tools/build-dev.ts。',
      });
      if (options.devPluginVersion) {
        const admitted = admissions.some(item => item.target === 'dsh-buildr' && item.version === options.devPluginVersion);
        checks.push({
          id: 'dsh-buildr-admission-status',
          target: 'dsh-buildr',
          status: 'info',
          message: admitted
            ? `dsh-buildr@${options.devPluginVersion} 已存在于准入清单。`
            : `dsh-buildr@${options.devPluginVersion} 尚未写入 main 准入清单。`,
          details: { admitted, version: options.devPluginVersion },
        });
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  return {
    schemaVersion: RELEASE_PREFLIGHT_SCHEMA,
    status: checks.some(item => item.status === 'action-required') ? 'action-required' : 'ready',
    repo,
    targets,
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { help, options } = parseReleasePreflightArgs(process.argv.slice(2));
  if (help) {
    console.log(releasePreflightUsage());
  } else {
    const result = runReleasePreflight(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ready') process.exitCode = 1;
  }
}
