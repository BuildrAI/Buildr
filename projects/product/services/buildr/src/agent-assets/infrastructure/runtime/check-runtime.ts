import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { getRuntimeAdapter } from './adapter-contract.ts';
import { checkRuntimeProjection, printRuntimeProjectionReport } from './projection.ts';
import { parseRenderClaudeCodeArgs } from './render-claude-code.ts';

export function runEnvironmentProbe(probe: any, options: any = {}): any  {
  if (probe.kind === 'none') return { status: 'not-checked', probe: 'none' };
  if (probe.kind === 'manual') return { status: 'manual', probe: 'manual', guidance: probe.guidance };
  const spawn = options.spawn || spawnSync;
  const result = spawn(probe.executable, probe.args, {
    encoding: 'utf8',
    timeout: probe.timeoutMs,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const evidence = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.error?.code === 'ENOENT') return { status: 'missing', probe: 'command', executable: probe.executable, args: probe.args, evidence: result.error.message };
  if (result.error) return { status: 'missing', probe: 'command', executable: probe.executable, args: probe.args, evidence: result.error.message };
  return {
    status: result.status === 0 ? 'ok' : 'missing',
    probe: 'command',
    executable: probe.executable,
    args: probe.args,
    exitCode: result.status,
    ...(evidence ? { evidence } : {}),
  };
}

function prerequisiteFindings(adapter: any): any  {
  return (adapter.traits.checker.prerequisites || []).map((item: any) => ({
    status: 'warning',
    path: '.',
    adapter: adapter.id,
    code: item.code,
    message: item.message,
    suggestion: item.guidance,
    userActionRequired: true,
  }));
}

function environmentFindings(adapter: any, checks: any): any  {
  const findings: any[] = [];
  if (checks.installation.status === 'missing') {
    findings.push({
      status: 'warning', path: '.', adapter: adapter.id,
      code: `runtime.${adapter.id.replaceAll('-', '_')}_installation_missing`,
      message: `${adapter.displayName} installation probe failed.`,
      suggestion: checks.installation.evidence || `Install ${adapter.displayName} or verify its command/application path.`,
      userActionRequired: true,
    });
  } else if (checks.installation.status === 'ok' && checks.version.status === 'missing') {
    findings.push({
      status: 'warning', path: '.', adapter: adapter.id,
      code: `runtime.${adapter.id.replaceAll('-', '_')}_version_unavailable`,
      message: `${adapter.displayName} version probe failed.`,
      suggestion: checks.version.evidence || `Verify the installed ${adapter.displayName} version manually.`,
      userActionRequired: true,
    });
  }
  return findings;
}

export function checkRuntimeAdapter(argv: any, options: any = {}): any  {
  const adapterId = options.adapterId;
  const adapter = getRuntimeAdapter(adapterId);
  const repoRoot = options.repoRoot ?? process.cwd();
  const args = parseRenderClaudeCodeArgs(argv, options.command ?? `buildr runtime check ${adapter.id}`);
  const result = checkRuntimeProjection({ repoRoot, targetRoot: path.resolve(repoRoot, args.target), scope: args.scope, adapterId: adapter.id });
  const environmentChecks: any = {
    installation: runEnvironmentProbe(adapter.traits.checker.installationProbe),
    version: runEnvironmentProbe(adapter.traits.checker.versionProbe),
  };
  const prerequisites = prerequisiteFindings(adapter);
  const environment = environmentFindings(adapter, environmentChecks);
  result.findings.push(...prerequisites, ...environment);
  result.counts.warning += prerequisites.length + environment.length;
  return {
    ...result,
    environmentChecks,
    activation: adapter.traits.activation,
  };
}

export function printRuntimeAdapterCheckReport(result: any): any  {
  printRuntimeProjectionReport(result, getRuntimeAdapter(result.adapterId).displayName);
  console.log('\nEnvironment:');
  for (const [name, check] of Object.entries(result.environmentChecks) as Array<[string, any]>) {
    const evidence = check.evidence ? ` - ${check.evidence.replaceAll('\n', ' | ')}` : '';
    console.log(`  ${name}: ${check.status} (${check.probe})${evidence}`);
    if (check.guidance) console.log(`    ${check.guidance}`);
  }
  console.log(`Activation: rules=${result.activation.rules} skills=${result.activation.skills}`);
  if (result.activation.reloadGuidance) console.log(`Reload: ${result.activation.reloadGuidance}`);
  console.log(`Runtime source: ${result.runtimeSourceEvidence.sourceRoot}`);
  console.log(`Projection identity: ${result.runtimeSourceEvidence.projectionIdentity}`);
  console.log(`Session consumption: ${result.runtimeSourceEvidence.sessionConsumption}`);
}

export const RUNTIME_CHECKERS = Object.freeze({ projection: checkRuntimeAdapter });
export const RUNTIME_CHECK_PRINTERS = Object.freeze({ projection: printRuntimeAdapterCheckReport });
