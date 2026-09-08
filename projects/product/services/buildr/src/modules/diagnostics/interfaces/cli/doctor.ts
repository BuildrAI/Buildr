import path from 'node:path';
import process from 'node:process';
import { optionValue, hasFlag } from '../../../../infrastructure/cli-arguments.ts';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../../infrastructure/contracts/public-json.ts';
import { printProductInstallationReport } from './product-installation-report.ts';
import type { DoctorInput } from '../../application/doctor-application.ts';

type DoctorApplication = { doctor(input: DoctorInput): any };

export function writeDoctorResult(result: any, { json = false, detail = 'compact' }: { json?: boolean; detail?: string } = {}) {
  if (json) {
    const report = detail === 'compact' ? {
      targetRoot: result.targetRoot, scope: result.scope, agentRuntime: result.agentRuntime,
      productInstallation: result.productInstallation,
      releaseAwareness: result.releaseAwareness,
      notices: result.notices,
      ok: result.ok, summary: result.summary, health: result.health, domainHealth: result.domainHealth,
      findings: result.findings, repairPlan: result.repairPlan, nextSteps: result.nextSteps,
    } : result;
    process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.doctor, report), null, 2)}\n`);
  } else {
    printDoctorReport(result);
  }
}

function printDoctorReport(result: any) {
  console.log(`Buildr doctor for ${result.targetRoot}`);
  console.log(`Status: ok=${result.summary.ok} info=${result.summary.info} warning=${result.summary.warning} error=${result.summary.error}`);
  console.log(`Health: workspaceValid=${result.health.workspaceValid} ready=${result.health.ready} actionRequired=${result.health.actionRequired} actionable=${result.health.actionableCount}`);
  console.log('');

  if (result.findings.length === 0) {
    console.log('[ok] 未发现问题。');
  } else {
    for (const finding of result.findings) {
      const location = finding.path ? ` (${finding.path})` : '';
      console.log(`[${finding.status}] ${finding.code}${location} - ${finding.message}`);
    }
  }

  printProductInstallationReport(result);

  if (result.notices?.length) {
    console.log('\n版本发布提示：');
    for (const notice of result.notices) console.log(`  ${notice.message}${notice.command ? `\n  命令：${notice.command}` : ''}`);
  }

  if (result.repairPlan.length > 0) {
    console.log('');
    console.log('Repair plan:');
    for (const step of result.repairPlan) {
      console.log(`${step.id} [${step.priority}] ${step.codes.join(', ')}`);
      if (step.suggestion) console.log(`  建议：${step.suggestion}`);
      for (const command of step.commands || []) console.log(`  命令：${command}`);
    }
  }

  printCapabilityReport(result);
}
function printCapabilityReport(result: any) {
  if (!result.capabilities?.graphs?.some((graph: any) => graph.consumers.length > 0)) return;
  console.log('');
  console.log('Capability readiness（ready 只表示结构可路由）：');
  for (const graph of result.capabilities.graphs) {
    for (const consumer of graph.consumers) {
      console.log(`  [${consumer.readiness}] ${graph.scope}:${consumer.consumer}${consumer.reason ? ` reason=${consumer.reason}` : ''}`);
      for (const dependency of consumer.dependencies) {
        const candidates = dependency.candidates.map((candidate: any) => `${candidate.id}@${candidate.scope}${candidate.runtimeAvailable === false ? '(runtime unavailable)' : ''}`).join(', ') || 'none';
        console.log(`    ${dependency.capability}@${dependency.version} mode=${dependency.mode} readiness=${dependency.readiness} reason=${dependency.reason || 'none'} selected=${dependency.selectedProvider?.id || 'none'} candidates=${candidates}`);
        for (const action of dependency.nextActions) console.log(`      next: ${action}`);
      }
    }
  }
}

export function runDoctorCommand(application: DoctorApplication, args: string[]) {
  const targetRoot = path.resolve(optionValue(args, '--target', process.cwd()));
  const scope = optionValue(args, '--scope', null);
  const agent = optionValue(args, '--agent', null);
  // Preserve validation order before interpreting output detail.
  if (agent !== null && (typeof agent !== 'string' || agent === '.' || agent === '..' || !/^[A-Za-z0-9._-]+$/.test(agent))) throw new Error(`Agent id must contain only letters, digits, dots, underscores, or dashes: ${agent || ''}`);
  const detail = optionValue(args, '--detail', 'compact');
  if (!['compact', 'full'].includes(detail)) throw new Error('--detail must be compact or full.');
  const result = application.doctor({
    targetRoot, scope, agent,
    includeInfo: hasFlag(args, '--include-info') || hasFlag(args, '--verbose'),
  });
  writeDoctorResult(result, { json: hasFlag(args, '--json'), detail });
  process.exitCode = result.ok ? 0 : 1;
  return result;
}

export function createDoctorCliContributions(application: any) {
  return Object.freeze([Object.freeze({
    key: 'doctor',
    surface: 'primary',
    summary: '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。',
    help: [
      'Usage: buildr doctor [--agent <agent>] [--target <dir>] [--scope <.|projects/project[/services/service[/path...]]>] [--json] [--detail <compact|full>] [--include-info] [--verbose]',
      '',
      '诊断 workspace 源资产和 Agent runtime render 状态。传入 --agent 时只检查该 Agent adapter。JSON 默认输出 compact；完整 inventory 使用 --detail full。',
    ],
    match: ({ domain }: any) => domain === 'doctor',
    run: (_runtime: any, context: any) => runDoctorCommand(application, context.argv.slice(3)),
  })]);
}
