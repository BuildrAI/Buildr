export const DOCTOR_DIAGNOSTIC_PROFILE = Object.freeze({
  id: 'default',
  core: ['workspace-identity', 'mutation-recovery', 'root-registries'],
  conditional: ['project-service-assets', 'rules-skills', 'package-assets', 'commands', 'agent-runtime'],
  specialty: [
    { id: 'runtime-detail', command: 'buildr runtime check <agent> --scope <scope> --target <dir>' },
    { id: 'commands-detail', command: 'buildr commands check --target <dir> --json' },
    { id: 'component-detail', command: 'buildr component check <id> --target <dir> --json' },
    { id: 'git-readiness', trigger: '进入提交、合并、发布或 workspace 更新流程时' },
    { id: 'openspec-change', trigger: '创建、实现、同步或归档 OpenSpec change 时' },
    { id: 'build-test', trigger: '实现变更或验证候选产物时' },
  ],
});

function normalizedRepairCommands(finding: any) {
  return [...new Set([
    ...(finding.command ? [finding.command] : []),
    ...(Array.isArray(finding.commands) ? finding.commands : []),
  ].filter(Boolean))];
}

export function buildDoctorRepairPlan(findings: any) {
  const steps: any[] = [];
  for (const finding of findings) {
    if (!['error', 'warning'].includes(finding.status) || finding.userActionRequired === false) continue;
    const commands = normalizedRepairCommands(finding);
    if (!finding.suggestion && commands.length === 0) continue;
    const priority = finding.status === 'error' ? 'blocking' : 'required';
    const commandKey = [...commands].sort().join('\n');
    const current = steps.find((step: any) =>
      (commandKey && step.commandKey === commandKey) ||
      (finding.suggestion && step.suggestion === finding.suggestion));
    if (current) {
      if (!current.codes.includes(finding.code)) current.codes.push(finding.code);
      if (priority === 'blocking') current.priority = 'blocking';
      current.commands = [...new Set([...(current.commands || []), ...commands])];
      continue;
    }
    steps.push({
      priority,
      codes: [finding.code],
      suggestion: finding.suggestion || null,
      commandKey,
      ...(commands.length > 0 ? { commands } : {}),
    });
  }
  return steps
    .sort((left: any, right: any) => Number(right.priority === 'blocking') - Number(left.priority === 'blocking'))
    .map(({ commandKey: _commandKey, ...step }: any, index: any) => ({ id: `repair-${index + 1}`, ...step }));
}

export function buildDoctorHealth(result: any) {
  const actionableCount = result.findings.filter((finding: any) =>
    ['error', 'warning'].includes(finding.status) && finding.userActionRequired !== false).length;
  const workspaceValid = result.workspace?.identity?.state === 'valid';
  return {
    workspaceValid,
    ready: workspaceValid && actionableCount === 0,
    generalWorkPermitted: null,
    actionRequired: actionableCount > 0,
    actionableCount,
  };
}

export function buildDoctorDomainHealth(findings: any) {
  const domains = new Map();
  for (const finding of findings) {
    const key = `${finding.domain}|${finding.scope}|${finding.ownershipUnit}`;
    const current = domains.get(key) || { domain: finding.domain, scope: finding.scope, ownershipUnit: finding.ownershipUnit, status: 'ok', actionableCount: 0, blockedActions: new Set(), findingCodes: [] };
    current.findingCodes.push(finding.code);
    if (finding.status === 'error') current.status = 'error';
    else if (finding.status === 'warning' && current.status !== 'error') current.status = 'warning';
    else if (finding.status === 'info' && current.status === 'ok') current.status = 'info';
    if (['error', 'warning'].includes(finding.status) && finding.userActionRequired !== false) {
      current.actionableCount += 1;
      for (const action of finding.affectedActions || []) current.blockedActions.add(action);
    }
    domains.set(key, current);
  }
  return [...domains.values()].map((item: any) => ({ ...item, blockedActions: [...item.blockedActions].sort(), findingCodes: [...new Set(item.findingCodes)].sort() }))
    .sort((left: any, right: any) => left.domain.localeCompare(right.domain) || left.scope.localeCompare(right.scope) || left.ownershipUnit.localeCompare(right.ownershipUnit));
}

export function finalizeDoctorResult(result: any) {
  const counts: Record<string, number> = { ok: 0, info: 0, warning: 0, error: 0 };
  for (const finding of result.findings) counts[finding.status] = (counts[finding.status] ?? 0) + 1;
  result.summary = counts;
  result.ok = counts.error === 0;
  result.repairPlan = buildDoctorRepairPlan(result.findings);
  result.health = buildDoctorHealth(result);
  result.domainHealth = buildDoctorDomainHealth(result.findings);
  result.nextSteps = result.repairPlan.slice(0, 10).map((step: any) => ({
    code: step.codes[0],
    codes: step.codes,
    suggestion: step.suggestion,
    ...(step.commands?.length === 1 ? { command: step.commands[0] } : {}),
    ...(step.commands?.length > 1 ? { commands: step.commands } : {}),
  }));
}
