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

function normalizedRepairCommands(finding) {
  return [...new Set([
    ...(finding.command ? [finding.command] : []),
    ...(Array.isArray(finding.commands) ? finding.commands : []),
  ].filter(Boolean))];
}

export function buildDoctorRepairPlan(findings) {
  const steps = [];
  for (const finding of findings) {
    if (!['error', 'warning'].includes(finding.status) || finding.userActionRequired === false) continue;
    const commands = normalizedRepairCommands(finding);
    if (!finding.suggestion && commands.length === 0) continue;
    const priority = finding.status === 'error' ? 'blocking' : 'required';
    const commandKey = [...commands].sort().join('\n');
    const current = steps.find((step) =>
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
    .sort((left, right) => Number(right.priority === 'blocking') - Number(left.priority === 'blocking'))
    .map(({ commandKey: _commandKey, ...step }, index) => ({ id: `repair-${index + 1}`, ...step }));
}

export function buildDoctorHealth(result) {
  const actionableCount = result.findings.filter((finding) =>
    ['error', 'warning'].includes(finding.status) && finding.userActionRequired !== false).length;
  const workspaceValid = result.workspace?.identity?.state === 'valid';
  return {
    workspaceValid,
    ready: workspaceValid && actionableCount === 0,
    actionRequired: actionableCount > 0,
    actionableCount,
  };
}
