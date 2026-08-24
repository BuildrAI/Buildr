function normalizedScope(project, services = []) {
  if (typeof project !== 'string' || !project.trim()) throw new Error('Declaration Intake project is required.');
  const projectCode = project.trim();
  const serviceCodes = [...new Set(services.map((service) => String(service).trim()).filter(Boolean))].sort();
  return {
    project: projectCode,
    services: serviceCodes,
    selectors: [`project:${projectCode}`, ...serviceCodes.map((service) => `service:${projectCode}/${service}`)],
  };
}

export function declarationIntakeNextAction({ trigger, project, services = [] }) {
  if (typeof trigger !== 'string' || !trigger.trim()) throw new Error('Declaration Intake trigger is required.');
  const scope = normalizedScope(project, services);
  return `运行 declaration-intake Skill（trigger: ${trigger.trim()}；scope: ${scope.selectors.join('、')}），只读检查 preparation.yml 与 verification.yml，展示候选或差异并分类routine-maintenance或user-decision-required；routine维护交给声明owner，改变长期适用性时请求用户确认。`;
}

const DECISION_FIELDS = Object.freeze([
  'scopeChanged',
  'applicabilityChanged',
  'requirednessChanged',
  'capabilityChanged',
  'externalEffectsChanged',
  'safetyExceptionChanged',
  'authorityConflict',
]);

export function classifyDeclarationMaintenance(input = {}) {
  const evidenceConfirmed = input.evidenceConfirmed === true;
  const reasons = DECISION_FIELDS.filter((field) => input[field] === true);
  if (!evidenceConfirmed) reasons.unshift('evidence-unconfirmed');
  return {
    classification: reasons.length ? 'user-decision-required' : 'routine-maintenance',
    requiresUserDecision: reasons.length > 0,
    reasons,
  };
}

export function declarationIntakeGapNextAction({ kind, project, services = [], scopes = [] }) {
  const scope = normalizedScope(project, services);
  const gapScopes = [...new Set(scopes.map((item) => String(item).trim()).filter(Boolean))].sort();
  const details = gapScopes.length ? `；gap: ${gapScopes.join('、')}` : '';
  return `${declarationIntakeNextAction({ trigger: `${kind}-gap`, project: scope.project, services: scope.services })}${details}`;
}
